CREATE TRIGGER trg_entity_states_validate_proposal_interval
BEFORE INSERT ON entity_states
WHEN EXISTS (
  SELECT 1
    FROM json_each(NEW.evidence_json)
   WHERE json_extract(value, '$.kind') = 'chapter'
     AND json_extract(value, '$.note') = 'worldforge:state-valid-until-exclusive'
)
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1
        FROM chapters start_chapter
        JOIN volumes start_volume ON start_volume.id = start_chapter.volume_id
        JOIN chapters end_chapter ON end_chapter.id = (
          SELECT json_extract(value, '$.targetId')
            FROM json_each(NEW.evidence_json)
           WHERE json_extract(value, '$.kind') = 'chapter'
             AND json_extract(value, '$.note') = 'worldforge:state-valid-until-exclusive'
           LIMIT 1
        )
        JOIN volumes end_volume ON end_volume.id = end_chapter.volume_id
       WHERE start_chapter.id = NEW.valid_from_chapter_id
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
    ) THEN RAISE(ABORT, 'ENTITY_STATE_INTERVAL_INVALID')
  END;
END;

CREATE TRIGGER trg_entity_states_apply_proposal_interval
AFTER INSERT ON entity_states
WHEN EXISTS (
  SELECT 1
    FROM json_each(NEW.evidence_json)
   WHERE json_extract(value, '$.kind') = 'chapter'
     AND json_extract(value, '$.note') = 'worldforge:state-valid-until-exclusive'
)
BEGIN
  UPDATE entity_states
     SET valid_until_chapter_id = (
       SELECT json_extract(value, '$.targetId')
         FROM json_each(NEW.evidence_json)
        WHERE json_extract(value, '$.kind') = 'chapter'
          AND json_extract(value, '$.note') = 'worldforge:state-valid-until-exclusive'
        LIMIT 1
     )
   WHERE id = NEW.id;
END;

UPDATE projects SET schema_version = 17;
