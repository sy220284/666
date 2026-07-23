-- M3-R01: cross-stage coordination hardening.
--
-- Keeps logicalBlockId as the stable prose identity, treats EndingSnapshot as
-- rebuildable derived state, and coordinates M1/M2 structural mutations with
-- M3 continuity data without introducing a second source of truth.

CREATE TABLE scene_beat_link_rebind_queue (
  scene_beat_id TEXT NOT NULL REFERENCES scene_beats(id) ON DELETE CASCADE,
  logical_block_id TEXT NOT NULL,
  source_draft_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(scene_beat_id, logical_block_id)
) WITHOUT ROWID, STRICT;

CREATE INDEX idx_scene_beat_link_rebind_logical
ON scene_beat_link_rebind_queue(logical_block_id, scene_beat_id);

CREATE TRIGGER trg_scene_beat_link_capture_before_block_delete
BEFORE DELETE ON draft_blocks
BEGIN
  INSERT OR REPLACE INTO scene_beat_link_rebind_queue(
    scene_beat_id, logical_block_id, source_draft_id, created_at
  )
  SELECT link.scene_beat_id, OLD.logical_block_id, OLD.draft_id,
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM scene_beat_block_links link
   WHERE link.draft_block_id = OLD.id;
END;

CREATE TRIGGER trg_scene_beat_link_rebind_after_block_insert
AFTER INSERT ON draft_blocks
WHEN EXISTS (
  SELECT 1
    FROM drafts draft
   WHERE draft.id = NEW.draft_id AND draft.status = 'active'
)
BEGIN
  INSERT OR IGNORE INTO scene_beat_block_links(scene_beat_id, draft_block_id, created_at)
  SELECT queue.scene_beat_id, NEW.id, queue.created_at
    FROM scene_beat_link_rebind_queue queue
    JOIN scene_beats beat ON beat.id = queue.scene_beat_id
   WHERE queue.logical_block_id = NEW.logical_block_id
     AND beat.deleted_at IS NULL;

  DELETE FROM scene_beat_link_rebind_queue
   WHERE logical_block_id = NEW.logical_block_id
     AND EXISTS (
       SELECT 1
         FROM scene_beat_block_links link
        WHERE link.scene_beat_id = scene_beat_link_rebind_queue.scene_beat_id
          AND link.draft_block_id = NEW.id
     );
END;

CREATE TRIGGER trg_scene_beat_link_rebind_after_active_draft_change
AFTER UPDATE OF active_draft_id ON chapters
WHEN NEW.active_draft_id IS NOT NULL
 AND (OLD.active_draft_id IS NULL OR OLD.active_draft_id <> NEW.active_draft_id)
BEGIN
  INSERT OR REPLACE INTO scene_beat_link_rebind_queue(
    scene_beat_id, logical_block_id, source_draft_id, created_at
  )
  SELECT link.scene_beat_id, old_block.logical_block_id, old_block.draft_id,
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM scene_beat_block_links link
    JOIN draft_blocks old_block ON old_block.id = link.draft_block_id
   WHERE old_block.draft_id = OLD.active_draft_id;

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
    JOIN scene_beats beat ON beat.id = queue.scene_beat_id
   WHERE beat.deleted_at IS NULL;

  DELETE FROM scene_beat_link_rebind_queue
   WHERE EXISTS (
     SELECT 1
       FROM scene_beat_block_links link
       JOIN draft_blocks block ON block.id = link.draft_block_id
      WHERE link.scene_beat_id = scene_beat_link_rebind_queue.scene_beat_id
        AND block.draft_id = NEW.active_draft_id
        AND block.logical_block_id = scene_beat_link_rebind_queue.logical_block_id
   );
END;

-- A soft-deleted chapter cannot remain an active validity boundary. The author
-- must first migrate or invalidate the affected continuity record explicitly.
CREATE TRIGGER trg_chapter_soft_delete_continuity_boundary_guard
BEFORE UPDATE OF deleted_at ON chapters
WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM entity_states state
     WHERE state.valid_from_chapter_id = OLD.id
        OR state.valid_until_chapter_id = OLD.id
  ) OR EXISTS (
    SELECT 1 FROM knowledge_states state
     WHERE state.valid_from_chapter_id = OLD.id
        OR state.valid_until_chapter_id = OLD.id
  ) THEN RAISE(ABORT, 'CONTINUITY_CHAPTER_BOUNDARY_IN_USE') END;
END;

