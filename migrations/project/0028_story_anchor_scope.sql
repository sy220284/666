CREATE TRIGGER trg_story_todo_anchor_scope_insert_0028
BEFORE INSERT ON story_todos
BEGIN
  SELECT CASE WHEN NEW.scene_beat_id IS NOT NULL AND (
    NEW.chapter_id IS NULL OR NOT EXISTS (
      SELECT 1
        FROM scene_beats beat
       WHERE beat.id = NEW.scene_beat_id
         AND beat.project_id = NEW.project_id
         AND beat.chapter_id = NEW.chapter_id
    )
  ) THEN RAISE(ABORT, 'STORY_TODO_BEAT_CHAPTER_SCOPE_INVALID') END;
  SELECT CASE WHEN NEW.logical_block_id IS NOT NULL AND (
    NEW.chapter_id IS NULL OR NOT EXISTS (
      SELECT 1
        FROM chapters chapter
        JOIN volumes volume ON volume.id = chapter.volume_id
        JOIN drafts draft ON draft.id = chapter.active_draft_id
        JOIN draft_blocks block ON block.draft_id = draft.id
       WHERE chapter.id = NEW.chapter_id
         AND volume.project_id = NEW.project_id
         AND block.logical_block_id = NEW.logical_block_id
    )
  ) THEN RAISE(ABORT, 'STORY_TODO_BLOCK_CHAPTER_SCOPE_INVALID') END;
  SELECT CASE WHEN NEW.validation_issue_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM validation_issues issue
     WHERE issue.id = NEW.validation_issue_id
       AND issue.project_id = NEW.project_id
       AND (NEW.chapter_id IS NULL OR issue.chapter_id IS NEW.chapter_id)
       AND (NEW.logical_block_id IS NULL OR issue.logical_block_id IS NEW.logical_block_id)
  ) THEN RAISE(ABORT, 'STORY_TODO_ISSUE_ANCHOR_SCOPE_INVALID') END;
END;

CREATE TRIGGER trg_story_todo_anchor_scope_update_0028
BEFORE UPDATE OF project_id, chapter_id, scene_beat_id, logical_block_id, validation_issue_id
ON story_todos
BEGIN
  SELECT CASE WHEN NEW.scene_beat_id IS NOT NULL AND (
    NEW.chapter_id IS NULL OR NOT EXISTS (
      SELECT 1
        FROM scene_beats beat
       WHERE beat.id = NEW.scene_beat_id
         AND beat.project_id = NEW.project_id
         AND beat.chapter_id = NEW.chapter_id
    )
  ) THEN RAISE(ABORT, 'STORY_TODO_BEAT_CHAPTER_SCOPE_INVALID') END;
  SELECT CASE WHEN NEW.logical_block_id IS NOT NULL AND (
    NEW.chapter_id IS NULL OR NOT EXISTS (
      SELECT 1
        FROM chapters chapter
        JOIN volumes volume ON volume.id = chapter.volume_id
        JOIN drafts draft ON draft.id = chapter.active_draft_id
        JOIN draft_blocks block ON block.draft_id = draft.id
       WHERE chapter.id = NEW.chapter_id
         AND volume.project_id = NEW.project_id
         AND block.logical_block_id = NEW.logical_block_id
    )
  ) THEN RAISE(ABORT, 'STORY_TODO_BLOCK_CHAPTER_SCOPE_INVALID') END;
  SELECT CASE WHEN NEW.validation_issue_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM validation_issues issue
     WHERE issue.id = NEW.validation_issue_id
       AND issue.project_id = NEW.project_id
       AND (NEW.chapter_id IS NULL OR issue.chapter_id IS NEW.chapter_id)
       AND (NEW.logical_block_id IS NULL OR issue.logical_block_id IS NEW.logical_block_id)
  ) THEN RAISE(ABORT, 'STORY_TODO_ISSUE_ANCHOR_SCOPE_INVALID') END;
END;

