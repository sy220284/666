CREATE TABLE state_proposal_batches (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE RESTRICT,
  source_version_id TEXT NOT NULL REFERENCES versions(id) ON DELETE RESTRICT,
  generation_run_id TEXT REFERENCES generation_runs(id) ON DELETE RESTRICT,
  source TEXT NOT NULL CHECK (source IN ('rule', 'provider_stub', 'provider')),
  proposal_count INTEGER NOT NULL CHECK (proposal_count >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'resolved', 'rejected', 'mixed')),
  created_at TEXT NOT NULL,
  UNIQUE(id, project_id),
  CHECK (
    (source = 'provider' AND generation_run_id IS NOT NULL)
    OR (source <> 'provider' AND generation_run_id IS NULL)
  )
) STRICT;

CREATE INDEX idx_state_proposal_batches_project_created
ON state_proposal_batches(project_id, chapter_id, created_at DESC, id DESC);

ALTER TABLE state_proposals RENAME TO state_proposals_legacy_0025;

INSERT INTO state_proposal_batches(
  id, project_id, chapter_id, source_version_id, generation_run_id,
  source, proposal_count, status, created_at
)
SELECT id, project_id, chapter_id, source_version_id, NULL,
       source, 1,
       CASE status
         WHEN 'pending' THEN 'pending'
         WHEN 'rejected' THEN 'rejected'
         ELSE 'resolved'
       END,
       created_at
  FROM state_proposals_legacy_0025;

CREATE TABLE state_proposals (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES state_proposal_batches(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE RESTRICT,
  source_version_id TEXT NOT NULL REFERENCES versions(id) ON DELETE RESTRICT,
  proposal_type TEXT NOT NULL CHECK (proposal_type IN ('entity_state', 'arc_milestone')),
  source TEXT NOT NULL CHECK (source IN ('rule', 'provider_stub', 'provider')),
  entity_id TEXT,
  state_key TEXT CHECK (state_key IS NULL OR length(trim(state_key)) BETWEEN 1 AND 120),
  arc_milestone_id TEXT,
  previous_value_json TEXT,
  proposed_value_json TEXT NOT NULL CHECK (json_valid(proposed_value_json)),
  evidence_json TEXT NOT NULL CHECK (
    json_valid(evidence_json) AND json_array_length(evidence_json) > 0
  ),
  confidence REAL NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'edited', 'rejected')),
  resolved_value_json TEXT CHECK (
    resolved_value_json IS NULL OR json_valid(resolved_value_json)
  ),
  valid_until_chapter_id TEXT REFERENCES chapters(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  UNIQUE(id, project_id),
  FOREIGN KEY(entity_id, project_id)
    REFERENCES entities(id, project_id) ON DELETE RESTRICT,
  FOREIGN KEY(arc_milestone_id, project_id)
    REFERENCES arc_milestones(id, project_id) ON DELETE RESTRICT,
  CHECK (
    (proposal_type = 'entity_state' AND entity_id IS NOT NULL AND state_key IS NOT NULL
      AND arc_milestone_id IS NULL)
    OR
    (proposal_type = 'arc_milestone' AND entity_id IS NULL AND state_key IS NULL
      AND arc_milestone_id IS NOT NULL)
  ),
  CHECK (
    (status = 'pending' AND resolved_at IS NULL AND resolved_value_json IS NULL)
    OR (status <> 'pending' AND resolved_at IS NOT NULL)
  )
) STRICT;

INSERT INTO state_proposals(
  id, batch_id, project_id, chapter_id, source_version_id, proposal_type, source,
  entity_id, state_key, arc_milestone_id, previous_value_json, proposed_value_json,
  evidence_json, confidence, status, resolved_value_json, valid_until_chapter_id,
  created_at, resolved_at
)
SELECT id, id, project_id, chapter_id, source_version_id, proposal_type, source,
       entity_id, state_key, arc_milestone_id, previous_value_json, proposed_value_json,
       evidence_json, confidence, status, resolved_value_json, valid_until_chapter_id,
       created_at, resolved_at
  FROM state_proposals_legacy_0025;

