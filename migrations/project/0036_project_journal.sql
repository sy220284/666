-- migration-policy: allow-unscoped-write
-- M12-01: local Project Journal. Journal rows are derived review artifacts only;
-- authoritative story facts remain in their existing domain tables.

DROP TRIGGER IF EXISTS trg_generation_runs_scope_insert;
DROP TRIGGER IF EXISTS trg_generation_runs_scope_update;
DROP TRIGGER IF EXISTS trg_state_proposal_batch_scope_insert;
DROP TRIGGER IF EXISTS trg_validation_batch_scope_insert;
DROP TRIGGER IF EXISTS trg_idea_card_generation_scope_insert;

ALTER TABLE generation_runs
ADD COLUMN run_type_m12_01 TEXT;

UPDATE generation_runs
SET run_type_m12_01 = run_type;

ALTER TABLE generation_runs
DROP COLUMN run_type;

ALTER TABLE generation_runs
ADD COLUMN run_type TEXT NOT NULL DEFAULT 'skeleton'
CHECK (
  run_type IN (
    'skeleton', 'chapter', 'rewrite', 'merge', 'validate', 'state_extract',
    'idea_explore', 'journal_summarize'
  )
);

UPDATE generation_runs
SET run_type = run_type_m12_01;

ALTER TABLE generation_runs
DROP COLUMN run_type_m12_01;

CREATE TRIGGER trg_generation_runs_scope_insert
BEFORE INSERT ON generation_runs
BEGIN
  SELECT CASE WHEN NEW.scope_id IS NULL OR length(trim(NEW.scope_id)) = 0
    THEN RAISE(ABORT, 'GENERATION_SCOPE_REQUIRED') END;

  SELECT CASE WHEN NEW.run_type NOT IN ('idea_explore', 'journal_summarize') AND (
    NEW.scope_type <> 'chapter'
    OR NEW.chapter_id IS NULL
    OR NEW.scope_id <> NEW.chapter_id
  ) THEN RAISE(ABORT, 'GENERATION_LEGACY_SCOPE_INVALID') END;

  SELECT CASE WHEN NEW.run_type = 'journal_summarize' AND (
    NEW.scope_type <> 'project'
    OR NEW.scope_id <> NEW.project_id
    OR NEW.chapter_id IS NOT NULL
  ) THEN RAISE(ABORT, 'GENERATION_JOURNAL_SCOPE_INVALID') END;

  SELECT CASE WHEN NEW.scope_type = 'project' AND NEW.scope_id <> NEW.project_id
    THEN RAISE(ABORT, 'GENERATION_PROJECT_SCOPE_INVALID') END;

  SELECT CASE WHEN NEW.scope_type = 'volume' AND NOT EXISTS (
    SELECT 1 FROM volumes volume
     WHERE volume.id = NEW.scope_id
       AND volume.project_id = NEW.project_id
       AND volume.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'GENERATION_VOLUME_SCOPE_INVALID') END;

  SELECT CASE WHEN NEW.scope_type = 'chapter' AND NOT EXISTS (
    SELECT 1
      FROM chapters chapter
      JOIN volumes volume ON volume.id = chapter.volume_id
     WHERE chapter.id = NEW.scope_id
       AND volume.project_id = NEW.project_id
       AND chapter.deleted_at IS NULL
       AND volume.deleted_at IS NULL
       AND NEW.chapter_id = NEW.scope_id
  ) THEN RAISE(ABORT, 'GENERATION_CHAPTER_SCOPE_INVALID') END;

  SELECT CASE WHEN NEW.scope_type = 'scene' AND NOT EXISTS (
    SELECT 1 FROM scene_beats beat
     WHERE beat.id = NEW.scope_id
       AND beat.project_id = NEW.project_id
       AND beat.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'GENERATION_SCENE_SCOPE_INVALID') END;

  SELECT CASE WHEN NEW.scope_type = 'entity' AND NOT EXISTS (
    SELECT 1 FROM entities entity
     WHERE entity.id = NEW.scope_id
       AND entity.project_id = NEW.project_id
       AND entity.status = 'active'
  ) THEN RAISE(ABORT, 'GENERATION_ENTITY_SCOPE_INVALID') END;

  SELECT CASE WHEN NEW.scope_type = 'selection' AND NOT EXISTS (
    SELECT 1
      FROM draft_blocks block
      JOIN drafts draft ON draft.id = block.draft_id
      JOIN chapters chapter ON chapter.id = draft.chapter_id
      JOIN volumes volume ON volume.id = chapter.volume_id
     WHERE block.logical_block_id = NEW.scope_id
       AND volume.project_id = NEW.project_id
       AND chapter.active_draft_id = draft.id
       AND draft.status = 'active'
       AND chapter.deleted_at IS NULL
       AND volume.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'GENERATION_SELECTION_SCOPE_INVALID') END;

  SELECT CASE WHEN NEW.chapter_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM chapters chapter
      JOIN volumes volume ON volume.id = chapter.volume_id
     WHERE chapter.id = NEW.chapter_id
       AND volume.project_id = NEW.project_id
       AND chapter.deleted_at IS NULL
       AND volume.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'GENERATION_COMPAT_CHAPTER_SCOPE_INVALID') END;
