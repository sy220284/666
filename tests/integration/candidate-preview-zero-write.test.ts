import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { CandidateApplyService } from '../../packages/core-service/src/candidate-apply.js';
import { CandidateService } from '../../packages/core-service/src/candidate.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-18T02:10:00.000Z') };

interface Harness {
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly drafts: DraftService;
  readonly candidates: CandidateService;
  readonly preview: CandidateApplyService;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-candidate-preview-'));
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
    candidates: new CandidateService(workspace, { clock }),
    preview: new CandidateApplyService(workspace, { clock }),
  };
}

async function closeHarness(harness: Harness): Promise<void> {
  await harness.workspace.shutdown();
  await harness.appRuntime.close();
}

function persistedState(workspace: ProjectWorkspaceService, projectId: string) {
  return workspace.readProject(projectId, (database) => ({
    drafts: database.prepare('SELECT * FROM drafts ORDER BY id').all(),
    draftBlocks: database.prepare('SELECT * FROM draft_blocks ORDER BY id').all(),
    patchLog: database.prepare('SELECT * FROM draft_patch_log ORDER BY id').all(),
    candidates: database.prepare('SELECT * FROM candidates ORDER BY id').all(),
    candidateBlocks: database.prepare('SELECT * FROM candidate_blocks ORDER BY id').all(),
    candidateSources: database
      .prepare('SELECT * FROM candidate_block_sources ORDER BY candidate_block_id, source_order')
      .all(),
    checkpoints: database.prepare('SELECT * FROM candidate_apply_checkpoints ORDER BY id').all(),
    records: database.prepare('SELECT * FROM candidate_apply_records ORDER BY id').all(),
    conflicts: database.prepare('SELECT * FROM candidate_conflict_sets ORDER BY id').all(),
  }));
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M2-03 Candidate Preview zero-write guarantee', () => {
  it('returns structural and character diff without changing any project row', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '预览零写入', channel: '长篇' },
        harness.parent,
      );
      const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      const draft = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      const source = draft.blocks[0]!;
      const candidate = await harness.candidates.createFixture(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseDraftRevision: draft.revision,
        candidateType: 'rewrite',
        completeness: 'partial',
        title: '只读预览候选',
        blocks: [
          {
            logicalBlockId: source.logicalBlockId,
            blockType: source.blockType,
            text: '预览只计算差异，不能写入正文。',
            attributes: source.attributes,
            sourceBlockHash: source.contentHash,
          },
        ],
      });
      const before = persistedState(harness.workspace, project.projectId);

      const preview = harness.preview.preview({
        projectId: project.projectId,
        chapterId: chapter.id,
        candidateId: candidate.candidateId,
      });

      expect(preview.candidate.candidateId).toBe(candidate.candidateId);
      expect(preview.structure.some((entry) => entry.kind === 'modified')).toBe(true);
      expect(preview.structure.find((entry) => entry.kind === 'modified')).toMatchObject({
        logicalBlockId: source.logicalBlockId,
        candidateBlockIds: [candidate.blocks[0]!.candidateBlockId],
        currentIndexes: [0],
        candidateIndexes: [0],
      });
      expect(preview.characterDiffs.length).toBeGreaterThan(0);
      expect(persistedState(harness.workspace, project.projectId)).toEqual(before);
    } finally {
      await closeHarness(harness);
    }
  });

  it('cancels a progressive long-chapter Preview without changing project rows', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '预览取消', channel: '长篇' },
        harness.parent,
      );
      const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      const opened = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      const source = opened.blocks[0]!;
      const draft = await harness.drafts.applyPatch(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: opened.draftId,
        baseRevision: opened.revision,
        operations: [
          {
            type: 'update',
            logicalBlockId: source.logicalBlockId,
            expectedHash: source.contentHash!,
            content: '甲'.repeat(20_000),
          },
        ],
      });
      const candidate = await harness.candidates.createFixture(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseDraftRevision: draft.revision,
        candidateType: 'rewrite',
        completeness: 'complete',
        title: '长章候选',
        blocks: [
          {
            logicalBlockId: draft.blocks[0]!.logicalBlockId,
            sourceLogicalBlockIds: [draft.blocks[0]!.logicalBlockId],
            blockType: draft.blocks[0]!.blockType,
            text: `${'甲'.repeat(19_999)}乙`,
            attributes: draft.blocks[0]!.attributes,
            sourceBlockHash: draft.blocks[0]!.contentHash,
          },
        ],
      });
      const before = persistedState(harness.workspace, project.projectId);
      const previewRequestId = randomUUID();

      const running = harness.preview.previewProgressively(previewRequestId, {
        projectId: project.projectId,
        chapterId: chapter.id,
        candidateId: candidate.candidateId,
      });
      expect(harness.preview.cancelPreview({ previewRequestId })).toEqual({ cancelled: true });
      await expect(running).rejects.toMatchObject({ code: 'CANDIDATE_PREVIEW_CANCELLED' });
      expect(persistedState(harness.workspace, project.projectId)).toEqual(before);
    } finally {
      await closeHarness(harness);
    }
  });
});
