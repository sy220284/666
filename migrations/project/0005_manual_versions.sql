CREATE TABLE versions (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters(id),
  source_draft_id TEXT NOT NULL REFERENCES drafts(id),
  source_revision INTEGER NOT NULL CHECK (source_revision >= 0),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  label TEXT,
  word_count INTEGER NOT NULL CHECK (word_count >= 0),
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  created_at TEXT NOT NULL,
  UNIQUE(chapter_id, title)
) STRICT;

CREATE TABLE version_blocks (
  version_id TEXT NOT NULL REFERENCES versions(id),
  logical_block_id TEXT NOT NULL,
  order_key INTEGER NOT NULL,
  block_type TEXT NOT NULL CHECK (block_type IN ('paragraph', 'dialogue', 'heading', 'separator')),
  text TEXT NOT NULL,
  attributes_json TEXT NOT NULL DEFAULT '{}',
  source TEXT NOT NULL CHECK (source IN ('manual', 'ai', 'mixed', 'imported')),
  locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  PRIMARY KEY(version_id, logical_block_id),
  UNIQUE(version_id, order_key)
) STRICT;

CREATE INDEX idx_versions_chapter_created
ON versions(chapter_id, created_at DESC);

-- Versions and VersionBlocks have no business UPDATE/DELETE command.
-- final_version_id ownership is validated by VersionService before the chapter pointer changes.

UPDATE projects SET schema_version = 5;
