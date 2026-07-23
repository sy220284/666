-- Final M0-M3 coordination remediation.
--
-- This migration replaces the broad Schema 18 triggers without rewriting the
-- released migration. It keeps SceneBeat movement author-controlled and makes
-- EndingSnapshot invalidation starts at the earliest affected chapter.

DROP TRIGGER IF EXISTS trg_scene_beat_link_capture_before_block_delete;
DROP TRIGGER IF EXISTS trg_scene_beat_link_rebind_after_block_insert;
DROP TRIGGER IF EXISTS trg_scene_beat_link_rebind_after_active_draft_change;
DROP TABLE IF EXISTS scene_beat_link_rebind_queue;

CREATE TABLE scene_beat_link_rebind_queue (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_beat_id TEXT NOT NULL REFERENCES scene_beats(id) ON DELETE CASCADE,
  logical_block_id TEXT NOT NULL,
  source_draft_id TEXT NOT NULL,
  source_chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  target_chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(scene_beat_id, logical_block_id, source_draft_id)
) WITHOUT ROWID, STRICT;

CREATE INDEX idx_scene_beat_link_rebind_target
ON scene_beat_link_rebind_queue(
  project_id, target_chapter_id, logical_block_id, scene_beat_id
);

-- Capture intent from the SceneBeat's current planning chapter. A later block
-- insertion may consume the row only in that exact Project/chapter and only in
-- the chapter's current active Draft. Moving prose alone never moves planning.
CREATE TRIGGER trg_scene_beat_link_capture_before_block_delete
BEFORE DELETE ON draft_blocks
BEGIN
  INSERT OR REPLACE INTO scene_beat_link_rebind_queue(
    project_id, scene_beat_id, logical_block_id, source_draft_id,
    source_chapter_id, target_chapter_id, created_at
  )
  SELECT beat.project_id, beat.id, OLD.logical_block_id, OLD.draft_id,
         source_draft.chapter_id, beat.chapter_id,
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM scene_beat_block_links link
    JOIN scene_beats beat ON beat.id = link.scene_beat_id
    JOIN drafts source_draft ON source_draft.id = OLD.draft_id
   WHERE link.draft_block_id = OLD.id
     AND beat.deleted_at IS NULL;
END;

CREATE TRIGGER trg_scene_beat_link_rebind_after_block_insert
AFTER INSERT ON draft_blocks
BEGIN
  INSERT OR IGNORE INTO scene_beat_block_links(scene_beat_id, draft_block_id, created_at)
  SELECT queue.scene_beat_id, NEW.id, queue.created_at
    FROM scene_beat_link_rebind_queue queue
    JOIN scene_beats beat
      ON beat.id = queue.scene_beat_id
     AND beat.project_id = queue.project_id
     AND beat.chapter_id = queue.target_chapter_id
     AND beat.deleted_at IS NULL
    JOIN drafts target_draft
      ON target_draft.id = NEW.draft_id
     AND target_draft.chapter_id = queue.target_chapter_id
    JOIN chapters target_chapter
      ON target_chapter.id = target_draft.chapter_id
     AND target_chapter.active_draft_id = target_draft.id
     AND target_chapter.deleted_at IS NULL
    JOIN volumes target_volume
      ON target_volume.id = target_chapter.volume_id
     AND target_volume.project_id = queue.project_id
     AND target_volume.deleted_at IS NULL
   WHERE queue.logical_block_id = NEW.logical_block_id;

  DELETE FROM scene_beat_link_rebind_queue
   WHERE logical_block_id = NEW.logical_block_id
     AND EXISTS (
       SELECT 1
         FROM scene_beat_block_links link
        WHERE link.scene_beat_id = scene_beat_link_rebind_queue.scene_beat_id
          AND link.draft_block_id = NEW.id
     );
END;

-- Version restoration/active-Draft replacement is confined to the same chapter
-- and therefore may rebind directly by logicalBlockId.
CREATE TRIGGER trg_scene_beat_link_rebind_after_active_draft_change
AFTER UPDATE OF active_draft_id ON chapters
WHEN NEW.active_draft_id IS NOT NULL
 AND OLD.active_draft_id IS NOT NULL
 AND OLD.active_draft_id <> NEW.active_draft_id
