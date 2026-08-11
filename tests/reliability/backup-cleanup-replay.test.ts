import { randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import type { DatabaseWriteOperation } from '../../packages/core-service/src/database/index.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { RecoveryService } from '../../packages/core-service/src/recovery.js';

const temporaryDirectories: string[] = [];

class FaultableProjectWorkspaceService extends ProjectWorkspaceService {
  #failurePosition: number | null = null;
  #armedWriteCount = 0;

  failWriteAt(position: number): void {
    this.#failurePosition = position;
    this.#armedWriteCount = 0;
  }

  override async writeProject<T>(
    requestId: string,
    projectId: string,
    operation: DatabaseWriteOperation<T>,
    commandIdentity?: unknown,
  ): Promise<T> {
    if (this.#failurePosition !== null) {
      this.#armedWriteCount += 1;
      if (this.#armedWriteCount === this.#failurePosition) {
        this.#failurePosition = null;
        throw new Error('FAULT_INJECTED_CLEANUP_DATABASE_WRITE');
      }
    }
    return super.writeProject(requestId, projectId, operation, commandIdentity);
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
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

describe('reliability: backup cleanup replay', () => {
  it('resumes a partially completed cleanup with the same requestId and converges all authorities', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-cleanup-fault-replay-'));
    temporaryDirectories.push(root);
    const parent = path.join(root, 'projects');
    const backupRoot = path.join(root, 'backups');
    await mkdir(parent, { recursive: true });
    let current = new Date('2026-08-01T08:00:00.000Z');
    const clock = { now: () => current };
    const runtime = await openAppRuntime({
      databasePath: path.join(root, 'app.sqlite'),
      migrationsDirectory: 'migrations/app',
      recoveryDirectory: path.join(root, 'app-recovery'),
      appVersion: '0.1.0',
      clock,
    });
    const workspace = new FaultableProjectWorkspaceService({
      projectMigrationsDirectory: 'migrations/project',
      projectMigrationRecoveryDirectory: path.join(root, 'migration-recovery'),
      appVersion: '0.1.0',
      recentProjects: runtime.recentProjects,
      clock,
    });
    const recovery = new RecoveryService(workspace, { backupRootDirectory: backupRoot, clock });

    try {
      const project = await workspace.create(
        randomUUID(),
        { name: '清理故障重放', channel: '长篇' },
        parent,
      );
      for (const day of [1, 2, 3, 4]) {
        current = new Date(`2026-08-${String(day).padStart(2, '0')}T08:00:00.000Z`);
        await recovery.createDailyBackup(randomUUID(), { projectId: project.projectId });
      }
      await recovery.updatePolicy(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        dailyRetentionCount: 1,
        majorRetentionCount: 1,
        majorRetentionDays: 1,
        quotaBytes: 100 * 1024 * 1024,
      });

      const preview = await recovery.previewCleanup(project.projectId);
      const deleteIds = preview.items
        .filter((item) => item.action === 'delete')
        .map((item) => item.backupId);
      expect(deleteIds.length).toBeGreaterThanOrEqual(2);

      const before = await recovery.getOverview(project.projectId);
      const records = new Map(before.checkpoints.map((record) => [record.backupId, record]));
      const firstRecord = records.get(deleteIds[0]!);
      const secondRecord = records.get(deleteIds[1]!);
      expect(firstRecord).toBeDefined();
      expect(secondRecord).toBeDefined();
      if (!firstRecord || !secondRecord)
        throw new Error('Cleanup preview referenced a missing backup.');

      const cleanupRequestId = randomUUID();
      const input = {
        projectId: project.projectId,
        authority: 'author' as const,
        planHash: preview.planHash,
      };
      workspace.failWriteAt(2);

      await expect(recovery.applyCleanup(cleanupRequestId, input)).rejects.toMatchObject({
        code: 'BACKUP_DELETE_FAILED',
      });

      const backupDirectory = path.join(backupRoot, project.projectId);
      const journalPath = path.join(
        backupDirectory,
        '.operations',
        `cleanup-${cleanupRequestId}.json`,
      );
      const failedJournal = JSON.parse(await readFile(journalPath, 'utf8')) as {
        deletedBackupIds: string[];
        completed: boolean;
      };
      expect(failedJournal.deletedBackupIds).toEqual([deleteIds[0]]);
      expect(failedJournal.completed).toBe(false);
      expect(
        workspace.readProject(project.projectId, (database) =>
          Number(
            database
              .prepare('SELECT COUNT(*) AS count FROM backup_records WHERE id = ?')
              .get(deleteIds[0])?.count ?? 0,
          ),
        ),
      ).toBe(0);
      expect(
        workspace.readProject(project.projectId, (database) =>
          Number(
            database
              .prepare('SELECT COUNT(*) AS count FROM backup_records WHERE id = ?')
              .get(deleteIds[1])?.count ?? 0,
          ),
        ),
      ).toBe(1);
      expect(await exists(path.join(backupDirectory, firstRecord.backupFileName))).toBe(false);
      expect(await exists(path.join(backupDirectory, `${firstRecord.backupId}.json`))).toBe(false);
      expect(await exists(path.join(backupDirectory, secondRecord.backupFileName))).toBe(true);
      expect(await exists(path.join(backupDirectory, `${secondRecord.backupId}.json`))).toBe(true);
      expect((await readdir(backupDirectory)).some((name) => name.includes('.deleting-'))).toBe(
        false,
      );

      const replica = new RecoveryService(workspace, { backupRootDirectory: backupRoot, clock });
      const retried = await replica.applyCleanup(cleanupRequestId, input);
      expect(retried.deletedBackupIds).toEqual(deleteIds);

      const completedJournal = JSON.parse(await readFile(journalPath, 'utf8')) as {
        deletedBackupIds: string[];
        completed: boolean;
      };
      expect(completedJournal.deletedBackupIds).toEqual(deleteIds);
      expect(completedJournal.completed).toBe(true);
      for (const backupId of deleteIds) {
        const record = records.get(backupId);
        expect(record).toBeDefined();
        if (!record) continue;
        expect(
          workspace.readProject(project.projectId, (database) =>
            Number(
              database
                .prepare('SELECT COUNT(*) AS count FROM backup_records WHERE id = ?')
                .get(backupId)?.count ?? 0,
            ),
          ),
        ).toBe(0);
        expect(await exists(path.join(backupDirectory, record.backupFileName))).toBe(false);
        expect(await exists(path.join(backupDirectory, `${record.backupId}.json`))).toBe(false);
      }
      expect((await readdir(backupDirectory)).some((name) => name.includes('.deleting-'))).toBe(
        false,
      );

      const replayed = await recovery.applyCleanup(cleanupRequestId, input);
      expect(replayed).toEqual(retried);
    } finally {
      await workspace.shutdown();
      await runtime.close();
    }
  });
});
