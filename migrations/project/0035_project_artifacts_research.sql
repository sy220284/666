-- M12-02: managed project artifacts and author-owned research library.
-- Research remains advisory material and never becomes Canon implicitly.

CREATE TABLE research_notes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 240),
  body TEXT NOT NULL DEFAULT '' CHECK(length(body) <= 500000),
  source_type TEXT CHECK(source_type IS NULL OR length(trim(source_type)) BETWEEN 1 AND 80),
  source_label TEXT CHECK(source_label IS NULL OR length(trim(source_label)) BETWEEN 1 AND 240),
  source_uri TEXT CHECK(source_uri IS NULL OR length(source_uri) <= 4096),
  tags_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags_json) AND json_type(tags_json) = 'array'),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  CHECK((status = 'active' AND archived_at IS NULL) OR (status = 'archived' AND archived_at IS NOT NULL)),
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_research_notes_project_status_updated
ON research_notes(project_id, status, updated_at DESC, id);

CREATE TABLE research_attachments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  note_id TEXT,
  display_name TEXT NOT NULL CHECK(length(trim(display_name)) BETWEEN 1 AND 240),
  media_type TEXT NOT NULL CHECK(length(media_type) BETWEEN 1 AND 255),
  size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0 AND size_bytes <= 268435456),
  content_hash TEXT NOT NULL CHECK(
    length(content_hash) = 64 AND content_hash NOT GLOB '*[^0-9a-f]*'
  ),
  managed_relative_path TEXT NOT NULL UNIQUE CHECK(
    length(managed_relative_path) BETWEEN 1 AND 1024 AND
    managed_relative_path NOT LIKE '/%' AND
    managed_relative_path NOT LIKE '\\%' AND
    managed_relative_path NOT LIKE '%..%'
  ),
  created_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY(note_id) REFERENCES research_notes(id) ON DELETE SET NULL
) STRICT;

CREATE INDEX idx_research_attachments_project_note
ON research_attachments(project_id, note_id, created_at DESC, id);

CREATE TABLE research_links (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('note', 'attachment')),
  source_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK(target_type IN (
    'chapter', 'volume', 'entity', 'relationship', 'timeline', 'foreshadowing', 'arc', 'milestone', 'idea'
  )),
  target_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id, source_type, source_id, target_type, target_id)
) STRICT;

CREATE INDEX idx_research_links_target
ON research_links(project_id, target_type, target_id, source_type, source_id);

CREATE TRIGGER cleanup_research_links_on_chapter_delete
AFTER DELETE ON chapters
BEGIN
  DELETE FROM research_links WHERE target_type = 'chapter' AND target_id = OLD.id;
END;

CREATE TRIGGER cleanup_research_links_on_chapter_soft_delete
AFTER UPDATE OF deleted_at ON chapters
WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
BEGIN
  DELETE FROM research_links WHERE target_type = 'chapter' AND target_id = NEW.id;
END;

CREATE TRIGGER cleanup_research_links_on_volume_delete
AFTER DELETE ON volumes
BEGIN
  DELETE FROM research_links WHERE target_type = 'volume' AND target_id = OLD.id;
END;

CREATE TRIGGER cleanup_research_links_on_volume_soft_delete
AFTER UPDATE OF deleted_at ON volumes
WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
BEGIN
  DELETE FROM research_links WHERE target_type = 'volume' AND target_id = NEW.id;
  DELETE FROM research_links
   WHERE target_type = 'chapter'
     AND target_id IN (SELECT id FROM chapters WHERE volume_id = NEW.id);
END;

CREATE TRIGGER cleanup_research_links_on_entity_delete
AFTER DELETE ON entities
BEGIN
  DELETE FROM research_links WHERE target_type = 'entity' AND target_id = OLD.id;
END;

CREATE TRIGGER cleanup_research_links_on_relationship_delete
AFTER DELETE ON character_relationships
BEGIN
  DELETE FROM research_links WHERE target_type = 'relationship' AND target_id = OLD.id;
END;

CREATE TRIGGER cleanup_research_links_on_timeline_delete
AFTER DELETE ON timeline_events
BEGIN
  DELETE FROM research_links WHERE target_type = 'timeline' AND target_id = OLD.id;
END;

CREATE TRIGGER cleanup_research_links_on_foreshadowing_delete
AFTER DELETE ON foreshadowings
BEGIN
  DELETE FROM research_links WHERE target_type = 'foreshadowing' AND target_id = OLD.id;
END;

CREATE TRIGGER cleanup_research_links_on_arc_delete
AFTER DELETE ON character_arcs
BEGIN
  DELETE FROM research_links WHERE target_type = 'arc' AND target_id = OLD.id;
END;

CREATE TRIGGER cleanup_research_links_on_milestone_delete
AFTER DELETE ON arc_milestones
BEGIN
  DELETE FROM research_links WHERE target_type = 'milestone' AND target_id = OLD.id;
END;

CREATE TRIGGER cleanup_research_links_on_idea_delete
AFTER DELETE ON idea_cards
BEGIN
  DELETE FROM research_links WHERE target_type = 'idea' AND target_id = OLD.id;
END;

CREATE TABLE generation_research_ref_sets (
  generation_run_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  selection_hash TEXT NOT NULL CHECK(
    length(selection_hash) = 64 AND selection_hash NOT GLOB '*[^0-9a-f]*'
  ),
  added_at TEXT NOT NULL,
  FOREIGN KEY(generation_run_id) REFERENCES generation_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_generation_research_ref_sets_project
ON generation_research_ref_sets(project_id, generation_run_id);

CREATE TABLE generation_research_refs (
  generation_run_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('note', 'attachment')),
  source_id TEXT NOT NULL,
  source_order INTEGER NOT NULL CHECK(source_order >= 0 AND source_order < 20),
  content_hash TEXT NOT NULL CHECK(
    length(content_hash) = 64 AND content_hash NOT GLOB '*[^0-9a-f]*'
  ),
  snapshot_text TEXT NOT NULL CHECK(length(snapshot_text) <= 16000),
  included_chars INTEGER NOT NULL CHECK(included_chars >= 0 AND included_chars <= 16000),
  trimmed INTEGER NOT NULL CHECK(trimmed IN (0, 1)),
  added_at TEXT NOT NULL,
  PRIMARY KEY(generation_run_id, source_type, source_id),
  UNIQUE(generation_run_id, source_order),
  FOREIGN KEY(generation_run_id) REFERENCES generation_research_ref_sets(generation_run_id) ON DELETE CASCADE,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_generation_research_refs_project
ON generation_research_refs(project_id, generation_run_id, source_order);

CREATE VIRTUAL TABLE fts_research_notes USING fts5(
  project_id UNINDEXED,
  note_id UNINDEXED,
  status UNINDEXED,
  title,
  body,
  tags,
  source_type,
  source_label,
  source_uri,
  tokenize = 'trigram'
);

UPDATE projects SET schema_version = 35;