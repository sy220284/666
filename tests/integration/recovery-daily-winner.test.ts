import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { RecoveryService } from '../../packages/core-service/src/recovery.js';

const roots: string[] = [];
const fixedClock = { now: () => new Date('2026-07-17T01:00:00.000Z') };

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('daily backup sqlite winner arbitration', () => {
  it('keeps the first committed daily record and removes later loser artifacts', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-daily-winner-'));
    roots.push(root);
    const projectParent = path.join(root, 'projects');
    const backupRoot = path.join(root, 'recovery');
    await Promise.all([
      mkdir(projectParent, { recursive: true }),
      mkdir(backupRoot, { recursive: true }),
    ]);

    const appRuntime = await openAppRuntime({
      databasePath: path.join(root, 'app.sqlite'),
      migrationsDirectory: 'migrations/app',
      recoveryDirectory: path.join(root, 'app-recovery'),
      appVersion: '0.1.0',
      clock: fixedClock,
    });
    const workspace = new ProjectWorkspaceService({
      projectMigrationsDirectory: 'migrations/project',
      projectMigrationRecoveryDirectory: path.join(root, 'project-migration-recovery'),
      appVersion: '0.1.0',
      recentProjects: appRuntime.recentProjects,
      clock: fixedClock,
    });
    const recovery = new RecoveryService(workspace, {
      backupRootDirectory: backupRoot,
      clock: fixedClock,
    });

    try {
      const project = await workspace.create(
        randomUUID(),
        { name: '每日备份仲裁', channel: '长篇' },
        projectParent,
      );
      const first = await recovery.createDailyBackup(randomUUID(), {
        projectId: project.projectId,
      });
      await Promise.resolve();

      const duplicateId = randomUUID();
      const duplicateFile = `backup-${duplicateId}.sqlite`;
      const directory = path.join(backupRoot, project.projectId);
      await copyFile(
        path.join(directory, first.backupFileName),
        path.join(directory, duplicateFile),
      );
      const duplicate = {
        ...first,
        backupId: duplicateId,
        backupFileName: duplicateFile,
        createdAt: '2026-07-17T02:00:00.000Z',
        verifiedAt: '2026-07-17T02:00:01.000Z',
      };
      await writeFile(
        path.join(directory, `${duplicateId}.json`),
        `${JSON.stringify({ ...duplicate, sourceWorkspaceName: project.name }, null, 2)}\n`,
        'utf8',
      );
      await workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database
          .prepare(
            `INSERT INTO backup_records(
               id, project_id, operation, backup_file_name, size_bytes, sha256,
               created_at, verified_at, backup_track, display_name, note,
               author_protected, migration_protected, schema_version
             ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            duplicate.backupId,
            duplicate.projectId,
            duplicate.operation,
            duplicate.backupFileName,
            duplicate.sizeBytes,
            duplicate.sha256,
            duplicate.createdAt,
            duplicate.verifiedAt,
            duplicate.track,
            duplicate.displayName,
            duplicate.note,
            duplicate.authorProtected ? 1 : 0,
            duplicate.migrationProtected ? 1 : 0,
            duplicate.schemaVersion,
          );
      });

      const winner = await recovery.createDailyBackup(randomUUID(), {
        projectId: project.projectId,
      });
      expect(winner.backupId).toBe(first.backupId);
      expect(
        workspace.readProject(project.projectId, (database) =>
          database
            .prepare(
              `SELECT id FROM backup_records
                WHERE project_id = ? AND backup_track = 'daily'
                ORDER BY rowid`,
            )
            .all(project.projectId)
            .map((row) => String(row.id)),
        ),
      ).toEqual([first.backupId]);
      expect(await readdir(directory)).not.toEqual(expect.arrayContaining([duplicateFile]));
      expect(await readdir(directory)).not.toEqual(expect.arrayContaining([`${duplicateId}.json`]));
    } finally {
      await workspace.shutdown();
      await appRuntime.close();
    }
  });
});
