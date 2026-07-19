CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (
    entity_type IN ('character', 'location', 'faction', 'item', 'ability', 'rule', 'event', 'custom')
  ),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 240),
  aliases_json TEXT NOT NULL DEFAULT '[]' CHECK (
    json_valid(aliases_json) AND json_type(aliases_json) = 'array'
  ),
  summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(id, project_id),
  CHECK (
    (status = 'active' AND archived_at IS NULL) OR
    (status = 'archived' AND archived_at IS NOT NULL)
  )
) STRICT;

CREATE UNIQUE INDEX idx_entities_active_name
ON entities(project_id, entity_type, lower(trim(name)))
WHERE status = 'active';

CREATE INDEX idx_entities_project_type_status
ON entities(project_id, entity_type, status, updated_at, id);

CREATE TABLE canon_facts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL,
  fact_key TEXT NOT NULL CHECK (length(trim(fact_key)) BETWEEN 1 AND 120),
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  description TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL CHECK (source_type IN ('author', 'import')),
  source_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('current', 'historical')),
  confirmed_at TEXT NOT NULL,
  superseded_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(entity_id, project_id) REFERENCES entities(id, project_id) ON DELETE CASCADE,
  CHECK (
    (status = 'current' AND superseded_at IS NULL) OR
    (status = 'historical' AND superseded_at IS NOT NULL)
  )
) STRICT;

CREATE UNIQUE INDEX idx_canon_facts_current
ON canon_facts(entity_id, fact_key)
WHERE status = 'current';

CREATE INDEX idx_canon_facts_entity_history
ON canon_facts(entity_id, fact_key, confirmed_at DESC, id);

CREATE UNIQUE INDEX idx_scene_beats_id_project
ON scene_beats(id, project_id);

CREATE TABLE scene_beat_entities (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_beat_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (
    role IN ('character', 'location', 'participant', 'setting', 'subject', 'related')
  ),
  created_at TEXT NOT NULL,
  PRIMARY KEY(scene_beat_id, entity_id, role),
  FOREIGN KEY(scene_beat_id, project_id)
    REFERENCES scene_beats(id, project_id) ON DELETE CASCADE,
  FOREIGN KEY(entity_id, project_id)
    REFERENCES entities(id, project_id) ON DELETE RESTRICT
) WITHOUT ROWID, STRICT;

CREATE INDEX idx_scene_beat_entities_entity
ON scene_beat_entities(project_id, entity_id, scene_beat_id);

UPDATE projects SET schema_version = 12;