BEGIN
  INSERT OR REPLACE INTO scene_beat_link_rebind_queue(
    project_id, scene_beat_id, logical_block_id, source_draft_id,
    source_chapter_id, target_chapter_id, created_at
  )
  SELECT beat.project_id, beat.id, old_block.logical_block_id, old_block.draft_id,
         OLD.id, NEW.id, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM scene_beat_block_links link
    JOIN scene_beats beat ON beat.id = link.scene_beat_id
    JOIN draft_blocks old_block ON old_block.id = link.draft_block_id
   WHERE old_block.draft_id = OLD.active_draft_id
     AND beat.chapter_id = OLD.id
     AND beat.deleted_at IS NULL;

  DELETE FROM scene_beat_block_links
   WHERE draft_block_id IN (
     SELECT id FROM draft_blocks WHERE draft_id = OLD.active_draft_id
   );

  INSERT OR IGNORE INTO scene_beat_block_links(scene_beat_id, draft_block_id, created_at)
  SELECT queue.scene_beat_id, new_block.id, queue.created_at
    FROM scene_beat_link_rebind_queue queue
    JOIN draft_blocks new_block
      ON new_block.draft_id = NEW.active_draft_id
     AND new_block.logical_block_id = queue.logical_block_id
    JOIN scene_beats beat
      ON beat.id = queue.scene_beat_id
     AND beat.project_id = queue.project_id
     AND beat.chapter_id = NEW.id
     AND beat.deleted_at IS NULL
   WHERE queue.source_chapter_id = OLD.id
     AND queue.target_chapter_id = NEW.id;

  DELETE FROM scene_beat_link_rebind_queue
   WHERE target_chapter_id = NEW.id
     AND EXISTS (
       SELECT 1
         FROM scene_beat_block_links link
         JOIN draft_blocks block ON block.id = link.draft_block_id
        WHERE link.scene_beat_id = scene_beat_link_rebind_queue.scene_beat_id
          AND block.draft_id = NEW.active_draft_id
          AND block.logical_block_id = scene_beat_link_rebind_queue.logical_block_id
     );
END;

-- A planning move after prose has already moved cannot retroactively claim an
-- old queued deletion. The author can relink explicitly from the target chapter.
CREATE TRIGGER trg_scene_beat_link_rebind_clear_after_planning_move
AFTER UPDATE OF chapter_id ON scene_beats
WHEN OLD.chapter_id <> NEW.chapter_id
BEGIN
  DELETE FROM scene_beat_link_rebind_queue WHERE scene_beat_id = NEW.id;
END;

DROP TRIGGER IF EXISTS trg_snapshot_stale_after_chapter_structure_change;
DROP TRIGGER IF EXISTS trg_snapshot_stale_after_volume_structure_change;
DROP TRIGGER IF EXISTS trg_snapshot_stale_after_entity_state_insert;
DROP TRIGGER IF EXISTS trg_snapshot_stale_after_entity_state_update;
DROP TRIGGER IF EXISTS trg_snapshot_stale_after_entity_state_delete;
DROP TRIGGER IF EXISTS trg_snapshot_stale_after_knowledge_state_insert;
DROP TRIGGER IF EXISTS trg_snapshot_stale_after_knowledge_state_update;
DROP TRIGGER IF EXISTS trg_snapshot_stale_after_knowledge_state_delete;
DROP TRIGGER IF EXISTS trg_snapshot_stale_after_foreshadowing_update;
DROP TRIGGER IF EXISTS trg_snapshot_stale_after_foreshadowing_chapter_insert;
DROP TRIGGER IF EXISTS trg_snapshot_stale_after_foreshadowing_chapter_delete;
DROP TRIGGER IF EXISTS trg_snapshot_stale_after_arc_milestone_update;
DROP TRIGGER IF EXISTS trg_snapshot_project_temporal_content_after_insert;
DROP TRIGGER IF EXISTS trg_snapshot_project_temporal_content_after_revalidate;

DROP VIEW IF EXISTS chapter_story_positions;
CREATE VIEW chapter_story_positions AS
SELECT chapter.id AS chapter_id,
       volume.project_id AS project_id,
       volume.order_key AS volume_order_key,
       chapter.order_key AS chapter_order_key
  FROM chapters chapter
  JOIN volumes volume ON volume.id = chapter.volume_id;

