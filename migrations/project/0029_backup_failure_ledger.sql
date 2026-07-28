CREATE TABLE backup_failures (
  id TEXT PRIMARY KEY CHECK(length(id) = 36),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK(operation IN (
    'manual-protection', 'import', 'replace', 'split-chapter', 'merge-chapter',
    'move-blocks', 'permanent-delete', 'migration'
  )),
  backup_track TEXT NOT NULL CHECK(backup_track IN ('daily', 'major', 'named')),
  error_code TEXT NOT NULL CHECK(error_code IN (
    'BACKUP_CREATE_FAILED', 'BACKUP_VERIFY_FAILED', 'BACKUP_SPACE_LOW'
  )),
  occurred_at TEXT NOT NULL,
  resolved_at TEXT,
  CHECK(resolved_at IS NULL OR resolved_at >= occurred_at)
) STRICT;

CREATE INDEX idx_backup_failures_project_open
ON backup_failures(project_id, resolved_at, occurred_at DESC);

UPDATE projects SET schema_version = 29;
