import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { AppDatabase, loadMigrations } from '../../packages/core-service/src/database/index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('provider option allowlist migration', () => {
  it('removes arbitrary legacy fields and preserves only the supported Anthropic version', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-provider-options-'));
    temporaryDirectories.push(root);
    const databasePath = path.join(root, 'app.sqlite');
    const migrations = await loadMigrations('migrations/app', 'app');
    const versionTwo = await AppDatabase.open({
      path: databasePath,
      migrations: migrations.slice(0, 2),
      appVersion: '0.0.1',
    });
    await versionTwo.write(randomUUID(), (database) => {
      const insert = database.prepare(
        `INSERT INTO provider_configs(
           id, name, protocol, base_url, model, credential_ref, timeout_ms,
           options_json, created_at, updated_at
         ) VALUES(?, ?, ?, ?, ?, NULL, 30000, ?, ?, ?)`,
      );
      const timestamp = '2026-08-09T00:00:00.000Z';
      insert.run(
        'legacy-openai',
        'Legacy OpenAI',
        'openai_compatible',
        'https://example.invalid/v1',
        'model',
        JSON.stringify({ authorization: 'Bearer secret', temperature: 0.7 }),
        timestamp,
        timestamp,
      );
      insert.run(
        'legacy-anthropic',
        'Legacy Anthropic',
        'anthropic',
        'https://example.invalid/v1',
        'model',
        JSON.stringify({ anthropicVersion: ' 2023-06-01 ', authHeader: 'secret' }),
        timestamp,
        timestamp,
      );
    });
    await versionTwo.close();

    const runtime = await openAppRuntime({
      databasePath,
      migrationsDirectory: 'migrations/app',
      recoveryDirectory: path.join(root, 'recovery'),
      appVersion: '0.1.0',
      recoveryId: () => 'provider-options',
    });
    expect(runtime.database.schemaVersion).toBe(3);
    expect(runtime.providerConfigs.list()).toMatchObject([
      { id: 'legacy-anthropic', options: { anthropicVersion: '2023-06-01' } },
      { id: 'legacy-openai', options: {} },
    ]);
    const storedOptions = runtime.database.read((database) =>
      database
        .prepare('SELECT options_json FROM provider_configs ORDER BY id')
        .all()
        .map((row) => String(row.options_json)),
    );
    expect(storedOptions.join(' ')).not.toContain('secret');
    await runtime.close();
  });
});
