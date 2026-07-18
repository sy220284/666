import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { RecoveryService } from '../../packages/core-service/src/recovery.js';
import { StructureOperationService } from '../../packages/core-service/src/structure-operations.js';
import { VersionService } from '../../packages/core-service/src/version.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-18T09:00:00.000Z') };

interface Harness {
  readonly root: string;
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly drafts: DraftService;
  readonly versions: VersionService;
  readonly recovery: RecoveryService;
  readonly operations: StructureOperationService;
}

async function createHarness(
  faultInjector?: ConstructorParameters<typeof StructureOperationService>[1]['faultInjector'],
): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-structure-operation-'));
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
    projectMigrationRecoveryDirectory: path.join(root, 'migration-recovery'),
    appVersion: '0.1.0',
    recentProjects: appRuntime.recentProjects,
    clock,
  });
  return {
    root,
    parent,
    appRuntime,
    workspace,
    structure: new ProjectStructureService(workspace, { clock }),
    drafts: new DraftService(workspace, { clock }),
    versions: new VersionService(workspace, { clock }),
    recovery: new RecoveryService(workspace, {
      backupRootDirectory: path.join(root, 'operation-recovery'),
      clock,
    }),
    operations: new StructureOperationService(workspace, { clock, faultInjector }),
  };
}

async function closeHarness(harness: Harness): Promise<void> {
  await harness.workspace.shutdown();
  await harness.appRuntime.close();
}

async function createProject(harness: Harness, name: string) {
  const project = await harness.workspace.create(
    randomUUID(),
    { name, channel: '长篇' },
    harness.parent,
  );
  const first = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
  const firstDraft = await harness.drafts.open(randomUUID(), {
    projectId: project.projectId,
    chapterId: first.id,
  });
  return { project, first, firstDraft };
}