-- Structural order changes alter temporal comparison itself, so all project
-- snapshots remain conservatively invalidated. A Final Version change only
-- invalidates the snapshot for that chapter; semantic propagation stays owned
-- by the existing DerivedInvalidation service.
CREATE TRIGGER trg_snapshot_stale_after_chapter_structure_change
AFTER UPDATE OF volume_id, order_key, deleted_at ON chapters
WHEN OLD.volume_id <> NEW.volume_id
  OR OLD.order_key <> NEW.order_key
  OR OLD.deleted_at IS NOT NEW.deleted_at
BEGIN
  UPDATE ending_snapshots
     SET status = 'stale',
         stale_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         stale_reasons_json = CASE
           WHEN EXISTS (SELECT 1 FROM json_each(stale_reasons_json) WHERE value = 'timeline')
             THEN stale_reasons_json
           ELSE json_insert(stale_reasons_json, '$[#]', 'timeline')
         END
   WHERE project_id IN (
     SELECT project_id FROM volumes WHERE id IN (OLD.volume_id, NEW.volume_id)
   )
     AND status = 'valid';
END;

CREATE TRIGGER trg_snapshot_stale_after_final_version_change
AFTER UPDATE OF final_version_id ON chapters
WHEN OLD.final_version_id IS NOT NEW.final_version_id
BEGIN
  UPDATE ending_snapshots
     SET status = 'stale',
         stale_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         stale_reasons_json = CASE
           WHEN EXISTS (SELECT 1 FROM json_each(stale_reasons_json) WHERE value = 'validation')
             THEN stale_reasons_json
           ELSE json_insert(stale_reasons_json, '$[#]', 'validation')
         END
   WHERE chapter_id = NEW.id AND status = 'valid';
END;

CREATE TRIGGER trg_snapshot_stale_after_volume_structure_change
AFTER UPDATE OF order_key, deleted_at ON volumes
WHEN OLD.order_key <> NEW.order_key OR OLD.deleted_at IS NOT NEW.deleted_at
BEGIN
  UPDATE ending_snapshots
     SET status = 'stale',
         stale_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         stale_reasons_json = CASE
           WHEN EXISTS (SELECT 1 FROM json_each(stale_reasons_json) WHERE value = 'timeline')
             THEN stale_reasons_json
           ELSE json_insert(stale_reasons_json, '$[#]', 'timeline')
         END
   WHERE project_id = NEW.project_id AND status = 'valid';
END;

-- Entity and knowledge state changes start at valid_from. Updating a state uses
-- both old and new boundaries so shortened, extended, or moved ranges are safe.
CREATE TRIGGER trg_snapshot_stale_after_entity_state_insert
AFTER INSERT ON entity_states
BEGIN
  UPDATE ending_snapshots
     SET status = 'stale', stale_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         stale_reasons_json = CASE
           WHEN EXISTS (SELECT 1 FROM json_each(stale_reasons_json) WHERE value = 'entity_state')
             THEN stale_reasons_json
           ELSE json_insert(stale_reasons_json, '$[#]', 'entity_state')
         END
   WHERE project_id = NEW.project_id AND status = 'valid'
     AND EXISTS (
       SELECT 1
         FROM chapter_story_positions snapshot_position
         JOIN chapter_story_positions source_position
           ON source_position.chapter_id = NEW.valid_from_chapter_id
        WHERE snapshot_position.chapter_id = ending_snapshots.chapter_id
          AND snapshot_position.project_id = NEW.project_id
          AND source_position.project_id = NEW.project_id
          AND (
            snapshot_position.volume_order_key > source_position.volume_order_key OR
            (snapshot_position.volume_order_key = source_position.volume_order_key AND
             snapshot_position.chapter_order_key >= source_position.chapter_order_key)
          )
     );
END;

CREATE TRIGGER trg_snapshot_stale_after_entity_state_update
AFTER UPDATE ON entity_states
BEGIN
  UPDATE ending_snapshots
     SET status = 'stale', stale_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         stale_reasons_json = CASE
           WHEN EXISTS (SELECT 1 FROM json_each(stale_reasons_json) WHERE value = 'entity_state')
             THEN stale_reasons_json
           ELSE json_insert(stale_reasons_json, '$[#]', 'entity_state')
         END
   WHERE project_id IN (OLD.project_id, NEW.project_id) AND status = 'valid'
     AND EXISTS (
       SELECT 1
         FROM chapter_story_positions snapshot_position
         JOIN chapter_story_positions source_position
           ON source_position.chapter_id IN (OLD.valid_from_chapter_id, NEW.valid_from_chapter_id)
        WHERE snapshot_position.chapter_id = ending_snapshots.chapter_id
          AND snapshot_position.project_id = source_position.project_id
          AND (
            snapshot_position.volume_order_key > source_position.volume_order_key OR
            (snapshot_position.volume_order_key = source_position.volume_order_key AND
             snapshot_position.chapter_order_key >= source_position.chapter_order_key)
          )
     );
