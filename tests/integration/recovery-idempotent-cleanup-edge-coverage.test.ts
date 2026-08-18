import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { BackupRecordSchema } from '@worldforge/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { RecoveryService } from '../../packages/core-service/src/recovery.js';

const directories: string[] = [];

function derivedRequestId(requestId: string, backupId: string): string {
  const bytes = Buffer.from(
    createHash('sha256').update(`${requestId}:${backupId}`).digest().subarray(0, 16),
  );
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const value = bytes.toString('hex');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

async function createHarness() {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-idempotent-cleanup-edge-'));
  directories.push(root);
  const parent = path.join(root, 'projects');
  const backupRoot = path.join(root, 'backups');
  await mkdir(parent, { recursive: true });
  let current = new Date('2026-08-01T08:00:00.000Z');
  const clock = { now: () => current };
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
  const recovery = new RecoveryService(workspace, { backupRootDirectory: backupRoot, clock });
  const project = await workspace.create(
    randomUUID(),
    { name: '幂等清理边界', channel: '长篇' },
    parent,
  );
  return {
    backupRoot,
    appRuntime,
    workspace,
    recovery,
    project,
    advance() {
      current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
    },
  };
}

async function closeHarness(harness: Awaited<ReturnType<typeof createHarness>>) {
  await harness.workspace.shutdown();
  await harness.appRuntime.close();
}

async function inflateMetadata(
  backupRoot: string,
  projectId: string,
  backupId: string,
  sizeBytes = 70 * 1024 * 1024,
) {
  const metadataPath = path.join(backupRoot, projectId, `${backupId}.json`);
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as Record<string, unknown>;
  await writeFile(metadataPath, `${JSON.stringify({ ...metadata, sizeBytes }, null, 2)}\n`, 'utf8');
}

async function cleanupTarget(harness: Awaited<ReturnType<typeof createHarness>>) {
  const first = await harness.recovery.createOperationCheckpoint(randomUUID(), {
    projectId: harness.project.projectId,
    operation: 'replace',
  });
  harness.advance();
  const second = await harness.recovery.createOperationCheckpoint(randomUUID(), {
    projectId: harness.project.projectId,
    operation: 'split-chapter',
  });
  harness.advance();
  const newest = await harness.recovery.createOperationCheckpoint(randomUUID(), {
    projectId: harness.project.projectId,
    operation: 'merge-chapter',
  });
  for (const record of [first, second, newest]) {
    await inflateMetadata(harness.backupRoot, harness.project.projectId, record.backupId);
  }
  await harness.recovery.updatePolicy(randomUUID(), {
    projectId: harness.project.projectId,
    authority: 'author',
    dailyRetentionCount: 365,
    majorRetentionCount: 500,
    majorRetentionDays: 3650,
    quotaBytes: 100 * 1024 * 1024,
  });
  const preview = await harness.recovery.previewCleanup(harness.project.projectId);
  const item = preview.items.find((candidate) => candidate.action === 'delete');
  if (!item) throw new Error('Expected a cleanup target.');
  const metadataPath = path.join(
    harness.backupRoot,
    harness.project.projectId,
    `${item.backupId}.json`,
  );
  const rawTarget = JSON.parse(await readFile(metadataPath, 'utf8')) as Record<string, unknown>;
  const { sourceWorkspaceName: _sourceWorkspaceName, ...record } = rawTarget;
  const target = BackupRecordSchema.parse(record);
  return { preview, target, backupId: item.backupId, metadataPath };
}

async function writeJournal(
  harness: Awaited<ReturnType<typeof createHarness>>,
  requestId: string,
  journal: Record<string, unknown>,
) {
  const operations = path.join(harness.backupRoot, harness.project.projectId, '.operations');
  await mkdir(operations, { recursive: true });
  const journalPath = path.join(operations, `cleanup-${requestId}.json`);
  await writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`, 'utf8');
  return journalPath;
}

function journal(
  harness: Awaited<ReturnType<typeof createHarness>>,
  requestId: string,
  planHash: string,
  totalBytes: number,
  targets: readonly Record<string, unknown>[],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    requestId,
    projectId: harness.project.projectId,
    authority: 'author',
    planHash,
    totalBytes,
    targets,
    deletedBackupIds: [],
    completed: false,
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('idempotent backup cleanup crash-recovery edges', () => {
  it('rejects malformed, invalid-shape, invalid-deleted-id and mismatched cleanup journals', async () => {
    const harness = await createHarness();
    try {
      const { preview, target } = await cleanupTarget(harness);
      const cases: Array<{ content: string; expected: string }> = [
        { content: '{broken', expected: 'BACKUP_CLEANUP_STALE' },
        { content: JSON.stringify([]), expected: 'BACKUP_CLEANUP_STALE' },
        {
          content: JSON.stringify({
            ...journal(harness, randomUUID(), preview.planHash, preview.totalBytes, [target]),
            deletedBackupIds: [7],
          }),
          expected: 'BACKUP_CLEANUP_STALE',
        },
      ];
      for (const testCase of cases) {
        const requestId = randomUUID();
        const operations = path.join(harness.backupRoot, harness.project.projectId, '.operations');
        await mkdir(operations, { recursive: true });
        await writeFile(
          path.join(operations, `cleanup-${requestId}.json`),
          testCase.content,
          'utf8',
        );
        await expect(
          harness.recovery.applyCleanup(requestId, {
            projectId: harness.project.projectId,
            authority: 'author',
            planHash: preview.planHash,
          }),
        ).rejects.toMatchObject({ code: testCase.expected });
      }

      const requestId = randomUUID();
      await writeJournal(
        harness,
        requestId,
        journal(harness, randomUUID(), preview.planHash, preview.totalBytes, [target]),
      );
      await expect(
        harness.recovery.applyCleanup(requestId, {
          projectId: harness.project.projectId,
          authority: 'author',
          planHash: preview.planHash,
        }),
      ).rejects.toMatchObject({ code: 'BACKUP_CLEANUP_STALE' });
    } finally {
      await closeHarness(harness);
    }
  });

  it('resumes a journal that already recorded one deleted target and returns a completed journal without deleting again', async () => {
    const harness = await createHarness();
    try {
      const { preview, target, backupId } = await cleanupTarget(harness);
      const requestId = randomUUID();
      await writeJournal(
        harness,
        requestId,
        journal(harness, requestId, preview.planHash, preview.totalBytes, [target], {
          deletedBackupIds: [backupId],
          completed: true,
        }),
      );
      const result = await harness.recovery.applyCleanup(requestId, {
        projectId: harness.project.projectId,
        authority: 'author',
        planHash: preview.planHash,
      });
      expect(result.deletedBackupIds).toEqual([backupId]);
    } finally {
      await closeHarness(harness);
    }
  });

  it('resumes after the backup file was staged before a crash and finishes deletion', async () => {
    const harness = await createHarness();
    try {
      const { preview, target, backupId } = await cleanupTarget(harness);
      const requestId = randomUUID();
      await writeJournal(
        harness,
        requestId,
        journal(harness, requestId, preview.planHash, preview.totalBytes, [target]),
      );
      const directory = path.join(harness.backupRoot, harness.project.projectId);
      const backupPath = path.join(directory, String(target.backupFileName));
      const stagedBackupPath = `${backupPath}.deleting-${derivedRequestId(requestId, backupId)}`;
      await rename(backupPath, stagedBackupPath);

      const result = await harness.recovery.applyCleanup(requestId, {
        projectId: harness.project.projectId,
        authority: 'author',
        planHash: preview.planHash,
      });
      expect(result.deletedBackupIds).toContain(backupId);
      expect(
        harness.workspace.readProject(harness.project.projectId, (database) =>
          database
            .prepare('SELECT id FROM backup_records WHERE id = ? AND project_id = ?')
            .get(backupId, harness.project.projectId),
        ),
      ).toBeUndefined();
    } finally {
      await closeHarness(harness);
    }
  });

  it('restores a staged backup when metadata is missing before the database delete', async () => {
    const harness = await createHarness();
    try {
      const { preview, target, backupId, metadataPath } = await cleanupTarget(harness);
      const requestId = randomUUID();
      await writeJournal(
        harness,
        requestId,
        journal(harness, requestId, preview.planHash, preview.totalBytes, [target]),
      );
      await rm(metadataPath);
      await expect(
        harness.recovery.applyCleanup(requestId, {
          projectId: harness.project.projectId,
          authority: 'author',
          planHash: preview.planHash,
        }),
      ).rejects.toMatchObject({ code: 'BACKUP_DELETE_FAILED' });
      const backupPath = path.join(
        harness.backupRoot,
        harness.project.projectId,
        String(target.backupFileName),
      );
      await expect(readFile(backupPath)).resolves.toBeInstanceOf(Buffer);
      expect(
        harness.workspace.readProject(harness.project.projectId, (database) =>
          database
            .prepare('SELECT id FROM backup_records WHERE id = ? AND project_id = ?')
            .get(backupId, harness.project.projectId),
        ),
      ).toBeTruthy();
    } finally {
      await closeHarness(harness);
    }
  });

  it('rolls back both staged files when the database delete affects zero rows', async () => {
    const harness = await createHarness();
    try {
      const { preview, target, backupId, metadataPath } = await cleanupTarget(harness);
      const requestId = randomUUID();
      await writeJournal(
        harness,
        requestId,
        journal(harness, requestId, preview.planHash, preview.totalBytes, [target]),
      );
      await harness.workspace.writeProject(randomUUID(), harness.project.projectId, (database) => {
        database.exec(`CREATE TRIGGER ignore_cleanup_delete
          BEFORE DELETE ON backup_records
          WHEN OLD.id = '${backupId}'
          BEGIN
            SELECT RAISE(IGNORE);
          END;`);
      });

      await expect(
        harness.recovery.applyCleanup(requestId, {
          projectId: harness.project.projectId,
          authority: 'author',
          planHash: preview.planHash,
        }),
      ).rejects.toMatchObject({ code: 'BACKUP_DELETE_FAILED' });

      const backupPath = path.join(
        harness.backupRoot,
        harness.project.projectId,
        String(target.backupFileName),
      );
      await expect(readFile(backupPath)).resolves.toBeInstanceOf(Buffer);
      await expect(readFile(metadataPath, 'utf8')).resolves.toContain(backupId);
    } finally {
      await closeHarness(harness);
    }
  });

  it('rejects unsafe backup filenames before a cleanup journal can reach deletion', () => {
    expect(() =>
      BackupRecordSchema.parse({
        backupId: randomUUID(),
        projectId: randomUUID(),
        operation: 'replace',
        backupFileName: '../unsafe.sqlite',
        sizeBytes: 1,
        sha256: 'a'.repeat(64),
        createdAt: '2026-08-17T00:00:00.000Z',
        verifiedAt: '2026-08-17T00:00:00.000Z',
      }),
    ).toThrow();
  });

  it('rejects an object journal whose required fields have invalid types', async () => {
    const harness = await createHarness();
    try {
      const { preview } = await cleanupTarget(harness);
      const requestId = randomUUID();
      await writeJournal(harness, requestId, {
        schemaVersion: 2,
        requestId,
        projectId: harness.project.projectId,
        authority: 'author',
        planHash: preview.planHash,
        totalBytes: preview.totalBytes,
        targets: [],
        deletedBackupIds: [],
        completed: false,
      });
      await expect(
        harness.recovery.applyCleanup(requestId, {
          projectId: harness.project.projectId,
          authority: 'author',
          planHash: preview.planHash,
        }),
      ).rejects.toMatchObject({ code: 'BACKUP_CLEANUP_STALE' });
    } finally {
      await closeHarness(harness);
    }
  });

  it('completes an interrupted journal by skipping a target already recorded as deleted', async () => {
    const harness = await createHarness();
    try {
      const { preview, target, backupId, metadataPath } = await cleanupTarget(harness);
      const requestId = randomUUID();
      const backupPath = path.join(
        harness.backupRoot,
        harness.project.projectId,
        String(target.backupFileName),
      );
      await harness.workspace.writeProject(randomUUID(), harness.project.projectId, (database) => {
        database
          .prepare('DELETE FROM backup_records WHERE id = ? AND project_id = ?')
          .run(backupId, harness.project.projectId);
      });
      await Promise.all([rm(backupPath, { force: true }), rm(metadataPath, { force: true })]);
      await writeJournal(
        harness,
        requestId,
        journal(harness, requestId, preview.planHash, preview.totalBytes, [target], {
          deletedBackupIds: [backupId],
          completed: false,
        }),
      );
      await expect(
        harness.recovery.applyCleanup(requestId, {
          projectId: harness.project.projectId,
          authority: 'author',
          planHash: preview.planHash,
        }),
      ).resolves.toMatchObject({ deletedBackupIds: [backupId] });
    } finally {
      await closeHarness(harness);
    }
  });

  it('removes orphaned files when the database record was already deleted before replay', async () => {
    const harness = await createHarness();
    try {
      const { preview, target, backupId } = await cleanupTarget(harness);
      const requestId = randomUUID();
      await writeJournal(
        harness,
        requestId,
        journal(harness, requestId, preview.planHash, preview.totalBytes, [target]),
      );
      await harness.workspace.writeProject(randomUUID(), harness.project.projectId, (database) => {
        database
          .prepare('DELETE FROM backup_records WHERE id = ? AND project_id = ?')
          .run(backupId, harness.project.projectId);
      });
      await expect(
        harness.recovery.applyCleanup(requestId, {
          projectId: harness.project.projectId,
          authority: 'author',
          planHash: preview.planHash,
        }),
      ).resolves.toMatchObject({ deletedBackupIds: [backupId] });
    } finally {
      await closeHarness(harness);
    }
  });

  it('fails closed when the backup file vanished after the operation journal was written', async () => {
    const harness = await createHarness();
    try {
      const { preview, target } = await cleanupTarget(harness);
      const requestId = randomUUID();
      await writeJournal(
        harness,
        requestId,
        journal(harness, requestId, preview.planHash, preview.totalBytes, [target]),
      );
      await rm(
        path.join(harness.backupRoot, harness.project.projectId, String(target.backupFileName)),
      );
      await expect(
        harness.recovery.applyCleanup(requestId, {
          projectId: harness.project.projectId,
          authority: 'author',
          planHash: preview.planHash,
        }),
      ).rejects.toMatchObject({ code: 'BACKUP_DELETE_FAILED' });
    } finally {
      await closeHarness(harness);
    }
  });

  it('resumes when both backup and metadata staging have partially progressed', async () => {
    const harness = await createHarness();
    try {
      const { preview, target, backupId, metadataPath } = await cleanupTarget(harness);
      const requestId = randomUUID();
      await writeJournal(
        harness,
        requestId,
        journal(harness, requestId, preview.planHash, preview.totalBytes, [target]),
      );
      const suffix = `.deleting-${derivedRequestId(requestId, backupId)}`;
      await rename(metadataPath, `${metadataPath}${suffix}`);
      await expect(
        harness.recovery.applyCleanup(requestId, {
          projectId: harness.project.projectId,
          authority: 'author',
          planHash: preview.planHash,
        }),
      ).resolves.toMatchObject({ deletedBackupIds: [backupId] });
    } finally {
      await closeHarness(harness);
    }
  });
});
