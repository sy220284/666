ALTER TABLE entity_states
ADD COLUMN semantic_kind TEXT NOT NULL DEFAULT 'custom'
CHECK (
  semantic_kind IN (
    'custom', 'life_status', 'location', 'age', 'holder',
    'identity', 'health', 'ability'
  )
);

DROP TRIGGER IF EXISTS trg_state_proposals_validate_interval_insert;
DROP TRIGGER IF EXISTS trg_state_proposals_validate_interval_update;
DROP TRIGGER IF EXISTS trg_state_proposal_scope_insert;

ALTER TABLE state_proposals RENAME TO state_proposals_legacy_0031;

CREATE TABLE state_proposals (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES state_proposal_batches(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE RESTRICT,
  source_version_id TEXT NOT NULL REFERENCES versions(id) ON DELETE RESTRICT,
  proposal_type TEXT NOT NULL CHECK (
    proposal_type IN (
      'entity_state', 'knowledge_state', 'timeline_event',
      'character_relationship', 'foreshadowing', 'arc_milestone',
      'entity_create', 'canon_fact'
    )
  ),
  source TEXT NOT NULL CHECK (source IN ('rule', 'provider_stub', 'provider')),
  target_json TEXT NOT NULL CHECK (
    json_valid(target_json) AND json_type(target_json) = 'object'
  ),
  previous_value_json TEXT CHECK (
    previous_value_json IS NULL OR json_valid(previous_value_json)
  ),
  proposed_value_json TEXT NOT NULL CHECK (json_valid(proposed_value_json)),
  evidence_json TEXT NOT NULL CHECK (
    json_valid(evidence_json) AND json_type(evidence_json) = 'array'
    AND json_array_length(evidence_json) > 0
  ),
  confidence REAL NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'edited', 'rejected')),
  resolved_value_json TEXT CHECK (
    resolved_value_json IS NULL OR json_valid(resolved_value_json)
  ),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  UNIQUE(id, project_id),
  CHECK (
    json_extract(target_json, '$.targetType') IS proposal_type
  ),
  CHECK (
    (status = 'pending' AND resolved_at IS NULL AND resolved_value_json IS NULL)
    OR (status <> 'pending' AND resolved_at IS NOT NULL)
  )
) STRICT;

INSERT INTO state_proposals(
  id, batch_id, project_id, chapter_id, source_version_id, proposal_type, source,
  target_json, previous_value_json, proposed_value_json, evidence_json,
  confidence, status, resolved_value_json, created_at, resolved_at
)
SELECT id, batch_id, project_id, chapter_id, source_version_id, proposal_type, source,
       CASE proposal_type
         WHEN 'entity_state' THEN json_object(
           'targetType', 'entity_state',
           'entityId', entity_id,
           'stateKey', state_key
         )
         ELSE json_object(
           'targetType', 'arc_milestone',
           'arcMilestoneId', arc_milestone_id
         )
       END,
       previous_value_json,
       CASE proposal_type
         WHEN 'entity_state' THEN json_object(
           'value', json(proposed_value_json),
           'semanticKind', 'custom',
           'validUntilChapterId', valid_until_chapter_id
         )
         ELSE proposed_value_json
       END,
       evidence_json, confidence, status, resolved_value_json, created_at, resolved_at
  FROM state_proposals_legacy_0031;

DROP TABLE state_proposals_legacy_0031;

CREATE INDEX idx_state_proposals_project_chapter
ON state_proposals(project_id, chapter_id, status, created_at, id);

CREATE INDEX idx_state_proposals_batch
ON state_proposals(batch_id, status, created_at, id);

CREATE UNIQUE INDEX idx_state_proposals_pending_target
ON state_proposals(
  project_id, chapter_id, source_version_id, proposal_type, target_json
)
WHERE status = 'pending';

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

CREATE TABLE character_relationships (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_character_id TEXT NOT NULL,
  to_character_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (
    category IN (
      'family', 'romantic', 'friendship', 'hostility', 'alliance',
      'mentorship', 'hierarchy', 'rivalry', 'custom'
    )
  ),
  label TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 120),
  valid_from_chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE RESTRICT,
  valid_until_chapter_id TEXT REFERENCES chapters(id) ON DELETE RESTRICT,
  record_status TEXT NOT NULL CHECK (
    record_status IN ('current', 'historical', 'invalid')
  ),
  source_version_id TEXT NOT NULL REFERENCES versions(id) ON DELETE RESTRICT,
  evidence_json TEXT NOT NULL CHECK (
    json_valid(evidence_json) AND json_type(evidence_json) = 'array'
    AND json_array_length(evidence_json) > 0
  ),
  created_at TEXT NOT NULL,
  superseded_at TEXT,
  UNIQUE(id, project_id),
  FOREIGN KEY(from_character_id, project_id)
    REFERENCES entities(id, project_id) ON DELETE RESTRICT,
  FOREIGN KEY(to_character_id, project_id)
    REFERENCES entities(id, project_id) ON DELETE RESTRICT,
  CHECK (from_character_id <> to_character_id),
  CHECK (
    (record_status = 'current' AND superseded_at IS NULL)
    OR (record_status <> 'current' AND superseded_at IS NOT NULL)
  )
) STRICT;

