import { randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { ResearchService } from '../../packages/core-service/src/research-service.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-08-14T08:00:00.000Z') };

async function harness() {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-m12-02-research-'));
  temporaryDirectories.push(root);
  const parent = path.join(root, 'projects');
  await mkdir(parent, { recursive: true });
  const runtime = await openAppRuntime({
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
    recentProjects: runtime.recentProjects,
    clock,
  });
  const structure = new ProjectStructureService(workspace, { clock });
  const research = new ResearchService(workspace, { clock });
  const project = await workspace.create(
    randomUUID(),
    { name: 'M12-02 研究资料测试', channel: '长篇' },
    parent,
  );
  return { root, runtime, workspace, structure, research, project };
}

async function missing(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return false;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return true;
    throw error;
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M12-02 research assets', () => {
  it('uses indexed search, preserves duplicate-note identity and enforces SHA constraints', async () => {
    const value = await harness();
    try {
      const first = await value.research.createNote(randomUUID(), {
        projectId: value.project.projectId,
        title: '未命名研究笔记',
        body: '秦岭古道驿站与沿线水源记录',
        sourceUri: 'archive:qinling-01',
        tags: ['历史', '交通'],
      });
      const firstNote = first.notes.find((note) => note.body.includes('秦岭古道驿站'));
      expect(firstNote).toBeDefined();

      const second = await value.research.createNote(randomUUID(), {
        projectId: value.project.projectId,
        title: '未命名研究笔记',
        body: '第二条同名笔记',
        sourceUri: null,
        tags: [],
      });
      const duplicateIds = second.notes
        .filter((note) => note.title === '未命名研究笔记')
        .map((note) => note.id);
      expect(new Set(duplicateIds).size).toBe(2);

      expect(
        value.research
          .list({
            projectId: value.project.projectId,
            includeArchived: false,
            query: '古道驿',
          })
          .notes.map((note) => note.id),
      ).toEqual([firstNote!.id]);
      expect(
        value.research
          .list({
            projectId: value.project.projectId,
            includeArchived: false,
            query: '古',
          })
          .notes.map((note) => note.id),
      ).toEqual([firstNote!.id]);

      await expect(
        value.workspace.writeProject(randomUUID(), value.project.projectId, (database) => {
          database
            .prepare(
              `INSERT INTO research_attachments(
                 id, project_id, note_id, display_name, media_type, size_bytes,
                 content_hash, managed_relative_path, created_at
               ) VALUES(?, ?, NULL, 'invalid.txt', 'text/plain', 1, ?, ?, ?)`,
            )
            .run(
              randomUUID(),
              value.project.projectId,
              `${'a'.repeat(63)}g`,
              `artifacts/research/${randomUUID()}.txt`,
              clock.now().toISOString(),
            );
        }),
      ).rejects.toThrow();
    } finally {
      await value.workspace.shutdown();
      await value.runtime.close();
    }
  });

  it('keeps attachment deletion replayable across filesystem and database interruption points', async () => {
    const value = await harness();
    try {
      const catalog = await value.research.createNote(randomUUID(), {
        projectId: value.project.projectId,
        title: '附件笔记',
        body: '',
        sourceUri: null,
        tags: [],
      });
      const note = catalog.notes.find((candidate) => candidate.title === '附件笔记');
      expect(note).toBeDefined();
      const sourcePath = path.join(value.root, 'source.txt');
      await writeFile(sourcePath, '受管附件正文', 'utf8');

      const imported = await value.research.importAttachment(
        randomUUID(),
        { projectId: value.project.projectId, noteId: note!.id },
        sourcePath,
      );
      const attachment = imported.attachments[0];
      expect(attachment).toBeDefined();
      expect(attachment!.contentHash).toMatch(/^[0-9a-f]{64}$/u);
      const managedPath = await value.workspace.resolveProjectPath(
        value.project.projectId,
        attachment!.managedRelativePath,
      );
      expect(await readFile(managedPath, 'utf8')).toBe('受管附件正文');
      const deleted = await value.research.deleteAttachment(randomUUID(), {
        projectId: value.project.projectId,
        attachmentId: attachment!.id,
      });
      expect(deleted.attachments).toHaveLength(0);
      expect(await missing(managedPath)).toBe(true);

      const beforeDatabaseCommit = await value.research.importAttachment(
        randomUUID(),
        { projectId: value.project.projectId, noteId: note!.id },
        sourcePath,
      );
      const stagedAttachment = beforeDatabaseCommit.attachments[0]!;
      const stagedManagedPath = await value.workspace.resolveProjectPath(
        value.project.projectId,
        stagedAttachment.managedRelativePath,
      );
      const stagedPath = `${stagedManagedPath}.deleting-${stagedAttachment.id}`;
      await rename(stagedManagedPath, stagedPath);
      const resumed = await value.research.deleteAttachment(randomUUID(), {
        projectId: value.project.projectId,
        attachmentId: stagedAttachment.id,
      });
      expect(resumed.attachments).toHaveLength(0);
      expect(await missing(stagedPath)).toBe(true);

      const afterDatabaseCommit = await value.research.importAttachment(
        randomUUID(),
        { projectId: value.project.projectId, noteId: note!.id },
        sourcePath,
      );
      const detachedAttachment = afterDatabaseCommit.attachments[0]!;
      const detachedManagedPath = await value.workspace.resolveProjectPath(
        value.project.projectId,
        detachedAttachment.managedRelativePath,
      );
      const detachedStagedPath = `${detachedManagedPath}.deleting-${detachedAttachment.id}`;
      await rename(detachedManagedPath, detachedStagedPath);
      await value.workspace.writeProject(randomUUID(), value.project.projectId, (database) => {
        database
          .prepare('DELETE FROM research_attachments WHERE id = ? AND project_id = ?')
          .run(detachedAttachment.id, value.project.projectId);
      });
      const completed = await value.research.deleteAttachment(randomUUID(), {
        projectId: value.project.projectId,
        attachmentId: detachedAttachment.id,
      });
      expect(completed.attachments).toHaveLength(0);
      expect(await missing(detachedStagedPath)).toBe(true);
    } finally {
      await value.workspace.shutdown();
      await value.runtime.close();
    }
  });

  it('removes research links when a chapter becomes logically deleted', async () => {
    const value = await harness();
    try {
      const chapter = value.structure.list(value.project.projectId).volumes[0]!.chapters[0]!;
      const catalog = await value.research.createNote(randomUUID(), {
        projectId: value.project.projectId,
        title: '章节关联资料',
        body: '',
        sourceUri: null,
        tags: [],
      });
      const note = catalog.notes.find((candidate) => candidate.title === '章节关联资料');
      expect(note).toBeDefined();
      const linked = await value.research.addLink(randomUUID(), {
        projectId: value.project.projectId,
        sourceType: 'note',
        sourceId: note!.id,
        targetType: 'chapter',
        targetId: chapter.id,
      });
      expect(linked.links).toHaveLength(1);

      await value.structure.deleteChapter(randomUUID(), {
        projectId: value.project.projectId,
        chapterId: chapter.id,
      });
      expect(
        value.research.list({
          projectId: value.project.projectId,
          includeArchived: true,
        }).links,
      ).toHaveLength(0);
      await expect(
        value.research.addLink(randomUUID(), {
          projectId: value.project.projectId,
          sourceType: 'note',
          sourceId: note!.id,
          targetType: 'chapter',
          targetId: chapter.id,
        }),
      ).rejects.toMatchObject({ code: 'RESEARCH_NOT_FOUND' });
    } finally {
      await value.workspace.shutdown();
      await value.runtime.close();
    }
  });
});
