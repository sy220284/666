DROP INDEX uq_active_chapter_title;
DROP INDEX idx_active_chapter_order;
DROP INDEX idx_chapters_volume_order;

ALTER TABLE chapters RENAME TO chapters_v2;

CREATE TABLE drafts_new (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters_new(id),
  status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE chapters_new (
  id TEXT PRIMARY KEY,
  volume_id TEXT NOT NULL REFERENCES volumes(id),
  title TEXT NOT NULL,
  order_key INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'outlined', 'writing', 'reviewing', 'finalized')),
  target_word_min INTEGER CHECK (target_word_min IS NULL OR target_word_min >= 0),
  target_word_max INTEGER CHECK (target_word_max IS NULL OR target_word_max >= 0),
  active_draft_id TEXT REFERENCES drafts_new(id),
  final_version_id TEXT,
  deleted_at TEXT,
  CHECK (
    target_word_min IS NULL OR
    target_word_max IS NULL OR
    target_word_min <= target_word_max
  )
) STRICT;

CREATE TABLE draft_blocks_new (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES drafts_new(id),
  logical_block_id TEXT NOT NULL,
  order_key INTEGER NOT NULL,
  block_type TEXT NOT NULL CHECK (block_type IN ('paragraph', 'dialogue', 'heading', 'separator')),
  text TEXT NOT NULL,
  attributes_json TEXT NOT NULL DEFAULT '{}',
  source TEXT NOT NULL CHECK (source IN ('manual', 'ai', 'mixed', 'imported')),
  locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
  content_hash TEXT,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  UNIQUE(draft_id, logical_block_id)
) STRICT;

INSERT INTO chapters_new(
  id, volume_id, title, order_key, status, target_word_min, target_word_max,
  active_draft_id, final_version_id, deleted_at
)
SELECT
  id, volume_id, title, order_key, status, target_word_min, target_word_max,
  active_draft_id, final_version_id, deleted_at
FROM chapters_v2;

DROP TABLE chapters_v2;

ALTER TABLE chapters_new RENAME TO chapters;
ALTER TABLE drafts_new RENAME TO drafts;
ALTER TABLE draft_blocks_new RENAME TO draft_blocks;

CREATE UNIQUE INDEX uq_active_chapter_title
ON chapters(volume_id, title)
WHERE deleted_at IS NULL;

CREATE INDEX idx_active_chapter_order
ON chapters(volume_id, order_key)
WHERE deleted_at IS NULL;

CREATE INDEX idx_chapters_volume_order
ON chapters(volume_id, deleted_at, order_key);

CREATE UNIQUE INDEX uq_active_draft_per_chapter
ON drafts(chapter_id)
WHERE status = 'active';

CREATE INDEX idx_drafts_chapter_status
ON drafts(chapter_id, status, created_at);

CREATE INDEX idx_draft_blocks_order
ON draft_blocks(draft_id, order_key);

UPDATE projects SET schema_version = 3;
