from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    source = file.read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, found {count}: {old[:100]!r}')
    file.write_text(source.replace(old, new))


migration = 'migrations/project/0019_final_coordination_remediation.sql'
replace_once(
    migration,
    """DROP TABLE IF EXISTS scene_beat_link_rebind_queue;

CREATE TABLE scene_beat_link_rebind_queue (""",
    """ALTER TABLE scene_beat_link_rebind_queue RENAME TO scene_beat_link_rebind_queue_legacy;

CREATE TABLE scene_beat_link_rebind_queue (""",
)
replace_once(
    migration,
    """CREATE INDEX idx_scene_beat_link_rebind_target
ON scene_beat_link_rebind_queue(
  project_id, target_chapter_id, logical_block_id, scene_beat_id
);

-- Capture intent""",
    """CREATE INDEX idx_scene_beat_link_rebind_target
ON scene_beat_link_rebind_queue(
  project_id, target_chapter_id, logical_block_id, scene_beat_id
);

INSERT OR REPLACE INTO scene_beat_link_rebind_queue(
  project_id, scene_beat_id, logical_block_id, source_draft_id,
  source_chapter_id, target_chapter_id, created_at
)
SELECT beat.project_id, legacy.scene_beat_id, legacy.logical_block_id,
       legacy.source_draft_id, source_draft.chapter_id, beat.chapter_id,
       legacy.created_at
  FROM scene_beat_link_rebind_queue_legacy legacy
  JOIN scene_beats beat ON beat.id = legacy.scene_beat_id
  JOIN drafts source_draft ON source_draft.id = legacy.source_draft_id
 WHERE beat.deleted_at IS NULL;

DROP TABLE scene_beat_link_rebind_queue_legacy;

-- Capture intent""",
)

test_path = 'tests/migration/final-coordination-remediation.test.ts'
marker = """describe('M0-M3 final coordination migration', () => {
  it('upgrades a populated Schema 17 database through 18 to 19 without losing data', async () => {"""
test = """describe('M0-M3 final coordination migration', () => {
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
      fixture = (await v18.write(randomUUID(), (connection) => {
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
      })).value;
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

  it('upgrades a populated Schema 17 database through 18 to 19 without losing data', async () => {"""
replace_once(test_path, marker, test)