CREATE UNIQUE INDEX idx_character_relationships_current
ON character_relationships(
  project_id, from_character_id, to_character_id, category, label
)
WHERE record_status = 'current';

CREATE INDEX idx_character_relationships_project_range
ON character_relationships(
  project_id, valid_from_chapter_id, valid_until_chapter_id, record_status
);

CREATE TRIGGER trg_character_relationship_scope_insert
BEFORE INSERT ON character_relationships
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM entities
     WHERE id = NEW.from_character_id AND project_id = NEW.project_id
       AND entity_type = 'character' AND status = 'active'
  ) THEN RAISE(ABORT, 'CHARACTER_RELATIONSHIP_FROM_INVALID') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM entities
     WHERE id = NEW.to_character_id AND project_id = NEW.project_id
       AND entity_type = 'character' AND status = 'active'
  ) THEN RAISE(ABORT, 'CHARACTER_RELATIONSHIP_TO_INVALID') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
      FROM versions version
      JOIN chapters chapter ON chapter.id = version.chapter_id
      JOIN volumes volume ON volume.id = chapter.volume_id
     WHERE version.id = NEW.source_version_id
       AND chapter.id = NEW.valid_from_chapter_id
       AND volume.project_id = NEW.project_id
       AND chapter.final_version_id = version.id
  ) THEN RAISE(ABORT, 'CHARACTER_RELATIONSHIP_VERSION_SCOPE_INVALID') END;
  SELECT CASE WHEN NEW.valid_until_chapter_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM chapters start_chapter
      JOIN volumes start_volume ON start_volume.id = start_chapter.volume_id
      JOIN chapters end_chapter ON end_chapter.id = NEW.valid_until_chapter_id
      JOIN volumes end_volume ON end_volume.id = end_chapter.volume_id
     WHERE start_chapter.id = NEW.valid_from_chapter_id
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
  ) THEN RAISE(ABORT, 'CHARACTER_RELATIONSHIP_INTERVAL_INVALID') END;
END;

CREATE TABLE validation_exceptions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  exception_type TEXT NOT NULL CHECK (
    exception_type IN (
      'flashback', 'dream', 'illusion', 'lie', 'unreliable_narration',
      'hidden_identity', 'special_rule', 'time_loop', 'double',
      'parallel_world', 'intentional_exception', 'custom'
    )
  ),
  scope_type TEXT NOT NULL CHECK (
    scope_type IN ('issue', 'chapter', 'entity', 'chapter_range', 'project_rule')
  ),
  issue_type TEXT NOT NULL CHECK (length(trim(issue_type)) BETWEEN 1 AND 120),
  validation_issue_id TEXT REFERENCES validation_issues(id) ON DELETE RESTRICT,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE RESTRICT,
  entity_id TEXT,
  valid_from_chapter_id TEXT REFERENCES chapters(id) ON DELETE RESTRICT,
  valid_until_chapter_id TEXT REFERENCES chapters(id) ON DELETE RESTRICT,
  project_rule_key TEXT CHECK (
    project_rule_key IS NULL OR length(trim(project_rule_key)) BETWEEN 1 AND 120
  ),
  notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 8000),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(id, project_id),
  FOREIGN KEY(entity_id, project_id)
    REFERENCES entities(id, project_id) ON DELETE RESTRICT,
  CHECK (
    (scope_type = 'issue' AND validation_issue_id IS NOT NULL AND chapter_id IS NOT NULL
      AND entity_id IS NULL AND valid_from_chapter_id IS NULL
      AND valid_until_chapter_id IS NULL AND project_rule_key IS NULL)
    OR
    (scope_type = 'chapter' AND validation_issue_id IS NULL AND chapter_id IS NOT NULL
      AND entity_id IS NULL AND valid_from_chapter_id IS NULL
      AND valid_until_chapter_id IS NULL AND project_rule_key IS NULL)
    OR
    (scope_type = 'entity' AND validation_issue_id IS NULL AND chapter_id IS NULL
      AND entity_id IS NOT NULL AND valid_from_chapter_id IS NULL
      AND valid_until_chapter_id IS NULL AND project_rule_key IS NULL)
    OR
    (scope_type = 'chapter_range' AND validation_issue_id IS NULL AND chapter_id IS NULL
      AND entity_id IS NULL AND valid_from_chapter_id IS NOT NULL
      AND project_rule_key IS NULL)
    OR
    (scope_type = 'project_rule' AND validation_issue_id IS NULL AND chapter_id IS NULL
      AND entity_id IS NULL AND valid_from_chapter_id IS NULL
      AND valid_until_chapter_id IS NULL AND project_rule_key IS NOT NULL)
  )
) STRICT;

