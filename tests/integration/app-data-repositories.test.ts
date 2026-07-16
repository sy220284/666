import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import type { AppDataRepositoryError } from '../../packages/core-service/src/app-data-errors.js';

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-app-data-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

async function runtimeAt(root: string, clock: { now(): Date }) {
  return openAppRuntime({
    databasePath: path.join(root, 'app.sqlite'),
    migrationsDirectory: 'migrations/app',
    recoveryDirectory: path.join(root, 'recovery'),
    appVersion: '0.1.0',
    clock,
  });
}

describe('application settings repository', () => {
  it('persists versioned settings, resets them, and safely recovers corrupt or future values', async () => {
    const root = await temporaryDirectory();
    const clock = { now: () => new Date('2026-07-16T01:00:00.000Z') };
    const runtime = await runtimeAt(root, clock);

    expect(runtime.appSettings.get()).toEqual({
      source: 'default',
      settings: {
        schemaVersion: 1,
        language: 'zh-CN',
        startupBehavior: 'show-home',
        defaultMode: 'beginner',
        themeId: 'theme-a',
        themeVariant: 'light',
        reduceMotion: false,
      },
    });

    await expect(
      runtime.appSettings.update(randomUUID(), {
        startupBehavior: 'reopen-last',
        defaultMode: 'professional',
        themeId: 'theme-b',
        themeVariant: 'dark',
        reduceMotion: true,
      }),
    ).resolves.toMatchObject({
      source: 'stored',
      settings: {
        schemaVersion: 1,
        startupBehavior: 'reopen-last',
        defaultMode: 'professional',
        themeId: 'theme-b',
        themeVariant: 'dark',
        reduceMotion: true,
      },
    });
    await runtime.close();

    const reopened = await runtimeAt(root, clock);
    expect(reopened.appSettings.get()).toMatchObject({
      source: 'stored',
      settings: { defaultMode: 'professional', themeId: 'theme-b' },
    });
    await expect(reopened.appSettings.reset(randomUUID())).resolves.toMatchObject({
      source: 'default',
      settings: { defaultMode: 'beginner', themeId: 'theme-a' },
    });

    await reopened.database.write(randomUUID(), (database) => {
      database
        .prepare(
          `INSERT INTO app_settings(key, value_json, updated_at) VALUES(?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json`,
        )
        .run('application_preferences', '{not-json', clock.now().toISOString());
    });
    expect(reopened.appSettings.get()).toMatchObject({
      source: 'recovered',
      recoveryReason: 'invalid-json',
      settings: { schemaVersion: 1, defaultMode: 'beginner' },
    });

    await reopened.database.write(randomUUID(), (database) => {
      database
        .prepare('UPDATE app_settings SET value_json = ? WHERE key = ?')
        .run(JSON.stringify({ schemaVersion: 99 }), 'application_preferences');
    });
    expect(reopened.appSettings.get()).toMatchObject({
      source: 'recovered',
      recoveryReason: 'unsupported-version',
      settings: { schemaVersion: 1, defaultMode: 'beginner' },
    });
    await reopened.close();
  });
});

