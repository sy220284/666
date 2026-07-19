CREATE TABLE entity_states (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL,
  state_key TEXT NOT NULL CHECK (length(trim(state_key)) BETWEEN 1 AND 120),
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  valid_from_chapter_id TEXT NOT NULL REFERENCES chapters(id),
  valid_until_chapter_id TEXT REFERENCES chapters(id),
  record_status TEXT NOT NULL CHECK (
    record_status IN ('current', 'historical', 'superseded', 'invalid')
  ),
  evidence_json TEXT NOT NULL DEFAULT '[]' CHECK (
    json_valid(evidence_json) AND json_type(evidence_json) = 'array'
  ),
  source_version_id TEXT NOT NULL REFERENCES versions(id),
  created_at TEXT NOT NULL,
  FOREIGN KEY(entity_id, project_id)
    REFERENCES entities(id, project_id) ON DELETE CASCADE
) STRICT;

CREATE UNIQUE INDEX idx_entity_states_current
ON entity_states(entity_id, state_key)
WHERE record_status = 'current';

CREATE INDEX idx_entity_states_history
ON entity_states(project_id, entity_id, state_key, created_at DESC, id);

CREATE TRIGGER entity_states_scope_insert
BEFORE INSERT ON entity_states
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
      FROM chapters c
      JOIN volumes v ON v.id = c.volume_id
     WHERE c.id = NEW.valid_from_chapter_id
       AND v.project_id = NEW.project_id
       AND c.deleted_at IS NULL
       AND v.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'entity state start chapter outside project') END;
  SELECT CASE WHEN NEW.valid_until_chapter_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM chapters c
      JOIN volumes v ON v.id = c.volume_id
     WHERE c.id = NEW.valid_until_chapter_id
       AND v.project_id = NEW.project_id
       AND c.deleted_at IS NULL
       AND v.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'entity state end chapter outside project') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
      FROM versions ver
      JOIN chapters c ON c.id = ver.chapter_id
      JOIN volumes v ON v.id = c.volume_id
     WHERE ver.id = NEW.source_version_id
       AND v.project_id = NEW.project_id
  ) THEN RAISE(ABORT, 'entity state source version outside project') END;
END;

CREATE TRIGGER entity_states_scope_update
BEFORE UPDATE OF valid_from_chapter_id, valid_until_chapter_id, source_version_id
ON entity_states
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
      FROM chapters c
      JOIN volumes v ON v.id = c.volume_id
     WHERE c.id = NEW.valid_from_chapter_id
       AND v.project_id = NEW.project_id
       AND c.deleted_at IS NULL
       AND v.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'entity state start chapter outside project') END;
  SELECT CASE WHEN NEW.valid_until_chapter_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM chapters c
      JOIN volumes v ON v.id = c.volume_id
     WHERE c.id = NEW.valid_until_chapter_id
       AND v.project_id = NEW.project_id
       AND c.deleted_at IS NULL
       AND v.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'entity state end chapter outside project') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
      FROM versions ver
      JOIN chapters c ON c.id = ver.chapter_id
      JOIN volumes v ON v.id = c.volume_id
     WHERE ver.id = NEW.source_version_id
       AND v.project_id = NEW.project_id
  ) THEN RAISE(ABORT, 'entity state source version outside project') END;
END;

CREATE TABLE timeline_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 240),
  start_value TEXT NOT NULL CHECK (length(trim(start_value)) BETWEEN 1 AND 120),
  end_value TEXT CHECK (end_value IS NULL OR length(trim(end_value)) BETWEEN 1 AND 120),
  precision TEXT NOT NULL CHECK (
    precision IN ('exact', 'day', 'month', 'year', 'approximate', 'unknown')
  ),
  chapter_id TEXT REFERENCES chapters(id),
  location_id TEXT,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(id, project_id),
  FOREIGN KEY(location_id, project_id)
    REFERENCES entities(id, project_id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX idx_timeline_events_project_time
ON timeline_events(project_id, precision, start_value, end_value, id);

CREATE TRIGGER timeline_events_scope_insert
BEFORE INSERT ON timeline_events
BEGIN
  SELECT CASE WHEN NEW.chapter_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM chapters c
      JOIN volumes v ON v.id = c.volume_id
     WHERE c.id = NEW.chapter_id
       AND v.project_id = NEW.project_id
       AND c.deleted_at IS NULL
       AND v.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'timeline chapter outside project') END;
  SELECT CASE WHEN NEW.location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM entities e
     WHERE e.id = NEW.location_id
       AND e.project_id = NEW.project_id
       AND e.entity_type = 'location'
       AND e.status = 'active'
  ) THEN RAISE(ABORT, 'timeline location invalid') END;
END;