END;

CREATE TRIGGER trg_snapshot_stale_after_entity_state_delete
AFTER DELETE ON entity_states
BEGIN
  UPDATE ending_snapshots
     SET status = 'stale', stale_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         stale_reasons_json = CASE
           WHEN EXISTS (SELECT 1 FROM json_each(stale_reasons_json) WHERE value = 'entity_state')
             THEN stale_reasons_json
           ELSE json_insert(stale_reasons_json, '$[#]', 'entity_state')
         END
   WHERE project_id = OLD.project_id AND status = 'valid'
     AND EXISTS (
       SELECT 1
         FROM chapter_story_positions snapshot_position
         JOIN chapter_story_positions source_position
           ON source_position.chapter_id = OLD.valid_from_chapter_id
        WHERE snapshot_position.chapter_id = ending_snapshots.chapter_id
          AND snapshot_position.project_id = OLD.project_id
          AND (
            snapshot_position.volume_order_key > source_position.volume_order_key OR
            (snapshot_position.volume_order_key = source_position.volume_order_key AND
             snapshot_position.chapter_order_key >= source_position.chapter_order_key)
          )
     );
END;

CREATE TRIGGER trg_snapshot_stale_after_knowledge_state_insert
AFTER INSERT ON knowledge_states
BEGIN
  UPDATE ending_snapshots
     SET status = 'stale', stale_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         stale_reasons_json = CASE
           WHEN EXISTS (SELECT 1 FROM json_each(stale_reasons_json) WHERE value = 'entity_state')
             THEN stale_reasons_json
           ELSE json_insert(stale_reasons_json, '$[#]', 'entity_state')
         END
   WHERE project_id = NEW.project_id AND status = 'valid'
     AND EXISTS (
       SELECT 1
         FROM chapter_story_positions snapshot_position
         JOIN chapter_story_positions source_position
           ON source_position.chapter_id = NEW.valid_from_chapter_id
        WHERE snapshot_position.chapter_id = ending_snapshots.chapter_id
          AND snapshot_position.project_id = NEW.project_id
          AND source_position.project_id = NEW.project_id
          AND (
            snapshot_position.volume_order_key > source_position.volume_order_key OR
            (snapshot_position.volume_order_key = source_position.volume_order_key AND
             snapshot_position.chapter_order_key >= source_position.chapter_order_key)
          )
     );
END;

CREATE TRIGGER trg_snapshot_stale_after_knowledge_state_update
AFTER UPDATE ON knowledge_states
BEGIN
  UPDATE ending_snapshots
     SET status = 'stale', stale_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         stale_reasons_json = CASE
           WHEN EXISTS (SELECT 1 FROM json_each(stale_reasons_json) WHERE value = 'entity_state')
             THEN stale_reasons_json
           ELSE json_insert(stale_reasons_json, '$[#]', 'entity_state')
         END
   WHERE project_id IN (OLD.project_id, NEW.project_id) AND status = 'valid'
     AND EXISTS (
       SELECT 1
         FROM chapter_story_positions snapshot_position
         JOIN chapter_story_positions source_position
           ON source_position.chapter_id IN (OLD.valid_from_chapter_id, NEW.valid_from_chapter_id)
        WHERE snapshot_position.chapter_id = ending_snapshots.chapter_id
          AND snapshot_position.project_id = source_position.project_id
          AND (
            snapshot_position.volume_order_key > source_position.volume_order_key OR
            (snapshot_position.volume_order_key = source_position.volume_order_key AND
             snapshot_position.chapter_order_key >= source_position.chapter_order_key)
          )
     );
END;

