CREATE TABLE foreshadowings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 240),
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (
    status IN ('planned', 'planted', 'reinforced', 'partially_revealed', 'revealed', 'cancelled')
  ),
  reveal_from_chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  reveal_by_chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(id, project_id)
) STRICT;

CREATE INDEX idx_foreshadowings_project_status
ON foreshadowings(project_id, status, updated_at DESC, id);

CREATE TABLE foreshadowing_chapters (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  foreshadowing_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (
    role IN ('plant', 'reinforce', 'partial_reveal', 'reveal', 'reference')
  ),
  created_at TEXT NOT NULL,
  PRIMARY KEY(foreshadowing_id, chapter_id, role),
  FOREIGN KEY(foreshadowing_id, project_id)
    REFERENCES foreshadowings(id, project_id) ON DELETE CASCADE
) WITHOUT ROWID, STRICT;

CREATE INDEX idx_foreshadowing_chapters_chapter
ON foreshadowing_chapters(project_id, chapter_id, foreshadowing_id);

CREATE TABLE foreshadowing_relations (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_foreshadowing_id TEXT NOT NULL,
  target_foreshadowing_id TEXT NOT NULL,
  relation_kind TEXT NOT NULL CHECK (
    relation_kind IN ('depends_on', 'blocks', 'mutually_exclusive', 'reinforces')
  ),
  created_at TEXT NOT NULL,
  PRIMARY KEY(source_foreshadowing_id, target_foreshadowing_id, relation_kind),
  FOREIGN KEY(source_foreshadowing_id, project_id)
    REFERENCES foreshadowings(id, project_id) ON DELETE CASCADE,
  FOREIGN KEY(target_foreshadowing_id, project_id)
    REFERENCES foreshadowings(id, project_id) ON DELETE RESTRICT,
  CHECK (source_foreshadowing_id <> target_foreshadowing_id)
) WITHOUT ROWID, STRICT;

CREATE INDEX idx_foreshadowing_relations_target
ON foreshadowing_relations(project_id, target_foreshadowing_id, relation_kind, source_foreshadowing_id);

CREATE TABLE character_arcs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 240),
  arc_type TEXT NOT NULL CHECK (
    arc_type IN ('growth', 'darkening', 'awakening', 'fall', 'redemption', 'custom')
  ),
  custom_type TEXT CHECK (
    custom_type IS NULL OR length(trim(custom_type)) BETWEEN 1 AND 120
  ),
  status TEXT NOT NULL CHECK (status IN ('planned', 'active', 'completed', 'abandoned')),
  author_intent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(id, project_id),
  FOREIGN KEY(character_id, project_id) REFERENCES entities(id, project_id) ON DELETE RESTRICT,
  CHECK (
    (arc_type = 'custom' AND custom_type IS NOT NULL) OR
    (arc_type <> 'custom' AND custom_type IS NULL)
  )
) STRICT;

CREATE INDEX idx_character_arcs_character
ON character_arcs(project_id, character_id, status, updated_at DESC, id);

CREATE TABLE arc_milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  arc_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 240),
  description TEXT NOT NULL DEFAULT '',
  sort_index INTEGER NOT NULL CHECK (sort_index >= 0),
  planned_chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  actual_chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('planned', 'hit', 'skipped')),
  confirmation_source TEXT CHECK (confirmation_source IN ('author', 'state_proposal')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(id, project_id),
  UNIQUE(arc_id, sort_index),
  FOREIGN KEY(arc_id, project_id) REFERENCES character_arcs(id, project_id) ON DELETE CASCADE,
  CHECK (
    (status = 'planned' AND confirmation_source IS NULL AND actual_chapter_id IS NULL) OR
    (status IN ('hit', 'skipped') AND confirmation_source IS NOT NULL)
  )
) STRICT;

CREATE INDEX idx_arc_milestones_arc
ON arc_milestones(project_id, arc_id, sort_index, id);

CREATE TABLE arc_milestone_dependencies (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_id TEXT NOT NULL,
  dependency_milestone_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(milestone_id, dependency_milestone_id),
  FOREIGN KEY(milestone_id, project_id)
    REFERENCES arc_milestones(id, project_id) ON DELETE CASCADE,
  FOREIGN KEY(dependency_milestone_id, project_id)
    REFERENCES arc_milestones(id, project_id) ON DELETE RESTRICT,
  CHECK (milestone_id <> dependency_milestone_id)
) WITHOUT ROWID, STRICT;

CREATE INDEX idx_arc_milestone_dependencies_reverse
ON arc_milestone_dependencies(project_id, dependency_milestone_id, milestone_id);

CREATE TABLE arc_milestone_timeline_dependencies (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_id TEXT NOT NULL,
  timeline_event_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(milestone_id, timeline_event_id),
  FOREIGN KEY(milestone_id, project_id)
    REFERENCES arc_milestones(id, project_id) ON DELETE CASCADE,
  FOREIGN KEY(timeline_event_id, project_id)
    REFERENCES timeline_events(id, project_id) ON DELETE RESTRICT
) WITHOUT ROWID, STRICT;

CREATE INDEX idx_arc_milestone_timeline_dependencies_event
ON arc_milestone_timeline_dependencies(project_id, timeline_event_id, milestone_id);

UPDATE projects SET schema_version = 14;