DROP TABLE state_proposals_legacy_0025;

CREATE INDEX idx_state_proposals_project_chapter
ON state_proposals(project_id, chapter_id, status, created_at, id);

CREATE INDEX idx_state_proposals_batch
ON state_proposals(batch_id, status, created_at, id);

CREATE UNIQUE INDEX idx_state_proposals_pending_entity
ON state_proposals(project_id, chapter_id, source_version_id, entity_id, state_key)
WHERE status = 'pending' AND proposal_type = 'entity_state';

CREATE UNIQUE INDEX idx_state_proposals_pending_milestone
ON state_proposals(project_id, chapter_id, source_version_id, arc_milestone_id)
WHERE status = 'pending' AND proposal_type = 'arc_milestone';

CREATE TRIGGER trg_state_proposals_validate_interval_insert
BEFORE INSERT ON state_proposals
BEGIN
  SELECT CASE
    WHEN NEW.proposal_type = 'arc_milestone' AND NEW.valid_until_chapter_id IS NOT NULL
      THEN RAISE(ABORT, 'ARC_MILESTONE_PROPOSAL_INTERVAL_FORBIDDEN')
    WHEN NEW.valid_until_chapter_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
        FROM chapters start_chapter
        JOIN volumes start_volume ON start_volume.id = start_chapter.volume_id
        JOIN chapters end_chapter ON end_chapter.id = NEW.valid_until_chapter_id
        JOIN volumes end_volume ON end_volume.id = end_chapter.volume_id
       WHERE start_chapter.id = NEW.chapter_id
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
    ) THEN RAISE(ABORT, 'STATE_PROPOSAL_INTERVAL_INVALID')
  END;
END;

CREATE TRIGGER trg_state_proposals_validate_interval_update
BEFORE UPDATE OF project_id, chapter_id, proposal_type, valid_until_chapter_id ON state_proposals
BEGIN
  SELECT CASE
    WHEN NEW.proposal_type = 'arc_milestone' AND NEW.valid_until_chapter_id IS NOT NULL
      THEN RAISE(ABORT, 'ARC_MILESTONE_PROPOSAL_INTERVAL_FORBIDDEN')
    WHEN NEW.valid_until_chapter_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
        FROM chapters start_chapter
        JOIN volumes start_volume ON start_volume.id = start_chapter.volume_id
        JOIN chapters end_chapter ON end_chapter.id = NEW.valid_until_chapter_id
        JOIN volumes end_volume ON end_volume.id = end_chapter.volume_id
       WHERE start_chapter.id = NEW.chapter_id
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
    ) THEN RAISE(ABORT, 'STATE_PROPOSAL_INTERVAL_INVALID')
  END;
END;

ALTER TABLE generation_input_sources RENAME TO generation_input_sources_legacy_0025;

