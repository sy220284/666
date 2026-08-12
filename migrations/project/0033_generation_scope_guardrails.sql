-- migration-policy: allow-unscoped-write
-- M11-05 post-merge remediation: keep legacy chapter workflows chapter-scoped
-- and make selection scope refer only to the current active Draft.

DROP TRIGGER IF EXISTS trg_generation_runs_scope_insert;
DROP TRIGGER IF EXISTS trg_generation_runs_scope_update;

CREATE TRIGGER trg_generation_runs_scope_insert
BEFORE INSERT ON generation_runs
BEGIN
  SELECT CASE WHEN NEW.scope_id IS NULL OR length(trim(NEW.scope_id)) = 0
    THEN RAISE(ABORT, 'GENERATION_SCOPE_REQUIRED') END;

  SELECT CASE WHEN NEW.run_type <> 'idea_explore' AND (
    NEW.scope_type <> 'chapter'
    OR NEW.chapter_id IS NULL
    OR NEW.scope_id <> NEW.chapter_id
  ) THEN RAISE(ABORT, 'GENERATION_LEGACY_SCOPE_INVALID') END;

  SELECT CASE WHEN NEW.scope_type = 'project' AND NEW.scope_id <> NEW.project_id
    THEN RAISE(ABORT, 'GENERATION_PROJECT_SCOPE_INVALID') END;

  SELECT CASE WHEN NEW.scope_type = 'volume' AND NOT EXISTS (
    SELECT 1 FROM volumes volume
     WHERE volume.id = NEW.scope_id
       AND volume.project_id = NEW.project_id
       AND volume.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'GENERATION_VOLUME_SCOPE_INVALID') END;

  SELECT CASE WHEN NEW.scope_type = 'chapter' AND NOT EXISTS (
    SELECT 1
      FROM chapters chapter
      JOIN volumes volume ON volume.id = chapter.volume_id
     WHERE chapter.id = NEW.scope_id
       AND volume.project_id = NEW.project_id
       AND chapter.deleted_at IS NULL
       AND volume.deleted_at IS NULL
       AND NEW.chapter_id = NEW.scope_id
  ) THEN RAISE(ABORT, 'GENERATION_CHAPTER_SCOPE_INVALID') END;

  SELECT CASE WHEN NEW.scope_type = 'scene' AND NOT EXISTS (
    SELECT 1 FROM scene_beats beat
     WHERE beat.id = NEW.scope_id
       AND beat.project_id = NEW.project_id
       AND beat.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'GENERATION_SCENE_SCOPE_INVALID') END;

  SELECT CASE WHEN NEW.scope_type = 'entity' AND NOT EXISTS (
    SELECT 1 FROM entities entity
     WHERE entity.id = NEW.scope_id
       AND entity.project_id = NEW.project_id
       AND entity.status = 'active'
  ) THEN RAISE(ABORT, 'GENERATION_ENTITY_SCOPE_INVALID') END;

  SELECT CASE WHEN NEW.scope_type = 'selection' AND NOT EXISTS (
    SELECT 1
      FROM draft_blocks block
      JOIN drafts draft ON draft.id = block.draft_id
      JOIN chapters chapter ON chapter.id = draft.chapter_id
      JOIN volumes volume ON volume.id = chapter.volume_id
     WHERE block.logical_block_id = NEW.scope_id
       AND volume.project_id = NEW.project_id
       AND chapter.active_draft_id = draft.id
       AND draft.status = 'active'
       AND chapter.deleted_at IS NULL
       AND volume.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'GENERATION_SELECTION_SCOPE_INVALID') END;

  SELECT CASE WHEN NEW.chapter_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM chapters chapter
      JOIN volumes volume ON volume.id = chapter.volume_id
     WHERE chapter.id = NEW.chapter_id
       AND volume.project_id = NEW.project_id
       AND chapter.deleted_at IS NULL
       AND volume.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'GENERATION_COMPAT_CHAPTER_SCOPE_INVALID') END;
END;

CREATE TRIGGER trg_generation_runs_scope_update
BEFORE UPDATE OF project_id, scope_type, scope_id, chapter_id, run_type ON generation_runs
BEGIN
  SELECT CASE WHEN NEW.scope_id IS NULL OR length(trim(NEW.scope_id)) = 0
    THEN RAISE(ABORT, 'GENERATION_SCOPE_REQUIRED') END;

  SELECT CASE WHEN NEW.run_type <> 'idea_explore' AND (
    NEW.scope_type <> 'chapter'
    OR NEW.chapter_id IS NULL
    OR NEW.scope_id <> NEW.chapter_id
  ) THEN RAISE(ABORT, 'GENERATION_LEGACY_SCOPE_INVALID') END;

  SELECT CASE WHEN NEW.scope_type = 'project' AND NEW.scope_id <> NEW.project_id
    THEN RAISE(ABORT, 'GENERATION_PROJECT_SCOPE_INVALID') END;

  SELECT CASE WHEN NEW.scope_type = 'volume' AND NOT EXISTS (
    SELECT 1 FROM volumes volume
     WHERE volume.id = NEW.scope_id
       AND volume.project_id = NEW.project_id
       AND volume.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'GENERATION_VOLUME_SCOPE_INVALID') END;

  SELECT CASE WHEN NEW.scope_type = 'chapter' AND NOT EXISTS (
    SELECT 1
      FROM chapters chapter
      JOIN volumes volume ON volume.id = chapter.volume_id
     WHERE chapter.id = NEW.scope_id
       AND volume.project_id = NEW.project_id
       AND chapter.deleted_at IS NULL
       AND volume.deleted_at IS NULL
       AND NEW.chapter_id = NEW.scope_id
  ) THEN RAISE(ABORT, 'GENERATION_CHAPTER_SCOPE_INVALID') END;

  SELECT CASE WHEN NEW.scope_type = 'scene' AND NOT EXISTS (
    SELECT 1 FROM scene_beats beat
     WHERE beat.id = NEW.scope_id
       AND beat.project_id = NEW.project_id
       AND beat.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'GENERATION_SCENE_SCOPE_INVALID') END;

  SELECT CASE WHEN NEW.scope_type = 'entity' AND NOT EXISTS (
    SELECT 1 FROM entities entity
     WHERE entity.id = NEW.scope_id
       AND entity.project_id = NEW.project_id
       AND entity.status = 'active'
  ) THEN RAISE(ABORT, 'GENERATION_ENTITY_SCOPE_INVALID') END;

  SELECT CASE WHEN NEW.scope_type = 'selection' AND NOT EXISTS (
    SELECT 1
      FROM draft_blocks block
      JOIN drafts draft ON draft.id = block.draft_id
      JOIN chapters chapter ON chapter.id = draft.chapter_id
      JOIN volumes volume ON volume.id = chapter.volume_id
     WHERE block.logical_block_id = NEW.scope_id
       AND volume.project_id = NEW.project_id
       AND chapter.active_draft_id = draft.id
       AND draft.status = 'active'
       AND chapter.deleted_at IS NULL
       AND volume.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'GENERATION_SELECTION_SCOPE_INVALID') END;

  SELECT CASE WHEN NEW.chapter_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM chapters chapter
      JOIN volumes volume ON volume.id = chapter.volume_id
     WHERE chapter.id = NEW.chapter_id
       AND volume.project_id = NEW.project_id
       AND chapter.deleted_at IS NULL
       AND volume.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'GENERATION_COMPAT_CHAPTER_SCOPE_INVALID') END;
END;

UPDATE projects SET schema_version = 33;
