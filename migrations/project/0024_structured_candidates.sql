CREATE TABLE candidate_skeleton_revisions (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision > 0),
  parent_revision_id TEXT REFERENCES candidate_skeleton_revisions(id),
  payload_schema_version INTEGER NOT NULL CHECK (payload_schema_version > 0),
  structured_payload_json TEXT NOT NULL CHECK (
    json_valid(structured_payload_json)
    AND json_type(structured_payload_json) = 'object'
  ),
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  source_fingerprint TEXT NOT NULL CHECK (length(source_fingerprint) = 64),
  edited_by TEXT NOT NULL CHECK (edited_by IN ('ai', 'author')),
  created_at TEXT NOT NULL,
  UNIQUE(candidate_id, revision)
) STRICT;

CREATE INDEX idx_candidate_skeleton_revisions_current
ON candidate_skeleton_revisions(candidate_id, revision DESC, id DESC);

CREATE TRIGGER candidate_skeleton_revision_requires_skeleton
BEFORE INSERT ON candidate_skeleton_revisions
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
      FROM candidates candidate
     WHERE candidate.id = NEW.candidate_id
       AND candidate.candidate_type = 'skeleton'
  ) THEN RAISE(ABORT, 'SKELETON_REVISION_CANDIDATE_INVALID') END;
END;

CREATE TRIGGER candidate_skeleton_revision_parent_guard
BEFORE INSERT ON candidate_skeleton_revisions
WHEN NEW.parent_revision_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
      FROM candidate_skeleton_revisions parent
     WHERE parent.id = NEW.parent_revision_id
       AND parent.candidate_id = NEW.candidate_id
       AND parent.revision = NEW.revision - 1
  ) THEN RAISE(ABORT, 'SKELETON_REVISION_PARENT_INVALID') END;
END;

CREATE TRIGGER candidate_blocks_reject_skeleton
BEFORE INSERT ON candidate_blocks
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM candidates candidate
     WHERE candidate.id = NEW.candidate_id
       AND candidate.candidate_type = 'skeleton'
  ) THEN RAISE(ABORT, 'SKELETON_BLOCKS_FORBIDDEN') END;
END;

CREATE TABLE generation_input_sources (
  run_id TEXT NOT NULL REFERENCES generation_runs(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (
    source_type IN (
      'chapter_goal', 'skeleton_candidate', 'scene_beat', 'draft_block',
      'candidate', 'current_draft', 'generation_run'
    )
  ),
  source_id TEXT NOT NULL,
  source_order INTEGER NOT NULL CHECK (source_order >= 0),
  content_hash TEXT CHECK (content_hash IS NULL OR length(content_hash) = 64),
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (
    json_valid(metadata_json) AND json_type(metadata_json) = 'object'
  ),
  created_at TEXT NOT NULL,
  PRIMARY KEY (run_id, source_type, source_id, source_order)
) WITHOUT ROWID, STRICT;

CREATE INDEX idx_generation_input_sources_source
ON generation_input_sources(source_type, source_id, run_id);

CREATE TABLE candidate_source_mappings (
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  mapping_type TEXT NOT NULL CHECK (mapping_type IN ('rewrite', 'beat', 'segment')),
  source_unit_id TEXT NOT NULL,
  source_order INTEGER NOT NULL CHECK (source_order >= 0),
  source_candidate_id TEXT REFERENCES candidates(id),
  scene_beat_id TEXT REFERENCES scene_beats(id),
  source_block_ids_json TEXT NOT NULL CHECK (
    json_valid(source_block_ids_json) AND json_type(source_block_ids_json) = 'array'
  ),
  keep_current_draft INTEGER NOT NULL DEFAULT 0 CHECK (keep_current_draft IN (0, 1)),
  range_anchor_json TEXT CHECK (
    range_anchor_json IS NULL
    OR (json_valid(range_anchor_json) AND json_type(range_anchor_json) = 'object')
  ),
  created_at TEXT NOT NULL,
  PRIMARY KEY (candidate_id, mapping_type, source_unit_id)
) WITHOUT ROWID, STRICT;

CREATE INDEX idx_candidate_source_mappings_source_candidate
ON candidate_source_mappings(source_candidate_id, candidate_id);

UPDATE projects SET schema_version = 24;
