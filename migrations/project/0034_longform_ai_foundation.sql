-- migration-policy: allow-unscoped-write
-- M11-07 long-form derived memory. Story digests are rebuildable projections;
-- authoritative story facts remain in the existing canon and continuity tables.
CREATE TABLE story_digests (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('chapter', 'volume', 'project')),
  scope_id TEXT NOT NULL,
  source_hash TEXT NOT NULL CHECK (length(source_hash) = 64),
  source_version_ids_json TEXT NOT NULL CHECK (
    json_valid(source_version_ids_json) AND json_type(source_version_ids_json) = 'array'
  ),
  semantic_revision INTEGER NOT NULL CHECK (semantic_revision > 0),
  freshness TEXT NOT NULL CHECK (freshness IN ('fresh', 'stale')),
  content TEXT NOT NULL CHECK (length(content) <= 200000),
  generation_source TEXT NOT NULL CHECK (generation_source IN ('local_extractive_v1')),
  generated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, scope_type, scope_id),
  CHECK (
    (scope_type = 'project' AND scope_id = project_id) OR
    (scope_type <> 'project' AND scope_id <> project_id)
  )
) STRICT;

CREATE INDEX idx_story_digests_project_scope
ON story_digests(project_id, scope_type, freshness, updated_at DESC, scope_id);

CREATE TRIGGER trg_story_digest_scope_insert
BEFORE INSERT ON story_digests
BEGIN
  SELECT CASE WHEN NEW.scope_type = 'chapter' AND NOT EXISTS (
    SELECT 1
      FROM chapters chapter
      JOIN volumes volume ON volume.id = chapter.volume_id
     WHERE chapter.id = NEW.scope_id AND volume.project_id = NEW.project_id
  ) THEN RAISE(ABORT, 'STORY_DIGEST_CHAPTER_SCOPE_INVALID') END;
  SELECT CASE WHEN NEW.scope_type = 'volume' AND NOT EXISTS (
    SELECT 1 FROM volumes volume
     WHERE volume.id = NEW.scope_id AND volume.project_id = NEW.project_id
  ) THEN RAISE(ABORT, 'STORY_DIGEST_VOLUME_SCOPE_INVALID') END;
END;

CREATE TRIGGER trg_story_digest_scope_update
BEFORE UPDATE OF project_id, scope_type, scope_id ON story_digests
BEGIN
  SELECT CASE WHEN NEW.scope_type = 'chapter' AND NOT EXISTS (
    SELECT 1
      FROM chapters chapter
      JOIN volumes volume ON volume.id = chapter.volume_id
     WHERE chapter.id = NEW.scope_id AND volume.project_id = NEW.project_id
  ) THEN RAISE(ABORT, 'STORY_DIGEST_CHAPTER_SCOPE_INVALID') END;
  SELECT CASE WHEN NEW.scope_type = 'volume' AND NOT EXISTS (
    SELECT 1 FROM volumes volume
     WHERE volume.id = NEW.scope_id AND volume.project_id = NEW.project_id
  ) THEN RAISE(ABORT, 'STORY_DIGEST_VOLUME_SCOPE_INVALID') END;
END;

CREATE TRIGGER trg_story_digest_finalize_invalidate
AFTER UPDATE OF final_version_id ON chapters
WHEN OLD.final_version_id IS NOT NEW.final_version_id
BEGIN
  UPDATE story_digests
     SET freshness = 'stale', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
   WHERE project_id = (
     SELECT volume.project_id FROM volumes volume WHERE volume.id = NEW.volume_id
   )
     AND (
       (scope_type = 'chapter' AND scope_id = NEW.id) OR
       (scope_type = 'volume' AND scope_id = NEW.volume_id) OR
       scope_type = 'project'
     );
END;

CREATE TRIGGER trg_story_digest_chapter_structure_invalidate
AFTER UPDATE OF volume_id, order_key, title, deleted_at ON chapters
BEGIN
  UPDATE story_digests
     SET freshness = 'stale', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
   WHERE project_id IN (
     SELECT project_id FROM volumes WHERE id IN (OLD.volume_id, NEW.volume_id)
   )
     AND scope_type IN ('volume', 'project');
END;

CREATE TRIGGER trg_story_digest_volume_structure_invalidate
AFTER UPDATE OF order_key, title, deleted_at ON volumes
BEGIN
  UPDATE story_digests
     SET freshness = 'stale', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
   WHERE project_id = NEW.project_id AND scope_type = 'project';
END;

UPDATE projects SET schema_version = 34;
