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
import { ResearchService } from '../../packages/core-service/src/research-service.js';
import { VersionService } from '../../packages/core-service/src/version.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-08-18T00:00:00.000Z') };

interface Harness {
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly drafts: DraftService;
  readonly versions: VersionService;
  readonly research: ResearchService;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-generation-risk-'));
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
    versions: new VersionService(workspace, { clock }),
    research: new ResearchService(workspace, { clock }),
  };
}

async function closeHarness(harness: Harness): Promise<void> {
  await harness.workspace.shutdown();
  await harness.appRuntime.close();
}

function constraints(projectId: string, chapterId: string, versionId: string) {
  return ConstraintPackageSchema.parse({
    projectId,
    chapterId,
    taskType: 'validate',
    snapshotSource: 'fallback_live_query',
    sections: { P0: [], P1: [], P2: [], P3: [], P4: [] },
    sourceVersionIds: [versionId],
    estimatedTokens: 0,
    budget: { maxInputTokens: 32_768, safetyMarginTokens: 2_048, usableTokens: 30_720 },
    contentHash: 'a'.repeat(64),
    constraintHash: 'b'.repeat(64),
    trimLog: [],
    conflicts: [],
  });
}

function chapterInput(
  projectId: string,
  chapterId: string,
  draftId: string,
  revision: number,
  overrides: Partial<GenerationRunCreateInput> = {},
): GenerationRunCreateInput {
  return {
    projectId,
    chapterId,
    baseDraftId: draftId,
    baseDraftRevision: revision,
    runType: 'chapter',
    promptId: 'worldforge.chapter',
    promptVersion: 1,
    outputMode: 'text',
    providerId: 'provider-test',
    actualModel: 'model-test',
    supportStatus: 'unverified',
    constraintPackage: ConstraintPackageSchema.parse({
      projectId,
      chapterId,
      taskType: 'chapter',
      snapshotSource: 'fallback_live_query',
      sections: { P0: [], P1: [], P2: [], P3: [], P4: [] },
      sourceVersionIds: [],
      estimatedTokens: 0,
      budget: { maxInputTokens: 32_768, safetyMarginTokens: 2_048, usableTokens: 30_720 },
      contentHash: 'c'.repeat(64),
      constraintHash: 'd'.repeat(64),
      trimLog: [],
      conflicts: [],
    }),
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('GenerationRunService high-risk boundaries', () => {
  it('derives safe project scope but rejects non-chapter scopes without an explicit scope id', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '生成作用域', channel: '长篇' },
        harness.parent,
      );
      const generation = new GenerationRunService(harness.workspace, { clock });
      const projectRun = await generation.create(randomUUID(), {
        projectId: project.projectId,
        scopeType: 'project',
        chapterId: null,
        baseDraftId: null,
        baseDraftRevision: null,
        runType: 'journal_summarize',
        promptId: 'worldforge.journal-summary',
        promptVersion: 1,
        outputMode: 'structured',
        providerId: 'provider-test',
        actualModel: 'model-test',
        supportStatus: 'unverified',
        constraintPackage: null,
      });
      expect(projectRun).toMatchObject({
        scopeType: 'project',
        scopeId: project.projectId,
        chapterId: null,
      });

      await expect(
        generation.create(randomUUID(), {
          projectId: project.projectId,
          scopeType: 'volume',
          chapterId: null,
          baseDraftId: null,
          baseDraftRevision: null,
          runType: 'journal_summarize',
          promptId: 'worldforge.journal-summary',
          promptVersion: 1,
          outputMode: 'structured',
          providerId: 'provider-test',
          actualModel: 'model-test',
          supportStatus: 'unverified',
          constraintPackage: null,
        }),
      ).rejects.toMatchObject({ code: 'GENERATION_BASE_CONFLICT' });
    } finally {
      await closeHarness(harness);
    }
  });

  it('fails closed when semantic validation lacks an authoritative final-version source or uses another chapter', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '语义校验来源', channel: '长篇' },
        harness.parent,
      );
      const volume = harness.structure.list(project.projectId).volumes[0]!;
      const chapter1 = volume.chapters[0]!;
      const structure = await harness.structure.createChapter(randomUUID(), {
        projectId: project.projectId,
        volumeId: volume.id,
        title: '第二章',
      });
      const chapter2 = structure.volumes[0]!.chapters.at(-1)!;
      const draft1 = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter1.id,
      });
      const draft2 = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter2.id,
      });
      const version1 = await harness.versions.create(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter1.id,
        draftId: draft1.draftId,
        baseRevision: draft1.revision,
        title: '第一章定稿',
      });
      const version2 = await harness.versions.create(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter2.id,
        draftId: draft2.draftId,
        baseRevision: draft2.revision,
        title: '第二章定稿',
      });
      await harness.versions.setFinal(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter1.id,
        versionId: version1.versionId,
      });
      await harness.versions.setFinal(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter2.id,
        versionId: version2.versionId,
      });
      const generation = new GenerationRunService(harness.workspace, { clock });
      const base: GenerationRunCreateInput = {
        projectId: project.projectId,
        chapterId: chapter1.id,
        baseDraftId: null,
        baseDraftRevision: null,
        runType: 'validate',
        promptId: 'worldforge.validate',
        promptVersion: 1,
        outputMode: 'structured',
        providerId: 'provider-test',
        actualModel: 'model-test',
        supportStatus: 'verified',
        constraintPackage: constraints(project.projectId, chapter1.id, version1.versionId),
      };

      await expect(generation.create(randomUUID(), base)).rejects.toMatchObject({
        code: 'GENERATION_BASE_CONFLICT',
      });
      await expect(
        generation.create(randomUUID(), {
          ...base,
          inputSources: [
            {
              sourceType: 'version',
              sourceId: version2.versionId,
              sourceOrder: 0,
              metadata: { final: true },
            },
          ],
        }),
      ).rejects.toMatchObject({ code: 'GENERATION_BASE_CONFLICT' });

      expect(
        harness.workspace.readProject(project.projectId, (database) =>
          Number(database.prepare('SELECT COUNT(*) AS count FROM generation_runs').get()?.count),
        ),
      ).toBe(0);
    } finally {
      await closeHarness(harness);
    }
  });

  it('binds persisted request replay to the exact research selection and repairs a missing selection snapshot', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '研究引用重放', channel: '长篇' },
        harness.parent,
      );
      const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      const draft = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      const firstCatalog = await harness.research.createNote(randomUUID(), {
        projectId: project.projectId,
        title: '甲资料',
        body: '甲资料正文',
        sourceType: null,
        sourceLabel: null,
        sourceUri: null,
        tags: [],
      });
      const firstNote = firstCatalog.notes[0]!;
      const secondCatalog = await harness.research.createNote(randomUUID(), {
        projectId: project.projectId,
        title: '乙资料',
        body: '乙资料正文',
        sourceType: null,
        sourceLabel: null,
        sourceUri: null,
        tags: [],
      });
      const secondNote = secondCatalog.notes.find((note) => note.id !== firstNote.id)!;
      const requestId = randomUUID();
      const input = chapterInput(project.projectId, chapter.id, draft.draftId, draft.revision, {
        researchReferences: [{ sourceType: 'note', sourceId: firstNote.id }],
      });
      const firstService = new GenerationRunService(harness.workspace, { clock });
      const first = await firstService.createWithReplay(requestId, input);

      const mismatchedService = new GenerationRunService(harness.workspace, { clock });
      await expect(
        mismatchedService.createWithReplay(requestId, {
          ...input,
          researchReferences: [{ sourceType: 'note', sourceId: secondNote.id }],
        }),
      ).rejects.toMatchObject({ code: 'GENERATION_RESULT_CONFLICT' });

      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database
          .prepare('DELETE FROM generation_research_refs WHERE generation_run_id = ?')
          .run(first.run.runId);
        database
          .prepare('DELETE FROM generation_research_ref_sets WHERE generation_run_id = ?')
          .run(first.run.runId);
      });
      const repairService = new GenerationRunService(harness.workspace, { clock });
      const replayed = await repairService.createWithReplay(requestId, input);
      expect(replayed).toEqual({ run: first.run, replayed: true });
      expect(
        repairService.getResearchReferenceMessage({
          projectId: project.projectId,
          runId: first.run.runId,
        }),
      ).toContain('甲资料正文');
      expect(
        harness.workspace.readProject(project.projectId, (database) => ({
          sets: Number(
            database
              .prepare(
                'SELECT COUNT(*) AS count FROM generation_research_ref_sets WHERE generation_run_id = ?',
              )
              .get(first.run.runId)?.count,
          ),
          refs: Number(
            database
              .prepare(
                'SELECT COUNT(*) AS count FROM generation_research_refs WHERE generation_run_id = ?',
              )
              .get(first.run.runId)?.count,
          ),
        })),
      ).toEqual({ sets: 1, refs: 1 });
    } finally {
      await closeHarness(harness);
    }
  });
});
