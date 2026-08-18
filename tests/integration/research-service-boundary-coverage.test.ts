import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { ResearchService } from '../../packages/core-service/src/research-service.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-08-17T00:00:00.000Z') };

type Harness = Awaited<ReturnType<typeof createHarness>>;

async function createHarness() {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-research-boundary-'));
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
    { name: 'Research boundary coverage', channel: '长篇' },
    parent,
  );
  return { root, parent, runtime, workspace, structure, research, project };
}

async function closeHarness(value: Harness): Promise<void> {
  await value.workspace.shutdown();
  await value.runtime.close();
}

async function createNote(
  value: Harness,
  title = '资料笔记',
  tags: readonly string[] = ['历史'],
  sourceType: 'archive' | 'book' | null = 'archive',
) {
  const catalog = await value.research.createNote(randomUUID(), {
    projectId: value.project.projectId,
    title,
    body: `${title}正文`,
    sourceType,
    sourceLabel: sourceType ? `${title}来源` : null,
    sourceUri: sourceType ? `source:${title}` : null,
    tags: [...tags],
  });
  return catalog.notes.find((note) => note.title === title)!;
}

async function importText(value: Harness, name: string, content: string | Buffer) {
  const source = path.join(value.root, name);
  await writeFile(source, content);
  const catalog = await value.research.importAttachment(
    randomUUID(),
    { projectId: value.project.projectId, noteId: null },
    source,
  );
  return catalog.attachments.find((item) => item.displayName === name)!;
}

