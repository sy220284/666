ALTER TABLE draft_patch_log
ADD COLUMN mutation_origin TEXT NOT NULL DEFAULT 'system'
CHECK (
  mutation_origin IN (
    'manual_edit', 'candidate_apply', 'import', 'safe_replace',
    'structure', 'restore', 'system'
  )
);

CREATE INDEX idx_draft_patch_log_origin_created
ON draft_patch_log(mutation_origin, created_at, draft_id);

CREATE TABLE replace_plans (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  query TEXT NOT NULL CHECK (length(query) BETWEEN 1 AND 500),
  replacement TEXT NOT NULL CHECK (length(replacement) <= 2000),
  match_case INTEGER NOT NULL CHECK (match_case IN (0, 1)),
  status TEXT NOT NULL CHECK (status IN ('preview', 'applied', 'stale')),
  item_count INTEGER NOT NULL CHECK (item_count >= 0),
  eligible_count INTEGER NOT NULL CHECK (eligible_count >= 0),
  locked_count INTEGER NOT NULL CHECK (locked_count >= 0),
  checkpoint_id TEXT REFERENCES backup_records(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  applied_at TEXT,
  UNIQUE(id, project_id),
  CHECK (
    (status = 'preview' AND applied_at IS NULL AND checkpoint_id IS NULL)
    OR (status = 'stale' AND applied_at IS NULL)
    OR (status = 'applied' AND applied_at IS NOT NULL AND checkpoint_id IS NOT NULL)
  )
) STRICT;

CREATE TABLE replace_plan_items (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES replace_plans(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  logical_block_id TEXT NOT NULL,
  base_revision INTEGER NOT NULL CHECK (base_revision >= 0),
  expected_block_hash TEXT NOT NULL CHECK (length(expected_block_hash) = 64),
  matched_text TEXT NOT NULL CHECK (length(matched_text) BETWEEN 1 AND 500),
  match_start INTEGER NOT NULL CHECK (match_start >= 0),
  match_end INTEGER NOT NULL CHECK (match_end > match_start),
  replacement TEXT NOT NULL CHECK (length(replacement) <= 2000),
  locked INTEGER NOT NULL CHECK (locked IN (0, 1)),
  created_at TEXT NOT NULL,
  UNIQUE(plan_id, draft_id, logical_block_id, match_start, match_end),
  FOREIGN KEY(plan_id, project_id)
    REFERENCES replace_plans(id, project_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_replace_plan_items_plan_draft
ON replace_plan_items(plan_id, draft_id, logical_block_id, match_start);

CREATE TRIGGER trg_replace_plan_item_scope
BEFORE INSERT ON replace_plan_items
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
      FROM drafts draft
      JOIN chapters chapter ON chapter.id = draft.chapter_id
      JOIN volumes volume ON volume.id = chapter.volume_id
      JOIN draft_blocks block ON block.draft_id = draft.id
     WHERE draft.id = NEW.draft_id
       AND draft.status = 'active'
       AND chapter.active_draft_id = draft.id
       AND chapter.id = NEW.chapter_id
       AND volume.project_id = NEW.project_id
       AND block.logical_block_id = NEW.logical_block_id
       AND block.content_hash = NEW.expected_block_hash
  ) THEN RAISE(ABORT, 'REPLACE_PLAN_ITEM_SCOPE_INVALID') END;
END;

CREATE TABLE genre_rhythm_profiles (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (length(trim(channel)) BETWEEN 1 AND 120),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  excitement_min_per_1000 REAL NOT NULL CHECK (excitement_min_per_1000 >= 0),
  excitement_max_per_1000 REAL NOT NULL CHECK (
    excitement_max_per_1000 >= excitement_min_per_1000
  ),
  hook_enabled INTEGER NOT NULL CHECK (hook_enabled IN (0, 1)),
  golden_three_enabled INTEGER NOT NULL CHECK (golden_three_enabled IN (0, 1)),
  target_daily_characters INTEGER NOT NULL CHECK (target_daily_characters >= 0),
  idle_threshold_seconds INTEGER NOT NULL CHECK (
    idle_threshold_seconds BETWEEN 30 AND 7200
  ),
  time_zone TEXT NOT NULL CHECK (length(time_zone) BETWEEN 1 AND 120),
  statistics_started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE writing_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
  day_key TEXT NOT NULL CHECK (day_key GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  started_at TEXT NOT NULL,
  last_input_at TEXT NOT NULL,
  active_seconds INTEGER NOT NULL CHECK (active_seconds >= 0),
  net_characters INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX idx_writing_sessions_project_day
ON writing_sessions(project_id, day_key, last_input_at, id);

UPDATE draft_patch_log
SET mutation_origin = 'system';

UPDATE projects SET schema_version = 26;
