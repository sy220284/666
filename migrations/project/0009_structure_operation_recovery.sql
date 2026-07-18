DROP INDEX idx_backup_records_project_created;

ALTER TABLE backup_records RENAME TO backup_records_v8;

CREATE TABLE backup_records (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  operation TEXT NOT NULL CHECK (
    operation IN (
      'manual-protection',
      'import',
      'replace',
      'split-chapter',
      'merge-chapter',
      'move-blocks',
      'permanent-delete',
      'migration'
    )
  ),
  backup_file_name TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  created_at TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  UNIQUE(project_id, backup_file_name)
) STRICT;

INSERT INTO backup_records(
  id, project_id, operation, backup_file_name, size_bytes, sha256, created_at, verified_at
)
SELECT
  id, project_id, operation, backup_file_name, size_bytes, sha256, created_at, verified_at
FROM backup_records_v8;

DROP TABLE backup_records_v8;

CREATE INDEX idx_backup_records_project_created
ON backup_records(project_id, created_at DESC);

UPDATE projects SET schema_version = 9;
