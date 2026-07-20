import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ProjectDatabase, loadMigrations } from '../../packages/core-service/src/database/index.js';

const temporaryDirectories: string[] = [];
const timestamp = '2026-07-20T03:00:00.000Z';

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M3-04 continuity migration', () => {
  it('creates strict ledgers, current uniqueness, and project-bound relationships', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-continuity-migration-'));
    temporaryDirectories.push(directory);
    const database = await ProjectDatabase.open({
      path: path.join(directory, 'project.sqlite'),
      migrations: await loadMigrations('migrations/project', 'project'),
      appVersion: '0.1.0',
    });
    try {
      expect(database.schemaVersion).toBe(13);
      expect(
        database.read((connection) =>
          connection
            .prepare(
              `SELECT name, strict, wr
                 FROM pragma_table_list
                WHERE name IN (
                  'entity_states',
                  'timeline_events',
                  'timeline_event_entities',
                  'timeline_event_dependencies',
                  'knowledge_states'
                )
                ORDER BY name`,
            )
            .all(),
        ),
      ).toEqual([
        { name: 'entity_states', strict: 1n, wr: 0n },
        { name: 'knowledge_states', strict: 1n, wr: 0n },
        { name: 'timeline_event_dependencies', strict: 1n, wr: 1n },
        { name: 'timeline_event_entities', strict: 1n, wr: 1n },
        { name: 'timeline_events', strict: 1n, wr: 0n },
      ]);

      const projectId = randomUUID();
      const volumeId = randomUUID();
      const chapterId = randomUUID();
      const entityId = randomUUID();
      const versionId = randomUUID();
      const eventId = randomUUID();
      await database.write(randomUUID(), (connection) => {
        connection
          .prepare(
            `INSERT INTO projects(
               id, name, channel, active_style_profile_id, schema_version, created_at, updated_at
             ) VALUES(?, 'Continuity', 'test', NULL, 13, ?, ?)`,
          )
          .run(projectId, timestamp, timestamp);
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
             ) VALUES(?, ?, '第一章', 1000, 'writing', NULL, NULL, NULL, NULL, NULL)`,
          )
          .run(chapterId, volumeId);
        connection
          .prepare(
            `INSERT INTO versions(
               id, chapter_id, source_draft_id, source_revision, title, description, label,
               content_hash, finalized, created_at, version_type, parent_version_id,
               source_candidate_id
             ) VALUES(?, ?, NULL, 0, '来源', '', NULL, ?, 0, ?, 'manual', NULL, NULL)`,
          )
          .run(versionId, chapterId, '0'.repeat(64), timestamp);
        connection
          .prepare(
            `INSERT INTO entities(
               id, project_id, entity_type, name, aliases_json, summary,
               status, archived_at, created_at, updated_at
             ) VALUES(?, ?, 'character', '人物', '[]', '', 'active', NULL, ?, ?)`,
          )
          .run(entityId, projectId, timestamp, timestamp);
        connection
          .prepare(
            `INSERT INTO entity_states(
               id, project_id, entity_id, state_key, value_json,
               valid_from_chapter_id, valid_until_chapter_id, record_status,
               evidence_json, source_version_id, created_at, superseded_at
             ) VALUES(?, ?, ?, 'health', '"well"', ?, NULL, 'current', '[]', ?, ?, NULL)`,
          )
          .run(randomUUID(), projectId, entityId, chapterId, versionId, timestamp);
        connection
          .prepare(
            `INSERT INTO timeline_events(
               id, project_id, title, start_value, end_value, precision, chapter_id,
               location_id, description, status, archived_at, created_at, updated_at
             ) VALUES(?, ?, '事件', '2026-07-20', NULL, 'day', ?, NULL, '',
               'active', NULL, ?, ?)`,
          )
          .run(eventId, projectId, chapterId, timestamp, timestamp);
      });

      await expect(
        database.write(randomUUID(), (connection) =>
          connection
            .prepare(
              `INSERT INTO entity_states(
                 id, project_id, entity_id, state_key, value_json,
                 valid_from_chapter_id, valid_until_chapter_id, record_status,
                 evidence_json, source_version_id, created_at, superseded_at
               ) VALUES(?, ?, ?, 'health', '"injured"', ?, NULL, 'current', '[]', ?, ?, NULL)`,
            )
            .run(randomUUID(), projectId, entityId, chapterId, versionId, timestamp),
        ),
      ).rejects.toMatchObject({ code: 'DATABASE_WRITE_FAILED' });

      await expect(
        database.write(randomUUID(), (connection) =>
          connection
            .prepare(
              `INSERT INTO timeline_event_dependencies(
                 project_id, event_id, dependency_event_id, created_at
               ) VALUES(?, ?, ?, ?)`,
            )
            .run(projectId, eventId, eventId, timestamp),
        ),
      ).rejects.toMatchObject({ code: 'DATABASE_WRITE_FAILED' });
      expect(database.foreignKeyCheck()).toEqual([]);
    } finally {
      await database.close();
    }
  });
});
