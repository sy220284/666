CREATE TABLE state_proposals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE RESTRICT,
  source_version_id TEXT NOT NULL REFERENCES versions(id) ON DELETE RESTRICT,
  proposal_type TEXT NOT NULL CHECK (proposal_type IN ('entity_state', 'arc_milestone')),
  source TEXT NOT NULL CHECK (source IN ('rule', 'provider_stub')),
  entity_id TEXT,
  state_key TEXT CHECK (state_key IS NULL OR length(trim(state_key)) BETWEEN 1 AND 120),
  arc_milestone_id TEXT,
  previous_value_json TEXT,
  proposed_value_json TEXT NOT NULL CHECK (json_valid(proposed_value_json)),
  evidence_json TEXT NOT NULL CHECK (json_valid(evidence_json) AND json_array_length(evidence_json) > 0),
  confidence REAL NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'edited', 'rejected')),
  resolved_value_json TEXT CHECK (resolved_value_json IS NULL OR json_valid(resolved_value_json)),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  UNIQUE(id, project_id),
  FOREIGN KEY(entity_id, project_id) REFERENCES entities(id, project_id) ON DELETE RESTRICT,
  FOREIGN KEY(arc_milestone_id, project_id)
    REFERENCES arc_milestones(id, project_id) ON DELETE RESTRICT,
  CHECK (
    (proposal_type = 'entity_state' AND entity_id IS NOT NULL AND state_key IS NOT NULL
      AND arc_milestone_id IS NULL) OR
    (proposal_type = 'arc_milestone' AND entity_id IS NULL AND state_key IS NULL
      AND arc_milestone_id IS NOT NULL)
  ),
  CHECK (
    (status = 'pending' AND resolved_at IS NULL AND resolved_value_json IS NULL) OR
    (status <> 'pending' AND resolved_at IS NOT NULL)
  )
) STRICT;

CREATE INDEX idx_state_proposals_project_chapter
ON state_proposals(project_id, chapter_id, status, created_at, id);

CREATE UNIQUE INDEX idx_state_proposals_pending_entity
ON state_proposals(project_id, chapter_id, source_version_id, entity_id, state_key)
WHERE status = 'pending' AND proposal_type = 'entity_state';

CREATE UNIQUE INDEX idx_state_proposals_pending_milestone
ON state_proposals(project_id, chapter_id, source_version_id, arc_milestone_id)
WHERE status = 'pending' AND proposal_type = 'arc_milestone';

CREATE TABLE ending_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE RESTRICT,
  source_version_id TEXT NOT NULL REFERENCES versions(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('valid', 'stale')),
  content_json TEXT NOT NULL CHECK (json_valid(content_json)),
  stale_reasons_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(stale_reasons_json)),
  created_at TEXT NOT NULL,
  stale_at TEXT,
  UNIQUE(id, project_id),
  UNIQUE(chapter_id, source_version_id),
  CHECK (
    (status = 'valid' AND stale_at IS NULL) OR
    (status = 'stale' AND stale_at IS NOT NULL)
  )
) STRICT;

CREATE UNIQUE INDEX idx_ending_snapshots_one_valid_chapter
ON ending_snapshots(project_id, chapter_id)
WHERE status = 'valid';

CREATE INDEX idx_ending_snapshots_project_status
ON ending_snapshots(project_id, status, chapter_id, created_at DESC, id);

CREATE TABLE derived_invalidations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE RESTRICT,
  source_version_id TEXT NOT NULL REFERENCES versions(id) ON DELETE RESTRICT,
  target_chapter_id TEXT REFERENCES chapters(id) ON DELETE RESTRICT,
  scope TEXT NOT NULL CHECK (
    scope IN ('continuity', 'arc', 'timeline', 'foreshadowing', 'validation', 'cache')
  ),
  change_type TEXT NOT NULL CHECK (
    change_type IN ('entity_state', 'arc_milestone', 'event', 'timeline', 'foreshadowing')
  ),
  created_at TEXT NOT NULL,
  UNIQUE(id, project_id)
) STRICT;

CREATE INDEX idx_derived_invalidations_project_scope
ON derived_invalidations(project_id, scope, target_chapter_id, created_at, id);

UPDATE projects SET schema_version = 16;
