CREATE TABLE generation_runs (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  task_id TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  base_draft_id TEXT REFERENCES drafts(id),
  base_draft_revision INTEGER CHECK (base_draft_revision IS NULL OR base_draft_revision >= 0),
  run_type TEXT NOT NULL CHECK (
    run_type IN ('skeleton', 'chapter', 'rewrite', 'merge', 'validate', 'state_extract')
  ),
  prompt_id TEXT NOT NULL,
  prompt_version INTEGER NOT NULL CHECK (prompt_version > 0),
  output_mode TEXT NOT NULL CHECK (output_mode IN ('structured', 'text')),
  provider_id TEXT NOT NULL,
  actual_model TEXT NOT NULL,
  support_status TEXT NOT NULL CHECK (
    support_status IN ('verified', 'limited', 'unverified')
  ),
  status TEXT NOT NULL CHECK (
    status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')
  ),
  stage TEXT NOT NULL CHECK (
    stage IN (
      'queued', 'assembling_constraints', 'calling_model', 'receiving_output',
      'parsing_output', 'saving_candidate', 'validating_candidate', 'completed',
      'failed', 'cancelled'
    )
  ),
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0),
  error_code TEXT,
  retryable INTEGER CHECK (retryable IS NULL OR retryable IN (0, 1)),
  partial_status TEXT NOT NULL DEFAULT 'unavailable' CHECK (
    partial_status IN ('unavailable', 'available', 'saved', 'discarded')
  ),
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  CHECK (
    (status IN ('queued', 'running') AND finished_at IS NULL)
    OR (status IN ('succeeded', 'failed', 'cancelled') AND finished_at IS NOT NULL)
  ),
  CHECK (
    (status = 'failed' AND error_code IS NOT NULL AND retryable IS NOT NULL)
    OR (status <> 'failed')
  )
) STRICT;

CREATE INDEX idx_generation_runs_chapter_created
ON generation_runs(chapter_id, created_at DESC, id DESC);

CREATE INDEX idx_generation_runs_project_status
ON generation_runs(project_id, status, created_at DESC);

CREATE TABLE generation_constraint_packages (
  run_id TEXT PRIMARY KEY REFERENCES generation_runs(id) ON DELETE CASCADE,
  constraint_hash TEXT NOT NULL CHECK (length(constraint_hash) = 64),
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  snapshot_source TEXT NOT NULL CHECK (snapshot_source IN ('snapshot', 'fallback_live_query')),
  source_version_ids_json TEXT NOT NULL CHECK (json_valid(source_version_ids_json)),
  sources_json TEXT NOT NULL CHECK (json_valid(sources_json)),
  estimated_tokens INTEGER NOT NULL CHECK (estimated_tokens >= 0),
  trim_log_json TEXT NOT NULL CHECK (json_valid(trim_log_json)),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE generation_result_refs (
  run_id TEXT NOT NULL REFERENCES generation_runs(id) ON DELETE CASCADE,
  result_type TEXT NOT NULL CHECK (result_type IN ('candidate', 'state_proposal_batch')),
  result_id TEXT NOT NULL,
  candidate_kind TEXT CHECK (candidate_kind IN ('prose', 'skeleton')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (run_id, result_type, result_id),
  CHECK (
    (result_type = 'candidate' AND candidate_kind IS NOT NULL)
    OR (result_type = 'state_proposal_batch' AND candidate_kind IS NULL)
  )
) STRICT;

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

CREATE TABLE generation_partial_buffers (
  run_id TEXT PRIMARY KEY REFERENCES generation_runs(id) ON DELETE CASCADE,
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 2000000),
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  received_characters INTEGER NOT NULL CHECK (received_characters > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE model_support_profiles (
  provider_id TEXT NOT NULL,
  model TEXT NOT NULL,
  task_type TEXT NOT NULL CHECK (
    task_type IN ('skeleton', 'chapter', 'rewrite', 'merge', 'validate', 'state_extract')
  ),
  prompt_id TEXT NOT NULL,
  prompt_version INTEGER NOT NULL CHECK (prompt_version > 0),
  status TEXT NOT NULL CHECK (status IN ('verified', 'limited', 'unverified')),
  evaluated_at TEXT,
  fixture_set_version TEXT,
  metrics_json TEXT CHECK (metrics_json IS NULL OR json_valid(metrics_json)),
  limitations_json TEXT NOT NULL CHECK (json_valid(limitations_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (provider_id, model, task_type, prompt_id, prompt_version)
) STRICT;

UPDATE projects SET schema_version = 23;