END;

CREATE TRIGGER trg_generation_runs_scope_update
BEFORE UPDATE OF project_id, scope_type, scope_id, chapter_id, run_type ON generation_runs
BEGIN
  SELECT CASE WHEN NEW.scope_id IS NULL OR length(trim(NEW.scope_id)) = 0
    THEN RAISE(ABORT, 'GENERATION_SCOPE_REQUIRED') END;

  SELECT CASE WHEN NEW.run_type NOT IN ('idea_explore', 'journal_summarize') AND (
    NEW.scope_type <> 'chapter'
    OR NEW.chapter_id IS NULL
    OR NEW.scope_id <> NEW.chapter_id
  ) THEN RAISE(ABORT, 'GENERATION_LEGACY_SCOPE_INVALID') END;

  SELECT CASE WHEN NEW.run_type = 'journal_summarize' AND (
    NEW.scope_type <> 'project'
    OR NEW.scope_id <> NEW.project_id
    OR NEW.chapter_id IS NOT NULL
  ) THEN RAISE(ABORT, 'GENERATION_JOURNAL_SCOPE_INVALID') END;

  SELECT CASE WHEN NEW.scope_type = 'project' AND NEW.scope_id <> NEW.project_id
    THEN RAISE(ABORT, 'GENERATION_PROJECT_SCOPE_INVALID') END;

  SELECT CASE WHEN NEW.scope_type = 'volume' AND NOT EXISTS (
    SELECT 1 FROM volumes volume
     WHERE volume.id = NEW.scope_id
       AND volume.project_id = NEW.project_id
       AND volume.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'GENERATION_VOLUME_SCOPE_INVALID') END;

  SELECT CASE WHEN NEW.scope_type = 'chapter' AND NOT EXISTS (
    SELECT 1
      FROM chapters chapter
      JOIN volumes volume ON volume.id = chapter.volume_id
     WHERE chapter.id = NEW.scope_id
       AND volume.project_id = NEW.project_id
       AND chapter.deleted_at IS NULL
       AND volume.deleted_at IS NULL
       AND NEW.chapter_id = NEW.scope_id
  ) THEN RAISE(ABORT, 'GENERATION_CHAPTER_SCOPE_INVALID') END;

  SELECT CASE WHEN NEW.scope_type = 'scene' AND NOT EXISTS (
    SELECT 1 FROM scene_beats beat
     WHERE beat.id = NEW.scope_id
       AND beat.project_id = NEW.project_id
       AND beat.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'GENERATION_SCENE_SCOPE_INVALID') END;

  SELECT CASE WHEN NEW.scope_type = 'entity' AND NOT EXISTS (
    SELECT 1 FROM entities entity
     WHERE entity.id = NEW.scope_id
       AND entity.project_id = NEW.project_id
       AND entity.status = 'active'
  ) THEN RAISE(ABORT, 'GENERATION_ENTITY_SCOPE_INVALID') END;

  SELECT CASE WHEN NEW.scope_type = 'selection' AND NOT EXISTS (
    SELECT 1
      FROM draft_blocks block
      JOIN drafts draft ON draft.id = block.draft_id
      JOIN chapters chapter ON chapter.id = draft.chapter_id
      JOIN volumes volume ON volume.id = chapter.volume_id
     WHERE block.logical_block_id = NEW.scope_id
       AND volume.project_id = NEW.project_id
       AND chapter.active_draft_id = draft.id
       AND draft.status = 'active'
       AND chapter.deleted_at IS NULL
       AND volume.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'GENERATION_SELECTION_SCOPE_INVALID') END;

  SELECT CASE WHEN NEW.chapter_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM chapters chapter
      JOIN volumes volume ON volume.id = chapter.volume_id
     WHERE chapter.id = NEW.chapter_id
       AND volume.project_id = NEW.project_id
       AND chapter.deleted_at IS NULL
       AND volume.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'GENERATION_COMPAT_CHAPTER_SCOPE_INVALID') END;
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

