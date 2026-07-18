CREATE TABLE scene_beats (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  plot_node_id TEXT REFERENCES plot_nodes(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 240),
  goal TEXT NOT NULL DEFAULT '',
  core_conflict TEXT NOT NULL DEFAULT '',
  expected_result TEXT NOT NULL DEFAULT '',
  beat_type TEXT NOT NULL CHECK (
    beat_type IN ('setup', 'development', 'turn', 'climax', 'resolution', 'custom')
  ),
  word_target_percent INTEGER NOT NULL DEFAULT 0 CHECK (
    word_target_percent BETWEEN 0 AND 100
  ),
  is_required INTEGER NOT NULL DEFAULT 0 CHECK (is_required IN (0, 1)),
  order_key INTEGER NOT NULL,
  character_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (
    json_valid(character_ids_json) AND json_type(character_ids_json) = 'array'
  ),
  location_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (
    json_valid(location_ids_json) AND json_type(location_ids_json) = 'array'
  ),
  deleted_at TEXT,
  updated_at TEXT NOT NULL
) STRICT;

CREATE UNIQUE INDEX idx_scene_beats_active_order
ON scene_beats(chapter_id, order_key)
WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX idx_scene_beats_active_title
ON scene_beats(chapter_id, title)
WHERE deleted_at IS NULL;

CREATE INDEX idx_scene_beats_project_chapter_order
ON scene_beats(project_id, chapter_id, deleted_at, order_key, id);

CREATE TABLE scene_beat_block_links (
  scene_beat_id TEXT NOT NULL REFERENCES scene_beats(id) ON DELETE CASCADE,
  draft_block_id TEXT NOT NULL UNIQUE REFERENCES draft_blocks(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(scene_beat_id, draft_block_id)
) WITHOUT ROWID, STRICT;

CREATE INDEX idx_scene_beat_block_links_beat
ON scene_beat_block_links(scene_beat_id, draft_block_id);

UPDATE projects SET schema_version = 11;
