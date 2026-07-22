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
const timestamp = '2026-07-22T12:00:00.000Z';
const emptySnapshot = JSON.stringify({
  entityStates: [],
  knowledgeStates: [],
  foreshadowings: [],
  arcMilestones: [],
});

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M3-R01 integrated coordination migration', () => {
  it('coordinates snapshots, continuity boundaries, and SceneBeat block identity', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-integrated-coordination-'));
    temporaryDirectories.push(directory);
    const migrations = await loadMigrations('migrations/project', 'project');
    const currentSchemaVersion = latestMigrationVersion(migrations);
    const database = await ProjectDatabase.open({
      path: path.join(directory, 'project.sqlite'),
      migrations,
      appVersion: '0.1.0',
    });

    try {
      expect(currentSchemaVersion).toBeGreaterThanOrEqual(18);
      const projectId = randomUUID();
      const volumeId = randomUUID();
      const chapter1Id = randomUUID();
      const chapter2Id = randomUUID();
      const draft1Id = randomUUID();
      const draft2Id = randomUUID();
      const block1Id = randomUUID();
      const replacementBlockId = randomUUID();
      const logicalBlockId = randomUUID();
      const sceneBeatId = randomUUID();
      const entityId = randomUUID();
      const version1Id = randomUUID();
      const version2Id = randomUUID();
      const foreshadowingId = randomUUID();
      const arcId = randomUUID();
      const milestoneId = randomUUID();
      const snapshotId = randomUUID();

      await database.write(randomUUID(), (connection) => {
        connection
          .prepare(
            `INSERT INTO projects(
               id, name, channel, active_style_profile_id, schema_version, created_at, updated_at
             ) VALUES(?, 'Integrated coordination', 'test', NULL, ?, ?, ?)`,
          )
          .run(projectId, currentSchemaVersion, timestamp, timestamp);
        connection
          .prepare(
            `INSERT INTO volumes(id, project_id, title, order_key, status, deleted_at)
             VALUES(?, ?, '第一卷', 1024, 'active', NULL)`,
          )
          .run(volumeId, projectId);
        connection
          .prepare(
            `INSERT INTO chapters(
               id, volume_id, title, order_key, status, target_word_min, target_word_max,
               active_draft_id, final_version_id, deleted_at
             ) VALUES(?, ?, '第一章', 1024, 'writing', NULL, NULL, NULL, NULL, NULL)`,
          )
          .run(chapter1Id, volumeId);
        connection
          .prepare(
            `INSERT INTO chapters(
               id, volume_id, title, order_key, status, target_word_min, target_word_max,
               active_draft_id, final_version_id, deleted_at
             ) VALUES(?, ?, '第二章', 2048, 'writing', NULL, NULL, NULL, NULL, NULL)`,
          )
          .run(chapter2Id, volumeId);
        connection
          .prepare(
            `INSERT INTO drafts(id, chapter_id, status, revision, created_at, updated_at)
             VALUES(?, ?, 'active', 0, ?, ?), (?, ?, 'active', 0, ?, ?)`,
          )
          .run(
            draft1Id,
            chapter1Id,
            timestamp,
            timestamp,
            draft2Id,
            chapter2Id,
            timestamp,
            timestamp,
          );
        connection
          .prepare('UPDATE chapters SET active_draft_id = ? WHERE id = ?')
          .run(draft1Id, chapter1Id);
        connection
          .prepare('UPDATE chapters SET active_draft_id = ? WHERE id = ?')
          .run(draft2Id, chapter2Id);
        connection
          .prepare(
            `INSERT INTO draft_blocks(
               id, draft_id, logical_block_id, order_key, block_type, text,
               attributes_json, source, locked, content_hash, revision
             ) VALUES(?, ?, ?, 1024, 'paragraph', '第一章正文', '{}', 'manual', 0, NULL, 0)`,
          )
          .run(block1Id, draft1Id, logicalBlockId);
        connection
          .prepare(
            `INSERT INTO versions(
               id, chapter_id, source_draft_id, source_revision, title, description, label,
               word_count, content_hash, created_at
             ) VALUES(?, ?, ?, 0, '第一版', '', NULL, 4, ?, ?),
                     (?, ?, ?, 0, '第二版', '', NULL, 4, ?, ?)`,
          )
          .run(
            version1Id,
            chapter1Id,
            draft1Id,
            '1'.repeat(64),
            timestamp,
            version2Id,
            chapter1Id,
            draft1Id,
            '2'.repeat(64),
            timestamp,
          );
        connection
          .prepare('UPDATE chapters SET final_version_id = ?, status = ? WHERE id = ?')
          .run(version1Id, 'finalized', chapter1Id);
        connection
          .prepare(
            `INSERT INTO scene_beats(
               id, project_id, chapter_id, plot_node_id, title, goal, core_conflict,
               expected_result, beat_type, word_target_percent, is_required, order_key,
               character_ids_json, location_ids_json, deleted_at, updated_at
             ) VALUES(?, ?, ?, NULL, '场景', '', '', '', 'setup', 50, 1, 1024,
                      '[]', '[]', NULL, ?)`,
          )
          .run(sceneBeatId, projectId, chapter1Id, timestamp);
        connection
          .prepare(
            `INSERT INTO scene_beat_block_links(scene_beat_id, draft_block_id, created_at)
             VALUES(?, ?, ?)`,
          )
          .run(sceneBeatId, block1Id, timestamp);
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
          .run(randomUUID(), projectId, entityId, chapter1Id, version1Id, timestamp);
        connection
          .prepare(
            `INSERT INTO foreshadowings(
               id, project_id, title, description, status,
               reveal_from_chapter_id, reveal_by_chapter_id, created_at, updated_at
             ) VALUES(?, ?, '伏笔', '', 'revealed', ?, ?, ?, ?)`,
          )
          .run(foreshadowingId, projectId, chapter1Id, chapter2Id, timestamp, timestamp);
        connection
          .prepare(
            `INSERT INTO foreshadowing_chapters(
               project_id, foreshadowing_id, chapter_id, role, created_at
             ) VALUES(?, ?, ?, 'plant', ?), (?, ?, ?, 'reveal', ?)`,
          )
          .run(
            projectId,
            foreshadowingId,
            chapter1Id,
            timestamp,
            projectId,
            foreshadowingId,
            chapter2Id,
            timestamp,
          );
        connection
          .prepare(
            `INSERT INTO character_arcs(
               id, project_id, character_id, title, arc_type, custom_type,
               status, author_intent, created_at, updated_at
             ) VALUES(?, ?, ?, '成长弧', 'growth', NULL, 'active', '', ?, ?)`,
          )
          .run(arcId, projectId, entityId, timestamp, timestamp);
        connection
          .prepare(
            `INSERT INTO arc_milestones(
               id, project_id, arc_id, title, description, sort_index,
               planned_chapter_id, actual_chapter_id, status, confirmation_source,
               created_at, updated_at
             ) VALUES(?, ?, ?, '后续命中', '', 1, ?, ?, 'hit', 'author', ?, ?)`,
          )
          .run(milestoneId, projectId, arcId, chapter2Id, chapter2Id, timestamp, timestamp);
        connection
          .prepare(
            `INSERT INTO ending_snapshots(
               id, project_id, chapter_id, source_version_id, status,
               content_json, stale_reasons_json, created_at, stale_at
             ) VALUES(?, ?, ?, ?, 'valid', ?, '[]', ?, NULL)`,
          )
          .run(snapshotId, projectId, chapter1Id, version1Id, emptySnapshot, timestamp);
      });

      const projected = database.read((connection) => {
        const row = connection
          .prepare('SELECT content_json AS contentJson FROM ending_snapshots WHERE id = ?')
          .get(snapshotId) as { readonly contentJson: string };
        return JSON.parse(row.contentJson) as {
          readonly foreshadowings: readonly { readonly id: string; readonly status: string }[];
          readonly arcMilestones: readonly unknown[];
        };
      });
      expect(projected.foreshadowings).toEqual([{ id: foreshadowingId, status: 'planted' }]);
      expect(projected.arcMilestones).toEqual([]);

      await database.write(randomUUID(), (connection) => {
        connection.prepare('DELETE FROM draft_blocks WHERE id = ?').run(block1Id);
        connection
          .prepare(
            `INSERT INTO draft_blocks(
               id, draft_id, logical_block_id, order_key, block_type, text,
               attributes_json, source, locked, content_hash, revision
             ) VALUES(?, ?, ?, 1024, 'paragraph', '移动后的正文', '{}', 'manual', 0, NULL, 1)`,
          )
          .run(replacementBlockId, draft2Id, logicalBlockId);
      });
      expect(
        database.read((connection) =>
          connection
            .prepare(
              `SELECT draft_block_id AS draftBlockId
                 FROM scene_beat_block_links WHERE scene_beat_id = ?`,
            )
            .get(sceneBeatId),
        ),
      ).toEqual({ draftBlockId: replacementBlockId });
      expect(
        database.read((connection) =>
          connection.prepare('SELECT COUNT(*) AS count FROM scene_beat_link_rebind_queue').get(),
        ),
      ).toEqual({ count: 0n });

      await database.write(randomUUID(), (connection) => {
        connection
          .prepare('UPDATE chapters SET final_version_id = ? WHERE id = ?')
          .run(version2Id, chapter1Id);
      });
      expect(
        database.read((connection) =>
          connection
            .prepare(
              `SELECT status, stale_reasons_json AS staleReasonsJson
                 FROM ending_snapshots WHERE id = ?`,
            )
            .get(snapshotId),
        ),
      ).toMatchObject({ status: 'stale' });

      await expect(
        database.write(randomUUID(), (connection) =>
          connection
            .prepare('UPDATE chapters SET deleted_at = ? WHERE id = ?')
            .run(timestamp, chapter1Id),
        ),
      ).rejects.toMatchObject({ code: 'DATABASE_WRITE_FAILED' });
      expect(database.foreignKeyCheck()).toEqual([]);
    } finally {
      await database.close();
    }
  });
});
