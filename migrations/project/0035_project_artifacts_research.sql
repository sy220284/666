-- M12-02: managed project artifacts and author-owned research library.
-- Research remains advisory material and never becomes Canon implicitly.

CREATE TABLE research_notes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 240),
  body TEXT NOT NULL DEFAULT '' CHECK(length(body) <= 500000),
  source_uri TEXT CHECK(source_uri IS NULL OR length(source_uri) <= 4096),
  tags_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags_json) AND json_type(tags_json) = 'array'),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
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
  content_hash TEXT NOT NULL CHECK(length(content_hash) = 64 AND content_hash GLOB '[0-9a-f]*'),
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
    'chapter', 'entity', 'relationship', 'timeline', 'foreshadowing', 'arc', 'idea'
  )),
  target_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE(project_id, source_type, source_id, target_type, target_id)
) STRICT;

CREATE INDEX idx_research_links_target
ON research_links(project_id, target_type, target_id, source_type, source_id);

CREATE TABLE generation_research_ref_sets (
  generation_run_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  selection_hash TEXT NOT NULL CHECK(length(selection_hash) = 64 AND selection_hash GLOB '[0-9a-f]*'),
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
  content_hash TEXT NOT NULL CHECK(length(content_hash) = 64 AND content_hash GLOB '[0-9a-f]*'),
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
  source_uri,
  tokenize = 'trigram'
);
