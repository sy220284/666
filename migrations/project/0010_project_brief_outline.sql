CREATE TABLE project_briefs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  concept TEXT NOT NULL DEFAULT '',
  reading_promise TEXT NOT NULL DEFAULT '',
  protagonist_goal TEXT NOT NULL DEFAULT '',
  core_conflict TEXT NOT NULL DEFAULT '',
  ending_intent TEXT NOT NULL DEFAULT '',
  required_json TEXT NOT NULL DEFAULT '[]' CHECK (
    json_valid(required_json) AND json_type(required_json) = 'array'
  ),
  forbidden_json TEXT NOT NULL DEFAULT '[]' CHECK (
    json_valid(forbidden_json) AND json_type(forbidden_json) = 'array'
  ),
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE plot_nodes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id TEXT,
  node_type TEXT NOT NULL CHECK (node_type IN ('volume', 'arc', 'chapter')),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 240),
  goal TEXT NOT NULL DEFAULT '',
  core_conflict TEXT NOT NULL DEFAULT '',
  expected_result TEXT NOT NULL DEFAULT '',
  order_key INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'outlined', 'writing', 'reviewing', 'finalized')
  ),
  UNIQUE(id, project_id),
  UNIQUE(project_id, parent_id, order_key),
  FOREIGN KEY(parent_id, project_id) REFERENCES plot_nodes(id, project_id) ON DELETE CASCADE
) STRICT;

CREATE UNIQUE INDEX idx_plot_nodes_sibling_order_unique
ON plot_nodes(project_id, COALESCE(parent_id, ''), order_key);

CREATE INDEX idx_plot_nodes_project_parent_order
ON plot_nodes(project_id, parent_id, order_key, id);

UPDATE projects SET schema_version = 10;
