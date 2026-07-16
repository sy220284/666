import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import {
  ProjectStructureService,
  type ProjectStructureError,
} from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-16T10:00:00.000Z') };

interface Harness {
  readonly root: string;
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-project-structure-'));
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
    root,
    parent,
    appRuntime,
    workspace,
    structure: new ProjectStructureService(workspace, { clock }),
  };
}

async function closeHarness(harness: Harness): Promise<void> {
  await harness.workspace.shutdown();
  await harness.appRuntime.close();
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('volume and chapter lifecycle', () => {
  it('creates the starter hierarchy by default and supports an explicit professional blank project', async () => {
    const harness = await createHarness();
    try {
      const starter = await harness.workspace.create(
        randomUUID(),
        { name: '起步项目', channel: '长篇' },
        harness.parent,
      );
      expect(harness.structure.list(starter.projectId)).toEqual({
        projectId: starter.projectId,
        volumes: [
          expect.objectContaining({
            title: '第一卷',
            orderKey: '1024',
            status: 'pending',
            chapters: [
              expect.objectContaining({
                title: '第一章',
                orderKey: '1024',
                status: 'pending',
                targetWordMin: null,
                targetWordMax: null,
                activeDraftId: null,
                finalVersionId: null,
              }),
            ],
          }),
        ],
      });

      await harness.workspace.close(randomUUID(), starter.projectId);
      const blank = await harness.workspace.create(
        randomUUID(),
        { name: '专业空白', channel: '长篇', initialStructure: 'blank' },
        harness.parent,
      );
      expect(harness.structure.list(blank.projectId)).toEqual({
        projectId: blank.projectId,
        volumes: [],
      });
    } finally {
      await closeHarness(harness);
    }
  });

  it('creates, edits, orders, and moves chapters across volumes with stable 64-bit keys', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '结构项目', channel: '悬疑', initialStructure: 'blank' },
        harness.parent,
      );
      const first = await harness.structure.createVolume(randomUUID(), {
        projectId: project.projectId,
        title: '第一卷',
        placement: { kind: 'end' },
      });
      const firstVolume = first.volumes[0]!;
      const third = await harness.structure.createVolume(randomUUID(), {
        projectId: project.projectId,
        title: '第三卷',
        placement: { kind: 'end' },
      });
      const thirdVolume = third.volumes[1]!;
      const ordered = await harness.structure.createVolume(randomUUID(), {
        projectId: project.projectId,
        title: '第二卷',
        placement: { kind: 'before', siblingId: thirdVolume.id },
      });
      expect(ordered.volumes.map((volume) => volume.title)).toEqual(['第一卷', '第二卷', '第三卷']);
      expect(new Set(ordered.volumes.map((volume) => volume.orderKey)).size).toBe(3);

      const chapterOne = await harness.structure.createChapter(randomUUID(), {
        projectId: project.projectId,
        volumeId: firstVolume.id,
        title: '开端',
        placement: { kind: 'end' },
      });
      const opening = chapterOne.volumes[0]!.chapters[0]!;
      await harness.structure.createChapter(randomUUID(), {
        projectId: project.projectId,
        volumeId: firstVolume.id,
        title: '追索',
        placement: { kind: 'end' },
      });
      const updated = await harness.structure.updateChapter(randomUUID(), {
        projectId: project.projectId,
        chapterId: opening.id,
        patch: {
          title: '雨夜开端',
          status: 'writing',
          targetWordMin: 2_500,
          targetWordMax: 3_500,
        },
      });
      expect(updated.volumes[0]!.chapters[0]).toMatchObject({
        title: '雨夜开端',
        status: 'writing',
        targetWordMin: 2_500,
        targetWordMax: 3_500,
      });

      const moved = await harness.structure.moveChapter(randomUUID(), {
        projectId: project.projectId,
        chapterId: opening.id,
        targetVolumeId: thirdVolume.id,
        placement: { kind: 'start' },
      });
      expect(moved.volumes[0]!.chapters.map((chapter) => chapter.title)).toEqual(['追索']);
      expect(moved.volumes[2]!.chapters.map((chapter) => chapter.title)).toEqual(['雨夜开端']);

      const beforeRestart = harness.structure.list(project.projectId);
      await harness.workspace.close(randomUUID(), project.projectId);
      await harness.workspace.open(randomUUID(), { workspacePath: project.workspacePath });
      expect(harness.structure.list(project.projectId)).toEqual(beforeRestart);
    } finally {
      await closeHarness(harness);
    }
  });

  it('uses midpoint insertion, locally rebalances only when gaps are exhausted, and rejects duplicates', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '排序项目', channel: '奇幻', initialStructure: 'blank' },
        harness.parent,
      );
      let snapshot = await harness.structure.createVolume(randomUUID(), {
        projectId: project.projectId,
        title: '左界',
        placement: { kind: 'end' },
      });
      const leftId = snapshot.volumes[0]!.id;
      snapshot = await harness.structure.createVolume(randomUUID(), {
        projectId: project.projectId,
        title: '右界',
        placement: { kind: 'end' },
      });
      const rightId = snapshot.volumes[1]!.id;

      for (let index = 0; index < 12; index += 1) {
        snapshot = await harness.structure.createVolume(randomUUID(), {
          projectId: project.projectId,
          title: `中间-${index}`,
          placement: { kind: 'before', siblingId: rightId },
        });
      }
      const keys = snapshot.volumes.map((volume) => BigInt(volume.orderKey));
      expect(keys.every((key, index) => index === 0 || key > keys[index - 1]!)).toBe(true);
      expect(new Set(keys.map(String)).size).toBe(keys.length);
      expect(snapshot.volumes[0]!.id).toBe(leftId);
      expect(snapshot.volumes.at(-1)!.id).toBe(rightId);

      await expect(
        harness.structure.createVolume(randomUUID(), {
          projectId: project.projectId,
          title: '左界',
          placement: { kind: 'end' },
        }),
      ).rejects.toMatchObject<ProjectStructureError>({ code: 'STRUCTURE_CONFLICT' });
    } finally {
      await closeHarness(harness);
    }
  });

  it('soft-deletes into trash and restores near an occupied original position', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '废纸篓项目', channel: '现实', initialStructure: 'blank' },
        harness.parent,
      );
      const withVolume = await harness.structure.createVolume(randomUUID(), {
        projectId: project.projectId,
        title: '正文卷',
        placement: { kind: 'end' },
      });
      const volumeId = withVolume.volumes[0]!.id;
      const first = await harness.structure.createChapter(randomUUID(), {
        projectId: project.projectId,
        volumeId,
        title: '待恢复',
        placement: { kind: 'end' },
      });
      const deletedChapterId = first.volumes[0]!.chapters[0]!.id;
      await harness.structure.createChapter(randomUUID(), {
        projectId: project.projectId,
        volumeId,
        title: '保留章',
        placement: { kind: 'end' },
      });
      await harness.structure.deleteChapter(randomUUID(), {
        projectId: project.projectId,
        chapterId: deletedChapterId,
      });
      const trash = harness.structure.listTrash(project.projectId);
      expect(trash.entries).toEqual([
        expect.objectContaining({
          entityType: 'chapter',
          entityId: deletedChapterId,
          title: '待恢复',
          originalParentId: volumeId,
          originalOrderKey: '1024',
        }),
      ]);

      await harness.structure.createChapter(randomUUID(), {
        projectId: project.projectId,
        volumeId,
        title: '占位章',
        placement: { kind: 'start' },
      });
      const restored = await harness.structure.restoreTrashEntry(randomUUID(), {
        projectId: project.projectId,
        trashEntryId: trash.entries[0]!.id,
        placement: 'original',
      });
      expect(restored.volumes[0]!.chapters.map((chapter) => chapter.title)).toEqual([
        '待恢复',
        '占位章',
        '保留章',
      ]);
      expect(harness.structure.listTrash(project.projectId).entries).toEqual([]);
    } finally {
      await closeHarness(harness);
    }
  });

  it('rolls back both the trash record and soft delete when a transaction is interrupted', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '事务项目', channel: '现实' },
        harness.parent,
      );
      const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      const interrupted = new ProjectStructureService(harness.workspace, {
        clock,
        faultInjector: () => {
          throw new Error('injected-structure-interruption');
        },
      });
      await expect(
        interrupted.deleteChapter(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
        }),
      ).rejects.toThrow('injected-structure-interruption');
      expect(harness.structure.list(project.projectId).volumes[0]!.chapters).toEqual([
        expect.objectContaining({ id: chapter.id, title: '第一章' }),
      ]);
      expect(harness.structure.listTrash(project.projectId).entries).toEqual([]);
    } finally {
      await closeHarness(harness);
    }
  });

  it('restores a soft-deleted volume together with its still-authoritative child chapters', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '卷恢复项目', channel: '长篇' },
        harness.parent,
      );
      const original = harness.structure.list(project.projectId).volumes[0]!;
      const deleted = await harness.structure.deleteVolume(randomUUID(), {
        projectId: project.projectId,
        volumeId: original.id,
      });
      expect(deleted.volumes).toEqual([]);
      const trash = harness.structure.listTrash(project.projectId);
      expect(trash.entries).toEqual([
        expect.objectContaining({ entityType: 'volume', entityId: original.id }),
      ]);
      const restored = await harness.structure.restoreTrashEntry(randomUUID(), {
        projectId: project.projectId,
        trashEntryId: trash.entries[0]!.id,
        placement: { kind: 'end' },
      });
      expect(restored.volumes).toEqual([
        expect.objectContaining({
          id: original.id,
          title: '第一卷',
          chapters: [expect.objectContaining({ title: '第一章' })],
        }),
      ]);
    } finally {
      await closeHarness(harness);
    }
  });
});