CREATE INDEX idx_validation_exceptions_project_active
ON validation_exceptions(project_id, active, issue_type, scope_type, created_at, id);

ALTER TABLE validation_issues
ADD COLUMN current_evidence_ids_json TEXT NOT NULL DEFAULT '[]'
CHECK (
  json_valid(current_evidence_ids_json)
  AND json_type(current_evidence_ids_json) = 'array'
);

ALTER TABLE validation_issues
ADD COLUMN conflict_evidence_ids_json TEXT NOT NULL DEFAULT '[]'
CHECK (
  json_valid(conflict_evidence_ids_json)
  AND json_type(conflict_evidence_ids_json) = 'array'
);

ALTER TABLE derived_invalidations RENAME TO derived_invalidations_legacy_0031;

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
    change_type IN (
      'entity_state', 'arc_milestone', 'event', 'timeline', 'foreshadowing',
      'knowledge', 'relationship', 'canon'
    )
  ),
  created_at TEXT NOT NULL,
  UNIQUE(id, project_id)
) STRICT;

INSERT INTO derived_invalidations(
  id, project_id, source_chapter_id, source_version_id,
  target_chapter_id, scope, change_type, created_at
)
SELECT id, project_id, source_chapter_id, source_version_id,
       target_chapter_id, scope, change_type, created_at
  FROM derived_invalidations_legacy_0031;

DROP TABLE derived_invalidations_legacy_0031;

CREATE INDEX idx_derived_invalidations_project_scope
ON derived_invalidations(project_id, scope, target_chapter_id, created_at, id);

CREATE TRIGGER semantic_revision_derived_invalidations_insert
AFTER INSERT ON derived_invalidations BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_derived_invalidations_update
AFTER UPDATE ON derived_invalidations BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_derived_invalidations_delete
AFTER DELETE ON derived_invalidations BEGIN
  UPDATE semantic_revision SET revision = revision + 1 WHERE project_id = OLD.project_id;
END;

CREATE TRIGGER semantic_revision_character_relationships_insert
AFTER INSERT ON character_relationships BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_character_relationships_update
AFTER UPDATE ON character_relationships BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_character_relationships_delete
AFTER DELETE ON character_relationships BEGIN
  UPDATE semantic_revision SET revision = revision + 1 WHERE project_id = OLD.project_id;
END;

CREATE TRIGGER semantic_revision_validation_exceptions_insert
AFTER INSERT ON validation_exceptions BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_validation_exceptions_update
AFTER UPDATE ON validation_exceptions BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_validation_exceptions_delete
AFTER DELETE ON validation_exceptions BEGIN
  UPDATE semantic_revision SET revision = revision + 1 WHERE project_id = OLD.project_id;
END;

CREATE TRIGGER trg_snapshot_stale_after_character_relationship_insert
AFTER INSERT ON character_relationships
BEGIN
  UPDATE ending_snapshots
     SET status = 'stale', stale_at = NEW.created_at,
         stale_reasons_json = CASE
           WHEN EXISTS (SELECT 1 FROM json_each(stale_reasons_json) WHERE value = 'relationship')
             THEN stale_reasons_json
           ELSE json_insert(stale_reasons_json, '$[#]', 'relationship')
         END
   WHERE project_id = NEW.project_id AND status = 'valid';
END;

CREATE TRIGGER trg_snapshot_stale_after_character_relationship_update
AFTER UPDATE ON character_relationships
BEGIN
  UPDATE ending_snapshots
     SET status = 'stale', stale_at = COALESCE(NEW.superseded_at, NEW.created_at),
         stale_reasons_json = CASE
           WHEN EXISTS (SELECT 1 FROM json_each(stale_reasons_json) WHERE value = 'relationship')
             THEN stale_reasons_json
           ELSE json_insert(stale_reasons_json, '$[#]', 'relationship')
         END
   WHERE project_id = NEW.project_id AND status = 'valid';
END;

CREATE TRIGGER trg_snapshot_stale_after_character_relationship_delete
AFTER DELETE ON character_relationships
BEGIN
  UPDATE ending_snapshots
     SET status = 'stale', stale_at = COALESCE(OLD.superseded_at, OLD.created_at),
         stale_reasons_json = CASE
           WHEN EXISTS (SELECT 1 FROM json_each(stale_reasons_json) WHERE value = 'relationship')
             THEN stale_reasons_json
           ELSE json_insert(stale_reasons_json, '$[#]', 'relationship')
         END
   WHERE project_id = OLD.project_id AND status = 'valid';
END;

-- migration-policy: allow-unscoped-write
UPDATE projects SET schema_version = 31;
