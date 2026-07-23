import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('application settings concurrent patch coordination', () => {
  it('preserves independent fields from concurrent updates', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-settings-concurrency-'));
    temporaryDirectories.push(root);
    const runtime = await openAppRuntime({
      databasePath: path.join(root, 'app.sqlite'),
      migrationsDirectory: 'migrations/app',
      recoveryDirectory: path.join(root, 'recovery'),
      appVersion: '0.1.0',
      clock: { now: () => new Date('2026-07-23T12:00:00.000Z') },
    });

    await Promise.all([
      runtime.appSettings.update(randomUUID(), { themeId: 'theme-concurrent' }),
      runtime.appSettings.update(randomUUID(), { defaultMode: 'professional' }),
      runtime.appSettings.update(randomUUID(), { reduceMotion: true }),
    ]);

    expect(runtime.appSettings.get()).toMatchObject({
      source: 'stored',
      settings: {
        themeId: 'theme-concurrent',
        defaultMode: 'professional',
        reduceMotion: true,
      },
    });
    await runtime.close();
  });
});
