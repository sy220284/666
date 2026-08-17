import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import {
  initializeProjectStructure,
  ProjectStructureService,
  type ProjectStructureError,
} from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-08-17T06:00:00.000Z') };

interface Harness {
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-project-structure-edge-'));
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
  };
}

async function closeHarness(harness: Harness): Promise<void> {
  await harness.workspace.shutdown();
  await harness.appRuntime.close();
}

async function createBlankProject(harness: Harness, name: string) {
  return harness.workspace.create(
    randomUUID(),
    { name, channel: '长篇', initialStructure: 'blank' },
    harness.parent,
  );
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('project structure edge coverage', () => {
  it('covers the exported blank/starter initializer including draft creation', async () => {
    const harness = await createHarness();
    try {
      const project = await createBlankProject(harness, '初始化边界');
      const blank = await harness.workspace.writeProject(
        randomUUID(),
        project.projectId,
        (connection) =>
          initializeProjectStructure(
            connection,
            project.projectId,
            'blank',
            clock.now().toISOString(),
          ),
      );
      expect(blank).toBeNull();

      const starter = await harness.workspace.writeProject(
        randomUUID(),
        project.projectId,
        (connection) =>
          initializeProjectStructure(
            connection,
            project.projectId,
            'starter',
            clock.now().toISOString(),
          ),
      );
      expect(starter).toEqual({ volumeId: expect.any(String), chapterId: expect.any(String) });
      expect(harness.structure.list(project.projectId).volumes[0]).toMatchObject({
        title: '第一卷',
        chapters: [expect.objectContaining({ title: '第一章', activeDraftId: expect.any(String) })],
      });
    } finally {
      await closeHarness(harness);
    }
  });

  it('updates and moves volumes while exercising default service options', async () => {
    const harness = await createHarness();
    try {
      const project = await createBlankProject(harness, '卷操作边界');
      const structure = new ProjectStructureService(harness.workspace);
      let snapshot = await structure.createVolume(randomUUID(), {
        projectId: project.projectId,
        title: '甲卷',
      });
      const firstId = snapshot.volumes[0]!.id;
      snapshot = await structure.createVolume(randomUUID(), {
        projectId: project.projectId,
        title: '乙卷',
      });
      const secondId = snapshot.volumes[1]!.id;
      snapshot = await structure.createVolume(randomUUID(), {
        projectId: project.projectId,
        title: '丙卷',
      });
      const thirdId = snapshot.volumes[2]!.id;

      snapshot = await structure.updateVolume(randomUUID(), {
        projectId: project.projectId,
        volumeId: firstId,
        patch: { title: '甲卷改' },
      });
      expect(snapshot.volumes[0]).toMatchObject({ title: '甲卷改', status: 'pending' });

      snapshot = await structure.updateVolume(randomUUID(), {
        projectId: project.projectId,
        volumeId: firstId,
        patch: { status: 'outlined' },
      });
      expect(snapshot.volumes[0]).toMatchObject({ title: '甲卷改', status: 'outlined' });

      snapshot = await structure.moveVolume(randomUUID(), {
        projectId: project.projectId,
        volumeId: thirdId,
        placement: { kind: 'start' },
      });
      expect(snapshot.volumes.map((volume) => volume.id)).toEqual([thirdId, firstId, secondId]);

      snapshot = await structure.deleteVolume(randomUUID(), {
        projectId: project.projectId,
        volumeId: secondId,
      });
      expect(snapshot.volumes.map((volume) => volume.id)).toEqual([thirdId, firstId]);
    } finally {
      await closeHarness(harness);
    }
  });

  it('rejects missing entities, unavailable positions, duplicate chapter titles and combined word limits', async () => {
    const harness = await createHarness();
    try {
      const project = await createBlankProject(harness, '冲突边界');
      const snapshot = await harness.structure.createVolume(randomUUID(), {
        projectId: project.projectId,
        title: '正文卷',
      });
      const volumeId = snapshot.volumes[0]!.id;
      const withChapter = await harness.structure.createChapter(randomUUID(), {
        projectId: project.projectId,
        volumeId,
        title: '唯一章',
      });
      const chapterId = withChapter.volumes[0]!.chapters[0]!.id;

      await expect(
        harness.structure.updateVolume(randomUUID(), {
          projectId: project.projectId,
          volumeId: randomUUID(),
          patch: { title: '不存在' },
        }),
      ).rejects.toMatchObject<ProjectStructureError>({ code: 'STRUCTURE_NOT_FOUND' });
      await expect(
        harness.structure.updateChapter(randomUUID(), {
          projectId: project.projectId,
          chapterId: randomUUID(),
          patch: { title: '不存在' },
        }),
      ).rejects.toMatchObject<ProjectStructureError>({ code: 'STRUCTURE_NOT_FOUND' });
      await expect(
        harness.structure.createVolume(randomUUID(), {
          projectId: project.projectId,
          title: '非法位置',
          placement: { kind: 'before', siblingId: randomUUID() },
        }),
      ).rejects.toMatchObject<ProjectStructureError>({ code: 'STRUCTURE_INVALID_POSITION' });
      await expect(
        harness.structure.createChapter(randomUUID(), {
          projectId: project.projectId,
          volumeId,
          title: '唯一章',
        }),
      ).rejects.toMatchObject<ProjectStructureError>({ code: 'STRUCTURE_CONFLICT' });

      await harness.structure.updateChapter(randomUUID(), {
        projectId: project.projectId,
        chapterId,
        patch: { targetWordMin: 5_000 },
      });
      await expect(
        harness.structure.updateChapter(randomUUID(), {
          projectId: project.projectId,
          chapterId,
          patch: { targetWordMax: 4_000 },
        }),
      ).rejects.toMatchObject<ProjectStructureError>({ code: 'STRUCTURE_CONFLICT' });

      await expect(
        harness.structure.restoreTrashEntry(randomUUID(), {
          projectId: project.projectId,
          trashEntryId: randomUUID(),
          placement: 'original',
        }),
      ).rejects.toMatchObject<ProjectStructureError>({ code: 'STRUCTURE_NOT_FOUND' });
    } finally {
      await closeHarness(harness);
    }
  });

  it('rejects invalid restore parent combinations for volumes and chapters', async () => {
    const harness = await createHarness();
    try {
      const project = await createBlankProject(harness, '恢复边界');
      let snapshot = await harness.structure.createVolume(randomUUID(), {
        projectId: project.projectId,
        title: '待删卷',
      });
      const deletedVolumeId = snapshot.volumes[0]!.id;
      snapshot = await harness.structure.createVolume(randomUUID(), {
        projectId: project.projectId,
        title: '目标卷',
      });
      const targetVolumeId = snapshot.volumes[1]!.id;
      await harness.structure.deleteVolume(randomUUID(), {
        projectId: project.projectId,
        volumeId: deletedVolumeId,
      });
      let trash = harness.structure.listTrash(project.projectId);
      const volumeTrash = trash.entries.find((entry) => entry.entityType === 'volume')!;
      await expect(
        harness.structure.restoreTrashEntry(randomUUID(), {
          projectId: project.projectId,
          trashEntryId: volumeTrash.id,
          placement: { kind: 'end' },
          targetVolumeId,
        }),
      ).rejects.toMatchObject<ProjectStructureError>({ code: 'STRUCTURE_INVALID_POSITION' });
      snapshot = await harness.structure.restoreTrashEntry(randomUUID(), {
        projectId: project.projectId,
        trashEntryId: volumeTrash.id,
        placement: 'original',
      });
      expect(snapshot.volumes[0]?.id).toBe(deletedVolumeId);

      await harness.structure.deleteVolume(randomUUID(), {
        projectId: project.projectId,
        volumeId: targetVolumeId,
      });
      trash = harness.structure.listTrash(project.projectId);
      const trailingVolumeTrash = trash.entries.find(
        (entry) => entry.entityType === 'volume' && entry.entityId === targetVolumeId,
      )!;
      snapshot = await harness.structure.restoreTrashEntry(randomUUID(), {
        projectId: project.projectId,
        trashEntryId: trailingVolumeTrash.id,
        placement: 'original',
      });
      expect(snapshot.volumes.at(-1)?.id).toBe(targetVolumeId);

      snapshot = await harness.structure.createChapter(randomUUID(), {
        projectId: project.projectId,
        volumeId: targetVolumeId,
        title: '待删章',
      });
      const chapterId = snapshot.volumes.find((volume) => volume.id === targetVolumeId)!
        .chapters[0]!.id;
      await harness.structure.deleteChapter(randomUUID(), {
        projectId: project.projectId,
        chapterId,
      });
      trash = harness.structure.listTrash(project.projectId);
      const chapterTrash = trash.entries.find((entry) => entry.entityType === 'chapter')!;
      await expect(
        harness.structure.restoreTrashEntry(randomUUID(), {
          projectId: project.projectId,
          trashEntryId: chapterTrash.id,
          placement: 'original',
          targetVolumeId,
        }),
      ).rejects.toMatchObject<ProjectStructureError>({ code: 'STRUCTURE_INVALID_POSITION' });
      snapshot = await harness.structure.restoreTrashEntry(randomUUID(), {
        projectId: project.projectId,
        trashEntryId: chapterTrash.id,
        placement: { kind: 'end' },
      });
      expect(snapshot.volumes.find((volume) => volume.id === targetVolumeId)?.chapters[0]?.id).toBe(
        chapterId,
      );
    } finally {
      await closeHarness(harness);
    }
  });

  it('rejects persisted word targets outside the safe JavaScript integer range', async () => {
    const harness = await createHarness();
    try {
      const project = await createBlankProject(harness, '持久化边界');
      let snapshot = await harness.structure.createVolume(randomUUID(), {
        projectId: project.projectId,
        title: '正文卷',
      });
      const volumeId = snapshot.volumes[0]!.id;
      snapshot = await harness.structure.createChapter(randomUUID(), {
        projectId: project.projectId,
        volumeId,
        title: '超界章',
      });
      const chapterId = snapshot.volumes[0]!.chapters[0]!.id;
      await harness.workspace.writeProject(randomUUID(), project.projectId, (connection) => {
        connection
          .prepare('UPDATE chapters SET target_word_min = ? WHERE id = ?')
          .run(BigInt(Number.MAX_SAFE_INTEGER) + 1n, chapterId);
      });
      expect(() => harness.structure.list(project.projectId)).toThrowError(
        expect.objectContaining({ code: 'STRUCTURE_CONFLICT' }),
      );
    } finally {
      await closeHarness(harness);
    }
  });
});
