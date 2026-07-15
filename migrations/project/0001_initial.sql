CREATE TABLE migration_journal (
  id TEXT PRIMARY KEY,
  migration_version INTEGER NOT NULL,
  stage TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'rolled_back')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  channel TEXT NOT NULL,
  active_style_profile_id TEXT,
  schema_version INTEGER NOT NULL CHECK (schema_version >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
