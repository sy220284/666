import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { WindowPreferences } from '@worldforge/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { AppDatabase, loadMigrations } from '../../packages/core-service/src/database/index.js';

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-window-preferences-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

const savedPreferences: WindowPreferences = {
  displayId: 'display-2',
  boundsDip: { x: 1_440, y: 48, width: 1_280, height: 800 },
  scaleFactor: 1.5,
  maximized: false,
  workspaceAlignment: 'left',
  uiScalePercent: 120,
  bodyFontSize: 20,
  contentWidth: 'wide',
};

describe('app window preference migration and repository', () => {
  it('backs up schema v1, migrates once, and reloads the singleton through Core storage', async () => {
    const root = await temporaryDirectory();
    const databasePath = path.join(root, 'app.sqlite');
    const recoveryDirectory = path.join(root, 'recovery');
    const migrations = await loadMigrations('migrations/app', 'app');
    const firstMigration = migrations[0];
    expect(firstMigration).toBeDefined();
    if (!firstMigration) return;

    const versionOne = await AppDatabase.open({
      path: databasePath,
      migrations: [firstMigration],
      appVersion: '0.0.1',
    });
    expect(versionOne.schemaVersion).toBe(1);
    await versionOne.close();

    const clock = { now: () => new Date('2026-07-15T06:00:00.000Z') };
    const runtime = await openAppRuntime({
      databasePath,
      migrationsDirectory: 'migrations/app',
      recoveryDirectory,
      appVersion: '0.1.0',
      clock,
      recoveryId: () => 'migration-recovery-001',
    });
    expect(runtime.database.schemaVersion).toBe(2);
    expect(runtime.windowPreferences.get()).toBeNull();

    const requestId = randomUUID();
    await expect(runtime.windowPreferences.save(requestId, savedPreferences)).resolves.toEqual(
      savedPreferences,
    );
    await expect(
      runtime.windowPreferences.save(requestId, { ...savedPreferences, bodyFontSize: 28 }),
    ).resolves.toEqual(savedPreferences);
    expect(runtime.windowPreferences.get()).toEqual(savedPreferences);
    expect(
      runtime.database.read((database) =>
        database.prepare('SELECT singleton_id, updated_at FROM window_preferences').get(),
      ),
    ).toEqual({ singleton_id: 1n, updated_at: '2026-07-15T06:00:00.000Z' });
    await runtime.close();

    const recoveryFiles = await readdir(recoveryDirectory);
    expect(recoveryFiles).toEqual(['app-v1-to-v2-migration-recovery-001.sqlite']);
    const recoveryPath = path.join(recoveryDirectory, recoveryFiles[0] ?? '');
    expect((await stat(recoveryDirectory)).mode & 0o777).toBe(0o700);
    expect((await stat(recoveryPath)).mode & 0o777).toBe(0o600);
    const recovery = new DatabaseSync(recoveryPath, {
      readOnly: true,
    });
    expect(recovery.prepare('PRAGMA quick_check').get()).toEqual({ quick_check: 'ok' });
    expect(recovery.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual(
      {
        version: 1,
      },
    );
    expect(
      recovery
        .prepare(
          "SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name='window_preferences'",
        )
        .get(),
    ).toEqual({ count: 0 });
    recovery.close();

    const reopened = await openAppRuntime({
      databasePath,
      migrationsDirectory: 'migrations/app',
      recoveryDirectory,
      appVersion: '0.1.0',
      clock,
      recoveryId: () => 'must-not-run',
    });
    expect(reopened.database.compatibility).toBe('current');
    expect(reopened.windowPreferences.get()).toEqual(savedPreferences);
    await reopened.close();
    expect(await readdir(recoveryDirectory)).toEqual(recoveryFiles);
  });
});
