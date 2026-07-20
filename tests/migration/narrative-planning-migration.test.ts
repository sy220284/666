import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ProjectDatabase, loadMigrations } from '../../packages/core-service/src/database/index.js';

const temporaryDirectories: string[] = [];
const timestamp = '2026-07-20T08:30:00.000Z';

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M3-05 narrative planning migration', () => {
  it('creates strict project-bound foreshadowing and character arc tables', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-narrative-migration-'));
    temporaryDirectories.push(directory);
    const database = await ProjectDatabase.open({
      path: path.join(directory, 'project.sqlite'),
      migrations: await loadMigrations('migrations/project', 'project'),
      appVersion: '0.1.0',
    });
    try {
      expect(database.schemaVersion).toBe(14);
      expect(
        database.read((connection) =>
          connection
            .prepare(
              `SELECT name, strict, wr
                 FROM pragma_table_list
                WHERE name IN (
                  'foreshadowings',
                  'foreshadowing_chapters',
                  'foreshadowing_relations',
                  'character_arcs',
                  'arc_milestones',
                  'arc_milestone_dependencies',
                  'arc_milestone_timeline_dependencies'
                )
                ORDER BY name`,
            )
            .all(),
        ),
      ).toEqual([
        { name: 'arc_milestone_dependencies', strict: 1n, wr: 1n },
        { name: 'arc_milestone_timeline_dependencies', strict: 1n, wr: 1n },
        { name: 'arc_milestones', strict: 1n, wr: 0n },
        { name: 'character_arcs', strict: 1n, wr: 0n },
        { name: 'foreshadowing_chapters', strict: 1n, wr: 1n },
        { name: 'foreshadowing_relations', strict: 1n, wr: 1n },
        { name: 'foreshadowings', strict: 1n, wr: 0n },
      ]);

      const projectId = randomUUID();
      const foreignProjectId = randomUUID();
      const volumeId = randomUUID();
      const chapterId = randomUUID();
      const characterId = randomUUID();
      const foreignCharacterId = randomUUID();
      const foreshadowingId = randomUUID();
      const arcId = randomUUID();
      const milestoneId = randomUUID();
      await database.write(randomUUID(), (connection) => {
        const insertProject = connection.prepare(
          `INSERT INTO projects(
             id, name, channel, active_style_profile_id, schema_version, created_at, updated_at
           ) VALUES(?, ?, 'test', NULL, 14, ?, ?)`,
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
             ) VALUES(?, ?, '第一章', 1000, 'writing', NULL, NULL, NULL, NULL, NULL)`,
          )
          .run(chapterId, volumeId);
        const insertEntity = connection.prepare(
          `INSERT INTO entities(
             id, project_id, entity_type, name, aliases_json, summary,
             status, archived_at, created_at, updated_at
           ) VALUES(?, ?, 'character', ?, '[]', '', 'active', NULL, ?, ?)`,
        );
        insertEntity.run(characterId, projectId, '本项目人物', timestamp, timestamp);
        insertEntity.run(foreignCharacterId, foreignProjectId, '异项目人物', timestamp, timestamp);
        connection
          .prepare(
            `INSERT INTO foreshadowings(
               id, project_id, title, description, status,
               reveal_from_chapter_id, reveal_by_chapter_id, created_at, updated_at
             ) VALUES(?, ?, '伏笔', '', 'planned', ?, ?, ?, ?)`,
          )
          .run(foreshadowingId, projectId, chapterId, chapterId, timestamp, timestamp);
        connection
          .prepare(
            `INSERT INTO character_arcs(
               id, project_id, character_id, title, arc_type, custom_type,
               status, author_intent, created_at, updated_at
             ) VALUES(?, ?, ?, '成长', 'growth', NULL, 'planned', '', ?, ?)`,
          )
          .run(arcId, projectId, characterId, timestamp, timestamp);
        connection
          .prepare(
            `INSERT INTO arc_milestones(
               id, project_id, arc_id, title, description, sort_index,
               planned_chapter_id, actual_chapter_id, status,
               confirmation_source, created_at, updated_at
             ) VALUES(?, ?, ?, '节点', '', 0, ?, NULL, 'planned', NULL, ?, ?)`,
          )
          .run(milestoneId, projectId, arcId, chapterId, timestamp, timestamp);
      });

      await expect(
        database.write(randomUUID(), (connection) =>
          connection
            .prepare(
              `INSERT INTO foreshadowing_relations(
                 project_id, source_foreshadowing_id, target_foreshadowing_id,
                 relation_kind, created_at
               ) VALUES(?, ?, ?, 'depends_on', ?)`,
            )
            .run(projectId, foreshadowingId, foreshadowingId, timestamp),
        ),
      ).rejects.toMatchObject({ code: 'DATABASE_WRITE_FAILED' });

      await expect(
        database.write(randomUUID(), (connection) =>
          connection
            .prepare(
              `INSERT INTO character_arcs(
                 id, project_id, character_id, title, arc_type, custom_type,
                 status, author_intent, created_at, updated_at
               ) VALUES(?, ?, ?, '跨项目', 'growth', NULL, 'planned', '', ?, ?)`,
            )
            .run(randomUUID(), projectId, foreignCharacterId, timestamp, timestamp),
        ),
      ).rejects.toMatchObject({ code: 'DATABASE_WRITE_FAILED' });

      await expect(
        database.write(randomUUID(), (connection) =>
          connection
            .prepare(
              `INSERT INTO character_arcs(
                 id, project_id, character_id, title, arc_type, custom_type,
                 status, author_intent, created_at, updated_at
               ) VALUES(?, ?, ?, '错误自定义', 'custom', NULL, 'planned', '', ?, ?)`,
            )
            .run(randomUUID(), projectId, characterId, timestamp, timestamp),
        ),
      ).rejects.toMatchObject({ code: 'DATABASE_WRITE_FAILED' });

      await expect(
        database.write(randomUUID(), (connection) =>
          connection
            .prepare(
              `UPDATE arc_milestones
                  SET status = 'hit', actual_chapter_id = ?, confirmation_source = NULL
                WHERE id = ?`,
            )
            .run(chapterId, milestoneId),
        ),
      ).rejects.toMatchObject({ code: 'DATABASE_WRITE_FAILED' });

      await expect(
        database.write(randomUUID(), (connection) =>
          connection
            .prepare(
              `INSERT INTO arc_milestone_dependencies(
                 project_id, milestone_id, dependency_milestone_id, created_at
               ) VALUES(?, ?, ?, ?)`,
            )
            .run(projectId, milestoneId, milestoneId, timestamp),
        ),
      ).rejects.toMatchObject({ code: 'DATABASE_WRITE_FAILED' });

      expect(database.foreignKeyCheck()).toEqual([]);
    } finally {
      await database.close();
    }
  });
});