CREATE TRIGGER trg_story_comment_anchor_scope_insert_0028
BEFORE INSERT ON story_comments
BEGIN
  SELECT CASE WHEN NEW.source_version_id IS NOT NULL AND (
    NEW.chapter_id IS NULL OR NOT EXISTS (
      SELECT 1
        FROM versions version
        JOIN chapters chapter ON chapter.id = version.chapter_id
        JOIN volumes volume ON volume.id = chapter.volume_id
       WHERE version.id = NEW.source_version_id
         AND chapter.id = NEW.chapter_id
         AND volume.project_id = NEW.project_id
    )
  ) THEN RAISE(ABORT, 'STORY_COMMENT_VERSION_CHAPTER_SCOPE_INVALID') END;
  SELECT CASE WHEN NEW.logical_block_id IS NOT NULL AND NOT (
    (
      NEW.source_version_id IS NOT NULL AND EXISTS (
        SELECT 1
          FROM version_blocks block
         WHERE block.version_id = NEW.source_version_id
           AND block.logical_block_id = NEW.logical_block_id
      )
    ) OR (
      NEW.source_version_id IS NULL
      AND NEW.chapter_id IS NOT NULL
      AND EXISTS (
        SELECT 1
          FROM chapters chapter
          JOIN volumes volume ON volume.id = chapter.volume_id
          JOIN drafts draft ON draft.id = chapter.active_draft_id
          JOIN draft_blocks block ON block.draft_id = draft.id
         WHERE chapter.id = NEW.chapter_id
           AND volume.project_id = NEW.project_id
           AND block.logical_block_id = NEW.logical_block_id
      )
    )
  ) THEN RAISE(ABORT, 'STORY_COMMENT_BLOCK_SOURCE_SCOPE_INVALID') END;
  SELECT CASE WHEN NEW.validation_issue_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM validation_issues issue
     WHERE issue.id = NEW.validation_issue_id
       AND issue.project_id = NEW.project_id
       AND (NEW.chapter_id IS NULL OR issue.chapter_id IS NEW.chapter_id)
       AND (NEW.source_version_id IS NULL OR issue.source_version_id IS NEW.source_version_id)
       AND (NEW.logical_block_id IS NULL OR issue.logical_block_id IS NEW.logical_block_id)
  ) THEN RAISE(ABORT, 'STORY_COMMENT_ISSUE_ANCHOR_SCOPE_INVALID') END;
END;

CREATE TRIGGER trg_story_comment_anchor_scope_update_0028
BEFORE UPDATE OF project_id, chapter_id, source_version_id, logical_block_id, validation_issue_id
ON story_comments
BEGIN
  SELECT CASE WHEN NEW.source_version_id IS NOT NULL AND (
    NEW.chapter_id IS NULL OR NOT EXISTS (
      SELECT 1
        FROM versions version
        JOIN chapters chapter ON chapter.id = version.chapter_id
        JOIN volumes volume ON volume.id = chapter.volume_id
       WHERE version.id = NEW.source_version_id
         AND chapter.id = NEW.chapter_id
         AND volume.project_id = NEW.project_id
    )
  ) THEN RAISE(ABORT, 'STORY_COMMENT_VERSION_CHAPTER_SCOPE_INVALID') END;
  SELECT CASE WHEN NEW.logical_block_id IS NOT NULL AND NOT (
    (
      NEW.source_version_id IS NOT NULL AND EXISTS (
        SELECT 1
          FROM version_blocks block
         WHERE block.version_id = NEW.source_version_id
           AND block.logical_block_id = NEW.logical_block_id
      )
    ) OR (
      NEW.source_version_id IS NULL
      AND NEW.chapter_id IS NOT NULL
      AND EXISTS (
        SELECT 1
          FROM chapters chapter
          JOIN volumes volume ON volume.id = chapter.volume_id
          JOIN drafts draft ON draft.id = chapter.active_draft_id
          JOIN draft_blocks block ON block.draft_id = draft.id
         WHERE chapter.id = NEW.chapter_id
           AND volume.project_id = NEW.project_id
           AND block.logical_block_id = NEW.logical_block_id
      )
    )
  ) THEN RAISE(ABORT, 'STORY_COMMENT_BLOCK_SOURCE_SCOPE_INVALID') END;
  SELECT CASE WHEN NEW.validation_issue_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM validation_issues issue
     WHERE issue.id = NEW.validation_issue_id
       AND issue.project_id = NEW.project_id
       AND (NEW.chapter_id IS NULL OR issue.chapter_id IS NEW.chapter_id)
       AND (NEW.source_version_id IS NULL OR issue.source_version_id IS NEW.source_version_id)
       AND (NEW.logical_block_id IS NULL OR issue.logical_block_id IS NEW.logical_block_id)
  ) THEN RAISE(ABORT, 'STORY_COMMENT_ISSUE_ANCHOR_SCOPE_INVALID') END;
END;

UPDATE projects SET schema_version = 28;
