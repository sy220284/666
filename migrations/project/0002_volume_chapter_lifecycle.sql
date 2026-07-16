CREATE TABLE volumes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  order_key INTEGER NOT NULL,
  status TEXT NOT NULL,
  deleted_at TEXT
) STRICT;

CREATE TABLE chapters (
  id TEXT PRIMARY KEY,
  volume_id TEXT NOT NULL REFERENCES volumes(id),
  title TEXT NOT NULL,
  order_key INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'outlined', 'writing', 'reviewing', 'finalized')),
  target_word_min INTEGER CHECK (target_word_min IS NULL OR target_word_min >= 0),
  target_word_max INTEGER CHECK (target_word_max IS NULL OR target_word_max >= 0),
  active_draft_id TEXT,
  final_version_id TEXT,
  deleted_at TEXT,
  CHECK (
    target_word_min IS NULL OR
    target_word_max IS NULL OR
    target_word_min <= target_word_max
  )
) STRICT;

CREATE TABLE trash_entries (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('volume', 'chapter')),
  entity_id TEXT NOT NULL,
  original_parent_id TEXT NOT NULL,
  original_order_key INTEGER NOT NULL,
  deleted_at TEXT NOT NULL,
  UNIQUE(entity_type, entity_id)
) STRICT;

CREATE UNIQUE INDEX uq_active_volume_title
ON volumes(project_id, title)
WHERE deleted_at IS NULL;

CREATE INDEX idx_active_volume_order
ON volumes(project_id, order_key)
WHERE deleted_at IS NULL;

CREATE INDEX idx_volumes_project_order
ON volumes(project_id, deleted_at, order_key);

CREATE UNIQUE INDEX uq_active_chapter_title
ON chapters(volume_id, title)
WHERE deleted_at IS NULL;

CREATE INDEX idx_active_chapter_order
ON chapters(volume_id, order_key)
WHERE deleted_at IS NULL;

CREATE INDEX idx_chapters_volume_order
ON chapters(volume_id, deleted_at, order_key);

CREATE INDEX idx_trash_entries_deleted
ON trash_entries(deleted_at, id);

UPDATE projects SET schema_version = 2;