CREATE TRIGGER trg_volume_soft_delete_continuity_boundary_guard
BEFORE UPDATE OF deleted_at ON volumes
WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM chapters chapter
      JOIN entity_states state
        ON state.valid_from_chapter_id = chapter.id
        OR state.valid_until_chapter_id = chapter.id
     WHERE chapter.volume_id = OLD.id
  ) OR EXISTS (
    SELECT 1
      FROM chapters chapter
      JOIN knowledge_states state
        ON state.valid_from_chapter_id = chapter.id
        OR state.valid_until_chapter_id = chapter.id
     WHERE chapter.volume_id = OLD.id
  ) THEN RAISE(ABORT, 'CONTINUITY_VOLUME_BOUNDARY_IN_USE') END;
END;

-- Snapshot invalidation is centralized at the database boundary so every Core
-- write path, including future callers, receives the same semantics.
CREATE TRIGGER trg_snapshot_stale_after_chapter_structure_change
AFTER UPDATE OF volume_id, order_key, deleted_at, final_version_id ON chapters
WHEN OLD.volume_id <> NEW.volume_id
  OR OLD.order_key <> NEW.order_key
  OR OLD.deleted_at IS NOT NEW.deleted_at
  OR OLD.final_version_id IS NOT NEW.final_version_id
BEGIN
  UPDATE ending_snapshots
     SET status = 'stale',
         stale_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         stale_reasons_json = CASE
           WHEN EXISTS (SELECT 1 FROM json_each(stale_reasons_json) WHERE value = 'timeline')
             THEN stale_reasons_json
           ELSE json_insert(stale_reasons_json, '$[#]', 'timeline')
         END
   WHERE project_id = (
     SELECT volume.project_id FROM volumes volume WHERE volume.id = NEW.volume_id
   )
     AND status = 'valid';
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

CREATE TRIGGER trg_snapshot_stale_after_entity_state_insert
AFTER INSERT ON entity_states
BEGIN
  UPDATE ending_snapshots
     SET status = 'stale',
         stale_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         stale_reasons_json = CASE
           WHEN EXISTS (SELECT 1 FROM json_each(stale_reasons_json) WHERE value = 'entity_state')
             THEN stale_reasons_json
           ELSE json_insert(stale_reasons_json, '$[#]', 'entity_state')
         END
   WHERE project_id = NEW.project_id AND status = 'valid';
END;

CREATE TRIGGER trg_snapshot_stale_after_entity_state_update
AFTER UPDATE ON entity_states
BEGIN
  UPDATE ending_snapshots
     SET status = 'stale',
         stale_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         stale_reasons_json = CASE
           WHEN EXISTS (SELECT 1 FROM json_each(stale_reasons_json) WHERE value = 'entity_state')
             THEN stale_reasons_json
           ELSE json_insert(stale_reasons_json, '$[#]', 'entity_state')
         END
   WHERE project_id = NEW.project_id AND status = 'valid';
END;

CREATE TRIGGER trg_snapshot_stale_after_entity_state_delete
AFTER DELETE ON entity_states
BEGIN
  UPDATE ending_snapshots
     SET status = 'stale',
         stale_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         stale_reasons_json = CASE
           WHEN EXISTS (SELECT 1 FROM json_each(stale_reasons_json) WHERE value = 'entity_state')
             THEN stale_reasons_json
           ELSE json_insert(stale_reasons_json, '$[#]', 'entity_state')
         END
   WHERE project_id = OLD.project_id AND status = 'valid';
END;

CREATE TRIGGER trg_snapshot_stale_after_knowledge_state_insert
AFTER INSERT ON knowledge_states
BEGIN
  UPDATE ending_snapshots
     SET status = 'stale',
         stale_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         stale_reasons_json = CASE
           WHEN EXISTS (SELECT 1 FROM json_each(stale_reasons_json) WHERE value = 'entity_state')
             THEN stale_reasons_json
           ELSE json_insert(stale_reasons_json, '$[#]', 'entity_state')
         END
   WHERE project_id = NEW.project_id AND status = 'valid';
END;

CREATE TRIGGER trg_snapshot_stale_after_knowledge_state_update
AFTER UPDATE ON knowledge_states
BEGIN
  UPDATE ending_snapshots
     SET status = 'stale',
         stale_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         stale_reasons_json = CASE
           WHEN EXISTS (SELECT 1 FROM json_each(stale_reasons_json) WHERE value = 'entity_state')
             THEN stale_reasons_json
           ELSE json_insert(stale_reasons_json, '$[#]', 'entity_state')
         END
   WHERE project_id = NEW.project_id AND status = 'valid';
END;