describe('recent projects repository', () => {
  it('sorts, rejects duplicate paths, marks missing paths, relocates, and removes records', async () => {
    const root = await temporaryDirectory();
    const firstPath = path.join(root, 'first-project');
    const secondPath = path.join(root, 'second-project');
    const relocatedPath = path.join(root, 'relocated-project');
    await Promise.all([
      mkdir(firstPath, { recursive: true }),
      mkdir(secondPath, { recursive: true }),
      mkdir(relocatedPath, { recursive: true }),
    ]);
    let now = new Date('2026-07-16T02:00:00.000Z');
    const clock = { now: () => now };
    const runtime = await runtimeAt(root, clock);
    const firstProjectId = randomUUID();
    const secondProjectId = randomUUID();

    await runtime.recentProjects.register(randomUUID(), {
      projectId: firstProjectId,
      workspacePath: firstPath,
      displayName: '第一部作品',
    });
    now = new Date('2026-07-16T03:00:00.000Z');
    await runtime.recentProjects.register(randomUUID(), {
      projectId: secondProjectId,
      workspacePath: secondPath,
      displayName: '第二部作品',
    });

    await expect(runtime.recentProjects.list(randomUUID())).resolves.toMatchObject([
      { projectId: secondProjectId, workspacePath: secondPath, missingSince: null },
      { projectId: firstProjectId, workspacePath: firstPath, missingSince: null },
    ]);
    await expect(
      runtime.recentProjects.register(randomUUID(), {
        projectId: randomUUID(),
        workspacePath: firstPath,
        displayName: '重复路径',
      }),
    ).rejects.toMatchObject<AppDataRepositoryError>({ code: 'RECENT_PROJECT_PATH_CONFLICT' });

    await rm(firstPath, { recursive: true });
    now = new Date('2026-07-16T04:00:00.000Z');
    const missing = await runtime.recentProjects.list(randomUUID());
    expect(missing.find((project) => project.projectId === firstProjectId)).toMatchObject({
      missingSince: '2026-07-16T04:00:00.000Z',
    });

    await expect(
      runtime.recentProjects.relocate(randomUUID(), firstProjectId, relocatedPath),
    ).resolves.toMatchObject({
      projectId: firstProjectId,
      workspacePath: relocatedPath,
      missingSince: null,
    });
    await expect(runtime.recentProjects.remove(randomUUID(), secondProjectId)).resolves.toBe(true);
    await expect(runtime.recentProjects.remove(randomUUID(), secondProjectId)).resolves.toBe(false);
    await expect(runtime.recentProjects.list(randomUUID())).resolves.toHaveLength(1);
    await runtime.close();
  });
});

describe('provider metadata and app/project boundary', () => {
  it('stores provider metadata without credentials or project business data', async () => {
    const root = await temporaryDirectory();
    const databasePath = path.join(root, 'app.sqlite');
    const clock = { now: () => new Date('2026-07-16T05:00:00.000Z') };
    const runtime = await runtimeAt(root, clock);
    const providerId = 'local-openai';

    await expect(
      runtime.providerConfigs.upsert(randomUUID(), {
        id: providerId,
        name: '本地兼容服务',
        protocol: 'openai_compatible',
        baseUrl: 'http://127.0.0.1:11434/v1',
        model: 'writer-model',
        credentialRef: null,
        timeoutMs: 30_000,
        options: { temperature: 0.7, stream: true },
      }),
    ).resolves.toMatchObject({ id: providerId, credentialRef: null });
    expect(runtime.providerConfigs.list()).toMatchObject([
      { id: providerId, options: { temperature: 0.7, stream: true } },
    ]);
    await expect(
      runtime.providerConfigs.upsert(randomUUID(), {
        id: 'unsafe-provider',
        name: '不安全配置',
        protocol: 'custom',
        baseUrl: 'https://example.invalid/v1',
        model: 'model',
        credentialRef: null,
        timeoutMs: 30_000,
        options: { apiKey: 'credential-body-must-not-be-stored' },
      }),
    ).rejects.toThrow();
    await runtime.close();

    const database = new DatabaseSync(databasePath, { readOnly: true });
    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => String(row.name));
    expect(tables).not.toEqual(
      expect.arrayContaining([
        'drafts',
        'draft_blocks',
        'candidates',
        'versions',
        'version_blocks',
      ]),
    );
    const stored = database
      .prepare('SELECT credential_ref, options_json FROM provider_configs WHERE id = ?')
      .get(providerId);
    expect(stored).toEqual({
      credential_ref: null,
      options_json: JSON.stringify({ temperature: 0.7, stream: true }),
    });
    expect(JSON.stringify(stored)).not.toContain('credential-body-must-not-be-stored');
    database.close();
  });
});