CREATE TRIGGER trg_idea_card_generation_scope_insert
BEFORE INSERT ON idea_cards
WHEN NEW.generation_run_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM generation_runs run
     WHERE run.id = NEW.generation_run_id
       AND run.project_id = NEW.project_id
       AND run.run_type = 'idea_explore'
       AND run.scope_type = json_extract(NEW.source_context_json, '$.scopeType')
       AND run.scope_id = json_extract(NEW.source_context_json, '$.scopeId')
  ) THEN RAISE(ABORT, 'IDEA_GENERATION_SCOPE_INVALID') END;
END;

ALTER TABLE model_support_profiles RENAME TO model_support_profiles_legacy_0036;

CREATE TABLE model_support_profiles (
  provider_id TEXT NOT NULL,
  model TEXT NOT NULL,
  task_type TEXT NOT NULL CHECK (
    task_type IN (
      'skeleton', 'chapter', 'rewrite', 'merge', 'validate', 'state_extract',
      'idea_explore', 'journal_summarize'
    )
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

INSERT INTO model_support_profiles(
  provider_id, model, task_type, prompt_id, prompt_version, status,
  evaluated_at, fixture_set_version, metrics_json, limitations_json,
  created_at, updated_at
)
SELECT provider_id, model, task_type, prompt_id, prompt_version, status,
       evaluated_at, fixture_set_version, metrics_json, limitations_json,
       created_at, updated_at
  FROM model_support_profiles_legacy_0036;

DROP TABLE model_support_profiles_legacy_0036;

ALTER TABLE generation_input_sources RENAME TO generation_input_sources_legacy_0036;

CREATE TABLE generation_input_sources (
  run_id TEXT NOT NULL REFERENCES generation_runs(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (
    source_type IN (
      'chapter_goal', 'skeleton_candidate', 'scene_beat', 'draft_block',
      'candidate', 'current_draft', 'generation_run', 'version', 'scope',
      'idea_card', 'journal_entry'
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
  FROM generation_input_sources_legacy_0036;

DROP TABLE generation_input_sources_legacy_0036;

CREATE INDEX idx_generation_input_sources_source
ON generation_input_sources(source_type, source_id, run_id);

CREATE TABLE project_journal_preferences (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  schedule TEXT NOT NULL DEFAULT 'off' CHECK (schedule IN ('off', 'daily', 'weekly')),
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE project_journal_entries (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL CHECK (period_type IN ('manual', 'daily', 'weekly')),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  source_revision INTEGER NOT NULL CHECK (source_revision >= 0),
  source_hash TEXT NOT NULL CHECK (
    length(source_hash) = 64 AND source_hash NOT GLOB '*[^0-9a-f]*'
  ),
  deterministic_summary_json TEXT NOT NULL CHECK (
    json_valid(deterministic_summary_json)
    AND json_type(deterministic_summary_json) = 'object'
  ),
  ai_summary TEXT CHECK (ai_summary IS NULL OR length(ai_summary) <= 40000),
  author_note TEXT CHECK (author_note IS NULL OR length(author_note) <= 20000),
  generation_run_id TEXT REFERENCES generation_runs(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (
    status IN ('deterministic', 'ai_pending', 'ready', 'ai_failed')
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (period_start < period_end),
  CHECK (
    (status = 'ready' AND ai_summary IS NOT NULL AND generation_run_id IS NOT NULL)
    OR (status <> 'ready')
  ),
  UNIQUE(project_id, period_type, period_start, period_end)
) STRICT;

CREATE INDEX idx_project_journal_entries_period
ON project_journal_entries(project_id, period_end DESC, id DESC);

CREATE INDEX idx_project_journal_entries_generation
ON project_journal_entries(generation_run_id)
WHERE generation_run_id IS NOT NULL;

DROP TRIGGER IF EXISTS generation_candidate_ref_requires_owned_candidate;
DROP TRIGGER IF EXISTS generation_state_batch_ref_requires_owned_batch;
DROP TRIGGER IF EXISTS generation_validation_batch_ref_requires_owned_batch;
DROP TRIGGER IF EXISTS generation_idea_ref_requires_owned_idea;

ALTER TABLE generation_result_refs RENAME TO generation_result_refs_legacy_0036;

CREATE TABLE generation_result_refs (
  run_id TEXT NOT NULL REFERENCES generation_runs(id) ON DELETE CASCADE,
  result_type TEXT NOT NULL CHECK (
    result_type IN (
      'candidate', 'state_proposal_batch', 'validation_batch', 'idea_card', 'journal_entry'
    )
  ),
  result_id TEXT NOT NULL,
  candidate_kind TEXT CHECK (candidate_kind IN ('prose', 'skeleton')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (run_id, result_type, result_id),
  CHECK (
    (result_type = 'candidate' AND candidate_kind IS NOT NULL)
    OR (result_type <> 'candidate' AND candidate_kind IS NULL)
  )
) STRICT;

INSERT INTO generation_result_refs(
  run_id, result_type, result_id, candidate_kind, created_at
)
SELECT run_id, result_type, result_id, candidate_kind, created_at
  FROM generation_result_refs_legacy_0036;

DROP TABLE generation_result_refs_legacy_0036;

CREATE TRIGGER generation_candidate_ref_requires_owned_candidate
BEFORE INSERT ON generation_result_refs
WHEN NEW.result_type = 'candidate'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM candidates candidate
     WHERE candidate.id = NEW.result_id
       AND candidate.generation_run_id = NEW.run_id
  ) THEN RAISE(ABORT, 'GENERATION_CANDIDATE_REF_INVALID') END;
END;

CREATE TRIGGER generation_state_batch_ref_requires_owned_batch
BEFORE INSERT ON generation_result_refs
WHEN NEW.result_type = 'state_proposal_batch'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM state_proposal_batches batch
     WHERE batch.id = NEW.result_id
       AND batch.generation_run_id = NEW.run_id
  ) THEN RAISE(ABORT, 'GENERATION_STATE_BATCH_REF_INVALID') END;
END;

CREATE TRIGGER generation_validation_batch_ref_requires_owned_batch
BEFORE INSERT ON generation_result_refs
WHEN NEW.result_type = 'validation_batch'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM validation_batches batch
     WHERE batch.id = NEW.result_id
       AND batch.generation_run_id = NEW.run_id
  ) THEN RAISE(ABORT, 'GENERATION_VALIDATION_BATCH_REF_INVALID') END;
END;

CREATE TRIGGER generation_idea_ref_requires_owned_idea
BEFORE INSERT ON generation_result_refs
WHEN NEW.result_type = 'idea_card'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM idea_cards idea
     WHERE idea.id = NEW.result_id
       AND idea.generation_run_id = NEW.run_id
  ) THEN RAISE(ABORT, 'GENERATION_IDEA_REF_INVALID') END;
END;

CREATE TRIGGER generation_journal_ref_requires_owned_entry
BEFORE INSERT ON generation_result_refs
WHEN NEW.result_type = 'journal_entry'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM project_journal_entries entry
     JOIN generation_runs run ON run.id = NEW.run_id
     WHERE entry.id = NEW.result_id
       AND entry.project_id = run.project_id
       AND entry.generation_run_id = NEW.run_id
       AND run.run_type = 'journal_summarize'
       AND run.scope_type = 'project'
       AND run.scope_id = entry.project_id
  ) THEN RAISE(ABORT, 'GENERATION_JOURNAL_REF_INVALID') END;
END;

UPDATE projects SET schema_version = 36;
