CREATE TABLE command_receipts (
  request_id TEXT NOT NULL,
  command_name TEXT NOT NULL CHECK (length(trim(command_name)) BETWEEN 1 AND 120),
  fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64),
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY(request_id, command_name)
) WITHOUT ROWID, STRICT;

CREATE TABLE semantic_revision (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0)
) WITHOUT ROWID, STRICT;

INSERT INTO semantic_revision(project_id, revision)
SELECT id, 0 FROM projects;

CREATE TRIGGER semantic_revision_projects_insert
AFTER INSERT ON projects BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.id, 0)
  ON CONFLICT(project_id) DO NOTHING;
END;

CREATE TRIGGER semantic_revision_entities_insert
AFTER INSERT ON entities BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_entities_update
AFTER UPDATE ON entities BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_entities_delete
AFTER DELETE ON entities BEGIN
  UPDATE semantic_revision SET revision = revision + 1 WHERE project_id = OLD.project_id;
END;

CREATE TRIGGER semantic_revision_canon_facts_insert
AFTER INSERT ON canon_facts BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_canon_facts_update
AFTER UPDATE ON canon_facts BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_canon_facts_delete
AFTER DELETE ON canon_facts BEGIN
  UPDATE semantic_revision SET revision = revision + 1 WHERE project_id = OLD.project_id;
END;

CREATE TRIGGER semantic_revision_entity_states_insert
AFTER INSERT ON entity_states BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_entity_states_update
AFTER UPDATE ON entity_states BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_entity_states_delete
AFTER DELETE ON entity_states BEGIN
  UPDATE semantic_revision SET revision = revision + 1 WHERE project_id = OLD.project_id;
END;

CREATE TRIGGER semantic_revision_knowledge_states_insert
AFTER INSERT ON knowledge_states BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_knowledge_states_update
AFTER UPDATE ON knowledge_states BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_knowledge_states_delete
AFTER DELETE ON knowledge_states BEGIN
  UPDATE semantic_revision SET revision = revision + 1 WHERE project_id = OLD.project_id;
END;

CREATE TRIGGER semantic_revision_timeline_events_insert
AFTER INSERT ON timeline_events BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_timeline_events_update
AFTER UPDATE ON timeline_events BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_timeline_events_delete
AFTER DELETE ON timeline_events BEGIN
  UPDATE semantic_revision SET revision = revision + 1 WHERE project_id = OLD.project_id;
END;

CREATE TRIGGER semantic_revision_timeline_event_entities_insert
AFTER INSERT ON timeline_event_entities BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_timeline_event_entities_update
AFTER UPDATE ON timeline_event_entities BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_timeline_event_entities_delete
AFTER DELETE ON timeline_event_entities BEGIN
  UPDATE semantic_revision SET revision = revision + 1 WHERE project_id = OLD.project_id;
END;

CREATE TRIGGER semantic_revision_timeline_event_dependencies_insert
AFTER INSERT ON timeline_event_dependencies BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_timeline_event_dependencies_update
AFTER UPDATE ON timeline_event_dependencies BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_timeline_event_dependencies_delete
AFTER DELETE ON timeline_event_dependencies BEGIN
  UPDATE semantic_revision SET revision = revision + 1 WHERE project_id = OLD.project_id;
END;

CREATE TRIGGER semantic_revision_foreshadowings_insert
AFTER INSERT ON foreshadowings BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_foreshadowings_update
AFTER UPDATE ON foreshadowings BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_foreshadowings_delete
AFTER DELETE ON foreshadowings BEGIN
  UPDATE semantic_revision SET revision = revision + 1 WHERE project_id = OLD.project_id;
END;

CREATE TRIGGER semantic_revision_foreshadowing_chapters_insert
AFTER INSERT ON foreshadowing_chapters BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_foreshadowing_chapters_update
AFTER UPDATE ON foreshadowing_chapters BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_foreshadowing_chapters_delete
AFTER DELETE ON foreshadowing_chapters BEGIN
  UPDATE semantic_revision SET revision = revision + 1 WHERE project_id = OLD.project_id;
END;

CREATE TRIGGER semantic_revision_foreshadowing_relations_insert
AFTER INSERT ON foreshadowing_relations BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_foreshadowing_relations_update
AFTER UPDATE ON foreshadowing_relations BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_foreshadowing_relations_delete
AFTER DELETE ON foreshadowing_relations BEGIN
  UPDATE semantic_revision SET revision = revision + 1 WHERE project_id = OLD.project_id;
END;

CREATE TRIGGER semantic_revision_character_arcs_insert
AFTER INSERT ON character_arcs BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_character_arcs_update
AFTER UPDATE ON character_arcs BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_character_arcs_delete
AFTER DELETE ON character_arcs BEGIN
  UPDATE semantic_revision SET revision = revision + 1 WHERE project_id = OLD.project_id;
END;

CREATE TRIGGER semantic_revision_arc_milestones_insert
AFTER INSERT ON arc_milestones BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_arc_milestones_update
AFTER UPDATE ON arc_milestones BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_arc_milestones_delete
AFTER DELETE ON arc_milestones BEGIN
  UPDATE semantic_revision SET revision = revision + 1 WHERE project_id = OLD.project_id;
END;

CREATE TRIGGER semantic_revision_arc_milestone_dependencies_insert
AFTER INSERT ON arc_milestone_dependencies BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_arc_milestone_dependencies_update
AFTER UPDATE ON arc_milestone_dependencies BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_arc_milestone_dependencies_delete
AFTER DELETE ON arc_milestone_dependencies BEGIN
  UPDATE semantic_revision SET revision = revision + 1 WHERE project_id = OLD.project_id;
END;

CREATE TRIGGER semantic_revision_arc_milestone_timeline_dependencies_insert
AFTER INSERT ON arc_milestone_timeline_dependencies BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_arc_milestone_timeline_dependencies_update
AFTER UPDATE ON arc_milestone_timeline_dependencies BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_arc_milestone_timeline_dependencies_delete
AFTER DELETE ON arc_milestone_timeline_dependencies BEGIN
  UPDATE semantic_revision SET revision = revision + 1 WHERE project_id = OLD.project_id;
END;

CREATE TRIGGER semantic_revision_derived_invalidations_insert
AFTER INSERT ON derived_invalidations BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_derived_invalidations_update
AFTER UPDATE ON derived_invalidations BEGIN
  INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
  ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
END;
CREATE TRIGGER semantic_revision_derived_invalidations_delete
AFTER DELETE ON derived_invalidations BEGIN
  UPDATE semantic_revision SET revision = revision + 1 WHERE project_id = OLD.project_id;
END;

-- migration-policy: allow-unscoped-write
UPDATE projects SET schema_version = 30;