CREATE TRIGGER trg_snapshot_stale_after_knowledge_state_delete
AFTER DELETE ON knowledge_states
BEGIN
  UPDATE ending_snapshots
     SET status = 'stale',
         stale_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         stale_reasons_json = CASE
           WHEN EXISTS (SELECT 1 FROM json_each(stale_reasons_json) WHERE value = 'entity_state')
             THEN stale_reasons_json
           ELSE json_insert(stale_reasons_json, '$[#]', 'entity_state')
         END
   WHERE project_id = OLD.project_id AND status = 'valid';
END;

CREATE TRIGGER trg_snapshot_stale_after_foreshadowing_update
AFTER UPDATE OF status ON foreshadowings
WHEN OLD.status <> NEW.status
BEGIN
  UPDATE ending_snapshots
     SET status = 'stale',
         stale_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         stale_reasons_json = CASE
           WHEN EXISTS (SELECT 1 FROM json_each(stale_reasons_json) WHERE value = 'foreshadowing')
             THEN stale_reasons_json
           ELSE json_insert(stale_reasons_json, '$[#]', 'foreshadowing')
         END
   WHERE project_id = NEW.project_id AND status = 'valid';
END;

CREATE TRIGGER trg_snapshot_stale_after_foreshadowing_chapter_insert
AFTER INSERT ON foreshadowing_chapters
BEGIN
  UPDATE ending_snapshots
     SET status = 'stale',
         stale_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         stale_reasons_json = CASE
           WHEN EXISTS (SELECT 1 FROM json_each(stale_reasons_json) WHERE value = 'foreshadowing')
             THEN stale_reasons_json
           ELSE json_insert(stale_reasons_json, '$[#]', 'foreshadowing')
         END
   WHERE project_id = NEW.project_id AND status = 'valid';
END;

CREATE TRIGGER trg_snapshot_stale_after_foreshadowing_chapter_delete
AFTER DELETE ON foreshadowing_chapters
BEGIN
  UPDATE ending_snapshots
     SET status = 'stale',
         stale_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         stale_reasons_json = CASE
           WHEN EXISTS (SELECT 1 FROM json_each(stale_reasons_json) WHERE value = 'foreshadowing')
             THEN stale_reasons_json
           ELSE json_insert(stale_reasons_json, '$[#]', 'foreshadowing')
         END
   WHERE project_id = OLD.project_id AND status = 'valid';
END;

CREATE TRIGGER trg_snapshot_stale_after_arc_milestone_update
AFTER UPDATE OF status, actual_chapter_id, planned_chapter_id ON arc_milestones
WHEN OLD.status <> NEW.status
  OR OLD.actual_chapter_id IS NOT NEW.actual_chapter_id
  OR OLD.planned_chapter_id IS NOT NEW.planned_chapter_id
BEGIN
  UPDATE ending_snapshots
     SET status = 'stale',
         stale_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         stale_reasons_json = CASE
           WHEN EXISTS (SELECT 1 FROM json_each(stale_reasons_json) WHERE value = 'arc_milestone')
             THEN stale_reasons_json
           ELSE json_insert(stale_reasons_json, '$[#]', 'arc_milestone')
         END
   WHERE project_id = NEW.project_id AND status = 'valid';
END;