CREATE TRIGGER trg_snapshot_stale_after_knowledge_state_delete
AFTER DELETE ON knowledge_states
BEGIN
  UPDATE ending_snapshots
     SET status = 'stale', stale_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         stale_reasons_json = CASE
           WHEN EXISTS (SELECT 1 FROM json_each(stale_reasons_json) WHERE value = 'entity_state')
             THEN stale_reasons_json
           ELSE json_insert(stale_reasons_json, '$[#]', 'entity_state')
         END
   WHERE project_id = OLD.project_id AND status = 'valid'
     AND EXISTS (
       SELECT 1
         FROM chapter_story_positions snapshot_position
         JOIN chapter_story_positions source_position
           ON source_position.chapter_id = OLD.valid_from_chapter_id
        WHERE snapshot_position.chapter_id = ending_snapshots.chapter_id
          AND snapshot_position.project_id = OLD.project_id
          AND (
            snapshot_position.volume_order_key > source_position.volume_order_key OR
            (snapshot_position.volume_order_key = source_position.volume_order_key AND
             snapshot_position.chapter_order_key >= source_position.chapter_order_key)
          )
     );
END;

-- Foreshadowings enter historical snapshots only after a linked chapter has
-- planted/reinforced/revealed them. Link changes invalidate from that chapter.
CREATE TRIGGER trg_snapshot_stale_before_foreshadowing_delete
BEFORE DELETE ON foreshadowings
BEGIN
  UPDATE ending_snapshots
     SET status = 'stale', stale_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         stale_reasons_json = CASE
           WHEN EXISTS (SELECT 1 FROM json_each(stale_reasons_json) WHERE value = 'foreshadowing')
             THEN stale_reasons_json
           ELSE json_insert(stale_reasons_json, '$[#]', 'foreshadowing')
         END
   WHERE project_id = OLD.project_id AND status = 'valid'
     AND EXISTS (
       SELECT 1
         FROM foreshadowing_chapters link
         JOIN chapter_story_positions source_position ON source_position.chapter_id = link.chapter_id
         JOIN chapter_story_positions snapshot_position
           ON snapshot_position.chapter_id = ending_snapshots.chapter_id
        WHERE link.foreshadowing_id = OLD.id
          AND snapshot_position.project_id = OLD.project_id
          AND (
            snapshot_position.volume_order_key > source_position.volume_order_key OR
            (snapshot_position.volume_order_key = source_position.volume_order_key AND
             snapshot_position.chapter_order_key >= source_position.chapter_order_key)
          )
     );
END;

CREATE TRIGGER trg_snapshot_stale_after_foreshadowing_chapter_insert
AFTER INSERT ON foreshadowing_chapters
BEGIN
  UPDATE ending_snapshots
     SET status = 'stale', stale_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         stale_reasons_json = CASE
           WHEN EXISTS (SELECT 1 FROM json_each(stale_reasons_json) WHERE value = 'foreshadowing')
             THEN stale_reasons_json
           ELSE json_insert(stale_reasons_json, '$[#]', 'foreshadowing')
         END
   WHERE project_id = NEW.project_id AND status = 'valid'
     AND EXISTS (
       SELECT 1 FROM chapter_story_positions snapshot_position
       JOIN chapter_story_positions source_position ON source_position.chapter_id = NEW.chapter_id
        WHERE snapshot_position.chapter_id = ending_snapshots.chapter_id
          AND snapshot_position.project_id = NEW.project_id
          AND (
            snapshot_position.volume_order_key > source_position.volume_order_key OR
            (snapshot_position.volume_order_key = source_position.volume_order_key AND
             snapshot_position.chapter_order_key >= source_position.chapter_order_key)
          )
     );
END;

CREATE TRIGGER trg_snapshot_stale_after_foreshadowing_chapter_update
AFTER UPDATE OF chapter_id, role ON foreshadowing_chapters
WHEN OLD.chapter_id <> NEW.chapter_id OR OLD.role <> NEW.role
BEGIN
  UPDATE ending_snapshots
     SET status = 'stale', stale_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         stale_reasons_json = CASE
           WHEN EXISTS (SELECT 1 FROM json_each(stale_reasons_json) WHERE value = 'foreshadowing')
             THEN stale_reasons_json
           ELSE json_insert(stale_reasons_json, '$[#]', 'foreshadowing')
         END
   WHERE project_id IN (OLD.project_id, NEW.project_id) AND status = 'valid'
     AND EXISTS (
       SELECT 1 FROM chapter_story_positions snapshot_position
       JOIN chapter_story_positions source_position
         ON source_position.chapter_id IN (OLD.chapter_id, NEW.chapter_id)
        WHERE snapshot_position.chapter_id = ending_snapshots.chapter_id
          AND snapshot_position.project_id = source_position.project_id
          AND (
            snapshot_position.volume_order_key > source_position.volume_order_key OR
            (snapshot_position.volume_order_key = source_position.volume_order_key AND
             snapshot_position.chapter_order_key >= source_position.chapter_order_key)
          )
     );
