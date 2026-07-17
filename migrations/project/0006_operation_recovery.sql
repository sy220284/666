CREATE TABLE backup_records (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  operation TEXT NOT NULL CHECK (
    operation IN ('manual-protection', 'import', 'replace', 'split-chapter', 'merge-chapter', 'migration')
  ),
  backup_file_name TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  created_at TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  UNIQUE(project_id, backup_file_name)
) STRICT;

CREATE INDEX idx_backup_records_project_created
ON backup_records(project_id, created_at DESC);

UPDATE projects SET schema_version = 6;
