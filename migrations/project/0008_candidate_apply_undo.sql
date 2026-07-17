CREATE TABLE candidate_block_sources (
  candidate_block_id TEXT NOT NULL REFERENCES candidate_blocks(id) ON DELETE CASCADE,
  source_logical_block_id TEXT NOT NULL,
  source_order INTEGER NOT NULL CHECK (source_order >= 0),
  PRIMARY KEY(candidate_block_id, source_logical_block_id),
  UNIQUE(candidate_block_id, source_order)
) STRICT;

CREATE TABLE candidate_apply_checkpoints (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id),
  draft_id TEXT NOT NULL REFERENCES drafts(id),
  source_revision INTEGER NOT NULL CHECK (source_revision >= 0),
  blocks_json TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE candidate_apply_records (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  candidate_id TEXT NOT NULL UNIQUE REFERENCES candidates(id),
  draft_id TEXT NOT NULL REFERENCES drafts(id),
  checkpoint_id TEXT NOT NULL UNIQUE REFERENCES candidate_apply_checkpoints(id),
  base_revision INTEGER NOT NULL CHECK (base_revision >= 0),
  committed_revision INTEGER NOT NULL CHECK (committed_revision > base_revision),
  selection_json TEXT NOT NULL,
  operations_json TEXT NOT NULL,
  inverse_operations_json TEXT NOT NULL,
  applied_blocks_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'undone')),
  applied_at TEXT NOT NULL,
  undone_revision INTEGER CHECK (undone_revision IS NULL OR undone_revision > committed_revision),
  undone_at TEXT,
  CHECK (
    (status = 'applied' AND undone_revision IS NULL AND undone_at IS NULL)
    OR (status = 'undone' AND undone_revision IS NOT NULL AND undone_at IS NOT NULL)
  )
) STRICT;

CREATE TABLE candidate_conflict_sets (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id),
  draft_id TEXT NOT NULL REFERENCES drafts(id),
  apply_record_id TEXT REFERENCES candidate_apply_records(id),
  phase TEXT NOT NULL CHECK (phase IN ('apply', 'undo')),
  attempted_revision INTEGER NOT NULL CHECK (attempted_revision >= 0),
  current_revision INTEGER NOT NULL CHECK (current_revision >= 0),
  conflicts_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT
) STRICT;

CREATE INDEX idx_candidate_block_sources_source
ON candidate_block_sources(source_logical_block_id, candidate_block_id);

CREATE INDEX idx_candidate_apply_records_draft
ON candidate_apply_records(draft_id, applied_at DESC, id DESC);

CREATE INDEX idx_candidate_conflict_sets_candidate
ON candidate_conflict_sets(candidate_id, created_at DESC, id DESC);

UPDATE projects SET schema_version = 8;
