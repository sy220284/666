import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ConstraintPackageSchema } from '@worldforge/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import {
  GenerationRunService,
  type GenerationRunCreateInput,
} from '../../packages/core-service/src/generation-run.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-08-05T12:00:00.000Z') };

interface Harness {
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly drafts: DraftService;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-m10-12-generation-'));
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
    projectMigrationRecoveryDirectory: path.join(root, 'project-recovery'),
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
  };
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

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M10-12 Generation命令身份', () => {
  it('只重放完整匹配的持久化请求并拒绝输入冲突', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '请求身份', channel: '长篇' },
        harness.parent,
      );
      const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      const draft = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      const input: GenerationRunCreateInput = {
        projectId: project.projectId,
        chapterId: chapter.id,
        baseDraftId: draft.draftId,
        baseDraftRevision: draft.revision,
        runType: 'chapter',
        promptId: 'worldforge.chapter',
        promptVersion: 1,
        outputMode: 'text',
        providerId: 'provider-a',
        actualModel: 'model-a',
        supportStatus: 'unverified',
        constraintPackage: constraints(project.projectId, chapter.id),
        inputSources: [
          {
            sourceType: 'chapter_goal',
            sourceId: chapter.id,
            sourceOrder: 0,
            metadata: { chapterGoal: '推进冲突' },
          },
        ],
      };
      const requestId = randomUUID();
      const firstService = new GenerationRunService(harness.workspace, { clock });
      const first = await firstService.createWithReplay(requestId, input);
      const concurrentReplay = await firstService.createWithReplay(requestId, input);
      const restartedService = new GenerationRunService(harness.workspace, { clock });
      const persistedReplay = await restartedService.createWithReplay(requestId, input);

      expect(first.replayed).toBe(false);
      expect(concurrentReplay).toEqual({ run: first.run, replayed: true });
      expect(persistedReplay).toEqual({ run: first.run, replayed: true });
      await expect(
        restartedService.createWithReplay(requestId, {
          ...input,
          actualModel: 'model-b',
        }),
      ).rejects.toMatchObject({ code: 'GENERATION_RESULT_CONFLICT' });
      expect(
        harness.workspace.readProject(project.projectId, (database) =>
          database.prepare('SELECT COUNT(*) AS count FROM generation_runs').get(),
        ),
      ).toEqual({ count: 1n });
    } finally {
      await harness.workspace.shutdown();
      await harness.appRuntime.close();
    }
  });
});