-- Historical projection: a chapter-ending snapshot must only contain narrative
-- facts that are visible at that chapter position. Current global status must not
-- leak later reveals or later arc hits into an earlier snapshot.
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
                      COALESCE((
                        SELECT CASE link.role
                          WHEN 'plant' THEN 'planted'
                          WHEN 'reinforce' THEN 'reinforced'
                          WHEN 'partial_reveal' THEN 'partially_revealed'
                          WHEN 'reveal' THEN 'revealed'
                          ELSE 'planned'
                        END
                          FROM foreshadowing_chapters link
                          JOIN chapters linked_chapter ON linked_chapter.id = link.chapter_id
                          JOIN volumes linked_volume ON linked_volume.id = linked_chapter.volume_id
                          JOIN chapters target_chapter ON target_chapter.id = NEW.chapter_id
                          JOIN volumes target_volume ON target_volume.id = target_chapter.volume_id
                         WHERE link.foreshadowing_id = foreshadowing.id
                           AND linked_chapter.deleted_at IS NULL
                           AND linked_volume.deleted_at IS NULL
                           AND (
                             linked_volume.order_key < target_volume.order_key
                             OR (
                               linked_volume.order_key = target_volume.order_key
                               AND linked_chapter.order_key <= target_chapter.order_key
                             )
                           )
                         ORDER BY linked_volume.order_key DESC,
                                  linked_chapter.order_key DESC,
                                  CASE link.role
                                    WHEN 'reveal' THEN 4
                                    WHEN 'partial_reveal' THEN 3
                                    WHEN 'reinforce' THEN 2
                                    WHEN 'plant' THEN 1
                                    ELSE 0
                                  END DESC
                         LIMIT 1
                      ), 'planned') AS status
                 FROM foreshadowings foreshadowing
                WHERE foreshadowing.project_id = NEW.project_id
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
           JOIN chapters effective_chapter
             ON effective_chapter.id = COALESCE(milestone.actual_chapter_id, milestone.planned_chapter_id)
           JOIN volumes effective_volume ON effective_volume.id = effective_chapter.volume_id
           JOIN chapters target_chapter ON target_chapter.id = NEW.chapter_id
           JOIN volumes target_volume ON target_volume.id = target_chapter.volume_id
          WHERE milestone.project_id = NEW.project_id
            AND milestone.status IN ('hit', 'skipped')
            AND effective_chapter.deleted_at IS NULL
            AND effective_volume.deleted_at IS NULL
            AND (
              effective_volume.order_key < target_volume.order_key
              OR (
                effective_volume.order_key = target_volume.order_key
                AND effective_chapter.order_key <= target_chapter.order_key
              )
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
                      COALESCE((
                        SELECT CASE link.role
                          WHEN 'plant' THEN 'planted'
                          WHEN 'reinforce' THEN 'reinforced'
                          WHEN 'partial_reveal' THEN 'partially_revealed'
                          WHEN 'reveal' THEN 'revealed'
                          ELSE 'planned'
                        END
                          FROM foreshadowing_chapters link
                          JOIN chapters linked_chapter ON linked_chapter.id = link.chapter_id
                          JOIN volumes linked_volume ON linked_volume.id = linked_chapter.volume_id
                          JOIN chapters target_chapter ON target_chapter.id = NEW.chapter_id
                          JOIN volumes target_volume ON target_volume.id = target_chapter.volume_id
                         WHERE link.foreshadowing_id = foreshadowing.id
                           AND linked_chapter.deleted_at IS NULL
                           AND linked_volume.deleted_at IS NULL
                           AND (
                             linked_volume.order_key < target_volume.order_key
                             OR (
                               linked_volume.order_key = target_volume.order_key
                               AND linked_chapter.order_key <= target_chapter.order_key
                             )
                           )
                         ORDER BY linked_volume.order_key DESC,
                                  linked_chapter.order_key DESC,
                                  CASE link.role
                                    WHEN 'reveal' THEN 4
                                    WHEN 'partial_reveal' THEN 3
                                    WHEN 'reinforce' THEN 2
                                    WHEN 'plant' THEN 1
                                    ELSE 0
                                  END DESC
                         LIMIT 1
                      ), 'planned') AS status
                 FROM foreshadowings foreshadowing
                WHERE foreshadowing.project_id = NEW.project_id
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
           JOIN chapters effective_chapter
             ON effective_chapter.id = COALESCE(milestone.actual_chapter_id, milestone.planned_chapter_id)
           JOIN volumes effective_volume ON effective_volume.id = effective_chapter.volume_id
           JOIN chapters target_chapter ON target_chapter.id = NEW.chapter_id
           JOIN volumes target_volume ON target_volume.id = target_chapter.volume_id
          WHERE milestone.project_id = NEW.project_id
            AND milestone.status IN ('hit', 'skipped')
            AND effective_chapter.deleted_at IS NULL
            AND effective_volume.deleted_at IS NULL
            AND (
              effective_volume.order_key < target_volume.order_key
              OR (
                effective_volume.order_key = target_volume.order_key
                AND effective_chapter.order_key <= target_chapter.order_key
              )
            )
          ORDER BY milestone.id
       ), '[]'))
     )
   WHERE id = NEW.id;
END;

-- Existing snapshots were generated before temporal projection and coordinated
-- invalidation existed. Never expose them as trustworthy derived state.
UPDATE ending_snapshots
   SET status = 'stale',
       stale_at = COALESCE(stale_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
       stale_reasons_json = CASE
         WHEN EXISTS (SELECT 1 FROM json_each(stale_reasons_json) WHERE value = 'timeline')
           THEN stale_reasons_json
         ELSE json_insert(stale_reasons_json, '$[#]', 'timeline')
       END
 WHERE status = 'valid';

UPDATE projects SET schema_version = 18;
