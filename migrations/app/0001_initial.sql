CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE recent_projects (
  project_id TEXT PRIMARY KEY,
  workspace_path TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  last_opened_at TEXT NOT NULL,
  missing_since TEXT
) STRICT;

CREATE TABLE provider_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  protocol TEXT NOT NULL CHECK (protocol IN ('openai_compatible', 'anthropic', 'custom')),
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  credential_ref TEXT,
  timeout_ms INTEGER NOT NULL CHECK (timeout_ms > 0),
  options_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
