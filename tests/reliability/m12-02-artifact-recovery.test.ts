import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { RecoveryService } from '../../packages/core-service/src/recovery.js';
import { ResearchService } from '../../packages/core-service/src/research-service.js';

const temporaryDirectories: string[] = [];

async function exists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

async function streamHash(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

async function harness() {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-m12-02-recovery-'));
  temporaryDirectories.push(root);
  const parent = path.join(root, 'projects');
  const restoreParent = path.join(root, 'restored');
  const backupRoot = path.join(root, 'backups');
  await Promise.all([
    mkdir(parent, { recursive: true }),
    mkdir(restoreParent, { recursive: true }),
  ]);
  let current = new Date('2026-08-10T08:00:00.000Z');
  const clock = { now: () => current };
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
  const research = new ResearchService(workspace, { clock });
  const recovery = new RecoveryService(workspace, { backupRootDirectory: backupRoot, clock });
  const project = await workspace.create(
    randomUUID(),
    { name: 'M12-02 资产恢复', channel: '长篇' },
    parent,
  );
  const catalog = await research.createNote(randomUUID(), {
    projectId: project.projectId,
    title: '恢复资料',
    body: '',
    sourceUri: null,
    tags: [],
  });
  const note = catalog.notes.find((candidate) => candidate.title === '恢复资料');
  if (!note) throw new Error('Research note was not created.');
  const sourcePath = path.join(root, 'artifact.txt');
  await writeFile(sourcePath, '必须与数据库一起恢复的附件', 'utf8');
  const imported = await research.importAttachment(
    randomUUID(),
    { projectId: project.projectId, noteId: note.id },
    sourcePath,
  );
  const attachment = imported.attachments[0];
  if (!attachment) throw new Error('Research attachment was not imported.');
  return {
    root,
    parent,
    restoreParent,
    backupRoot,
    runtime,
    workspace,
    research,
    recovery,
    project,
    note,
    attachment,
    setDay(day: number) {
      current = new Date(`2026-08-${String(day).padStart(2, '0')}T08:00:00.000Z`);
    },
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M12-02 managed artifact recovery', () => {
  it('restores the complete artifact set into a clone-safe project identity', async () => {
    const value = await harness();
    try {
      const checkpoint = await value.recovery.createOperationCheckpoint(randomUUID(), {
        projectId: value.project.projectId,
        operation: 'replace',
      });
      const restoreRequestId = randomUUID();
      const restored = await value.recovery.restoreCheckpoint(
        restoreRequestId,
        { projectId: value.project.projectId, backupId: checkpoint.backupId },
        value.restoreParent,
      );

      expect(restored.projectId).toBe(restoreRequestId);
      expect(restored.projectId).not.toBe(value.project.projectId);
      const restoredArtifact = path.join(
        restored.workspacePath,
        ...value.attachment.managedRelativePath.split('/'),
      );
      expect(await readFile(restoredArtifact, 'utf8')).toBe('必须与数据库一起恢复的附件');

      const restoredDatabase = new DatabaseSync(
        path.join(restored.workspacePath, 'project.sqlite'),
        {
          readOnly: true,
          allowExtension: false,
          readBigInts: true,
        },
      );
      try {
        const restoredNote = restoredDatabase
          .prepare('SELECT id, project_id AS projectId FROM research_notes WHERE id = ?')
          .get(value.note.id) as { id: string; projectId: string } | undefined;
        const restoredAttachment = restoredDatabase
          .prepare(
            `SELECT id, project_id AS projectId, note_id AS noteId, content_hash AS contentHash,
                    managed_relative_path AS managedRelativePath
               FROM research_attachments WHERE id = ?`,
          )
          .get(value.attachment.id) as
          | {
              id: string;
              projectId: string;
              noteId: string | null;
              contentHash: string;
              managedRelativePath: string;
            }
          | undefined;
        expect(restoredNote).toEqual({ id: value.note.id, projectId: restored.projectId });
        expect(restoredAttachment).toEqual({
          id: value.attachment.id,
          projectId: restored.projectId,
          noteId: value.note.id,
          contentHash: value.attachment.contentHash,
          managedRelativePath: value.attachment.managedRelativePath,
        });
        const ftsCount = restoredDatabase
          .prepare('SELECT COUNT(*) AS count FROM fts_research_notes')
          .get() as { count: bigint };
        expect(Number(ftsCount.count)).toBe(0);
        expect(
          restoredDatabase
            .prepare(
              'SELECT status, last_indexed_at AS lastIndexedAt FROM search_index_state WHERE singleton_id = 1',
            )
            .get(),
        ).toMatchObject({ status: 'stale', lastIndexedAt: null });
      } finally {
        restoredDatabase.close();
      }
    } finally {
      await value.workspace.shutdown();
      await value.runtime.close();
    }
  });

  it('backs up and restores many attachments including a multi-megabyte artifact with streamed hash verification', async () => {
    const value = await harness();
    try {
      const additional = [];
      const sizes = [8 * 1024 * 1024, ...Array.from({ length: 8 }, () => 256 * 1024)];
      for (const [index, size] of sizes.entries()) {
        const sourcePath = path.join(value.root, `bulk-${index}.txt`);
        await writeFile(sourcePath, Buffer.alloc(size, 65 + index));
        const catalog = await value.research.importAttachment(
          randomUUID(),
          { projectId: value.project.projectId, noteId: value.note.id },
          sourcePath,
        );
        const imported = catalog.attachments.find(
          (candidate) => candidate.displayName === `bulk-${index}.txt`,
        );
        if (!imported) throw new Error(`Bulk research attachment ${index} was not imported.`);
        additional.push(imported);
      }

      const checkpoint = await value.recovery.createOperationCheckpoint(randomUUID(), {
        projectId: value.project.projectId,
        operation: 'replace',
      });
      const manifest = JSON.parse(
        await readFile(
          path.join(
            value.backupRoot,
            value.project.projectId,
            `${checkpoint.backupId}.artifacts.json`,
          ),
          'utf8',
        ),
      ) as { files: Array<{ relativePath: string; sha256: string; sizeBytes: number }> };
      expect(manifest.files).toHaveLength(10);
      expect(manifest.files.some((item) => item.sizeBytes === 8 * 1024 * 1024)).toBe(true);

      const restored = await value.recovery.restoreCheckpoint(
        randomUUID(),
        { projectId: value.project.projectId, backupId: checkpoint.backupId },
        value.restoreParent,
      );
      for (const attachment of [value.attachment, ...additional]) {
        const restoredPath = path.join(
          restored.workspacePath,
          ...attachment.managedRelativePath.split('/'),
        );
        expect(await streamHash(restoredPath)).toBe(attachment.contentHash);
      }
    } finally {
      await value.workspace.shutdown();
      await value.runtime.close();
    }
  });

  it('does not publish a half-restored project when a backed-up artifact is missing', async () => {
    const value = await harness();
    try {
      const checkpoint = await value.recovery.createOperationCheckpoint(randomUUID(), {
        projectId: value.project.projectId,
        operation: 'replace',
      });
      const backedUpArtifact = path.join(
        value.backupRoot,
        value.project.projectId,
        `${checkpoint.backupId}.artifacts`,
        ...value.attachment.managedRelativePath.split('/'),
      );
      expect(await exists(backedUpArtifact)).toBe(true);
      await rm(backedUpArtifact, { force: true });

      await expect(
        value.recovery.restoreCheckpoint(
          randomUUID(),
          { projectId: value.project.projectId, backupId: checkpoint.backupId },
          value.restoreParent,
        ),
      ).rejects.toMatchObject({ code: 'RESTORE_SOURCE_INVALID' });
      expect(await readdir(value.restoreParent)).toEqual([]);
    } finally {
      await value.workspace.shutdown();
      await value.runtime.close();
    }
  });

  it('rejects a corrupted backed-up attachment instead of reporting a complete restore', async () => {
    const value = await harness();
    try {
      const checkpoint = await value.recovery.createOperationCheckpoint(randomUUID(), {
        projectId: value.project.projectId,
        operation: 'replace',
      });
      const backedUpArtifact = path.join(
        value.backupRoot,
        value.project.projectId,
        `${checkpoint.backupId}.artifacts`,
        ...value.attachment.managedRelativePath.split('/'),
      );
      await writeFile(backedUpArtifact, '已被篡改的附件', 'utf8');

      await expect(
        value.recovery.restoreCheckpoint(
          randomUUID(),
          { projectId: value.project.projectId, backupId: checkpoint.backupId },
          value.restoreParent,
        ),
      ).rejects.toMatchObject({ code: 'RESTORE_SOURCE_INVALID' });
      expect(await readdir(value.restoreParent)).toEqual([]);
    } finally {
      await value.workspace.shutdown();
      await value.runtime.close();
    }
  });

  it('rejects unsafe managed paths at both database and restore-manifest boundaries', async () => {
    const value = await harness();
    try {
      await expect(
        value.workspace.writeProject(randomUUID(), value.project.projectId, (database) => {
          database
            .prepare(
              'UPDATE research_attachments SET managed_relative_path = ? WHERE id = ? AND project_id = ?',
            )
            .run('../escape.txt', value.attachment.id, value.project.projectId);
        }),
      ).rejects.toMatchObject({ code: 'DATABASE_WRITE_FAILED' });

      const checkpoint = await value.recovery.createOperationCheckpoint(randomUUID(), {
        projectId: value.project.projectId,
        operation: 'replace',
      });
      const manifestPath = path.join(
        value.backupRoot,
        value.project.projectId,
        `${checkpoint.backupId}.artifacts.json`,
      );
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
        files: Array<Record<string, unknown>>;
      };
      manifest.files[0]!.relativePath = '../escape.txt';
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

      await expect(
        value.recovery.restoreCheckpoint(
          randomUUID(),
          { projectId: value.project.projectId, backupId: checkpoint.backupId },
          value.restoreParent,
        ),
      ).rejects.toMatchObject({ code: 'BACKUP_VERIFY_FAILED' });
      expect(await readdir(value.restoreParent)).toEqual([]);
    } finally {
      await value.workspace.shutdown();
      await value.runtime.close();
    }
  });
  it('removes managed artifact bundles as part of backup cleanup completion', async () => {
    const value = await harness();
    try {
      for (const day of [10, 11, 12, 13]) {
        value.setDay(day);
        await value.recovery.createDailyBackup(randomUUID(), {
          projectId: value.project.projectId,
        });
      }
      await value.recovery.updatePolicy(randomUUID(), {
        projectId: value.project.projectId,
        authority: 'author',
        dailyRetentionCount: 1,
        majorRetentionCount: 1,
        majorRetentionDays: 1,
        quotaBytes: 100 * 1024 * 1024,
      });
      const preview = await value.recovery.previewCleanup(value.project.projectId);
      const deleteIds = preview.items
        .filter((item) => item.action === 'delete')
        .map((item) => item.backupId);
      expect(deleteIds.length).toBeGreaterThanOrEqual(2);

      const result = await value.recovery.applyCleanup(randomUUID(), {
        projectId: value.project.projectId,
        authority: 'author',
        planHash: preview.planHash,
      });
      expect(result.deletedBackupIds).toEqual(deleteIds);
      for (const backupId of deleteIds) {
        expect(
          await exists(
            path.join(value.backupRoot, value.project.projectId, `${backupId}.artifacts`),
          ),
        ).toBe(false);
        expect(
          await exists(
            path.join(value.backupRoot, value.project.projectId, `${backupId}.artifacts.json`),
          ),
        ).toBe(false);
      }
    } finally {
      await value.workspace.shutdown();
      await value.runtime.close();
    }
  });
});
