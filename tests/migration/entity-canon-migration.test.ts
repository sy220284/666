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
      const volumeId = randomUUID();
      const chapterId = randomUUID();
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
        connection
          .prepare(
            `INSERT INTO volumes(id, project_id, title, order_key, status, deleted_at)
             VALUES(?, ?, '第一卷', 1000, 'active', NULL)`,
          )
          .run(volumeId, projectId);
        connection
          .prepare(
            `INSERT INTO chapters(
               id, volume_id, title, order_key, status, target_word_min, target_word_max,
               active_draft_id, final_version_id, deleted_at
             ) VALUES(?, ?, '第一章', 1000, 'pending', NULL, NULL, NULL, NULL, NULL)`,
          )
          .run(chapterId, volumeId);
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
               expected_result, beat_type, word_target_percent, is_required, order_key,
               character_ids_json, location_ids_json, deleted_at, updated_at
             ) VALUES(?, ?, ?, NULL, '场景', '', '', '', 'setup', 10, 1, 1000, '[]', '[]', NULL, ?)`,
          )
          .run(sceneBeatId, projectId, chapterId, timestamp);
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
      ).rejects.toMatchObject({ code: 'DATABASE_WRITE_FAILED' });
      expect(
        database.read(
          (connection) =>
            connection
              .prepare(
                "SELECT COUNT(*) AS total FROM canon_facts WHERE entity_id = ? AND fact_key = 'identity' AND status = 'current'",
              )
              .get(entityId)?.total,
        ),
      ).toBe(1n);

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
      ).rejects.toMatchObject({ code: 'DATABASE_WRITE_FAILED' });
      expect(
        database.read(
          (connection) =>
            connection.prepare('SELECT COUNT(*) AS total FROM scene_beat_entities').get()?.total,
        ),
      ).toBe(0n);
      expect(database.foreignKeyCheck()).toEqual([]);
    } finally {
      await database.close();
    }
  });
});
