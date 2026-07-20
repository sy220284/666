CREATE TABLE entity_states (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL,
  state_key TEXT NOT NULL CHECK (length(trim(state_key)) BETWEEN 1 AND 120),
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  valid_from_chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE RESTRICT,
  valid_until_chapter_id TEXT REFERENCES chapters(id) ON DELETE RESTRICT,
  record_status TEXT NOT NULL CHECK (
    record_status IN ('current', 'historical', 'superseded', 'invalid')
  ),
  evidence_json TEXT NOT NULL DEFAULT '[]' CHECK (
    json_valid(evidence_json) AND json_type(evidence_json) = 'array'
  ),
  source_version_id TEXT NOT NULL REFERENCES versions(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  superseded_at TEXT,
  FOREIGN KEY(entity_id, project_id) REFERENCES entities(id, project_id) ON DELETE CASCADE,
  CHECK (
    (record_status = 'current' AND superseded_at IS NULL) OR
    (record_status <> 'current' AND superseded_at IS NOT NULL)
  )
) STRICT;

CREATE UNIQUE INDEX idx_entity_states_current
ON entity_states(entity_id, state_key)
WHERE record_status = 'current';

CREATE INDEX idx_entity_states_history
ON entity_states(project_id, entity_id, state_key, created_at DESC, id);

CREATE TABLE timeline_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 240),
  start_value TEXT NOT NULL CHECK (length(trim(start_value)) BETWEEN 1 AND 120),
  end_value TEXT CHECK (end_value IS NULL OR length(trim(end_value)) BETWEEN 1 AND 120),
  precision TEXT NOT NULL CHECK (
    precision IN ('exact', 'day', 'month', 'year', 'approximate', 'unknown')
  ),
  chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  location_id TEXT,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(id, project_id),
  FOREIGN KEY(location_id, project_id) REFERENCES entities(id, project_id) ON DELETE RESTRICT,
  CHECK (
    (status = 'active' AND archived_at IS NULL) OR
    (status = 'archived' AND archived_at IS NOT NULL)
  )
) STRICT;

CREATE INDEX idx_timeline_events_project_status
ON timeline_events(project_id, status, start_value, id);

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

CREATE TABLE timeline_event_dependencies (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  dependency_event_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(event_id, dependency_event_id),
  FOREIGN KEY(event_id, project_id)
    REFERENCES timeline_events(id, project_id) ON DELETE CASCADE,
  FOREIGN KEY(dependency_event_id, project_id)
    REFERENCES timeline_events(id, project_id) ON DELETE RESTRICT,
  CHECK (event_id <> dependency_event_id)
) WITHOUT ROWID, STRICT;

CREATE INDEX idx_timeline_event_dependencies_reverse
ON timeline_event_dependencies(project_id, dependency_event_id, event_id);

CREATE TABLE knowledge_states (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  information_key TEXT NOT NULL CHECK (length(trim(information_key)) BETWEEN 1 AND 240),
  character_id TEXT NOT NULL,
  knowledge_status TEXT NOT NULL CHECK (
    knowledge_status IN ('knows', 'believes', 'suspects', 'misunderstands', 'unknown')
  ),
  valid_from_chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE RESTRICT,
  valid_until_chapter_id TEXT REFERENCES chapters(id) ON DELETE RESTRICT,
  source_version_id TEXT REFERENCES versions(id) ON DELETE SET NULL,
  source_logical_block_id TEXT CHECK (
    source_logical_block_id IS NULL OR length(trim(source_logical_block_id)) BETWEEN 1 AND 240
  ),
  notes TEXT NOT NULL DEFAULT '',
  record_status TEXT NOT NULL CHECK (record_status IN ('current', 'historical', 'invalid')),
  created_at TEXT NOT NULL,
  superseded_at TEXT,
  FOREIGN KEY(character_id, project_id) REFERENCES entities(id, project_id) ON DELETE CASCADE,
  CHECK (source_version_id IS NOT NULL OR source_logical_block_id IS NOT NULL),
  CHECK (
    (record_status = 'current' AND superseded_at IS NULL) OR
    (record_status <> 'current' AND superseded_at IS NOT NULL)
  )
) STRICT;

CREATE UNIQUE INDEX idx_knowledge_states_current
ON knowledge_states(character_id, information_key)
WHERE record_status = 'current';

CREATE INDEX idx_knowledge_states_history
ON knowledge_states(project_id, character_id, information_key, created_at DESC, id);

UPDATE projects SET schema_version = 13;
