import { randomUUID } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import type { DatabaseWriteOperation } from '../../packages/core-service/src/database/index.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { RecoveryService } from '../../packages/core-service/src/recovery.js';

const temporaryDirectories: string[] = [];
const permissionSensitiveIt = it.runIf(process.getuid?.() !== 0);

class RegistrationFailureWorkspaceService extends ProjectWorkspaceService {
  #lockedBackupDirectory: string | null = null;
  #failNextWrite = false;

  failNextWriteWithLockedBackupDirectory(backupDirectory: string): void {
    this.#lockedBackupDirectory = backupDirectory;
    this.#failNextWrite = true;
  }

  override async writeProject<T>(
    requestId: string,
    projectId: string,
    operation: DatabaseWriteOperation<T>,
    commandIdentity?: unknown,
  ): Promise<T> {
    if (this.#failNextWrite) {
      this.#failNextWrite = false;
      if (this.#lockedBackupDirectory) await chmod(this.#lockedBackupDirectory, 0o500);
      throw new Error('FAULT_INJECTED_BACKUP_REGISTRATION_WRITE');
    }
    return super.writeProject(requestId, projectId, operation, commandIdentity);
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('reliability: backup creation compensation replay', () => {
  permissionSensitiveIt(
    'repairs a verified final backup left by failed compensation using the same requestId',
    async () => {
      const root = await mkdtemp(path.join(tmpdir(), 'worldforge-backup-compensation-replay-'));
      temporaryDirectories.push(root);
      const parent = path.join(root, 'projects');
      const backupRootDirectory = path.join(root, 'backups');
      await mkdir(parent, { recursive: true });
      const clock = { now: () => new Date('2026-08-11T10:30:00.000Z') };
      const appRuntime = await openAppRuntime({
        databasePath: path.join(root, 'app.sqlite'),
        migrationsDirectory: 'migrations/app',
        recoveryDirectory: path.join(root, 'app-recovery'),
        appVersion: '0.1.0',
        clock,
      });
      const workspace = new RegistrationFailureWorkspaceService({
        projectMigrationsDirectory: 'migrations/project',
        projectMigrationRecoveryDirectory: path.join(root, 'project-migration-recovery'),
        appVersion: '0.1.0',
        recentProjects: appRuntime.recentProjects,
        clock,
      });
      let backupDirectory: string | null = null;

      try {
        const project = await workspace.create(
          randomUUID(),
          { name: '备份补偿重放', channel: '长篇' },
          parent,
        );
        backupDirectory = path.join(backupRootDirectory, project.projectId);
        const recovery = new RecoveryService(workspace, { backupRootDirectory, clock });
        const requestId = randomUUID();
        const input = { projectId: project.projectId, operation: 'replace' as const };
        workspace.failNextWriteWithLockedBackupDirectory(backupDirectory);

        let firstFailure: unknown;
        try {
          await recovery.createOperationCheckpoint(requestId, input);
        } catch (error) {
          firstFailure = error;
        }
        expect(firstFailure).toMatchObject({ code: 'BACKUP_CREATE_FAILED' });
        expect(firstFailure).toBeInstanceOf(Error);
        expect((firstFailure as Error).cause).toBeInstanceOf(AggregateError);

        await chmod(backupDirectory, 0o700);
        const metadataPath = path.join(backupDirectory, `${requestId}.json`);
        const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as {
          backupId: string;
          backupFileName: string;
          sha256: string;
        };
        expect(metadata.backupId).toBe(requestId);
        expect(await readdir(backupDirectory)).toEqual(
          expect.arrayContaining([metadata.backupFileName, `${requestId}.json`]),
        );
        expect((await readdir(backupDirectory)).some((name) => name.includes('.partial-'))).toBe(
          false,
        );
        expect(
          workspace.readProject(project.projectId, (database) =>
            Number(
              database
                .prepare('SELECT COUNT(*) AS count FROM backup_records WHERE id = ?')
                .get(requestId)?.count ?? 0,
            ),
          ),
        ).toBe(0);
        expect(
          workspace.readProject(project.projectId, (database) =>
            Number(
              database
                .prepare('SELECT COUNT(*) AS count FROM backup_failures WHERE resolved_at IS NULL')
                .get()?.count ?? 0,
            ),
          ),
        ).toBe(1);

        const replica = new RecoveryService(workspace, { backupRootDirectory, clock });
        const repaired = await replica.createOperationCheckpoint(requestId, input);
        expect(repaired).toMatchObject({
          backupId: requestId,
          projectId: project.projectId,
          operation: 'replace',
          backupFileName: metadata.backupFileName,
          sha256: metadata.sha256,
        });
        expect(
          workspace.readProject(project.projectId, (database) => ({
            records: Number(
              database
                .prepare('SELECT COUNT(*) AS count FROM backup_records WHERE id = ?')
                .get(requestId)?.count ?? 0,
            ),
            unresolvedFailures: Number(
              database
                .prepare('SELECT COUNT(*) AS count FROM backup_failures WHERE resolved_at IS NULL')
                .get()?.count ?? 0,
            ),
            resolvedFailures: Number(
              database
                .prepare(
                  'SELECT COUNT(*) AS count FROM backup_failures WHERE resolved_at IS NOT NULL',
                )
                .get()?.count ?? 0,
            ),
          })),
        ).toEqual({ records: 1, unresolvedFailures: 0, resolvedFailures: 1 });
        expect((await readdir(backupDirectory)).some((name) => name.includes('.partial-'))).toBe(
          false,
        );

        const replayedByOriginalService = await recovery.createOperationCheckpoint(
          requestId,
          input,
        );
        expect(replayedByOriginalService).toEqual(repaired);
      } finally {
        if (backupDirectory) await chmod(backupDirectory, 0o700).catch(() => undefined);
        await workspace.shutdown();
        await appRuntime.close();
      }
    },
  );
});