CREATE TRIGGER timeline_events_scope_update
BEFORE UPDATE OF chapter_id, location_id ON timeline_events
BEGIN
  SELECT CASE WHEN NEW.chapter_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM chapters c
      JOIN volumes v ON v.id = c.volume_id
     WHERE c.id = NEW.chapter_id
       AND v.project_id = NEW.project_id
       AND c.deleted_at IS NULL
       AND v.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'timeline chapter outside project') END;
  SELECT CASE WHEN NEW.location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM entities e
     WHERE e.id = NEW.location_id
       AND e.project_id = NEW.project_id
       AND e.entity_type = 'location'
       AND e.status = 'active'
  ) THEN RAISE(ABORT, 'timeline location invalid') END;
END;

CREATE TABLE timeline_event_entities (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('participant', 'witness', 'subject')),
  created_at TEXT NOT NULL,
  PRIMARY KEY(event_id, entity_id, role),
  FOREIGN KEY(event_id, project_id)
    REFERENCES timeline_events(id, project_id) ON DELETE CASCADE,
  FOREIGN KEY(entity_id, project_id)
    REFERENCES entities(id, project_id) ON DELETE RESTRICT
) WITHOUT ROWID, STRICT;

CREATE INDEX idx_timeline_event_entities_entity
ON timeline_event_entities(project_id, entity_id, event_id);

CREATE TABLE timeline_dependencies (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  depends_on_event_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(event_id, depends_on_event_id),
  FOREIGN KEY(event_id, project_id)
    REFERENCES timeline_events(id, project_id) ON DELETE CASCADE,
  FOREIGN KEY(depends_on_event_id, project_id)
    REFERENCES timeline_events(id, project_id) ON DELETE CASCADE,
  CHECK (event_id <> depends_on_event_id)
) WITHOUT ROWID, STRICT;

CREATE INDEX idx_timeline_dependencies_parent
ON timeline_dependencies(project_id, depends_on_event_id, event_id);

CREATE TABLE knowledge_states (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  information_key TEXT NOT NULL CHECK (length(trim(information_key)) BETWEEN 1 AND 240),
  character_id TEXT NOT NULL,
  knowledge_status TEXT NOT NULL CHECK (
    knowledge_status IN ('knows', 'believes', 'suspects', 'misunderstands', 'unknown')
  ),
  acquired_chapter_id TEXT REFERENCES chapters(id),
  source_block_id TEXT REFERENCES draft_blocks(id),
  source_version_id TEXT REFERENCES versions(id),
  notes TEXT NOT NULL DEFAULT '',
  record_status TEXT NOT NULL CHECK (record_status IN ('current', 'historical')),
  created_at TEXT NOT NULL,
  superseded_at TEXT,
  FOREIGN KEY(character_id, project_id)
    REFERENCES entities(id, project_id) ON DELETE CASCADE,
  CHECK (
    (record_status = 'current' AND superseded_at IS NULL) OR
    (record_status = 'historical' AND superseded_at IS NOT NULL)
  )
) STRICT;

CREATE UNIQUE INDEX idx_knowledge_states_current
ON knowledge_states(character_id, information_key)
WHERE record_status = 'current';

CREATE INDEX idx_knowledge_states_history
ON knowledge_states(project_id, character_id, information_key, created_at DESC, id);

CREATE TRIGGER knowledge_states_scope_insert
BEFORE INSERT ON knowledge_states
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM entities e
     WHERE e.id = NEW.character_id
       AND e.project_id = NEW.project_id
       AND e.entity_type = 'character'
       AND e.status = 'active'
  ) THEN RAISE(ABORT, 'knowledge character invalid') END;
  SELECT CASE WHEN NEW.acquired_chapter_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM chapters c
      JOIN volumes v ON v.id = c.volume_id
     WHERE c.id = NEW.acquired_chapter_id
       AND v.project_id = NEW.project_id
       AND c.deleted_at IS NULL
       AND v.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'knowledge chapter outside project') END;
  SELECT CASE WHEN NEW.source_block_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM draft_blocks b
      JOIN drafts d ON d.id = b.draft_id
      JOIN chapters c ON c.id = d.chapter_id
      JOIN volumes v ON v.id = c.volume_id
     WHERE b.id = NEW.source_block_id
       AND v.project_id = NEW.project_id
  ) THEN RAISE(ABORT, 'knowledge block outside project') END;
  SELECT CASE WHEN NEW.source_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM versions ver
      JOIN chapters c ON c.id = ver.chapter_id
      JOIN volumes v ON v.id = c.volume_id
     WHERE ver.id = NEW.source_version_id
       AND v.project_id = NEW.project_id
  ) THEN RAISE(ABORT, 'knowledge version outside project') END;
END;

UPDATE projects SET schema_version = 13;
