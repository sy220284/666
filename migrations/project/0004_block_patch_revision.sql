CREATE TABLE draft_patch_log (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES drafts(id),
  request_id TEXT NOT NULL UNIQUE,
  base_revision INTEGER NOT NULL CHECK (base_revision >= 0),
  committed_revision INTEGER NOT NULL CHECK (committed_revision > base_revision),
  operations_json TEXT NOT NULL,
  before_blocks_json TEXT NOT NULL,
  after_blocks_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(draft_id, committed_revision)
) STRICT;

CREATE INDEX idx_draft_patch_log_draft_revision
ON draft_patch_log(draft_id, committed_revision);

UPDATE projects SET schema_version = 4;