CREATE TABLE generation_input_sources (
  run_id TEXT NOT NULL REFERENCES generation_runs(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (
    source_type IN (
      'chapter_goal', 'skeleton_candidate', 'scene_beat', 'draft_block',
      'candidate', 'current_draft', 'generation_run', 'version'
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

INSERT INTO generation_input_sources(
  run_id, source_type, source_id, source_order, content_hash, metadata_json, created_at
)
SELECT run_id, source_type, source_id, source_order, content_hash, metadata_json, created_at
  FROM generation_input_sources_legacy_0025;

DROP TABLE generation_input_sources_legacy_0025;

CREATE INDEX idx_generation_input_sources_source
ON generation_input_sources(source_type, source_id, run_id);

CREATE TABLE validation_batches (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE RESTRICT,
  source_version_id TEXT NOT NULL REFERENCES versions(id) ON DELETE RESTRICT,
  generation_run_id TEXT REFERENCES generation_runs(id) ON DELETE RESTRICT,
  source TEXT NOT NULL CHECK (source IN ('rule', 'ai')),
  rule_version TEXT,
  config_version TEXT,
  input_fingerprint TEXT CHECK (
    input_fingerprint IS NULL OR length(input_fingerprint) = 64
  ),
  issue_count INTEGER NOT NULL CHECK (issue_count >= 0),
  created_at TEXT NOT NULL,
  UNIQUE(id, project_id),
  CHECK (
    (source = 'ai' AND generation_run_id IS NOT NULL
      AND rule_version IS NULL AND config_version IS NULL)
    OR
    (source = 'rule' AND generation_run_id IS NULL
      AND rule_version IS NOT NULL AND config_version IS NOT NULL
      AND input_fingerprint IS NOT NULL)
  )
) STRICT;

CREATE UNIQUE INDEX idx_validation_batches_rule_fingerprint
ON validation_batches(project_id, source_version_id, input_fingerprint)
WHERE source = 'rule';

CREATE INDEX idx_validation_batches_project_created
ON validation_batches(project_id, chapter_id, created_at DESC, id DESC);

CREATE TABLE validation_issues (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES validation_batches(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE RESTRICT,
  source_version_id TEXT REFERENCES versions(id) ON DELETE RESTRICT,
  logical_block_id TEXT,
  expected_block_hash TEXT CHECK (
    expected_block_hash IS NULL OR length(expected_block_hash) = 64
  ),
  text_quote TEXT,
  range_hint_json TEXT CHECK (
    range_hint_json IS NULL
    OR (json_valid(range_hint_json) AND json_type(range_hint_json) = 'object')
  ),
  issue_type TEXT NOT NULL CHECK (length(trim(issue_type)) BETWEEN 1 AND 120),
  source TEXT NOT NULL CHECK (source IN ('rule', 'ai')),
  severity TEXT NOT NULL CHECK (severity IN ('high', 'medium', 'low', 'info')),
  rationale TEXT NOT NULL CHECK (length(trim(rationale)) BETWEEN 1 AND 8000),
  evidence_ids_json TEXT NOT NULL CHECK (
    json_valid(evidence_ids_json) AND json_type(evidence_ids_json) = 'array'
  ),
  suggestion TEXT,
  confidence REAL CHECK (confidence IS NULL OR (confidence >= 0.0 AND confidence <= 1.0)),
  rule_id TEXT,
  rule_version TEXT,
  config_version TEXT,
  status TEXT NOT NULL CHECK (
    status IN ('open', 'resolved', 'ignored', 'muted', 'false_positive')
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(id, project_id),
  CHECK (
    (source = 'rule' AND rule_id IS NOT NULL
      AND rule_version IS NOT NULL AND config_version IS NOT NULL)
    OR
    (source = 'ai' AND rule_id IS NULL
      AND rule_version IS NULL AND config_version IS NULL)
  )
) STRICT;

CREATE INDEX idx_validation_issues_project_status
ON validation_issues(project_id, status, severity, created_at DESC, id);

CREATE INDEX idx_validation_issues_version_block
ON validation_issues(source_version_id, logical_block_id, expected_block_hash);

CREATE TABLE story_todos (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE RESTRICT,
  scene_beat_id TEXT REFERENCES scene_beats(id) ON DELETE RESTRICT,
  logical_block_id TEXT,
  validation_issue_id TEXT REFERENCES validation_issues(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 240),
  status TEXT NOT NULL CHECK (status IN ('open', 'done')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE(id, project_id),
  CHECK (
    (status = 'open' AND completed_at IS NULL)
    OR (status = 'done' AND completed_at IS NOT NULL)
  )
) STRICT;

CREATE INDEX idx_story_todos_project_status
ON story_todos(project_id, status, updated_at DESC, id);

CREATE TABLE story_comments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE RESTRICT,
  source_version_id TEXT REFERENCES versions(id) ON DELETE RESTRICT,
  logical_block_id TEXT,
  validation_issue_id TEXT REFERENCES validation_issues(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 8000),
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT,
  UNIQUE(id, project_id),
  CHECK (
    (status = 'open' AND resolved_at IS NULL)
    OR (status = 'resolved' AND resolved_at IS NOT NULL)
  )
) STRICT;

CREATE INDEX idx_story_comments_project_status
ON story_comments(project_id, status, updated_at DESC, id);

ALTER TABLE generation_result_refs RENAME TO generation_result_refs_legacy_0025;

CREATE TABLE generation_result_refs (
  run_id TEXT NOT NULL REFERENCES generation_runs(id) ON DELETE CASCADE,
  result_type TEXT NOT NULL CHECK (
    result_type IN ('candidate', 'state_proposal_batch', 'validation_batch')
  ),
  result_id TEXT NOT NULL,
  candidate_kind TEXT CHECK (candidate_kind IN ('prose', 'skeleton')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (run_id, result_type, result_id),
  CHECK (
    (result_type = 'candidate' AND candidate_kind IS NOT NULL)
    OR (result_type IN ('state_proposal_batch', 'validation_batch')
      AND candidate_kind IS NULL)
  )
) STRICT;

INSERT INTO generation_result_refs(
  run_id, result_type, result_id, candidate_kind, created_at
)
SELECT run_id, result_type, result_id, candidate_kind, created_at
  FROM generation_result_refs_legacy_0025;

DROP TABLE generation_result_refs_legacy_0025;

CREATE TRIGGER generation_candidate_ref_requires_owned_candidate
BEFORE INSERT ON generation_result_refs
WHEN NEW.result_type = 'candidate'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
      FROM candidates candidate
     WHERE candidate.id = NEW.result_id
       AND candidate.generation_run_id = NEW.run_id
  ) THEN RAISE(ABORT, 'GENERATION_CANDIDATE_REF_INVALID') END;
END;

CREATE TRIGGER generation_state_batch_ref_requires_owned_batch
BEFORE INSERT ON generation_result_refs
WHEN NEW.result_type = 'state_proposal_batch'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
      FROM state_proposal_batches batch
     WHERE batch.id = NEW.result_id
       AND batch.generation_run_id = NEW.run_id
  ) THEN RAISE(ABORT, 'GENERATION_STATE_BATCH_REF_INVALID') END;
END;

CREATE TRIGGER generation_validation_batch_ref_requires_owned_batch
BEFORE INSERT ON generation_result_refs
WHEN NEW.result_type = 'validation_batch'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
      FROM validation_batches batch
     WHERE batch.id = NEW.result_id
       AND batch.generation_run_id = NEW.run_id
  ) THEN RAISE(ABORT, 'GENERATION_VALIDATION_BATCH_REF_INVALID') END;
END;

CREATE TRIGGER trg_state_proposal_batch_scope_insert
BEFORE INSERT ON state_proposal_batches
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
      FROM versions version
      JOIN chapters chapter ON chapter.id = version.chapter_id
      JOIN volumes volume ON volume.id = chapter.volume_id
     WHERE version.id = NEW.source_version_id
       AND chapter.id = NEW.chapter_id
       AND volume.project_id = NEW.project_id
       AND chapter.final_version_id = version.id
  ) THEN RAISE(ABORT, 'STATE_PROPOSAL_BATCH_VERSION_SCOPE_INVALID') END;
  SELECT CASE WHEN NEW.source = 'provider' AND NOT EXISTS (
    SELECT 1
      FROM generation_runs run
     WHERE run.id = NEW.generation_run_id
       AND run.project_id = NEW.project_id
       AND run.chapter_id = NEW.chapter_id
       AND run.run_type = 'state_extract'
  ) THEN RAISE(ABORT, 'STATE_PROPOSAL_BATCH_RUN_SCOPE_INVALID') END;
END;

CREATE TRIGGER trg_state_proposal_scope_insert
BEFORE INSERT ON state_proposals
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
      FROM state_proposal_batches batch
     WHERE batch.id = NEW.batch_id
       AND batch.project_id = NEW.project_id
       AND batch.chapter_id = NEW.chapter_id
       AND batch.source_version_id = NEW.source_version_id
       AND batch.source = NEW.source
  ) THEN RAISE(ABORT, 'STATE_PROPOSAL_BATCH_SCOPE_INVALID') END;
END;

CREATE TRIGGER trg_validation_batch_scope_insert
BEFORE INSERT ON validation_batches
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
      FROM versions version
      JOIN chapters chapter ON chapter.id = version.chapter_id
      JOIN volumes volume ON volume.id = chapter.volume_id
     WHERE version.id = NEW.source_version_id
       AND chapter.id = NEW.chapter_id
       AND volume.project_id = NEW.project_id
       AND chapter.final_version_id = version.id
  ) THEN RAISE(ABORT, 'VALIDATION_BATCH_VERSION_SCOPE_INVALID') END;
  SELECT CASE WHEN NEW.source = 'ai' AND NOT EXISTS (
    SELECT 1
      FROM generation_runs run
     WHERE run.id = NEW.generation_run_id
       AND run.project_id = NEW.project_id
       AND run.chapter_id = NEW.chapter_id
       AND run.run_type = 'validate'
  ) THEN RAISE(ABORT, 'VALIDATION_BATCH_RUN_SCOPE_INVALID') END;
END;

CREATE TRIGGER trg_validation_issue_scope_insert
BEFORE INSERT ON validation_issues
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
      FROM validation_batches batch
     WHERE batch.id = NEW.batch_id
       AND batch.project_id = NEW.project_id
       AND batch.chapter_id IS NEW.chapter_id
       AND batch.source_version_id IS NEW.source_version_id
       AND batch.source = NEW.source
  ) THEN RAISE(ABORT, 'VALIDATION_ISSUE_BATCH_SCOPE_INVALID') END;
  SELECT CASE WHEN NEW.logical_block_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM version_blocks block
     WHERE block.version_id = NEW.source_version_id
       AND block.logical_block_id = NEW.logical_block_id
       AND (
         NEW.expected_block_hash IS NULL
         OR block.content_hash = NEW.expected_block_hash
       )
  ) THEN RAISE(ABORT, 'VALIDATION_ISSUE_BLOCK_SCOPE_INVALID') END;