END;

CREATE TRIGGER trg_snapshot_stale_after_foreshadowing_chapter_delete
AFTER DELETE ON foreshadowing_chapters
BEGIN
  UPDATE ending_snapshots
     SET status = 'stale', stale_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         stale_reasons_json = CASE
           WHEN EXISTS (SELECT 1 FROM json_each(stale_reasons_json) WHERE value = 'foreshadowing')
             THEN stale_reasons_json
           ELSE json_insert(stale_reasons_json, '$[#]', 'foreshadowing')
         END
   WHERE project_id = OLD.project_id AND status = 'valid'
     AND EXISTS (
       SELECT 1 FROM chapter_story_positions snapshot_position
       JOIN chapter_story_positions source_position ON source_position.chapter_id = OLD.chapter_id
        WHERE snapshot_position.chapter_id = ending_snapshots.chapter_id
          AND snapshot_position.project_id = OLD.project_id
          AND (
            snapshot_position.volume_order_key > source_position.volume_order_key OR
            (snapshot_position.volume_order_key = source_position.volume_order_key AND
             snapshot_position.chapter_order_key >= source_position.chapter_order_key)
          )
     );
END;

-- Arc milestones affect snapshots only when hit/skipped at an effective chapter.
CREATE TRIGGER trg_snapshot_stale_after_arc_milestone_insert
AFTER INSERT ON arc_milestones
WHEN NEW.status IN ('hit', 'skipped')
 AND COALESCE(NEW.actual_chapter_id, NEW.planned_chapter_id) IS NOT NULL
BEGIN
  UPDATE ending_snapshots
     SET status = 'stale', stale_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         stale_reasons_json = CASE
           WHEN EXISTS (SELECT 1 FROM json_each(stale_reasons_json) WHERE value = 'arc_milestone')
             THEN stale_reasons_json
           ELSE json_insert(stale_reasons_json, '$[#]', 'arc_milestone')
         END
   WHERE project_id = NEW.project_id AND status = 'valid'
     AND EXISTS (
       SELECT 1 FROM chapter_story_positions snapshot_position
       JOIN chapter_story_positions source_position
         ON source_position.chapter_id = COALESCE(NEW.actual_chapter_id, NEW.planned_chapter_id)
        WHERE snapshot_position.chapter_id = ending_snapshots.chapter_id
          AND snapshot_position.project_id = NEW.project_id
          AND (
            snapshot_position.volume_order_key > source_position.volume_order_key OR
            (snapshot_position.volume_order_key = source_position.volume_order_key AND
             snapshot_position.chapter_order_key >= source_position.chapter_order_key)
          )
     );
END;

CREATE TRIGGER trg_snapshot_stale_after_arc_milestone_update
AFTER UPDATE OF status, actual_chapter_id, planned_chapter_id ON arc_milestones
WHEN OLD.status <> NEW.status
  OR OLD.actual_chapter_id IS NOT NEW.actual_chapter_id
  OR OLD.planned_chapter_id IS NOT NEW.planned_chapter_id
BEGIN
  UPDATE ending_snapshots
     SET status = 'stale', stale_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         stale_reasons_json = CASE
           WHEN EXISTS (SELECT 1 FROM json_each(stale_reasons_json) WHERE value = 'arc_milestone')
             THEN stale_reasons_json
           ELSE json_insert(stale_reasons_json, '$[#]', 'arc_milestone')
         END
   WHERE project_id IN (OLD.project_id, NEW.project_id) AND status = 'valid'
     AND EXISTS (
       SELECT 1 FROM chapter_story_positions snapshot_position
       JOIN chapter_story_positions source_position
         ON source_position.chapter_id IN (
           COALESCE(OLD.actual_chapter_id, OLD.planned_chapter_id),
           COALESCE(NEW.actual_chapter_id, NEW.planned_chapter_id)
         )
        WHERE snapshot_position.chapter_id = ending_snapshots.chapter_id
          AND snapshot_position.project_id = source_position.project_id
          AND (
            snapshot_position.volume_order_key > source_position.volume_order_key OR
            (snapshot_position.volume_order_key = source_position.volume_order_key AND
             snapshot_position.chapter_order_key >= source_position.chapter_order_key)
          )
     );
END;

