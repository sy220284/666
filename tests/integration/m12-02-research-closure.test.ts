import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import {
  MAX_RESEARCH_ATTACHMENT_BYTES,
  MAX_RESEARCH_PROJECT_ATTACHMENT_BYTES,
  ResearchService,
} from '../../packages/core-service/src/research-service.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-08-14T10:30:00.000Z') };

async function harness() {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-m12-02-closure-'));
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
    { name: 'M12-02 闭环测试', channel: '长篇' },
    parent,
  );
  return { root, parent, runtime, workspace, structure, research, project };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M12-02 research closure boundaries', () => {
  it(
    'supports complete note lifecycle with source metadata and detached managed attachments',
    async () => {
      const value = await harness();
      try {
        let catalog = await value.research.createNote(randomUUID(), {
          projectId: value.project.projectId,
          title: '地方志摘录',
          body: '初稿',
          sourceType: 'archive',
          sourceLabel: '县志卷三',
          sourceUri: 'archive:county-3',
          tags: ['地方志'],
        });
        let note = catalog.notes[0]!;
        expect(note).toMatchObject({
          sourceType: 'archive',
          sourceLabel: '县志卷三',
          archivedAt: null,
          status: 'active',
        });

        catalog = await value.research.updateNote(randomUUID(), {
          projectId: value.project.projectId,
          noteId: note.id,
          expectedUpdatedAt: note.updatedAt,
          title: note.title,
          body: '修订稿',
          sourceType: 'archive',
          sourceLabel: '县志卷三·修订',
          sourceUri: note.sourceUri,
          tags: note.tags,
        });
        note = catalog.notes[0]!;
        expect(note.body).toBe('修订稿');
        expect(note.sourceLabel).toBe('县志卷三·修订');

        catalog = await value.research.setNoteStatus(randomUUID(), {
          projectId: value.project.projectId,
          noteId: note.id,
          expectedUpdatedAt: note.updatedAt,
          status: 'archived',
        });
        note = catalog.notes[0]!;
        expect(note.archivedAt).toBe(clock.now().toISOString());

        catalog = await value.research.setNoteStatus(randomUUID(), {
          projectId: value.project.projectId,
          noteId: note.id,
          expectedUpdatedAt: note.updatedAt,
          status: 'active',
        });
        note = catalog.notes[0]!;
        expect(note.archivedAt).toBeNull();

        const source = path.join(value.root, 'note.txt');
        await writeFile(source, '安全预览正文', 'utf8');
        catalog = await value.research.importAttachment(
          randomUUID(),
          { projectId: value.project.projectId, noteId: note.id },
          source,
        );
        const attachment = catalog.attachments[0]!;
        const preview = await value.research.previewAttachment({
          projectId: value.project.projectId,
          attachmentId: attachment.id,
        });
        expect(preview).toMatchObject({
          text: '安全预览正文',
          truncated: false,
          mediaType: 'text/plain',
        });

        catalog = await value.research.deleteNote(randomUUID(), {
          projectId: value.project.projectId,
          noteId: note.id,
          expectedUpdatedAt: note.updatedAt,
        });
        expect(catalog.notes).toHaveLength(0);
        expect(catalog.attachments).toHaveLength(1);
        expect(catalog.attachments[0]!.noteId).toBeNull();
      } finally {
        await value.workspace.shutdown();
        await value.runtime.close();
      }
    },
  );

  it(
    'rejects unsafe attachment types, tampered previews, duplicate content and project quota overflow',
    async () => {
      const value = await harness();
      try {
        const executable = path.join(value.root, 'payload.exe');
        await writeFile(executable, 'MZ', 'utf8');
        await expect(
          value.research.importAttachment(
            randomUUID(),
            { projectId: value.project.projectId, noteId: null },
            executable,
          ),
        ).rejects.toMatchObject({ code: 'RESEARCH_INVALID' });

        const source = path.join(value.root, 'safe.txt');
        await writeFile(source, '原始内容', 'utf8');
        const imported = await value.research.importAttachment(
          randomUUID(),
          { projectId: value.project.projectId, noteId: null },
          source,
        );
        const attachment = imported.attachments[0]!;
        await expect(
          value.research.importAttachment(
            randomUUID(),
            { projectId: value.project.projectId, noteId: null },
            source,
          ),
        ).rejects.toMatchObject({ code: 'RESEARCH_CONFLICT' });
        const managed = await value.workspace.resolveProjectPath(
          value.project.projectId,
          attachment.managedRelativePath,
        );
        await writeFile(managed, '篡改内容', 'utf8');
        await expect(
          value.research.previewAttachment({
            projectId: value.project.projectId,
            attachmentId: attachment.id,
          }),
        ).rejects.toMatchObject({ code: 'RESEARCH_ATTACHMENT_FAILED' });

        await value.research.deleteAttachment(randomUUID(), {
          projectId: value.project.projectId,
          attachmentId: attachment.id,
        });
        const rows = MAX_RESEARCH_PROJECT_ATTACHMENT_BYTES / MAX_RESEARCH_ATTACHMENT_BYTES;
        await value.workspace.writeProject(
          randomUUID(),
          value.project.projectId,
          (database) => {
            for (let index = 0; index < rows; index += 1) {
              database
                .prepare(
                  `INSERT INTO research_attachments(
                     id, project_id, note_id, display_name, media_type, size_bytes,
                     content_hash, managed_relative_path, created_at
                   ) VALUES(?, ?, NULL, ?, 'application/pdf', ?, ?, ?, ?)`,
                )
                .run(
                  randomUUID(),
                  value.project.projectId,
                  `quota-${index}.pdf`,
                  MAX_RESEARCH_ATTACHMENT_BYTES,
                  index.toString(16).padStart(64, '0'),
                  `artifacts/research/quota-${index}.pdf`,
                  clock.now().toISOString(),
                );
            }
          },
        );
        const overQuota = path.join(value.root, 'over.txt');
        await writeFile(overQuota, 'x', 'utf8');
        await expect(
          value.research.importAttachment(
            randomUUID(),
            { projectId: value.project.projectId, noteId: null },
            overQuota,
          ),
        ).rejects.toMatchObject({ code: 'RESEARCH_INVALID' });
      } finally {
        await value.workspace.shutdown();
        await value.runtime.close();
      }
    },
  );

  it('links research to volumes and rejects cross-project targets', async () => {
    const value = await harness();
    try {
      const catalog = await value.research.createNote(randomUUID(), {
        projectId: value.project.projectId,
        title: '卷级资料',
        body: '',
        sourceUri: null,
        tags: [],
      });
      const note = catalog.notes[0]!;
      const volume = value.structure.list(value.project.projectId).volumes[0]!;
      const linked = await value.research.addLink(randomUUID(), {
        projectId: value.project.projectId,
        sourceType: 'note',
        sourceId: note.id,
        targetType: 'volume',
        targetId: volume.id,
      });
      expect(linked.links).toHaveLength(1);
      expect(
        value.research.list({
          projectId: value.project.projectId,
          includeArchived: true,
          targetType: 'volume',
          targetId: volume.id,
        }).notes.map((item) => item.id),
      ).toEqual([note.id]);

      const foreign = await value.workspace.create(
        randomUUID(),
        { name: '外部作品', channel: '长篇' },
        value.parent,
      );
      const foreignVolume = value.structure.list(foreign.projectId).volumes[0]!;
      await expect(
        value.research.addLink(randomUUID(), {
          projectId: value.project.projectId,
          sourceType: 'note',
          sourceId: note.id,
          targetType: 'volume',
          targetId: foreignVolume.id,
        }),
      ).rejects.toMatchObject({ code: 'RESEARCH_NOT_FOUND' });
    } finally {
      await value.workspace.shutdown();
      await value.runtime.close();
    }
  });
});
