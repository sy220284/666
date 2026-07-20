import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ProjectDatabase,
  latestMigrationVersion,
  loadMigrations,
} from '../../packages/core-service/src/database/index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M3-02 SceneBeat migration', () => {
  it('keeps strict planning tables through the current project schema without正文 ownership cascades', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-scene-beat-migration-'));
    temporaryDirectories.push(directory);
    const migrations = await loadMigrations('migrations/project', 'project');
    const database = await ProjectDatabase.open({
      path: path.join(directory, 'project.sqlite'),
      migrations,
      appVersion: '0.1.0',
    });
    try {
      expect(database.schemaVersion).toBe(latestMigrationVersion(migrations));
      expect(
        database.read((connection) =>
          connection
            .prepare(
              "SELECT name, strict, wr FROM pragma_table_list WHERE name IN ('scene_beats', 'scene_beat_block_links') ORDER BY name",
            )
            .all(),
        ),
      ).toEqual([
        { name: 'scene_beat_block_links', strict: 1n, wr: 1n },
        { name: 'scene_beats', strict: 1n, wr: 0n },
      ]);
      const linkForeignKeys = database.read((connection) =>
        connection.prepare('PRAGMA foreign_key_list(scene_beat_block_links)').all(),
      );
      expect(linkForeignKeys).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ table: 'draft_blocks', on_delete: 'CASCADE' }),
          expect.objectContaining({ table: 'scene_beats', on_delete: 'CASCADE' }),
        ]),
      );
      expect(database.foreignKeyCheck()).toEqual([]);
    } finally {
      await database.close();
    }
  });
});
