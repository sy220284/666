CREATE TABLE project_settings (
  setting_key TEXT PRIMARY KEY CHECK (length(trim(setting_key)) BETWEEN 1 AND 120),
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  updated_at TEXT NOT NULL
) STRICT;

UPDATE projects SET schema_version = 22;