CREATE TRIGGER trg_snapshot_stale_before_arc_milestone_delete
BEFORE DELETE ON arc_milestones
WHEN OLD.status IN ('hit', 'skipped')
 AND COALESCE(OLD.actual_chapter_id, OLD.planned_chapter_id) IS NOT NULL
BEGIN
  UPDATE ending_snapshots
     SET status = 'stale', stale_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         stale_reasons_json = CASE
           WHEN EXISTS (SELECT 1 FROM json_each(stale_reasons_json) WHERE value = 'arc_milestone')
             THEN stale_reasons_json
           ELSE json_insert(stale_reasons_json, '$[#]', 'arc_milestone')
         END
   WHERE project_id = OLD.project_id AND status = 'valid'
     AND EXISTS (
       SELECT 1 FROM chapter_story_positions snapshot_position
       JOIN chapter_story_positions source_position
         ON source_position.chapter_id = COALESCE(OLD.actual_chapter_id, OLD.planned_chapter_id)
        WHERE snapshot_position.chapter_id = ending_snapshots.chapter_id
          AND snapshot_position.project_id = OLD.project_id
          AND (
            snapshot_position.volume_order_key > source_position.volume_order_key OR
            (snapshot_position.volume_order_key = source_position.volume_order_key AND
             snapshot_position.chapter_order_key >= source_position.chapter_order_key)
          )
     );
END;

-- Rebuild temporal projection. Unlinked/planned future foreshadowings are absent
-- from past snapshots rather than appearing as author-only future knowledge.
CREATE TRIGGER trg_snapshot_project_temporal_content_after_insert
AFTER INSERT ON ending_snapshots
WHEN NEW.status = 'valid'
BEGIN
  UPDATE ending_snapshots
     SET content_json = json_set(
       json_set(
         content_json,
         '$.foreshadowings',
         json(COALESCE((
           SELECT json_group_array(json_object('id', projected.id, 'status', projected.status))
             FROM (
               SELECT foreshadowing.id,
                      (
                        SELECT CASE link.role
                          WHEN 'plant' THEN 'planted'
                          WHEN 'reinforce' THEN 'reinforced'
                          WHEN 'partial_reveal' THEN 'partially_revealed'
                          WHEN 'reveal' THEN 'revealed'
                          ELSE 'planned'
                        END
                          FROM foreshadowing_chapters link
                          JOIN chapter_story_positions linked_position
                            ON linked_position.chapter_id = link.chapter_id
                          JOIN chapter_story_positions target_position
                            ON target_position.chapter_id = NEW.chapter_id
                         WHERE link.foreshadowing_id = foreshadowing.id
                           AND (
                             linked_position.volume_order_key < target_position.volume_order_key OR
                             (linked_position.volume_order_key = target_position.volume_order_key AND
                              linked_position.chapter_order_key <= target_position.chapter_order_key)
                           )
                         ORDER BY linked_position.volume_order_key DESC,
                                  linked_position.chapter_order_key DESC,
                                  CASE link.role
                                    WHEN 'reveal' THEN 4
                                    WHEN 'partial_reveal' THEN 3
                                    WHEN 'reinforce' THEN 2
                                    WHEN 'plant' THEN 1
                                    ELSE 0
                                  END DESC
                         LIMIT 1
                      ) AS status
                 FROM foreshadowings foreshadowing
                WHERE foreshadowing.project_id = NEW.project_id
                  AND EXISTS (
                    SELECT 1
                      FROM foreshadowing_chapters visible_link
                      JOIN chapter_story_positions visible_position
                        ON visible_position.chapter_id = visible_link.chapter_id
                      JOIN chapter_story_positions target_position
                        ON target_position.chapter_id = NEW.chapter_id
                     WHERE visible_link.foreshadowing_id = foreshadowing.id
                       AND (
                         visible_position.volume_order_key < target_position.volume_order_key OR
                         (visible_position.volume_order_key = target_position.volume_order_key AND
                          visible_position.chapter_order_key <= target_position.chapter_order_key)
                       )
                  )
                ORDER BY foreshadowing.id
             ) projected
         ), '[]'))
       ),
       '$.arcMilestones',
       json(COALESCE((
         SELECT json_group_array(
           json_object(
             'id', milestone.id,
             'status', milestone.status,
             'actualChapterId', milestone.actual_chapter_id
           )
         )
           FROM arc_milestones milestone
           JOIN chapter_story_positions effective_position
             ON effective_position.chapter_id = COALESCE(
               milestone.actual_chapter_id, milestone.planned_chapter_id
             )
           JOIN chapter_story_positions target_position
             ON target_position.chapter_id = NEW.chapter_id
          WHERE milestone.project_id = NEW.project_id
            AND milestone.status IN ('hit', 'skipped')
            AND (
              effective_position.volume_order_key < target_position.volume_order_key OR
              (effective_position.volume_order_key = target_position.volume_order_key AND
               effective_position.chapter_order_key <= target_position.chapter_order_key)
            )
          ORDER BY milestone.id
       ), '[]'))
     )
   WHERE id = NEW.id;
