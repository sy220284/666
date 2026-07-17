CREATE TABLE candidates (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters(id),
  generation_run_id TEXT,
  candidate_type TEXT NOT NULL CHECK (candidate_type IN ('skeleton', 'full', 'rewrite', 'merge')),
  base_draft_id TEXT NOT NULL REFERENCES drafts(id),
  base_draft_revision INTEGER NOT NULL CHECK (base_draft_revision >= 0),
  completeness TEXT NOT NULL CHECK (completeness IN ('complete', 'partial')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'discarded')),
  title TEXT NOT NULL,
  source_version_id TEXT REFERENCES versions(id),
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  CHECK (
    (status = 'pending' AND resolved_at IS NULL)
    OR (status IN ('accepted', 'discarded') AND resolved_at IS NOT NULL)
  )
) STRICT;

CREATE TABLE candidate_blocks (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  logical_block_id TEXT NOT NULL,
  order_key INTEGER NOT NULL,
  block_type TEXT NOT NULL CHECK (block_type IN ('paragraph', 'dialogue', 'heading', 'separator')),
  text TEXT NOT NULL,
  attributes_json TEXT NOT NULL DEFAULT '{}',
  beat_id TEXT,
  source_block_hash TEXT CHECK (source_block_hash IS NULL OR length(source_block_hash) = 64),
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  UNIQUE(candidate_id, logical_block_id),
  UNIQUE(candidate_id, order_key)
) STRICT;

CREATE INDEX idx_candidates_chapter_created
ON candidates(chapter_id, created_at DESC, id DESC);

CREATE INDEX idx_candidates_base_draft
ON candidates(base_draft_id, base_draft_revision);

ALTER TABLE versions
ADD COLUMN version_type TEXT NOT NULL DEFAULT 'manual'
CHECK (version_type IN ('manual', 'candidate', 'checkpoint', 'imported'));

ALTER TABLE versions
ADD COLUMN parent_version_id TEXT REFERENCES versions(id);

ALTER TABLE versions
ADD COLUMN source_candidate_id TEXT REFERENCES candidates(id);

CREATE INDEX idx_versions_parent
ON versions(parent_version_id);

CREATE INDEX idx_versions_source_candidate
ON versions(source_candidate_id);

UPDATE projects SET schema_version = 7;
