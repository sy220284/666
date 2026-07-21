import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ProjectDatabase, loadMigrations } from '../../packages/core-service/src/database/index.js';

const temporaryDirectories: string[] = [];
const timestamp = '2026-07-20T11:00:00.000Z';

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M3-02 SceneBeat entity truth migration', () => {
  it('validates legacy UUID inputs and keeps generic relation rows synchronized', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-scene-beat-entity-truth-'));
    temporaryDirectories.push(directory);
    const database = await ProjectDatabase.open({
      path: path.join(directory, 'project.sqlite'),
      migrations: await loadMigrations('migrations/project', 'project'),
      appVersion: '0.1.0',
    });
    try {
      expect(database.schemaVersion).toBe(16);
      const projectId = randomUUID();
      const foreignProjectId = randomUUID();
      const volumeId = randomUUID();
      const chapterId = randomUUID();
      const characterId = randomUUID();
      const locationId = randomUUID();
      const archivedCharacterId = randomUUID();
      const foreignCharacterId = randomUUID();
      const sceneBeatId = randomUUID();
      const mirrorBeatId = randomUUID();

      await database.write(randomUUID(), (connection) => {
        const insertProject = connection.prepare(
          `INSERT INTO projects(
             id, name, channel, active_style_profile_id, schema_version, created_at, updated_at
           ) VALUES(?, ?, 'test', NULL, 16, ?, ?)`,
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
           ) VALUES(?, ?, ?, ?, '[]', '', ?, ?, ?, ?)`,
        );
        insertEntity.run(
          characterId,
          projectId,
          'character',
          '本项目人物',
          'active',
          null,
          timestamp,
          timestamp,
        );
        insertEntity.run(
          locationId,
          projectId,
          'location',
          '本项目地点',
          'active',
          null,
          timestamp,
          timestamp,
        );
        insertEntity.run(
          archivedCharacterId,
          projectId,
          'character',
          '已归档人物',
          'archived',
          timestamp,
          timestamp,
          timestamp,
        );
        insertEntity.run(
          foreignCharacterId,
          foreignProjectId,
          'character',
          '异项目人物',
          'active',
          null,
          timestamp,
          timestamp,
        );
        const insertBeat = connection.prepare(
          `INSERT INTO scene_beats(
             id, project_id, chapter_id, plot_node_id, title, goal, core_conflict,
             expected_result, beat_type, word_target_percent, is_required, order_key,
             character_ids_json, location_ids_json, deleted_at, updated_at
           ) VALUES(?, ?, ?, NULL, ?, '', '', '', 'setup', 10, 1, ?, ?, ?, NULL, ?)`,
        );
        insertBeat.run(
          sceneBeatId,
          projectId,
          chapterId,
          '合法引用',
          1000,
          JSON.stringify([characterId]),
          JSON.stringify([locationId]),
          timestamp,
        );
        insertBeat.run(
          mirrorBeatId,
          projectId,
          chapterId,
          '关系表镜像',
          2000,
          '[]',
          '[]',
          timestamp,
        );
      });

      expect(
        database.read((connection) =>
          connection
            .prepare(
              `SELECT entity_id AS entityId, role
                 FROM scene_beat_entities
                WHERE scene_beat_id = ?
                ORDER BY role, entity_id`,
            )
            .all(sceneBeatId),
        ),
      ).toEqual([
        { entityId: characterId, role: 'character' },
        { entityId: locationId, role: 'location' },
      ]);

      for (const invalidCharacterId of [randomUUID(), archivedCharacterId, foreignCharacterId]) {
        await expect(
          database.write(randomUUID(), (connection) =>
            connection
              .prepare('UPDATE scene_beats SET character_ids_json = ? WHERE id = ?')
              .run(JSON.stringify([invalidCharacterId]), sceneBeatId),
          ),
        ).rejects.toMatchObject({ code: 'DATABASE_WRITE_FAILED' });
      }

      await expect(
        database.write(randomUUID(), (connection) =>
          connection
            .prepare('UPDATE scene_beats SET character_ids_json = ? WHERE id = ?')
            .run(JSON.stringify([locationId]), sceneBeatId),
        ),
      ).rejects.toMatchObject({ code: 'DATABASE_WRITE_FAILED' });

      await database.write(randomUUID(), (connection) => {
        connection
          .prepare(
            `INSERT INTO scene_beat_entities(
               project_id, scene_beat_id, entity_id, role, created_at
             ) VALUES(?, ?, ?, 'character', ?)`,
          )
          .run(projectId, mirrorBeatId, characterId, timestamp);
      });
      expect(
        database.read(
          (connection) =>
            connection
              .prepare(
                'SELECT character_ids_json AS characterIdsJson FROM scene_beats WHERE id = ?',
              )
              .get(mirrorBeatId)?.characterIdsJson,
        ),
      ).toBe(JSON.stringify([characterId]));

      await database.write(randomUUID(), (connection) => {
        connection
          .prepare(
            `DELETE FROM scene_beat_entities
              WHERE scene_beat_id = ? AND entity_id = ? AND role = 'character'`,
          )
          .run(mirrorBeatId, characterId);
      });
      expect(
        database.read(
          (connection) =>
            connection
              .prepare(
                'SELECT character_ids_json AS characterIdsJson FROM scene_beats WHERE id = ?',
              )
              .get(mirrorBeatId)?.characterIdsJson,
        ),
      ).toBe('[]');
      expect(database.foreignKeyCheck()).toEqual([]);
    } finally {
      await database.close();
    }
  });
});