async function addBlocks(
  harness: Harness,
  projectId: string,
  chapterId: string,
  draft: Awaited<ReturnType<DraftService['open']>>,
  texts: readonly string[],
) {
  return harness.drafts.applyPatch(randomUUID(), {
    projectId,
    chapterId,
    draftId: draft.draftId,
    baseRevision: draft.revision,
    operations: texts.map((content) => ({
      type: 'insert' as const,
      afterLogicalBlockId: draft.blocks[0]!.logicalBlockId,
      block: { blockType: 'paragraph' as const, content, attributes: {} },
    })),
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M2-04 high-risk structure operations', () => {
  it('splits only after a fresh preview and keeps immutable Versions unchanged', async () => {
    const harness = await createHarness();
    try {
      const { project, first, firstDraft } = await createProject(harness, '拆章预览');
      const prepared = await addBlocks(harness, project.projectId, first.id, firstDraft, [
        '第二段',
        '第三段',
      ]);
      const version = await harness.versions.create(randomUUID(), {
        projectId: project.projectId,
        chapterId: first.id,
        draftId: prepared.draftId,
        baseRevision: prepared.revision,
        title: '拆章前版本',
      });
      const previewInput = {
        projectId: project.projectId,
        chapterId: first.id,
        draftId: prepared.draftId,
        baseRevision: prepared.revision,
        splitAfterLogicalBlockId: prepared.blocks[0]!.logicalBlockId,
        newChapterTitle: '拆出的章节',
      };
      const preview = harness.operations.previewSplit(previewInput);
      expect(preview).toMatchObject({
        operation: 'split-chapter',
        sourceBlockCount: 3,
        resultingSourceBlockCount: 1,
        resultingTargetBlockCount: 2,
        canExecute: true,
      });
      const checkpoint = await harness.recovery.createOperationCheckpoint(randomUUID(), {
        projectId: project.projectId,
        operation: 'split-chapter',
      });
      const result = await harness.operations.executeSplit(
        randomUUID(),
        { ...previewInput, planHash: preview.planHash },
        checkpoint.backupId,
      );
      expect(result.backupId).toBe(checkpoint.backupId);
      expect(result.drafts.map((draft) => draft.blocks.length)).toEqual([1, 2]);
      expect(result.drafts[0]!.revision).toBe(prepared.revision + 1);
      expect(result.drafts[1]!.revision).toBe(1);
      expect(result.structure.volumes[0]!.chapters.map((chapter) => chapter.title)).toEqual([
        first.title,
        '拆出的章节',
      ]);
      expect(
        harness.versions.get({
          projectId: project.projectId,
          chapterId: first.id,
          versionId: version.versionId,
        }),
      ).toEqual(version);
      expect(
        (await harness.recovery.getOverview(project.projectId)).checkpoints.map(
          (record) => record.backupId,
        ),
      ).toContain(checkpoint.backupId);
    } finally {
      await closeHarness(harness);
    }
  });

  it('blocks locked or stale split plans and rolls back an interrupted transaction', async () => {
    let fail = false;
    const harness = await createHarness((stage) => {
      if (fail && stage === 'after-source-persist') throw new Error('INJECTED_STRUCTURE_FAILURE');
    });
    try {
      const { project, first, firstDraft } = await createProject(harness, '拆章保护');
      const prepared = await addBlocks(harness, project.projectId, first.id, firstDraft, [
        '要移动的段落',
      ]);
      const moved = prepared.blocks[1]!;
      const locked = await harness.drafts.applyPatch(randomUUID(), {
        projectId: project.projectId,
        chapterId: first.id,
        draftId: prepared.draftId,
        baseRevision: prepared.revision,
        operations: [
          {
            type: 'set-lock',
            logicalBlockId: moved.logicalBlockId,
            expectedHash: moved.contentHash!,
            locked: true,
          },
        ],
      });
      const input = {
        projectId: project.projectId,
        chapterId: first.id,
        draftId: locked.draftId,
        baseRevision: locked.revision,
        splitAfterLogicalBlockId: locked.blocks[0]!.logicalBlockId,
        newChapterTitle: '被阻断的拆章',
      };
      const blocked = harness.operations.previewSplit(input);
      expect(blocked).toMatchObject({
        canExecute: false,
        lockedLogicalBlockIds: [moved.logicalBlockId],
      });
      expect(() =>
        harness.operations.assertSplitExecutable({ ...input, planHash: blocked.planHash }),
      ).toThrow(/Locked DraftBlocks/u);

      const unlocked = await harness.drafts.applyPatch(randomUUID(), {
        projectId: project.projectId,
        chapterId: first.id,
        draftId: locked.draftId,
        baseRevision: locked.revision,
        operations: [
          {
            type: 'set-lock',
            logicalBlockId: moved.logicalBlockId,
            expectedHash: moved.contentHash!,
            locked: false,
          },
        ],
      });
      expect(() =>
        harness.operations.assertSplitExecutable({ ...input, planHash: blocked.planHash }),
      ).toThrow(/Revision changed/u);
      const freshInput = { ...input, baseRevision: unlocked.revision };
      const fresh = harness.operations.previewSplit(freshInput);
      const structureBefore = harness.structure.list(project.projectId);
      fail = true;
      await expect(
        harness.operations.executeSplit(
          randomUUID(),
          { ...freshInput, planHash: fresh.planHash },
          randomUUID(),
        ),
      ).rejects.toThrow('INJECTED_STRUCTURE_FAILURE');
      fail = false;
      expect(harness.structure.list(project.projectId)).toEqual(structureBefore);
      await expect(
        harness.drafts.open(randomUUID(), {
          projectId: project.projectId,
          chapterId: first.id,
        }),
      ).resolves.toEqual(unlocked);
    } finally {
      await closeHarness(harness);
    }
  });

  it('moves blocks across chapters and merges through revisioned Draft transactions', async () => {
    const harness = await createHarness();
    try {
      const { project, first, firstDraft } = await createProject(harness, '移动并章');
      const prepared = await addBlocks(harness, project.projectId, first.id, firstDraft, [
        '移动段',
        '保留段',
      ]);
      const structure = await harness.structure.createChapter(randomUUID(), {
        projectId: project.projectId,
        volumeId: first.volumeId,
        title: '目标章',
      });
      const target = structure.volumes[0]!.chapters[1]!;
      const targetDraft = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: target.id,
      });
      const movedBlock = prepared.blocks[1]!;
      const moveInput = {
        projectId: project.projectId,
        sourceChapterId: first.id,
        sourceDraftId: prepared.draftId,
        sourceBaseRevision: prepared.revision,
        targetChapterId: target.id,
        targetDraftId: targetDraft.draftId,
        targetBaseRevision: targetDraft.revision,
        logicalBlockIds: [movedBlock.logicalBlockId],
        afterTargetLogicalBlockId: targetDraft.blocks[0]!.logicalBlockId,
      };
      const movePreview = harness.operations.previewMove(moveInput);
      const moveCheckpoint = await harness.recovery.createOperationCheckpoint(randomUUID(), {
        projectId: project.projectId,
        operation: 'move-blocks',
      });
      const moved = await harness.operations.executeMove(
        randomUUID(),
        { ...moveInput, planHash: movePreview.planHash },
        moveCheckpoint.backupId,
      );
      expect(moved.drafts.map((draft) => draft.blocks.length)).toEqual([2, 2]);
      expect(moved.drafts[1]!.blocks[1]!.logicalBlockId).toBe(movedBlock.logicalBlockId);

      const sourceAfterMove = moved.drafts[0]!;
      const targetAfterMove = moved.drafts[1]!;
      const mergeInput = {
        projectId: project.projectId,
        sourceChapterId: first.id,
        sourceDraftId: sourceAfterMove.draftId,
        sourceBaseRevision: sourceAfterMove.revision,
        targetChapterId: target.id,
        targetDraftId: targetAfterMove.draftId,
        targetBaseRevision: targetAfterMove.revision,
      };
      const mergePreview = harness.operations.previewMerge(mergeInput);
      const mergeCheckpoint = await harness.recovery.createOperationCheckpoint(randomUUID(), {
        projectId: project.projectId,
        operation: 'merge-chapter',
      });
      const merged = await harness.operations.executeMerge(
        randomUUID(),
        { ...mergeInput, planHash: mergePreview.planHash },
        mergeCheckpoint.backupId,
      );
      expect(merged.deletedChapterId).toBe(first.id);
      expect(merged.drafts[0]!.blocks).toHaveLength(4);
      expect(merged.structure.volumes[0]!.chapters.map((chapter) => chapter.id)).toEqual([
        target.id,
      ]);
      expect(harness.structure.listTrash(project.projectId).entries).toEqual([
        expect.objectContaining({ entityType: 'chapter', entityId: first.id }),
      ]);
    } finally {
      await closeHarness(harness);
    }
  });

  it('previews permanent-delete impact, blocks references and deletes only after exact confirmation', async () => {
    const harness = await createHarness();
    try {
      const { project, first, firstDraft } = await createProject(harness, '永久删除');
      await harness.versions.create(randomUUID(), {
        projectId: project.projectId,
        chapterId: first.id,
        draftId: firstDraft.draftId,
        baseRevision: firstDraft.revision,
        title: '阻断删除的版本',
      });
      await harness.structure.deleteChapter(randomUUID(), {
        projectId: project.projectId,
        chapterId: first.id,
      });
      const referencedEntry = harness.structure.listTrash(project.projectId).entries[0]!;
      const referenced = harness.operations.previewPermanentDelete({
        projectId: project.projectId,
        trashEntryId: referencedEntry.id,
      });
      expect(referenced).toMatchObject({
        canDelete: false,
        blockers: [{ kind: 'version', count: 1 }],
      });
      expect(() =>
        harness.operations.assertPermanentDeleteExecutable({
          projectId: project.projectId,
          trashEntryId: referencedEntry.id,
          planHash: referenced.planHash,
          confirmationTitle: referencedEntry.title,
        }),
      ).toThrow(/references block/u);

      const restored = await harness.structure.restoreTrashEntry(randomUUID(), {
        projectId: project.projectId,
        trashEntryId: referencedEntry.id,
        placement: 'original',
      });
      const second = await harness.structure.createChapter(randomUUID(), {
        projectId: project.projectId,
        volumeId: restored.volumes[0]!.id,
        title: '可以永久删除',
      });
      const deletable = second.volumes[0]!.chapters.find(
        (chapter) => chapter.title === '可以永久删除',
      )!;
      await harness.structure.deleteChapter(randomUUID(), {
        projectId: project.projectId,
        chapterId: deletable.id,
      });
      const entry = harness.structure
        .listTrash(project.projectId)
        .entries.find((candidate) => candidate.entityId === deletable.id)!;
      const preview = harness.operations.previewPermanentDelete({
        projectId: project.projectId,
        trashEntryId: entry.id,
      });
      expect(preview).toMatchObject({
        canDelete: true,
        impact: { chapters: 1, drafts: 1, draftBlocks: 1, versions: 0, candidates: 0 },
      });
      expect(() =>
        harness.operations.assertPermanentDeleteExecutable({
          projectId: project.projectId,
          trashEntryId: entry.id,
          planHash: preview.planHash,
          confirmationTitle: '错误标题',
        }),
      ).toThrow(/confirmation title/u);
      const checkpoint = await harness.recovery.createOperationCheckpoint(randomUUID(), {
        projectId: project.projectId,
        operation: 'permanent-delete',
      });
      const result = await harness.operations.permanentDelete(
        randomUUID(),
        {
          projectId: project.projectId,
          trashEntryId: entry.id,
          planHash: preview.planHash,
          confirmationTitle: entry.title,
        },
        checkpoint.backupId,
      );
      expect(result).toMatchObject({ deleted: true, backupId: checkpoint.backupId });
      expect(
        harness.structure
          .listTrash(project.projectId)
          .entries.some((candidate) => candidate.id === entry.id),
      ).toBe(false);
    } finally {
      await closeHarness(harness);
    }
  });

  it('permanently deletes a chapter created by split after a verified checkpoint', async () => {
    const harness = await createHarness();
    try {
      const { project, first, firstDraft } = await createProject(harness, '拆章后永久删除');
      const prepared = await addBlocks(harness, project.projectId, first.id, firstDraft, [
        '拆出的正文',
      ]);
      const splitInput = {
        projectId: project.projectId,
        chapterId: first.id,
        draftId: prepared.draftId,
        baseRevision: prepared.revision,
        splitAfterLogicalBlockId: prepared.blocks[0]!.logicalBlockId,
        newChapterTitle: '拆出章节',
      };
      const splitPreview = harness.operations.previewSplit(splitInput);
      const splitCheckpoint = await harness.recovery.createOperationCheckpoint(randomUUID(), {
        projectId: project.projectId,
        operation: 'split-chapter',
      });
      const split = await harness.operations.executeSplit(
        randomUUID(),
        { ...splitInput, planHash: splitPreview.planHash },
        splitCheckpoint.backupId,
      );
      const target = split.structure.volumes[0]!.chapters[1]!;
      await harness.structure.deleteChapter(randomUUID(), {
        projectId: project.projectId,
        chapterId: target.id,
      });
      const entry = harness.structure
        .listTrash(project.projectId)
        .entries.find((candidate) => candidate.entityId === target.id)!;
      const preview = harness.operations.previewPermanentDelete({
        projectId: project.projectId,
        trashEntryId: entry.id,
      });
      const checkpoint = await harness.recovery.createOperationCheckpoint(randomUUID(), {
        projectId: project.projectId,
        operation: 'permanent-delete',
      });
      await expect(
        harness.operations.permanentDelete(
          randomUUID(),
          {
            projectId: project.projectId,
            trashEntryId: entry.id,
            planHash: preview.planHash,
            confirmationTitle: entry.title,
          },
          checkpoint.backupId,
        ),
      ).resolves.toMatchObject({ deleted: true, backupId: checkpoint.backupId });
    } finally {
      await closeHarness(harness);
    }
  });
});
