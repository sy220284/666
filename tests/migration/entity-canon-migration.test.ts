import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ProjectDatabase, loadMigrations } from '../../packages/core-service/src/database/index.js';

const temporaryDirectories: string[] = [];
const timestamp = '2026-07-19T08:00:00.000Z';

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M3-03 Entity and Canon migration', () => {
  it('creates strict Canon tables with current uniqueness and project-bound references', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-entity-canon-migration-'));
    temporaryDirectories.push(directory);
    const database = await ProjectDatabase.open({
      path: path.join(directory, 'project.sqlite'),
      migrations: await loadMigrations('migrations/project', 'project'),
      appVersion: '0.1.0',
    });
    try {
      expect(database.schemaVersion).toBe(12);
      expect(
        database.read((connection) =>
          connection
            .prepare(
              "SELECT name, strict, wr FROM pragma_table_list WHERE name IN ('entities', 'canon_facts', 'scene_beat_entities') ORDER BY name",
            )
            .all(),
        ),
      ).toEqual([
        { name: 'canon_facts', strict: 1n, wr: 0n },
        { name: 'entities', strict: 1n, wr: 0n },
        { name: 'scene_beat_entities', strict: 1n, wr: 1n },
      ]);

      const projectId = randomUUID();
      const foreignProjectId = randomUUID();
      const entityId = randomUUID();
      const foreignEntityId = randomUUID();
      const sceneBeatId = randomUUID();
      await database.write(randomUUID(), (connection) => {
        const insertProject = connection.prepare(
          `INSERT INTO projects(
             id, name, channel, active_style_profile_id, schema_version, created_at, updated_at
           ) VALUES(?, ?, 'test', NULL, 12, ?, ?)`,
        );
        insertProject.run(projectId, '本项目', timestamp, timestamp);
        insertProject.run(foreignProjectId, '异项目', timestamp, timestamp);
        const insertEntity = connection.prepare(
          `INSERT INTO entities(
             id, project_id, entity_type, name, aliases_json, summary,
             status, archived_at, created_at, updated_at
           ) VALUES(?, ?, 'character', ?, '[]', '', 'active', NULL, ?, ?)`,
        );
        insertEntity.run(entityId, projectId, '本项目人物', timestamp, timestamp);
        insertEntity.run(foreignEntityId, foreignProjectId, '异项目人物', timestamp, timestamp);
        connection
          .prepare(
            `INSERT INTO canon_facts(
               id, project_id, entity_id, fact_key, value_json, description,
               source_type, source_id, status, confirmed_at, superseded_at, created_at
             ) VALUES(?, ?, ?, 'identity', '{}', '', 'author', NULL, 'current', ?, NULL, ?)`,
          )
          .run(randomUUID(), projectId, entityId, timestamp, timestamp);
        connection
          .prepare(
            `INSERT INTO scene_beats(
               id, project_id, chapter_id, plot_node_id, title, goal, core_conflict,
               expected_result, beat_type, word_target_percent, required, order_key,
               revision, deleted_at, created_at, updated_at
             ) VALUES(?, ?, NULL, NULL, '场景', '', '', '', 'setup', 10, 1, 'a', 1, NULL, ?, ?)`,
          )
          .run(sceneBeatId, projectId, timestamp, timestamp);
      });

      await expect(
        database.write(randomUUID(), (connection) =>
          connection
            .prepare(
              `INSERT INTO canon_facts(
                 id, project_id, entity_id, fact_key, value_json, description,
                 source_type, source_id, status, confirmed_at, superseded_at, created_at
               ) VALUES(?, ?, ?, 'identity', '{}', '', 'author', NULL, 'current', ?, NULL, ?)`,
            )
            .run(randomUUID(), projectId, entityId, timestamp, timestamp),
        ),
      ).rejects.toThrow(/UNIQUE constraint failed/u);

      await expect(
        database.write(randomUUID(), (connection) =>
          connection
            .prepare(
              `INSERT INTO scene_beat_entities(
                 project_id, scene_beat_id, entity_id, role, created_at
               ) VALUES(?, ?, ?, 'character', ?)`,
            )
            .run(projectId, sceneBeatId, foreignEntityId, timestamp),
        ),
      ).rejects.toThrow(/FOREIGN KEY constraint failed/u);
      expect(database.foreignKeyCheck()).toEqual([]);
    } finally {
      await database.close();
    }
  });
});
