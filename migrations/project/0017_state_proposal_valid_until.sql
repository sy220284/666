ALTER TABLE state_proposals
ADD COLUMN valid_until_chapter_id TEXT REFERENCES chapters(id) ON DELETE RESTRICT;

CREATE TRIGGER trg_state_proposals_validate_interval_insert
BEFORE INSERT ON state_proposals
BEGIN
  SELECT CASE
    WHEN NEW.proposal_type = 'arc_milestone' AND NEW.valid_until_chapter_id IS NOT NULL
      THEN RAISE(ABORT, 'ARC_MILESTONE_PROPOSAL_INTERVAL_FORBIDDEN')
    WHEN NEW.valid_until_chapter_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
        FROM chapters start_chapter
        JOIN volumes start_volume ON start_volume.id = start_chapter.volume_id
        JOIN chapters end_chapter ON end_chapter.id = NEW.valid_until_chapter_id
        JOIN volumes end_volume ON end_volume.id = end_chapter.volume_id
       WHERE start_chapter.id = NEW.chapter_id
         AND start_volume.project_id = NEW.project_id
         AND end_volume.project_id = NEW.project_id
         AND start_chapter.deleted_at IS NULL
         AND start_volume.deleted_at IS NULL
         AND end_chapter.deleted_at IS NULL
         AND end_volume.deleted_at IS NULL
         AND (
           end_volume.order_key > start_volume.order_key
           OR (
             end_volume.order_key = start_volume.order_key
             AND end_chapter.order_key > start_chapter.order_key
           )
         )
    ) THEN RAISE(ABORT, 'STATE_PROPOSAL_INTERVAL_INVALID')
  END;
END;

CREATE TRIGGER trg_state_proposals_validate_interval_update
BEFORE UPDATE OF project_id, chapter_id, proposal_type, valid_until_chapter_id ON state_proposals
BEGIN
  SELECT CASE
    WHEN NEW.proposal_type = 'arc_milestone' AND NEW.valid_until_chapter_id IS NOT NULL
      THEN RAISE(ABORT, 'ARC_MILESTONE_PROPOSAL_INTERVAL_FORBIDDEN')
    WHEN NEW.valid_until_chapter_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
        FROM chapters start_chapter
        JOIN volumes start_volume ON start_volume.id = start_chapter.volume_id
        JOIN chapters end_chapter ON end_chapter.id = NEW.valid_until_chapter_id
        JOIN volumes end_volume ON end_volume.id = end_chapter.volume_id
       WHERE start_chapter.id = NEW.chapter_id
         AND start_volume.project_id = NEW.project_id
         AND end_volume.project_id = NEW.project_id
         AND start_chapter.deleted_at IS NULL
         AND start_volume.deleted_at IS NULL
         AND end_chapter.deleted_at IS NULL
         AND end_volume.deleted_at IS NULL
         AND (
           end_volume.order_key > start_volume.order_key
           OR (
             end_volume.order_key = start_volume.order_key
             AND end_chapter.order_key > start_chapter.order_key
           )
         )
    ) THEN RAISE(ABORT, 'STATE_PROPOSAL_INTERVAL_INVALID')
  END;
END;

UPDATE projects SET schema_version = 17;