async function managedPath(value: Harness, relativePath: string): Promise<string> {
  return value.workspace.resolveProjectPath(value.project.projectId, relativePath);
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('ResearchService boundary coverage', () => {
  it('covers default clock, stored-tag corruption, optimistic conflicts and delete races', async () => {
    const value = await createHarness();
    try {
      const defaultClockService = new ResearchService(value.workspace);
      await defaultClockService.createNote(randomUUID(), {
        projectId: value.project.projectId,
        title: '系统时钟资料',
        body: '',
        sourceType: null,
        sourceLabel: null,
        sourceUri: null,
        tags: [],
      });

      const note = await createNote(value, '冲突资料', ['历史', '地理']);
      expect(
        value.research
          .list({
            projectId: value.project.projectId,
            includeArchived: true,
            tags: ['地理'],
            noteSourceType: 'archive',
          })
          .notes.map((item) => item.id),
      ).toContain(note.id);
      expect(
        value.research.list({
          projectId: value.project.projectId,
          includeArchived: true,
          tags: ['不存在'],
        }).notes,
      ).toHaveLength(0);
      expect(
        value.research
          .list({
            projectId: value.project.projectId,
            includeArchived: true,
            query: '冲突资料',
          })
          .notes.map((item) => item.id),
      ).toContain(note.id);
      expect(
        value.research
          .list({
            projectId: value.project.projectId,
            includeArchived: true,
            query: '冲',
          })
          .notes.map((item) => item.id),
      ).toContain(note.id);
      expect(
        value.research
          .list({
            projectId: value.project.projectId,
            includeArchived: false,
          })
          .notes.map((item) => item.id),
      ).toContain(note.id);

      await expect(
        value.research.updateNote(randomUUID(), {
          projectId: value.project.projectId,
          noteId: note.id,
          expectedUpdatedAt: '2026-08-16T00:00:00.000Z',
          title: note.title,
          body: note.body,
          sourceType: note.sourceType,
          sourceLabel: note.sourceLabel,
          sourceUri: note.sourceUri,
          tags: note.tags,
        }),
      ).rejects.toMatchObject({ code: 'RESEARCH_CONFLICT' });
      await expect(
        value.research.updateNote(randomUUID(), {
          projectId: value.project.projectId,
          noteId: randomUUID(),
          expectedUpdatedAt: note.updatedAt,
          title: note.title,
          body: note.body,
          sourceType: note.sourceType,
          sourceLabel: note.sourceLabel,
          sourceUri: note.sourceUri,
          tags: note.tags,
        }),
      ).rejects.toMatchObject({ code: 'RESEARCH_NOT_FOUND' });
      await expect(
        value.research.setNoteStatus(randomUUID(), {
          projectId: value.project.projectId,
          noteId: note.id,
          expectedUpdatedAt: '2026-08-16T00:00:00.000Z',
          status: 'archived',
        }),
      ).rejects.toMatchObject({ code: 'RESEARCH_CONFLICT' });
      await expect(
        value.research.deleteNote(randomUUID(), {
          projectId: value.project.projectId,
          noteId: randomUUID(),
          expectedUpdatedAt: note.updatedAt,
        }),
      ).rejects.toMatchObject({ code: 'RESEARCH_NOT_FOUND' });
      await expect(
        value.research.deleteNote(randomUUID(), {
          projectId: value.project.projectId,
          noteId: note.id,
          expectedUpdatedAt: '2026-08-16T00:00:00.000Z',
        }),
      ).rejects.toMatchObject({ code: 'RESEARCH_CONFLICT' });

      const blockedDelete = await createNote(value, '阻断删除');
      await value.workspace.writeProject(randomUUID(), value.project.projectId, (database) => {
        database.exec(`
          CREATE TRIGGER research_boundary_ignore_delete
          BEFORE DELETE ON research_notes
          WHEN OLD.id = '${blockedDelete.id}'
          BEGIN
            SELECT RAISE(IGNORE);
          END
        `);
      });
      await expect(
        value.research.deleteNote(randomUUID(), {
          projectId: value.project.projectId,
          noteId: blockedDelete.id,
          expectedUpdatedAt: blockedDelete.updatedAt,
        }),
      ).rejects.toMatchObject({ code: 'RESEARCH_CONFLICT' });
      await value.workspace.writeProject(randomUUID(), value.project.projectId, (database) => {
        database.exec('DROP TRIGGER research_boundary_ignore_delete');
      });

      const disappearing = await createNote(value, '更新后消失');
      await value.workspace.writeProject(randomUUID(), value.project.projectId, (database) => {
        database.exec(`
          CREATE TRIGGER research_boundary_delete_after_update
          AFTER UPDATE ON research_notes
          WHEN NEW.id = '${disappearing.id}'
          BEGIN
            DELETE FROM research_notes WHERE id = NEW.id;
          END
        `);
      });
      const afterStatus = await value.research.setNoteStatus(randomUUID(), {
        projectId: value.project.projectId,
        noteId: disappearing.id,
        expectedUpdatedAt: disappearing.updatedAt,
        status: 'archived',
      });
      expect(afterStatus.notes.some((item) => item.id === disappearing.id)).toBe(false);
      await value.workspace.writeProject(randomUUID(), value.project.projectId, (database) => {
        database.exec('DROP TRIGGER research_boundary_delete_after_update');
      });

      await value.workspace.writeProject(randomUUID(), value.project.projectId, (database) => {
        database.exec('PRAGMA ignore_check_constraints = ON');
        database
          .prepare('UPDATE research_notes SET tags_json = ? WHERE id = ? AND project_id = ?')
          .run('{broken', note.id, value.project.projectId);
        database.exec('PRAGMA ignore_check_constraints = OFF');
      });
      expect(() =>
        value.research.list({ projectId: value.project.projectId, includeArchived: true }),
      ).toThrow(expect.objectContaining({ code: 'RESEARCH_INVALID' }));
    } finally {
      await closeHarness(value);
    }
  });

  it('covers attachment import/preview failures, truncation and database rollback cleanup', async () => {
    const value = await createHarness();
    try {
      await expect(
        value.research.importAttachment(
          randomUUID(),
          { projectId: value.project.projectId, noteId: null },
          'relative.txt',
        ),
      ).rejects.toMatchObject({ code: 'RESEARCH_INVALID' });
      await expect(
        value.research.importAttachment(
          randomUUID(),
          { projectId: value.project.projectId, noteId: null },
          path.join(value.root, 'missing.txt'),
        ),
      ).rejects.toMatchObject({ code: 'RESEARCH_ATTACHMENT_FAILED' });

      const directorySource = path.join(value.root, 'directory.txt');
      await mkdir(directorySource);
      await expect(
        value.research.importAttachment(
          randomUUID(),
          { projectId: value.project.projectId, noteId: null },
          directorySource,
        ),
      ).rejects.toMatchObject({ code: 'RESEARCH_INVALID' });

      const unattachedSource = path.join(value.root, 'note-bound.txt');
      await writeFile(unattachedSource, 'note bound', 'utf8');
      await expect(
        value.research.importAttachment(
          randomUUID(),
          { projectId: value.project.projectId, noteId: randomUUID() },
          unattachedSource,
        ),
      ).rejects.toMatchObject({ code: 'RESEARCH_NOT_FOUND' });

      await value.workspace.writeProject(randomUUID(), value.project.projectId, (database) => {
        database.exec(`
          CREATE TRIGGER research_boundary_block_attachment_insert
          BEFORE INSERT ON research_attachments
          BEGIN
            SELECT RAISE(ABORT, 'blocked attachment insert');
          END
        `);
      });
      const blockedSource = path.join(value.root, 'blocked.txt');
      await writeFile(blockedSource, 'blocked', 'utf8');
      await expect(
        value.research.importAttachment(
          randomUUID(),
          { projectId: value.project.projectId, noteId: null },
          blockedSource,
        ),
      ).rejects.toMatchObject({ code: 'RESEARCH_ATTACHMENT_FAILED' });
      await value.workspace.writeProject(randomUUID(), value.project.projectId, (database) => {
        database.exec('DROP TRIGGER research_boundary_block_attachment_insert');
      });
      expect(
        value.research.list({ projectId: value.project.projectId, includeArchived: true })
          .attachments,
      ).toHaveLength(0);

      const pdfSource = path.join(value.root, 'manual.pdf');
      await writeFile(pdfSource, 'pdf body', 'utf8');
      const pdfCatalog = await value.research.importAttachment(
        randomUUID(),
        { projectId: value.project.projectId, noteId: null },
        pdfSource,
      );
      await expect(
        value.research.previewAttachment({
          projectId: value.project.projectId,
          attachmentId: pdfCatalog.attachments[0]!.id,
        }),
      ).rejects.toMatchObject({ code: 'RESEARCH_INVALID' });
      await expect(
        value.research.previewAttachment({
          projectId: value.project.projectId,
          attachmentId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'RESEARCH_NOT_FOUND' });

      const missingAttachment = await importText(value, 'missing-preview.txt', 'preview source');
      await rm(await managedPath(value, missingAttachment.managedRelativePath), { force: true });
      await expect(
        value.research.previewAttachment({
          projectId: value.project.projectId,
          attachmentId: missingAttachment.id,
        }),
      ).rejects.toMatchObject({ code: 'RESEARCH_ATTACHMENT_FAILED' });

      const mismatched = await importText(value, 'mismatch.txt', 'short');
      await writeFile(
        await managedPath(value, mismatched.managedRelativePath),
        'much longer content',
      );
      await expect(
        value.research.previewAttachment({
          projectId: value.project.projectId,
          attachmentId: mismatched.id,
        }),
      ).rejects.toMatchObject({ code: 'RESEARCH_ATTACHMENT_FAILED' });

      const invalidUtf8 = await importText(value, 'invalid-utf8.txt', Buffer.from([0xff, 0xfe]));
      await expect(
        value.research.previewAttachment({
          projectId: value.project.projectId,
          attachmentId: invalidUtf8.id,
        }),
      ).rejects.toMatchObject({ code: 'RESEARCH_INVALID' });

      const longText = 'x'.repeat(270_000);
      const truncated = await importText(value, 'long-preview.txt', longText);
      const preview = await value.research.previewAttachment({
        projectId: value.project.projectId,
        attachmentId: truncated.id,
      });
      expect(preview.truncated).toBe(true);
      expect(preview.text.length).toBeLessThanOrEqual(262_144);
    } finally {
      await closeHarness(value);
    }
  });

  it('covers attachment delete replay, compensation, detached conflicts and cleanup failures', async () => {
    const value = await createHarness();
    try {
      await expect(
        value.research.deleteAttachment(randomUUID(), {
          projectId: value.project.projectId,
          attachmentId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'RESEARCH_NOT_FOUND' });

      const missingManaged = await importText(value, 'missing-delete.txt', 'delete me');
      await rm(await managedPath(value, missingManaged.managedRelativePath), { force: true });
      await expect(
        value.research.deleteAttachment(randomUUID(), {
          projectId: value.project.projectId,
          attachmentId: missingManaged.id,
        }),
      ).rejects.toMatchObject({ code: 'RESEARCH_ATTACHMENT_FAILED' });

      const compensated = await importText(value, 'compensate.txt', 'restore me');
      const compensatedPath = await managedPath(value, compensated.managedRelativePath);
      await value.workspace.writeProject(randomUUID(), value.project.projectId, (database) => {
        database.exec(`
          CREATE TRIGGER research_boundary_ignore_attachment_delete
          BEFORE DELETE ON research_attachments
          WHEN OLD.id = '${compensated.id}'
          BEGIN
            SELECT RAISE(IGNORE);
          END
        `);
      });
      await expect(
        value.research.deleteAttachment(randomUUID(), {
          projectId: value.project.projectId,
          attachmentId: compensated.id,
        }),
      ).rejects.toMatchObject({ code: 'RESEARCH_CONFLICT' });
      await expect(
        import('node:fs/promises').then(({ stat }) => stat(compensatedPath)),
      ).resolves.toBeDefined();
      await value.workspace.writeProject(randomUUID(), value.project.projectId, (database) => {
        database.exec('DROP TRIGGER research_boundary_ignore_attachment_delete');
      });

      const detachedId = randomUUID();
      const researchDirectory = await value.workspace.resolveProjectPath(
        value.project.projectId,
        'artifacts/research',
      );
      await mkdir(researchDirectory, { recursive: true });
      await expect(
        value.research.deleteAttachment(randomUUID(), {
          projectId: value.project.projectId,
          attachmentId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'RESEARCH_NOT_FOUND' });
      await writeFile(path.join(researchDirectory, `first.deleting-${detachedId}`), 'one');
      await writeFile(path.join(researchDirectory, `second.deleting-${detachedId}`), 'two');
      await expect(
        value.research.deleteAttachment(randomUUID(), {
          projectId: value.project.projectId,
          attachmentId: detachedId,
        }),
      ).rejects.toMatchObject({ code: 'RESEARCH_CONFLICT' });

      const detachedDirectoryId = randomUUID();
      await mkdir(path.join(researchDirectory, `folder.deleting-${detachedDirectoryId}`));
      await expect(
        value.research.deleteAttachment(randomUUID(), {
          projectId: value.project.projectId,
          attachmentId: detachedDirectoryId,
        }),
      ).rejects.toMatchObject({ code: 'RESEARCH_ATTACHMENT_FAILED' });

      const directoryAttachmentId = randomUUID();
      const directoryRelative = `artifacts/research/directory-${directoryAttachmentId}.txt`;
      await mkdir(await managedPath(value, directoryRelative), { recursive: true });
      await value.workspace.writeProject(randomUUID(), value.project.projectId, (database) => {
        database
          .prepare(
            `INSERT INTO research_attachments(
               id, project_id, note_id, display_name, media_type, size_bytes,
               content_hash, managed_relative_path, created_at
             ) VALUES(?, ?, NULL, ?, 'text/plain', 0, ?, ?, ?)`,
          )
          .run(
            directoryAttachmentId,
            value.project.projectId,
            'directory.txt',
            '0'.repeat(64),
            directoryRelative,
            clock.now().toISOString(),
          );
      });
      await expect(
        value.research.deleteAttachment(randomUUID(), {
          projectId: value.project.projectId,
          attachmentId: directoryAttachmentId,
        }),
      ).rejects.toMatchObject({ code: 'RESEARCH_ATTACHMENT_FAILED' });

      const blockingParentRelative = 'artifacts/research/not-a-directory.txt';
      await writeFile(await managedPath(value, blockingParentRelative), 'parent file', 'utf8');
      const nestedAttachmentId = randomUUID();
      await value.workspace.writeProject(randomUUID(), value.project.projectId, (database) => {
        database
          .prepare(
            `INSERT INTO research_attachments(
               id, project_id, note_id, display_name, media_type, size_bytes,
               content_hash, managed_relative_path, created_at
             ) VALUES(?, ?, NULL, ?, 'text/plain', 0, ?, ?, ?)`,
          )
          .run(
            nestedAttachmentId,
            value.project.projectId,
            'nested.txt',
            '1'.repeat(64),
            `${blockingParentRelative}/nested.txt`,
            clock.now().toISOString(),
          );
      });
      await expect(
        value.research.deleteAttachment(randomUUID(), {
          projectId: value.project.projectId,
          attachmentId: nestedAttachmentId,
        }),
      ).rejects.toMatchObject({ code: 'ENOTDIR' });

      await rm(researchDirectory, { recursive: true, force: true });
      await writeFile(researchDirectory, 'not a directory', 'utf8');
      await expect(
        value.research.deleteAttachment(randomUUID(), {
          projectId: value.project.projectId,
          attachmentId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'RESEARCH_ATTACHMENT_FAILED' });
    } finally {
      await closeHarness(value);
    }
  });

  it('covers attachment sources, link removal and target-only catalog filtering', async () => {
    const value = await createHarness();
    try {
      const note = await createNote(value, '链接资料', ['关联'], 'book');
      const attachment = await importText(value, 'link-source.txt', 'attachment source');
      const chapter = value.structure.list(value.project.projectId).volumes[0]!.chapters[0]!;

      await expect(
        value.research.addLink(randomUUID(), {
          projectId: value.project.projectId,
          sourceType: 'attachment',
          sourceId: randomUUID(),
          targetType: 'chapter',
          targetId: chapter.id,
        }),
      ).rejects.toMatchObject({ code: 'RESEARCH_NOT_FOUND' });

      const attached = await value.research.addLink(randomUUID(), {
        projectId: value.project.projectId,
        sourceType: 'attachment',
        sourceId: attachment.id,
        targetType: 'chapter',
        targetId: chapter.id,
      });
      const attachmentLink = attached.links.find((link) => link.sourceId === attachment.id)!;
      const noteLinked = await value.research.addLink(randomUUID(), {
        projectId: value.project.projectId,
        sourceType: 'note',
        sourceId: note.id,
        targetType: 'chapter',
        targetId: chapter.id,
      });
      const noteLink = noteLinked.links.find((link) => link.sourceId === note.id)!;

      expect(
        value.research.list({
          projectId: value.project.projectId,
          includeArchived: true,
          targetType: 'chapter',
        }).links,
      ).toHaveLength(2);
      expect(
        value.research.list({
          projectId: value.project.projectId,
          includeArchived: true,
          targetId: chapter.id,
        }).links,
      ).toHaveLength(2);
      expect(
        value.research
          .list({
            projectId: value.project.projectId,
            includeArchived: true,
            tags: ['关联'],
            noteSourceType: 'book',
            targetType: 'chapter',
            targetId: chapter.id,
          })
          .notes.map((item) => item.id),
      ).toEqual([note.id]);

      const afterRemove = await value.research.removeLink(randomUUID(), {
        projectId: value.project.projectId,
        linkId: attachmentLink.id,
      });
      expect(afterRemove.links.some((link) => link.id === attachmentLink.id)).toBe(false);
      await expect(
        value.research.removeLink(randomUUID(), {
          projectId: value.project.projectId,
          linkId: attachmentLink.id,
        }),
      ).rejects.toMatchObject({ code: 'RESEARCH_NOT_FOUND' });
      expect(noteLink.id).toBeTruthy();
    } finally {
      await closeHarness(value);
    }
  });
});
