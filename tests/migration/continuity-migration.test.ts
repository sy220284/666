import { randomUUID } from 'node:crypto';
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
const timestamp = '2026-07-19T12:00:00.000Z';
const emptyHash = '0'.repeat(64);

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M3-04 continuity migration', () => {
  it('creates strict continuity tables and enforces current uniqueness plus project scope', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-continuity-migration-'));
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
              `SELECT name, strict, wr FROM pragma_table_list
                WHERE name IN (
                  'entity_states', 'timeline_events', 'timeline_event_entities',
                  'timeline_dependencies', 'knowledge_states'
                )
                ORDER BY name`,
            )
            .all(),
        ),
      ).toEqual([
        { name: 'entity_states', strict: 1n, wr: 0n },
        { name: 'knowledge_states', strict: 1n, wr: 0n },
        { name: 'timeline_dependencies', strict: 1n, wr: 1n },
        { name: 'timeline_event_entities', strict: 1n, wr: 1n },
        { name: 'timeline_events', strict: 1n, wr: 0n },
      ]);

      const projectId = randomUUID();
      const foreignProjectId = randomUUID();
      const volumeId = randomUUID();
      const foreignVolumeId = randomUUID();
      const chapterId = randomUUID();
      const foreignChapterId = randomUUID();
      const draftId = randomUUID();
      const foreignDraftId = randomUUID();
      const blockId = randomUUID();
      const foreignBlockId = randomUUID();
      const versionId = randomUUID();
      const foreignVersionId = randomUUID();
      const characterId = randomUUID();
      const locationId = randomUUID();
      const foreignCharacterId = randomUUID();

      await database.write(randomUUID(), (connection) => {
        const insertProject = connection.prepare(
          `INSERT INTO projects(
             id, name, channel, active_style_profile_id, schema_version, created_at, updated_at
           ) VALUES(?, ?, 'test', NULL, ?, ?, ?)`,
        );
        insertProject.run(projectId, '本项目', database.schemaVersion, timestamp, timestamp);
        insertProject.run(
          foreignProjectId,
          '异项目',
          database.schemaVersion,
          timestamp,
          timestamp,
        );
        const insertVolume = connection.prepare(
          `INSERT INTO volumes(id, project_id, title, order_key, status, deleted_at)
           VALUES(?, ?, ?, 1000, 'pending', NULL)`,
        );
        insertVolume.run(volumeId, projectId, '第一卷');
        insertVolume.run(foreignVolumeId, foreignProjectId, '异项目卷');
        const insertChapter = connection.prepare(
          `INSERT INTO chapters(
             id, volume_id, title, order_key, status, target_word_min, target_word_max,
             active_draft_id, final_version_id, deleted_at
           ) VALUES(?, ?, ?, 1000, 'pending', NULL, NULL, NULL, NULL, NULL)`,
        );
        insertChapter.run(chapterId, volumeId, '第一章');
        insertChapter.run(foreignChapterId, foreignVolumeId, '异项目章');
        const insertDraft = connection.prepare(
          `INSERT INTO drafts(id, chapter_id, status, revision, created_at, updated_at)
           VALUES(?, ?, 'active', 0, ?, ?)`,
        );
        insertDraft.run(draftId, chapterId, timestamp, timestamp);
        insertDraft.run(foreignDraftId, foreignChapterId, timestamp, timestamp);
        const insertBlock = connection.prepare(
          `INSERT INTO draft_blocks(
             id, draft_id, logical_block_id, order_key, block_type, text,
             attributes_json, source, locked, content_hash, revision
           ) VALUES(?, ?, ?, 1000, 'paragraph', '', '{}', 'manual', 0, NULL, 0)`,
        );
        insertBlock.run(blockId, draftId, randomUUID());
        insertBlock.run(foreignBlockId, foreignDraftId, randomUUID());
        const insertVersion = connection.prepare(
          `INSERT INTO versions(
             id, chapter_id, source_draft_id, source_revision, title, description,
             label, word_count, content_hash, created_at
           ) VALUES(?, ?, ?, 0, ?, '', NULL, 0, ?, ?)`,
        );
        insertVersion.run(versionId, chapterId, draftId, '本项目Version', emptyHash, timestamp);
        insertVersion.run(
          foreignVersionId,
          foreignChapterId,
          foreignDraftId,
          '异项目Version',
          emptyHash,
          timestamp,
        );
        const insertEntity = connection.prepare(
          `INSERT INTO entities(
             id, project_id, entity_type, name, aliases_json, summary,
             status, archived_at, created_at, updated_at
           ) VALUES(?, ?, ?, ?, '[]', '', 'active', NULL, ?, ?)`,
        );
        insertEntity.run(characterId, projectId, 'character', '人物', timestamp, timestamp);
        insertEntity.run(locationId, projectId, 'location', '地点', timestamp, timestamp);
        insertEntity.run(
          foreignCharacterId,
          foreignProjectId,
          'character',
          '异项目人物',
          timestamp,
          timestamp,
        );
        connection
          .prepare(
            `INSERT INTO entity_states(
               id, project_id, entity_id, state_key, value_json,
               valid_from_chapter_id, valid_until_chapter_id, record_status,
               evidence_json, source_version_id, created_at
             ) VALUES(?, ?, ?, 'health', '"well"', ?, NULL, 'current', '[]', ?, ?)`,
          )
          .run(randomUUID(), projectId, characterId, chapterId, versionId, timestamp);
      });

      await expect(
        database.write(randomUUID(), (connection) =>
          connection
            .prepare(
              `INSERT INTO entity_states(
                 id, project_id, entity_id, state_key, value_json,
                 valid_from_chapter_id, valid_until_chapter_id, record_status,
                 evidence_json, source_version_id, created_at
               ) VALUES(?, ?, ?, 'health', '"hurt"', ?, NULL, 'current', '[]', ?, ?)`,
            )
            .run(randomUUID(), projectId, characterId, chapterId, versionId, timestamp),
        ),
      ).rejects.toMatchObject({ code: 'DATABASE_WRITE_FAILED' });
      expect(
        database.read(
          (connection) =>
            connection
              .prepare(
                `SELECT COUNT(*) AS total FROM entity_states
                  WHERE entity_id = ? AND state_key = 'health' AND record_status = 'current'`,
              )
              .get(characterId)?.total,
        ),
      ).toBe(1n);

      await expect(
        database.write(randomUUID(), (connection) =>
          connection
            .prepare(
              `INSERT INTO entity_states(
                 id, project_id, entity_id, state_key, value_json,
                 valid_from_chapter_id, valid_until_chapter_id, record_status,
                 evidence_json, source_version_id, created_at
               ) VALUES(?, ?, ?, 'foreign-source', 'true', ?, NULL, 'current', '[]', ?, ?)`,
            )
            .run(
              randomUUID(),
              projectId,
              characterId,
              chapterId,
              foreignVersionId,
              timestamp,
            ),
        ),
      ).rejects.toMatchObject({ code: 'DATABASE_WRITE_FAILED' });

      await expect(
        database.write(randomUUID(), (connection) =>
          connection
            .prepare(
              `INSERT INTO timeline_events(
                 id, project_id, title, start_value, end_value, precision,
                 chapter_id, location_id, description, created_at, updated_at
               ) VALUES(?, ?, '错误地点', '2026-01-01', NULL, 'day', ?, ?, '', ?, ?)`,
            )
            .run(randomUUID(), projectId, chapterId, foreignCharacterId, timestamp, timestamp),
        ),
      ).rejects.toMatchObject({ code: 'DATABASE_WRITE_FAILED' });

      await expect(
        database.write(randomUUID(), (connection) =>
          connection
            .prepare(
              `INSERT INTO knowledge_states(
                 id, project_id, information_key, character_id, knowledge_status,
                 acquired_chapter_id, source_block_id, source_version_id, notes,
                 record_status, created_at, superseded_at
               ) VALUES(?, ?, 'secret', ?, 'knows', ?, ?, ?, '', 'current', ?, NULL)`,
            )
            .run(
              randomUUID(),
              projectId,
              foreignCharacterId,
              chapterId,
              blockId,
              versionId,
              timestamp,
            ),
        ),
      ).rejects.toMatchObject({ code: 'DATABASE_WRITE_FAILED' });

      expect(database.foreignKeyCheck()).toEqual([]);
    } finally {
      await database.close();
    }
  });
});