END;

CREATE TRIGGER trg_snapshot_project_temporal_content_after_revalidate
AFTER UPDATE OF status, source_version_id ON ending_snapshots
WHEN NEW.status = 'valid'
 AND (OLD.status <> 'valid' OR OLD.source_version_id <> NEW.source_version_id)
BEGIN
  UPDATE ending_snapshots
     SET content_json = json_set(
       json_set(
         content_json,
         '$.foreshadowings',
         json(COALESCE((
           SELECT json_group_array(json_object('id', projected.id, 'status', projected.status))
             FROM (
               SELECT foreshadowing.id,
                      (
                        SELECT CASE link.role
                          WHEN 'plant' THEN 'planted'
                          WHEN 'reinforce' THEN 'reinforced'
                          WHEN 'partial_reveal' THEN 'partially_revealed'
                          WHEN 'reveal' THEN 'revealed'
                          ELSE 'planned'
                        END
                          FROM foreshadowing_chapters link
                          JOIN chapter_story_positions linked_position
                            ON linked_position.chapter_id = link.chapter_id
                          JOIN chapter_story_positions target_position
                            ON target_position.chapter_id = NEW.chapter_id
                         WHERE link.foreshadowing_id = foreshadowing.id
                           AND (
                             linked_position.volume_order_key < target_position.volume_order_key OR
                             (linked_position.volume_order_key = target_position.volume_order_key AND
                              linked_position.chapter_order_key <= target_position.chapter_order_key)
                           )
                         ORDER BY linked_position.volume_order_key DESC,
                                  linked_position.chapter_order_key DESC,
                                  CASE link.role
                                    WHEN 'reveal' THEN 4
                                    WHEN 'partial_reveal' THEN 3
                                    WHEN 'reinforce' THEN 2
                                    WHEN 'plant' THEN 1
                                    ELSE 0
                                  END DESC
                         LIMIT 1
                      ) AS status
                 FROM foreshadowings foreshadowing
                WHERE foreshadowing.project_id = NEW.project_id
                  AND EXISTS (
                    SELECT 1
                      FROM foreshadowing_chapters visible_link
                      JOIN chapter_story_positions visible_position
                        ON visible_position.chapter_id = visible_link.chapter_id
                      JOIN chapter_story_positions target_position
                        ON target_position.chapter_id = NEW.chapter_id
                     WHERE visible_link.foreshadowing_id = foreshadowing.id
                       AND (
                         visible_position.volume_order_key < target_position.volume_order_key OR
                         (visible_position.volume_order_key = target_position.volume_order_key AND
                          visible_position.chapter_order_key <= target_position.chapter_order_key)
                       )
                  )
                ORDER BY foreshadowing.id
             ) projected
         ), '[]'))
       ),
       '$.arcMilestones',
       json(COALESCE((
         SELECT json_group_array(
           json_object(
             'id', milestone.id,
             'status', milestone.status,
             'actualChapterId', milestone.actual_chapter_id
           )
         )
           FROM arc_milestones milestone
           JOIN chapter_story_positions effective_position
             ON effective_position.chapter_id = COALESCE(
               milestone.actual_chapter_id, milestone.planned_chapter_id
             )
           JOIN chapter_story_positions target_position
             ON target_position.chapter_id = NEW.chapter_id
          WHERE milestone.project_id = NEW.project_id
            AND milestone.status IN ('hit', 'skipped')
            AND (
              effective_position.volume_order_key < target_position.volume_order_key OR
              (effective_position.volume_order_key = target_position.volume_order_key AND
               effective_position.chapter_order_key <= target_position.chapter_order_key)
            )
          ORDER BY milestone.id
       ), '[]'))
     )
   WHERE id = NEW.id;
END;

UPDATE projects SET schema_version = 19;
