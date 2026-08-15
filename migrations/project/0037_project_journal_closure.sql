-- migration-policy: allow-unscoped-write
-- M12-01 closure hardening: record the actual chapter finalization time without mutating Version rows.

ALTER TABLE chapters
ADD COLUMN finalized_at TEXT;

-- Legacy projects did not persist finalization time. Preserve a deterministic best-known anchor
-- for existing finalized chapters; all subsequent final-version changes are timestamped exactly.
UPDATE chapters
SET finalized_at = (
  SELECT version.created_at
  FROM versions version
  WHERE version.id = chapters.final_version_id
)
WHERE final_version_id IS NOT NULL;

CREATE INDEX idx_chapters_finalized_at
ON chapters(finalized_at)
WHERE finalized_at IS NOT NULL;

CREATE TRIGGER trg_chapters_final_version_timestamp
AFTER UPDATE OF final_version_id ON chapters
WHEN NEW.final_version_id IS NOT OLD.final_version_id
BEGIN
  UPDATE chapters
     SET finalized_at = CASE
       WHEN NEW.final_version_id IS NULL THEN NULL
       ELSE strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     END
   WHERE id = NEW.id;
END;

UPDATE projects SET schema_version = 37;
