import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ProjectDatabase,
  latestMigrationVersion,
  loadMigrations,
} from '../../packages/core-service/src/database/index.js';

const temporaryDirectories: string[] = [];
const timestamp = '2026-07-23T05:00:00.000Z';

function percentile95(samples: readonly number[]): number {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? Number.POSITIVE_INFINITY;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M3 SceneBeat rebind performance budget', () => {
  it('rebinds 500 linked DraftBlocks within the bulk structure-operation budget', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-scene-beat-perf-'));
    temporaryDirectories.push(directory);
    const migrations = await loadMigrations('migrations/project', 'project');
    const database = await ProjectDatabase.open({
      path: path.join(directory, 'project.sqlite'),
      migrations,
      appVersion: '0.1.0',
    });
    const projectId = randomUUID();
    const volumeId = randomUUID();
    const chapterId = randomUUID();
    const draftId = randomUUID();
    const beatId = randomUUID();
    const logicalBlockIds = Array.from({ length: 500 }, () => randomUUID());

    try {
      await database.write(randomUUID(), (connection) => {
        connection
          .prepare(
            `INSERT INTO projects(
               id, name, channel, active_style_profile_id, schema_version, created_at, updated_at
             ) VALUES(?, 'SceneBeat performance', 'test', NULL, ?, ?, ?)`,
          )
          .run(projectId, latestMigrationVersion(migrations), timestamp, timestamp);
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
          .run(chapterId, volumeId);
        connection
          .prepare(
            `INSERT INTO drafts(id, chapter_id, status, revision, created_at, updated_at)
             VALUES(?, ?, 'active', 0, ?, ?)`,
          )
          .run(draftId, chapterId, timestamp, timestamp);
        connection
          .prepare('UPDATE chapters SET active_draft_id = ? WHERE id = ?')
          .run(draftId, chapterId);
        connection
          .prepare(
            `INSERT INTO scene_beats(
               id, project_id, chapter_id, plot_node_id, title, goal, core_conflict,
               expected_result, beat_type, word_target_percent, is_required, order_key,
               character_ids_json, location_ids_json, deleted_at, updated_at
             ) VALUES(?, ?, ?, NULL, '批量节拍', '', '', '', 'setup', 50, 1, 1024,
                      '[]', '[]', NULL, ?)`,
          )
          .run(beatId, projectId, chapterId, timestamp);
        const insertBlock = connection.prepare(
          `INSERT INTO draft_blocks(
             id, draft_id, logical_block_id, order_key, block_type, text,
             attributes_json, source, locked, content_hash, revision
           ) VALUES(?, ?, ?, ?, 'paragraph', ?, '{}', 'manual', 0, NULL, ?)`,
        );
        const insertLink = connection.prepare(
          'INSERT INTO scene_beat_block_links(scene_beat_id, draft_block_id, created_at) VALUES(?, ?, ?)',
        );
        for (const [index, logicalBlockId] of logicalBlockIds.entries()) {
          const blockId = randomUUID();
          insertBlock.run(
            blockId,
            draftId,
            logicalBlockId,
            (index + 1) * 1024,
            `正文${index}`,
            0,
          );
          insertLink.run(beatId, blockId, timestamp);
        }
      });

      const samples: number[] = [];
      for (let round = 1; round <= 5; round += 1) {
        const started = performance.now();
        await database.write(randomUUID(), (connection) => {
          connection.prepare('DELETE FROM draft_blocks WHERE draft_id = ?').run(draftId);
          const insertBlock = connection.prepare(
            `INSERT INTO draft_blocks(
               id, draft_id, logical_block_id, order_key, block_type, text,
               attributes_json, source, locked, content_hash, revision
             ) VALUES(?, ?, ?, ?, 'paragraph', ?, '{}', 'manual', 0, NULL, ?)`,
          );
          for (const [index, logicalBlockId] of logicalBlockIds.entries()) {
            insertBlock.run(
              randomUUID(),
              draftId,
              logicalBlockId,
              (index + 1) * 1024,
              `正文${round}-${index}`,
              round,
            );
          }
        });
        samples.push(performance.now() - started);
        expect(
          database.read((connection) =>
            connection
              .prepare('SELECT COUNT(*) AS count FROM scene_beat_block_links WHERE scene_beat_id = ?')
              .get(beatId),
          ),
        ).toEqual({ count: 500n });
        expect(
          database.read((connection) =>
            connection.prepare('SELECT COUNT(*) AS count FROM scene_beat_link_rebind_queue').get(),
          ),
        ).toEqual({ count: 0n });
      }

      const p95 = percentile95(samples);
      expect(p95).toBeLessThanOrEqual(3_000);
    } finally {
      await database.close();
    }
  });
});
