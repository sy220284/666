import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  latestProjectMigrationVersion,
  loadProjectMigrations,
  loadProjectMigrationsThrough,
  materializeProjectMigrationsThrough,
} from '../../packages/testkit/src/index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('project migration testkit', () => {
  it('derives the latest version from the authoritative migration sequence', async () => {
    const migrations = await loadProjectMigrations();
    expect(await latestProjectMigrationVersion()).toBe(migrations.at(-1)?.version);
  });

  it('builds historical migration inputs forward through the requested version', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-project-migrations-'));
    temporaryDirectories.push(root);
    const targetDirectory = path.join(root, 'project');

    const selected = await loadProjectMigrationsThrough(27);
    const materialized = await materializeProjectMigrationsThrough(27, targetDirectory);

    expect(selected).toHaveLength(27);
    expect(materialized.map(({ version, name }) => ({ version, name }))).toEqual(
      selected.map(({ version, name }) => ({ version, name })),
    );
    expect(await readdir(targetDirectory)).toEqual(
      selected.map(
        (migration) => `${migration.version.toString().padStart(4, '0')}_${migration.name}.sql`,
      ),
    );
    expect(await loadProjectMigrations(targetDirectory)).toHaveLength(27);
  });

  it('rejects versions outside the available migration sequence', async () => {
    const latest = await latestProjectMigrationVersion();
    await expect(loadProjectMigrationsThrough(0)).rejects.toThrow(RangeError);
    await expect(loadProjectMigrationsThrough(latest + 1)).rejects.toThrow(RangeError);
  });
});
