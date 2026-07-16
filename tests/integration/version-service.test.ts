import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { VersionService } from '../../packages/core-service/src/version.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-16T18:00:00.000Z') };

async function harness() {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-version-'));
  temporaryDirectories.push(root);
  const parent = path.join(root, 'projects');
  await mkdir(parent, { recursive: true });
  const appRuntime: AppRuntime = await openAppRuntime({
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
  const structure = new ProjectStructureService(workspace, { clock });
  const drafts = new DraftService(workspace, { clock });
  const versions = new VersionService(workspace, { clock });
  return { root, parent, appRuntime, workspace, structure, drafts, versions };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M1-07 immutable manual Versions', () => {
  it('creates, finalizes and restores a Version as a new active Draft', async () => {
    const value = await harness();
    try {
      const project = await value.workspace.create(
        randomUUID(),
        { name: '版本项目', channel: '长篇' },
        value.parent,
      );
      const chapter = value.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      const draft = await value.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      const initial = draft.blocks[0]!;
      const edited = await value.drafts.applyPatch(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseRevision: draft.revision,
        operations: [
          {
            type: 'update',
            logicalBlockId: initial.logicalBlockId,
            expectedHash: initial.contentHash!,
            content: '首稿正文',
          },
        ],
      });
      const version = await value.versions.create(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: edited.draftId,
        baseRevision: edited.revision,
        title: '首稿',
        description: '阶段留档',
        label: '第一阶段',
      });
      const immutableSnapshot = structuredClone(version);
      expect(version.label).toBe('第一阶段');
      expect(
        value.versions.list({ projectId: project.projectId, chapterId: chapter.id }).versions,
      ).toHaveLength(1);
      await expect(
        value.versions.create(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
          draftId: edited.draftId,
          baseRevision: edited.revision,
          title: '首稿',
        }),
      ).rejects.toMatchObject({ code: 'VERSION_TITLE_CONFLICT' });

      const finalized = await value.versions.setFinal(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        versionId: version.versionId,
      });
      expect(finalized.finalized).toBe(true);
      expect(value.structure.list(project.projectId).volumes[0]!.chapters[0]!.finalVersionId).toBe(
        version.versionId,
      );

      const changed = await value.drafts.applyPatch(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: edited.draftId,
        baseRevision: edited.revision,
        operations: [
          {
            type: 'update',
            logicalBlockId: edited.blocks[0]!.logicalBlockId,
            expectedHash: edited.blocks[0]!.contentHash!,
            content: '后续修改',
          },
        ],
      });
      const restored = await value.versions.restore(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        versionId: version.versionId,
      });
      expect(restored.draftId).not.toBe(changed.draftId);
      expect(restored.blocks[0]!.text).toBe('首稿正文');
      const continued = await value.drafts.applyPatch(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: restored.draftId,
        baseRevision: restored.revision,
        operations: [
          {
            type: 'update',
            logicalBlockId: restored.blocks[0]!.logicalBlockId,
            expectedHash: restored.blocks[0]!.contentHash!,
            content: '恢复后继续编辑',
          },
        ],
      });
      expect(continued.blocks[0]!.text).toBe('恢复后继续编辑');
      expect(
        value.workspace.readProject(project.projectId, (database) =>
          Number(
            database
              .prepare(
                "SELECT COUNT(*) AS count FROM drafts WHERE chapter_id = ? AND status = 'archived'",
              )
              .get(chapter.id)?.count ?? 0,
          ),
        ),
      ).toBe(1);
      expect(
        value.versions.get({
          projectId: project.projectId,
          chapterId: chapter.id,
          versionId: version.versionId,
        }),
      ).toEqual({ ...immutableSnapshot, finalized: true });

      const beforeMissingRestore = await value.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      await expect(
        value.versions.restore(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
          versionId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'VERSION_NOT_FOUND' });
      await expect(
        value.drafts.open(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
        }),
      ).resolves.toEqual(beforeMissingRestore);

      await value.workspace.close(randomUUID(), project.projectId);
      await value.workspace.open(randomUUID(), { workspacePath: project.workspacePath });
      const reopenedVersions = new VersionService(value.workspace, { clock });
      const reopened = reopenedVersions.list({
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      expect(reopened.finalVersionId).toBe(version.versionId);
      expect(reopened.versions).toHaveLength(1);
      expect(reopened.versions[0]).toMatchObject({
        versionId: immutableSnapshot.versionId,
        projectId: immutableSnapshot.projectId,
        chapterId: immutableSnapshot.chapterId,
        sourceDraftId: immutableSnapshot.sourceDraftId,
        sourceRevision: immutableSnapshot.sourceRevision,
        title: immutableSnapshot.title,
        description: immutableSnapshot.description,
        label: immutableSnapshot.label,
        wordCount: immutableSnapshot.wordCount,
        contentHash: immutableSnapshot.contentHash,
        createdAt: immutableSnapshot.createdAt,
        finalized: true,
      });

      const serviceSource = await readFile('packages/core-service/src/version.ts', 'utf8');
      expect(serviceSource).not.toMatch(
        /(?:UPDATE|DELETE\s+FROM)\s+(?:versions|version_blocks)\b/iu,
      );
    } finally {
      await value.workspace.shutdown();
      await value.appRuntime.close();
    }
  });
});
