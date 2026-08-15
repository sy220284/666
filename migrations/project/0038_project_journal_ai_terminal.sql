-- migration-policy: allow-unscoped-write
-- M12-01 closure hardening: keep Journal AI projection aligned with GenerationRun terminal state.

CREATE TRIGGER trg_generation_run_journal_terminal
AFTER UPDATE OF status ON generation_runs
WHEN NEW.run_type = 'journal_summarize'
 AND NEW.status IN ('failed', 'cancelled')
BEGIN
  UPDATE project_journal_entries
     SET status = 'ai_failed',
         updated_at = COALESCE(NEW.finished_at, updated_at)
   WHERE generation_run_id = NEW.id
     AND project_id = NEW.project_id
     AND status = 'ai_pending';
END;

UPDATE projects SET schema_version = 38;
