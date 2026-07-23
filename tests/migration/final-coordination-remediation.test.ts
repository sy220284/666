import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ProjectDatabase,
  latestMigrationVersion,
  loadMigrations,
  type SqlMigration,
} from '../../packages/core-service/src/database/index.js';

const temporaryDirectories: string[] = [];
const timestamp = '2026-07-23T04:00:00.000Z';
const emptySnapshot = JSON.stringify({
  entityStates: [],
  knowledgeStates: [],
  foreshadowings: [],
  arcMilestones: [],
});

interface ChapterFixture {
  readonly chapterId: string;
  readonly draftId: string;
  readonly versionId: string;
}

interface ProjectFixture {
  readonly projectId: string;
  readonly volumeId: string;
  readonly chapters: readonly ChapterFixture[];
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function databasePath(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return path.join(directory, 'project.sqlite');
}

async function openLatest(prefix: string) {
  const migrations = await loadMigrations('migrations/project', 'project');
  const database = await ProjectDatabase.open({
    path: await databasePath(prefix),
    migrations,
    appVersion: '0.1.0',
  });
  return { database, migrations };
}

function seedProject(
  connection: Parameters<
    Parameters<Awaited<ReturnType<typeof openLatest>>['database']['write']>[1]
  >[0],
  schemaVersion: number,
  chapterCount = 3,
): ProjectFixture {
  const projectId = randomUUID();
  const volumeId = randomUUID();
  connection
    .prepare(
      `INSERT INTO projects(
         id, name, channel, active_style_profile_id, schema_version, created_at, updated_at
       ) VALUES(?, 'Final remediation', 'test', NULL, ?, ?, ?)`,
    )
    .run(projectId, schemaVersion, timestamp, timestamp);
  connection
    .prepare(
      `INSERT INTO volumes(id, project_id, title, order_key, status, deleted_at)
       VALUES(?, ?, '第一卷', 1024, 'active', NULL)`,
    )
    .run(volumeId, projectId);

  const chapters: ChapterFixture[] = [];
  for (let index = 0; index < chapterCount; index += 1) {
    const chapterId = randomUUID();
    const draftId = randomUUID();
    const versionId = randomUUID();
    connection
      .prepare(
        `INSERT INTO chapters(
           id, volume_id, title, order_key, status, target_word_min, target_word_max,
           active_draft_id, final_version_id, deleted_at
         ) VALUES(?, ?, ?, ?, 'writing', NULL, NULL, NULL, NULL, NULL)`,
      )
      .run(chapterId, volumeId, `第${index + 1}章`, (index + 1) * 1024);
    connection
      .prepare(
        `INSERT INTO drafts(id, chapter_id, status, revision, created_at, updated_at)
         VALUES(?, ?, 'active', 0, ?, ?)`,
      )
      .run(draftId, chapterId, timestamp, timestamp);
    connection
      .prepare(
        `INSERT INTO versions(
           id, chapter_id, source_draft_id, source_revision, title, description, label,
           word_count, content_hash, created_at
         ) VALUES(?, ?, ?, 0, ?, '', NULL, 0, ?, ?)`,
      )
      .run(
        versionId,
        chapterId,
        draftId,
        `版本${index + 1}`,
        String(index + 1).repeat(64),
        timestamp,
      );
    connection
      .prepare('UPDATE chapters SET active_draft_id = ?, final_version_id = ? WHERE id = ?')
      .run(draftId, versionId, chapterId);
    chapters.push({ chapterId, draftId, versionId });
  }
  return { projectId, volumeId, chapters };
}

function insertSnapshot(
  connection: Parameters<
    Parameters<Awaited<ReturnType<typeof openLatest>>['database']['write']>[1]
  >[0],
  projectId: string,
  chapter: ChapterFixture,
  versionId = chapter.versionId,
): string {
  const snapshotId = randomUUID();
  connection
    .prepare(
      `INSERT INTO ending_snapshots(
         id, project_id, chapter_id, source_version_id, status,
         content_json, stale_reasons_json, created_at, stale_at
       ) VALUES(?, ?, ?, ?, 'valid', ?, '[]', ?, NULL)`,
    )
    .run(snapshotId, projectId, chapter.chapterId, versionId, emptySnapshot, timestamp);
  return snapshotId;
}

function snapshotStatuses(
  database: Awaited<ReturnType<typeof openLatest>>['database'],
  projectId: string,
): Array<{ chapterId: string; status: string }> {
  return database.read(
    (connection) =>
      connection
        .prepare(
          `SELECT chapter_id AS chapterId, status
             FROM ending_snapshots
            WHERE project_id = ?
            ORDER BY chapter_id`,
        )
        .all(projectId) as Array<{ chapterId: string; status: string }>,
  );
}

function migrationsThrough(
  migrations: readonly SqlMigration[],
  version: number,
): readonly SqlMigration[] {
  return migrations.filter((migration) => migration.version <= version);
}

describe('M0-M3 final coordination migration', () => {
  it('preserves a pending Schema 18 SceneBeat rebind row during the Schema 19 upgrade', async () => {
    const migrations = await loadMigrations('migrations/project', 'project');
    const filePath = await databasePath('worldforge-v18-rebind-v19-');
    const v18 = await ProjectDatabase.open({
      path: filePath,
      migrations: migrationsThrough(migrations, 18),
      appVersion: '0.1.0',
    });
    let fixture: ProjectFixture;
    let beatId = '';
    let logicalBlockId = '';
    try {
      fixture = (
        await v18.write(randomUUID(), (connection) => {
          const seeded = seedProject(connection, 18, 2);
          const [source, target] = seeded.chapters;
          beatId = randomUUID();
          logicalBlockId = randomUUID();
          const sourceBlockId = randomUUID();
          connection
            .prepare(
              `INSERT INTO draft_blocks(
               id, draft_id, logical_block_id, order_key, block_type, text,
               attributes_json, source, locked, content_hash, revision
             ) VALUES(?, ?, ?, 1024, 'paragraph', '待迁移正文', '{}', 'manual', 0, NULL, 0)`,
            )
            .run(sourceBlockId, source!.draftId, logicalBlockId);
          connection
            .prepare(
              `INSERT INTO scene_beats(
               id, project_id, chapter_id, plot_node_id, title, goal, core_conflict,
               expected_result, beat_type, word_target_percent, is_required, order_key,
               character_ids_json, location_ids_json, deleted_at, updated_at
             ) VALUES(?, ?, ?, NULL, '待迁移节拍', '', '', '', 'setup', 50, 1, 1024,
                      '[]', '[]', NULL, ?)`,
            )
            .run(beatId, seeded.projectId, target!.chapterId, timestamp);
          connection
            .prepare(
              'INSERT INTO scene_beat_block_links(scene_beat_id, draft_block_id, created_at) VALUES(?, ?, ?)',
            )
            .run(beatId, sourceBlockId, timestamp);
          connection.prepare('DELETE FROM draft_blocks WHERE id = ?').run(sourceBlockId);
          expect(
            connection.prepare('SELECT COUNT(*) AS count FROM scene_beat_link_rebind_queue').get(),
          ).toEqual({ count: 1n });
          return seeded;
        })
      ).value;
    } finally {
      await v18.close();
    }

    const upgraded = await ProjectDatabase.open({
      path: filePath,
      migrations,
      appVersion: '0.1.0',
      prepareRecoveryPoint: async () => undefined,
    });
    try {
      const [source, target] = fixture.chapters;
      expect(
        upgraded.read((connection) =>
          connection
            .prepare(
              `SELECT project_id AS projectId, scene_beat_id AS sceneBeatId,
                      source_draft_id AS sourceDraftId,
                      source_chapter_id AS sourceChapterId,
                      target_chapter_id AS targetChapterId
                 FROM scene_beat_link_rebind_queue`,
            )
            .get(),
        ),
      ).toEqual({
        projectId: fixture.projectId,
        sceneBeatId: beatId,
        sourceDraftId: source!.draftId,
        sourceChapterId: source!.chapterId,
        targetChapterId: target!.chapterId,
      });

      await upgraded.write(randomUUID(), (connection) => {
        connection
          .prepare(
            `INSERT INTO draft_blocks(
               id, draft_id, logical_block_id, order_key, block_type, text,
               attributes_json, source, locked, content_hash, revision
             ) VALUES(?, ?, ?, 1024, 'paragraph', '迁移后目标正文', '{}', 'manual', 0, NULL, 1)`,
          )
          .run(randomUUID(), target!.draftId, logicalBlockId);
      });
      expect(
        upgraded.read((connection) =>
          connection
            .prepare('SELECT COUNT(*) AS count FROM scene_beat_block_links WHERE scene_beat_id = ?')
            .get(beatId),
        ),
      ).toEqual({ count: 1n });
      expect(
        upgraded.read((connection) =>
          connection.prepare('SELECT COUNT(*) AS count FROM scene_beat_link_rebind_queue').get(),
        ),
      ).toEqual({ count: 0n });
      expect(upgraded.foreignKeyCheck()).toEqual([]);
    } finally {
      await upgraded.close();
    }
  });

  it('upgrades a populated Schema 17 database through 18 to 19 without losing data', async () => {
    const migrations = await loadMigrations('migrations/project', 'project');
    expect(latestMigrationVersion(migrations)).toBe(19);
    const filePath = await databasePath('worldforge-v17-v19-');
    const v17 = await ProjectDatabase.open({
      path: filePath,
      migrations: migrationsThrough(migrations, 17),
      appVersion: '0.1.0',
    });
    let fixture: ProjectFixture;
    let snapshotId: string;
    try {
      fixture = (
        await v17.write(randomUUID(), (connection) => {
          const seeded = seedProject(connection, 17, 1);
          snapshotId = insertSnapshot(connection, seeded.projectId, seeded.chapters[0]!);
          return seeded;
        })
      ).value;
    } finally {
      await v17.close();
    }

    const upgraded = await ProjectDatabase.open({
      path: filePath,
      migrations,
      appVersion: '0.1.0',
      prepareRecoveryPoint: async () => undefined,
    });
    try {
      expect(upgraded).toMatchObject({ schemaVersion: 19, compatibility: 'migrated' });
      expect(
        upgraded.read((connection) =>
          connection.prepare('SELECT id FROM projects WHERE id = ?').get(fixture.projectId),
        ),
      ).toEqual({ id: fixture.projectId });
      expect(
        upgraded.read((connection) =>
          connection.prepare('SELECT status FROM ending_snapshots WHERE id = ?').get(snapshotId!),
        ),
      ).toEqual({ status: 'stale' });
      expect(
        upgraded.read((connection) =>
          connection
            .prepare('PRAGMA table_info(scene_beat_link_rebind_queue)')
            .all()
            .map((row) => row.name),
        ),
      ).toEqual([
        'project_id',
        'scene_beat_id',
        'logical_block_id',
        'source_draft_id',
        'source_chapter_id',
        'target_chapter_id',
        'created_at',
      ]);
      expect(upgraded.foreignKeyCheck()).toEqual([]);
    } finally {
      await upgraded.close();
    }
  });

  it('rejects unrelated logicalBlockId insertions and rebinds only after a planned SceneBeat move', async () => {
    const { database, migrations } = await openLatest('worldforge-scene-beat-rebind-');
    try {
      const ids = (
        await database.write(randomUUID(), (connection) => {
          const fixture = seedProject(connection, latestMigrationVersion(migrations), 2);
          const [source, target] = fixture.chapters;
          const logicalBlockId = randomUUID();
          const sourceBlockId = randomUUID();
          const beatId = randomUUID();
          connection
            .prepare(
              `INSERT INTO draft_blocks(
               id, draft_id, logical_block_id, order_key, block_type, text,
               attributes_json, source, locked, content_hash, revision
             ) VALUES(?, ?, ?, 1024, 'paragraph', '源正文', '{}', 'manual', 0, NULL, 0)`,
            )
            .run(sourceBlockId, source!.draftId, logicalBlockId);
          connection
            .prepare(
              `INSERT INTO scene_beats(
               id, project_id, chapter_id, plot_node_id, title, goal, core_conflict,
               expected_result, beat_type, word_target_percent, is_required, order_key,
               character_ids_json, location_ids_json, deleted_at, updated_at
             ) VALUES(?, ?, ?, NULL, '受控节拍', '', '', '', 'setup', 50, 1, 1024,
                      '[]', '[]', NULL, ?)`,
            )
            .run(beatId, fixture.projectId, source!.chapterId, timestamp);
          connection
            .prepare(
              'INSERT INTO scene_beat_block_links(scene_beat_id, draft_block_id, created_at) VALUES(?, ?, ?)',
            )
            .run(beatId, sourceBlockId, timestamp);
          return {
            fixture,
            source: source!,
            target: target!,
            logicalBlockId,
            sourceBlockId,
            beatId,
          };
        })
      ).value;

      const unrelatedBlockId = randomUUID();
      await database.write(randomUUID(), (connection) => {
        connection.prepare('DELETE FROM draft_blocks WHERE id = ?').run(ids.sourceBlockId);
        connection
          .prepare(
            `INSERT INTO draft_blocks(
               id, draft_id, logical_block_id, order_key, block_type, text,
               attributes_json, source, locked, content_hash, revision
             ) VALUES(?, ?, ?, 1024, 'paragraph', '无关目标正文', '{}', 'manual', 0, NULL, 1)`,
          )
          .run(unrelatedBlockId, ids.target.draftId, ids.logicalBlockId);
      });
      expect(
        database.read((connection) =>
          connection
            .prepare('SELECT draft_block_id FROM scene_beat_block_links WHERE scene_beat_id = ?')
            .all(ids.beatId),
        ),
      ).toEqual([]);
      expect(
        database.read((connection) =>
          connection.prepare('SELECT COUNT(*) AS count FROM scene_beat_link_rebind_queue').get(),
        ),
      ).toEqual({ count: 1n });

      await database.write(randomUUID(), (connection) => {
        connection.prepare('DELETE FROM scene_beat_link_rebind_queue').run();
        connection.prepare('DELETE FROM draft_blocks WHERE id = ?').run(unrelatedBlockId);
        const sourceReplacementId = randomUUID();
        connection
          .prepare(
            `INSERT INTO draft_blocks(
               id, draft_id, logical_block_id, order_key, block_type, text,
               attributes_json, source, locked, content_hash, revision
             ) VALUES(?, ?, ?, 1024, 'paragraph', '重新建立源正文', '{}', 'manual', 0, NULL, 2)`,
          )
          .run(sourceReplacementId, ids.source.draftId, ids.logicalBlockId);
        connection
          .prepare(
            'INSERT INTO scene_beat_block_links(scene_beat_id, draft_block_id, created_at) VALUES(?, ?, ?)',
          )
          .run(ids.beatId, sourceReplacementId, timestamp);
        connection
          .prepare('UPDATE scene_beats SET chapter_id = ?, updated_at = ? WHERE id = ?')
          .run(ids.target.chapterId, timestamp, ids.beatId);
        connection.prepare('DELETE FROM draft_blocks WHERE id = ?').run(sourceReplacementId);
        const controlledTargetBlockId = randomUUID();
        connection
          .prepare(
            `INSERT INTO draft_blocks(
               id, draft_id, logical_block_id, order_key, block_type, text,
               attributes_json, source, locked, content_hash, revision
             ) VALUES(?, ?, ?, 1024, 'paragraph', '受控目标正文', '{}', 'manual', 0, NULL, 2)`,
          )
          .run(controlledTargetBlockId, ids.target.draftId, ids.logicalBlockId);
      });
      expect(
        database.read((connection) =>
          connection
            .prepare(
              `SELECT block.draft_id AS draftId
                 FROM scene_beat_block_links link
                 JOIN draft_blocks block ON block.id = link.draft_block_id
                WHERE link.scene_beat_id = ?`,
            )
            .get(ids.beatId),
        ),
      ).toEqual({ draftId: ids.target.draftId });
      expect(database.foreignKeyCheck()).toEqual([]);
    } finally {
      await database.close();
    }
  });

  it('invalidates only the affected chapter or chapters at and after a state boundary', async () => {
    const { database, migrations } = await openLatest('worldforge-snapshot-boundary-');
    try {
      const ids = (
        await database.write(randomUUID(), (connection) => {
          const fixture = seedProject(connection, latestMigrationVersion(migrations), 3);
          const snapshotIds = fixture.chapters.map((chapter) =>
            insertSnapshot(connection, fixture.projectId, chapter),
          );
          return { fixture, snapshotIds };
        })
      ).value;
      const [, middle] = ids.fixture.chapters;
      const replacementVersionId = randomUUID();
      await database.write(randomUUID(), (connection) => {
        connection
          .prepare(
            `INSERT INTO versions(
               id, chapter_id, source_draft_id, source_revision, title, description, label,
               word_count, content_hash, created_at
             ) VALUES(?, ?, ?, 0, '润色版', '', NULL, 0, ?, ?)`,
          )
          .run(replacementVersionId, middle!.chapterId, middle!.draftId, '9'.repeat(64), timestamp);
        connection
          .prepare('UPDATE chapters SET final_version_id = ? WHERE id = ?')
          .run(replacementVersionId, middle!.chapterId);
      });
      expect(snapshotStatuses(database, ids.fixture.projectId)).toEqual(
        [...ids.fixture.chapters]
          .sort((left, right) => left.chapterId.localeCompare(right.chapterId, 'en'))
          .map((chapter) => ({
            chapterId: chapter.chapterId,
            status: chapter.chapterId === middle!.chapterId ? 'stale' : 'valid',
          })),
      );

      await database.write(randomUUID(), (connection) => {
        connection
          .prepare(
            `UPDATE ending_snapshots
                SET status = 'valid', stale_at = NULL, stale_reasons_json = '[]'
              WHERE project_id = ?`,
          )
          .run(ids.fixture.projectId);
        const entityId = randomUUID();
        connection
          .prepare(
            `INSERT INTO entities(
               id, project_id, entity_type, name, aliases_json, summary,
               status, archived_at, created_at, updated_at
             ) VALUES(?, ?, 'character', '人物', '[]', '', 'active', NULL, ?, ?)`,
          )
          .run(entityId, ids.fixture.projectId, timestamp, timestamp);
        connection
          .prepare(
            `INSERT INTO entity_states(
               id, project_id, entity_id, state_key, value_json,
               valid_from_chapter_id, valid_until_chapter_id, record_status,
               evidence_json, source_version_id, created_at, superseded_at
             ) VALUES(?, ?, ?, 'health', '"well"', ?, NULL, 'current', '[]', ?, ?, NULL)`,
          )
          .run(
            randomUUID(),
            ids.fixture.projectId,
            entityId,
            middle!.chapterId,
            middle!.versionId,
            timestamp,
          );
      });
      const orderedChapters = [...ids.fixture.chapters].sort((left, right) =>
        left.chapterId.localeCompare(right.chapterId, 'en'),
      );
      const firstChapterId = ids.fixture.chapters[0]!.chapterId;
      expect(snapshotStatuses(database, ids.fixture.projectId)).toEqual(
        orderedChapters.map((chapter) => ({
          chapterId: chapter.chapterId,
          status: chapter.chapterId === firstChapterId ? 'valid' : 'stale',
        })),
      );
    } finally {
      await database.close();
    }
  });

  it('keeps unplanted future plans out of history and invalidates from the linked chapter', async () => {
    const { database, migrations } = await openLatest('worldforge-temporal-projection-');
    try {
      const ids = (
        await database.write(randomUUID(), (connection) => {
          const fixture = seedProject(connection, latestMigrationVersion(migrations), 3);
          const foreshadowingId = randomUUID();
          connection
            .prepare(
              `INSERT INTO foreshadowings(
               id, project_id, title, description, status,
               reveal_from_chapter_id, reveal_by_chapter_id, created_at, updated_at
             ) VALUES(?, ?, '未来伏笔', '', 'planned', NULL, NULL, ?, ?)`,
            )
            .run(foreshadowingId, fixture.projectId, timestamp, timestamp);
          const snapshotIds = fixture.chapters.map((chapter) =>
            insertSnapshot(connection, fixture.projectId, chapter),
          );
          return { fixture, foreshadowingId, snapshotIds };
        })
      ).value;
      for (const snapshotId of ids.snapshotIds) {
        expect(
          database.read((connection) => {
            const row = connection
              .prepare('SELECT content_json AS contentJson FROM ending_snapshots WHERE id = ?')
              .get(snapshotId) as { contentJson: string };
            return JSON.parse(row.contentJson).foreshadowings;
          }),
        ).toEqual([]);
      }

      const middle = ids.fixture.chapters[1]!;
      await database.write(randomUUID(), (connection) => {
        connection
          .prepare(
            `INSERT INTO foreshadowing_chapters(
               project_id, foreshadowing_id, chapter_id, role, created_at
             ) VALUES(?, ?, ?, 'plant', ?)`,
          )
          .run(ids.fixture.projectId, ids.foreshadowingId, middle.chapterId, timestamp);
      });
      const firstChapterId = ids.fixture.chapters[0]!.chapterId;
      expect(snapshotStatuses(database, ids.fixture.projectId)).toEqual(
        [...ids.fixture.chapters]
          .sort((left, right) => left.chapterId.localeCompare(right.chapterId, 'en'))
          .map((chapter) => ({
            chapterId: chapter.chapterId,
            status: chapter.chapterId === firstChapterId ? 'valid' : 'stale',
          })),
      );
    } finally {
      await database.close();
    }
  });
});
