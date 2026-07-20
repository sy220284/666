CREATE TABLE _m0015_scene_beat_entity_guard (
  issue_count INTEGER NOT NULL CHECK (issue_count = 0)
) STRICT;

INSERT INTO _m0015_scene_beat_entity_guard(issue_count)
SELECT
  (SELECT COUNT(*)
     FROM scene_beats beat, json_each(beat.character_ids_json) ref
     LEFT JOIN entities entity
       ON entity.id = ref.value AND entity.project_id = beat.project_id
    WHERE typeof(ref.value) <> 'text'
       OR entity.id IS NULL
       OR entity.entity_type <> 'character'
       OR entity.status <> 'active')
  +
  (SELECT COUNT(*)
     FROM scene_beats beat, json_each(beat.location_ids_json) ref
     LEFT JOIN entities entity
       ON entity.id = ref.value AND entity.project_id = beat.project_id
    WHERE typeof(ref.value) <> 'text'
       OR entity.id IS NULL
       OR entity.entity_type <> 'location'
       OR entity.status <> 'active')
  +
  (SELECT COUNT(*)
     FROM scene_beat_entities link
     JOIN entities entity
       ON entity.id = link.entity_id AND entity.project_id = link.project_id
    WHERE entity.status <> 'active'
       OR (link.role = 'character' AND entity.entity_type <> 'character')
       OR (link.role = 'location' AND entity.entity_type <> 'location'));

DROP TABLE _m0015_scene_beat_entity_guard;

INSERT OR IGNORE INTO scene_beat_entities(
  project_id, scene_beat_id, entity_id, role, created_at
)
SELECT beat.project_id, beat.id, ref.value, 'character', beat.updated_at
  FROM scene_beats beat, json_each(beat.character_ids_json) ref;

INSERT OR IGNORE INTO scene_beat_entities(
  project_id, scene_beat_id, entity_id, role, created_at
)
SELECT beat.project_id, beat.id, ref.value, 'location', beat.updated_at
  FROM scene_beats beat, json_each(beat.location_ids_json) ref;

CREATE TRIGGER trg_scene_beats_entity_refs_validate_insert
BEFORE INSERT ON scene_beats
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM json_each(NEW.character_ids_json) ref
      LEFT JOIN entities entity
        ON entity.id = ref.value AND entity.project_id = NEW.project_id
     WHERE typeof(ref.value) <> 'text'
        OR entity.id IS NULL
        OR entity.entity_type <> 'character'
        OR entity.status <> 'active'
  ) THEN RAISE(ABORT, 'SCENE_BEAT_CHARACTER_REFERENCE_INVALID') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM json_each(NEW.location_ids_json) ref
      LEFT JOIN entities entity
        ON entity.id = ref.value AND entity.project_id = NEW.project_id
     WHERE typeof(ref.value) <> 'text'
        OR entity.id IS NULL
        OR entity.entity_type <> 'location'
        OR entity.status <> 'active'
  ) THEN RAISE(ABORT, 'SCENE_BEAT_LOCATION_REFERENCE_INVALID') END;
END;

CREATE TRIGGER trg_scene_beats_entity_refs_validate_update
BEFORE UPDATE OF project_id, character_ids_json, location_ids_json ON scene_beats
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM json_each(NEW.character_ids_json) ref
      LEFT JOIN entities entity
        ON entity.id = ref.value AND entity.project_id = NEW.project_id
     WHERE typeof(ref.value) <> 'text'
        OR entity.id IS NULL
        OR entity.entity_type <> 'character'
        OR entity.status <> 'active'
  ) THEN RAISE(ABORT, 'SCENE_BEAT_CHARACTER_REFERENCE_INVALID') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM json_each(NEW.location_ids_json) ref
      LEFT JOIN entities entity
        ON entity.id = ref.value AND entity.project_id = NEW.project_id
     WHERE typeof(ref.value) <> 'text'
        OR entity.id IS NULL
        OR entity.entity_type <> 'location'
        OR entity.status <> 'active'
  ) THEN RAISE(ABORT, 'SCENE_BEAT_LOCATION_REFERENCE_INVALID') END;
END;

CREATE TRIGGER trg_scene_beats_entity_refs_sync_insert
AFTER INSERT ON scene_beats
BEGIN
  INSERT OR IGNORE INTO scene_beat_entities(project_id, scene_beat_id, entity_id, role, created_at)
  SELECT NEW.project_id, NEW.id, value, 'character', NEW.updated_at
    FROM json_each(NEW.character_ids_json);
  INSERT OR IGNORE INTO scene_beat_entities(project_id, scene_beat_id, entity_id, role, created_at)
  SELECT NEW.project_id, NEW.id, value, 'location', NEW.updated_at
    FROM json_each(NEW.location_ids_json);
END;