END;

CREATE TRIGGER trg_story_todo_scope_insert
BEFORE INSERT ON story_todos
BEGIN
  SELECT CASE WHEN NEW.chapter_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM chapters chapter
      JOIN volumes volume ON volume.id = chapter.volume_id
     WHERE chapter.id = NEW.chapter_id AND volume.project_id = NEW.project_id
  ) THEN RAISE(ABORT, 'STORY_TODO_CHAPTER_SCOPE_INVALID') END;
  SELECT CASE WHEN NEW.scene_beat_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM scene_beats beat
     WHERE beat.id = NEW.scene_beat_id AND beat.project_id = NEW.project_id
  ) THEN RAISE(ABORT, 'STORY_TODO_BEAT_SCOPE_INVALID') END;
  SELECT CASE WHEN NEW.validation_issue_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM validation_issues issue
     WHERE issue.id = NEW.validation_issue_id AND issue.project_id = NEW.project_id
  ) THEN RAISE(ABORT, 'STORY_TODO_ISSUE_SCOPE_INVALID') END;
END;

CREATE TRIGGER trg_story_comment_scope_insert
BEFORE INSERT ON story_comments
BEGIN
  SELECT CASE WHEN NEW.chapter_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM chapters chapter
      JOIN volumes volume ON volume.id = chapter.volume_id
     WHERE chapter.id = NEW.chapter_id AND volume.project_id = NEW.project_id
  ) THEN RAISE(ABORT, 'STORY_COMMENT_CHAPTER_SCOPE_INVALID') END;
  SELECT CASE WHEN NEW.source_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM versions version
      JOIN chapters chapter ON chapter.id = version.chapter_id
      JOIN volumes volume ON volume.id = chapter.volume_id
     WHERE version.id = NEW.source_version_id
       AND volume.project_id = NEW.project_id
  ) THEN RAISE(ABORT, 'STORY_COMMENT_VERSION_SCOPE_INVALID') END;
  SELECT CASE WHEN NEW.validation_issue_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM validation_issues issue
     WHERE issue.id = NEW.validation_issue_id AND issue.project_id = NEW.project_id
  ) THEN RAISE(ABORT, 'STORY_COMMENT_ISSUE_SCOPE_INVALID') END;
END;

UPDATE projects SET schema_version = 25;
