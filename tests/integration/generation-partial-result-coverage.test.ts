import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ConstraintPackageSchema } from '@worldforge/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import { GenerationRunService } from '../../packages/core-service/src/generation-run.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-08-14T00:00:00.000Z') };

interface Harness {
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly drafts: DraftService;
  readonly generation: GenerationRunService;
}

async function harness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-partial-coverage-'));
  temporaryDirectories.push(root);
  const parent = path.join(root, 'projects');
  await mkdir(parent, { recursive: true });
  const appRuntime = await openAppRuntime({
    databasePath: path.join(root, 'app.sqlite'),
    migrationsDirectory: 'migrations/app',
    recoveryDirectory: path.join(root, 'app-recovery'),
    appVersion: '0.1.0',
    clock,
  });
  const workspace = new ProjectWorkspaceService({
    projectMigrationsDirectory: 'migrations/project',
    projectMigrationRecoveryDirectory: path.join(root, 'project-migration-recovery'),
    appVersion: '0.1.0',
    recentProjects: appRuntime.recentProjects,
    clock,
  });
  return {
    parent,
    appRuntime,
    workspace,
    structure: new ProjectStructureService(workspace, { clock }),
    drafts: new DraftService(workspace, { clock }),
    generation: new GenerationRunService(workspace, { clock }),
  };
}

async function close(harnessValue: Harness): Promise<void> {
  await harnessValue.workspace.shutdown();
  await harnessValue.appRuntime.close();
}

function constraints(projectId: string, chapterId: string) {
  return ConstraintPackageSchema.parse({
    projectId,
    chapterId,
    taskType: 'chapter',
    snapshotSource: 'fallback_live_query',
    sections: { P0: [], P1: [], P2: [], P3: [], P4: [] },
    sourceVersionIds: [],
    estimatedTokens: 0,
    budget: { maxInputTokens: 32_768, safetyMarginTokens: 2_048, usableTokens: 30_720 },
    contentHash: 'a'.repeat(64),
    constraintHash: 'b'.repeat(64),
    trimLog: [],
    conflicts: [],
  });
}

async function createRunningGeneration(harnessValue: Harness, name: string) {
  const project = await harnessValue.workspace.create(
    randomUUID(),
    { name, channel: '长篇' },
    harnessValue.parent,
  );
  const chapter = harnessValue.structure.list(project.projectId).volumes[0]!.chapters[0]!;
  const draft = await harnessValue.drafts.open(randomUUID(), {
    projectId: project.projectId,
    chapterId: chapter.id,
  });
  const run = await harnessValue.generation.create(randomUUID(), {
    projectId: project.projectId,
    chapterId: chapter.id,
    baseDraftId: draft.draftId,
    baseDraftRevision: draft.revision,
    runType: 'chapter',
    promptId: 'worldforge.chapter',
    promptVersion: 1,
    outputMode: 'text',
    providerId: 'stub',
    actualModel: 'deterministic-v1',
    supportStatus: 'unverified',
    constraintPackage: constraints(project.projectId, chapter.id),
  });
  await harnessValue.generation.markRunning(randomUUID(), {
    projectId: project.projectId,
    runId: run.runId,
  });
  return { project, run };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('generation partial result coverage', () => {
  it('records, replaces and discards partial output without creating a candidate', async () => {
    const harnessValue = await harness();
    try {
      const { project, run } = await createRunningGeneration(harnessValue, '丢弃部分输出');
      const identity = { projectId: project.projectId, runId: run.runId };

      await expect(
        harnessValue.generation.recordPartial(randomUUID(), { ...identity, text: '' }),
      ).resolves.toMatchObject({ partialStatus: 'unavailable' });
      await expect(
        harnessValue.generation.recordPartial(randomUUID(), {
          ...identity,
          text: '第一版部分内容',
        }),
      ).resolves.toMatchObject({ partialStatus: 'available' });
      await harnessValue.generation.recordPartial(randomUUID(), {
        ...identity,
        text: '第二版部分内容',
      });

      expect(
        harnessValue.workspace.readProject(project.projectId, (database) =>
          database
            .prepare(
              'SELECT text, received_characters AS receivedCharacters FROM generation_partial_buffers WHERE run_id = ?',
            )
            .get(run.runId),
        ),
      ).toEqual({ text: '第二版部分内容', receivedCharacters: 7n });

      await expect(
        harnessValue.generation.discardPartial(randomUUID(), identity),
      ).resolves.toMatchObject({
        run: { partialStatus: 'discarded' },
        candidate: null,
      });
      expect(
        harnessValue.workspace.readProject(project.projectId, (database) =>
          database
            .prepare('SELECT COUNT(*) AS count FROM generation_partial_buffers WHERE run_id = ?')
            .get(run.runId),
        ),
      ).toEqual({ count: 0n });
      await expect(
        harnessValue.generation.discardPartial(randomUUID(), identity),
      ).rejects.toMatchObject({
        code: 'GENERATION_PARTIAL_DECIDED',
      });
    } finally {
      await close(harnessValue);
    }
  });

  it('rejects saving whitespace-only partial output and preserves the undecided buffer', async () => {
    const harnessValue = await harness();
    try {
      const { project, run } = await createRunningGeneration(harnessValue, '空部分输出');
      const identity = { projectId: project.projectId, runId: run.runId };
      await harnessValue.generation.recordPartial(randomUUID(), { ...identity, text: ' \n\n  ' });

      await expect(
        harnessValue.generation.savePartial(randomUUID(), identity),
      ).rejects.toMatchObject({
        code: 'GENERATION_CANDIDATE_INVALID',
      });
      expect(harnessValue.generation.get(identity)).toMatchObject({ partialStatus: 'available' });
      expect(
        harnessValue.workspace.readProject(project.projectId, (database) =>
          database
            .prepare('SELECT COUNT(*) AS count FROM generation_partial_buffers WHERE run_id = ?')
            .get(run.runId),
        ),
      ).toEqual({ count: 1n });
    } finally {
      await close(harnessValue);
    }
  });

  it('rejects missing buffers and unavailable decisions with distinct service errors', async () => {
    const harnessValue = await harness();
    try {
      const { project, run } = await createRunningGeneration(harnessValue, '缺失部分输出');
      const identity = { projectId: project.projectId, runId: run.runId };

      await expect(
        harnessValue.generation.savePartial(randomUUID(), identity),
      ).rejects.toMatchObject({
        code: 'GENERATION_PARTIAL_UNAVAILABLE',
      });
      await harnessValue.generation.recordPartial(randomUUID(), { ...identity, text: '会被移除' });
      await harnessValue.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database.prepare('DELETE FROM generation_partial_buffers WHERE run_id = ?').run(run.runId);
      });
      await expect(
        harnessValue.generation.savePartial(randomUUID(), identity),
      ).rejects.toMatchObject({
        code: 'GENERATION_PARTIAL_UNAVAILABLE',
      });
    } finally {
      await close(harnessValue);
    }
  });
});