CREATE TRIGGER trg_scene_beats_entity_refs_sync_update
AFTER UPDATE OF project_id, character_ids_json, location_ids_json ON scene_beats
WHEN
  EXISTS (
    SELECT value FROM json_each(NEW.character_ids_json)
    EXCEPT
    SELECT entity_id FROM scene_beat_entities
     WHERE scene_beat_id = NEW.id AND role = 'character'
  )
  OR EXISTS (
    SELECT entity_id FROM scene_beat_entities
     WHERE scene_beat_id = NEW.id AND role = 'character'
    EXCEPT
    SELECT value FROM json_each(NEW.character_ids_json)
  )
  OR EXISTS (
    SELECT value FROM json_each(NEW.location_ids_json)
    EXCEPT
    SELECT entity_id FROM scene_beat_entities
     WHERE scene_beat_id = NEW.id AND role = 'location'
  )
  OR EXISTS (
    SELECT entity_id FROM scene_beat_entities
     WHERE scene_beat_id = NEW.id AND role = 'location'
    EXCEPT
    SELECT value FROM json_each(NEW.location_ids_json)
  )
BEGIN
  DELETE FROM scene_beat_entities
   WHERE scene_beat_id = NEW.id AND role IN ('character', 'location');
  INSERT INTO scene_beat_entities(project_id, scene_beat_id, entity_id, role, created_at)
  SELECT NEW.project_id, NEW.id, value, 'character', NEW.updated_at
    FROM json_each(NEW.character_ids_json);
  INSERT INTO scene_beat_entities(project_id, scene_beat_id, entity_id, role, created_at)
  SELECT NEW.project_id, NEW.id, value, 'location', NEW.updated_at
    FROM json_each(NEW.location_ids_json);
END;

CREATE TRIGGER trg_scene_beat_entities_validate_insert
BEFORE INSERT ON scene_beat_entities
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM entities entity
     WHERE entity.id = NEW.entity_id
       AND entity.project_id = NEW.project_id
       AND entity.status = 'active'
       AND (NEW.role <> 'character' OR entity.entity_type = 'character')
       AND (NEW.role <> 'location' OR entity.entity_type = 'location')
  ) THEN RAISE(ABORT, 'SCENE_BEAT_ENTITY_REFERENCE_INVALID') END;
END;

CREATE TRIGGER trg_scene_beat_entities_validate_update
BEFORE UPDATE OF project_id, entity_id, role ON scene_beat_entities
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM entities entity
     WHERE entity.id = NEW.entity_id
       AND entity.project_id = NEW.project_id
       AND entity.status = 'active'
       AND (NEW.role <> 'character' OR entity.entity_type = 'character')
       AND (NEW.role <> 'location' OR entity.entity_type = 'location')
  ) THEN RAISE(ABORT, 'SCENE_BEAT_ENTITY_REFERENCE_INVALID') END;
END;

CREATE TRIGGER trg_scene_beat_entities_character_mirror_insert
AFTER INSERT ON scene_beat_entities
WHEN NEW.role = 'character'
BEGIN
  UPDATE scene_beats
     SET character_ids_json = (
       SELECT COALESCE(json_group_array(entity_id), '[]')
         FROM (
           SELECT entity_id
             FROM scene_beat_entities
            WHERE scene_beat_id = NEW.scene_beat_id AND role = 'character'
            ORDER BY entity_id
         )
     )
   WHERE id = NEW.scene_beat_id;
END;

CREATE TRIGGER trg_scene_beat_entities_location_mirror_insert
AFTER INSERT ON scene_beat_entities
WHEN NEW.role = 'location'
BEGIN
  UPDATE scene_beats
     SET location_ids_json = (
       SELECT COALESCE(json_group_array(entity_id), '[]')
         FROM (
           SELECT entity_id
             FROM scene_beat_entities
            WHERE scene_beat_id = NEW.scene_beat_id AND role = 'location'
            ORDER BY entity_id
         )
     )
   WHERE id = NEW.scene_beat_id;
END;

CREATE TRIGGER trg_scene_beat_entities_character_mirror_delete
AFTER DELETE ON scene_beat_entities
WHEN OLD.role = 'character'
BEGIN
  UPDATE scene_beats
     SET character_ids_json = (
       SELECT COALESCE(json_group_array(entity_id), '[]')
         FROM (
           SELECT entity_id
             FROM scene_beat_entities
            WHERE scene_beat_id = OLD.scene_beat_id AND role = 'character'
            ORDER BY entity_id
         )
     )
   WHERE id = OLD.scene_beat_id;
END;

CREATE TRIGGER trg_scene_beat_entities_location_mirror_delete
AFTER DELETE ON scene_beat_entities
WHEN OLD.role = 'location'
BEGIN
  UPDATE scene_beats
     SET location_ids_json = (
       SELECT COALESCE(json_group_array(entity_id), '[]')
         FROM (
           SELECT entity_id
             FROM scene_beat_entities
            WHERE scene_beat_id = OLD.scene_beat_id AND role = 'location'
            ORDER BY entity_id
         )
     )
   WHERE id = OLD.scene_beat_id;
END;

UPDATE projects SET schema_version = 15;
