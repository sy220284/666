ALTER TABLE backup_records
ADD COLUMN backup_track TEXT NOT NULL DEFAULT 'major'
CHECK (backup_track IN ('daily', 'major', 'named'));

ALTER TABLE backup_records
ADD COLUMN display_name TEXT
CHECK (display_name IS NULL OR length(trim(display_name)) BETWEEN 1 AND 120);

ALTER TABLE backup_records
ADD COLUMN note TEXT
CHECK (note IS NULL OR length(note) <= 1000);

ALTER TABLE backup_records
ADD COLUMN author_protected INTEGER NOT NULL DEFAULT 0
CHECK (author_protected IN (0, 1));

ALTER TABLE backup_records
ADD COLUMN migration_protected INTEGER NOT NULL DEFAULT 0
CHECK (migration_protected IN (0, 1));

ALTER TABLE backup_records
ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 0
CHECK (schema_version >= 0);

UPDATE backup_records
SET backup_track = 'named',
    display_name = '历史手动恢复点',
    author_protected = 1
WHERE operation = 'manual-protection';

UPDATE backup_records
SET migration_protected = 1
WHERE operation = 'migration';

CREATE INDEX idx_backup_records_track_created
ON backup_records(project_id, backup_track, created_at DESC, id DESC);

CREATE TABLE backup_policies (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  policy_version INTEGER NOT NULL CHECK (policy_version >= 1),
  daily_retention_count INTEGER NOT NULL CHECK (daily_retention_count BETWEEN 1 AND 365),
  major_retention_count INTEGER NOT NULL CHECK (major_retention_count BETWEEN 1 AND 500),
  major_retention_days INTEGER NOT NULL CHECK (major_retention_days BETWEEN 1 AND 3650),
  quota_bytes INTEGER NOT NULL CHECK (quota_bytes BETWEEN 104857600 AND 1099511627776),
  updated_at TEXT NOT NULL
) STRICT;

UPDATE projects SET schema_version = 27;
