-- M4-01: rebuildable FTS5 derived data and explicit target queue.
-- Triggers only enqueue authoritative business IDs. Full-text assembly remains in Core.

CREATE TABLE search_index_state (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  status TEXT NOT NULL CHECK (status IN ('ready', 'stale', 'rebuilding')),
  last_indexed_at TEXT,
  stale_at TEXT,
  last_error_code TEXT,
  updated_at TEXT NOT NULL,
  CHECK (
    (status = 'ready' AND stale_at IS NULL AND last_error_code IS NULL) OR
    status IN ('stale', 'rebuilding')
  )
) STRICT;

INSERT INTO search_index_state(
  singleton_id, status, last_indexed_at, stale_at, last_error_code, updated_at
) VALUES(
  1, 'stale', NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

CREATE TABLE search_index_queue (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('draft', 'version', 'entity')),
  target_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(target_type, target_id)
) STRICT;

CREATE INDEX idx_search_index_queue_status
ON search_index_queue(status, created_at, id);

CREATE VIRTUAL TABLE fts_draft_blocks USING fts5(
  project_id UNINDEXED,
  draft_id UNINDEXED,
  logical_block_id UNINDEXED,
  chapter_id UNINDEXED,
  title,
  body,
  tokenize = 'trigram'
);

CREATE VIRTUAL TABLE fts_version_blocks USING fts5(
  project_id UNINDEXED,
  version_id UNINDEXED,
  logical_block_id UNINDEXED,
  chapter_id UNINDEXED,
  title,
  body,
  tokenize = 'trigram'
);

CREATE VIRTUAL TABLE fts_entities USING fts5(
  project_id UNINDEXED,
  entity_id UNINDEXED,
  entity_type UNINDEXED,
  status UNINDEXED,
  name,
  aliases,
  summary,
  facts,
  tokenize = 'trigram'
);

INSERT INTO search_index_queue(
  id, target_type, target_id, operation, status, attempt_count,
  last_error_code, created_at, updated_at
)
SELECT 'migration-draft-' || id, 'draft', id, 'upsert', 'pending', 0,
       NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM drafts;

INSERT INTO search_index_queue(
  id, target_type, target_id, operation, status, attempt_count,
  last_error_code, created_at, updated_at
)
SELECT 'migration-version-' || id, 'version', id, 'upsert', 'pending', 0,
       NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM versions;

INSERT INTO search_index_queue(
  id, target_type, target_id, operation, status, attempt_count,
  last_error_code, created_at, updated_at
)
SELECT 'migration-entity-' || id, 'entity', id, 'upsert', 'pending', 0,
       NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM entities;

CREATE TRIGGER trg_search_queue_draft_after_insert
AFTER INSERT ON drafts
BEGIN
  INSERT INTO search_index_queue(id, target_type, target_id, operation, status, attempt_count, last_error_code, created_at, updated_at)
  VALUES('draft-' || NEW.id, 'draft', NEW.id, 'upsert', 'pending', 0, NULL,
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(target_type, target_id) DO UPDATE SET
    operation = 'upsert', status = 'pending', attempt_count = 0, last_error_code = NULL,
    updated_at = excluded.updated_at;
  UPDATE search_index_state SET status = 'stale',
    stale_at = COALESCE(stale_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_error_code = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE singleton_id = 1;
END;

CREATE TRIGGER trg_search_queue_draft_after_update
AFTER UPDATE OF status, chapter_id ON drafts
BEGIN
  INSERT INTO search_index_queue(id, target_type, target_id, operation, status, attempt_count, last_error_code, created_at, updated_at)
  VALUES('draft-' || NEW.id, 'draft', NEW.id, 'upsert', 'pending', 0, NULL,
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(target_type, target_id) DO UPDATE SET
    operation = 'upsert', status = 'pending', attempt_count = 0, last_error_code = NULL,
    updated_at = excluded.updated_at;
  UPDATE search_index_state SET status = 'stale',
    stale_at = COALESCE(stale_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_error_code = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE singleton_id = 1;
END;

CREATE TRIGGER trg_search_queue_draft_after_delete
AFTER DELETE ON drafts
BEGIN
  INSERT INTO search_index_queue(id, target_type, target_id, operation, status, attempt_count, last_error_code, created_at, updated_at)
  VALUES('draft-' || OLD.id, 'draft', OLD.id, 'delete', 'pending', 0, NULL,
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(target_type, target_id) DO UPDATE SET
    operation = 'delete', status = 'pending', attempt_count = 0, last_error_code = NULL,
    updated_at = excluded.updated_at;
  UPDATE search_index_state SET status = 'stale',
    stale_at = COALESCE(stale_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_error_code = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE singleton_id = 1;
END;

CREATE TRIGGER trg_search_queue_draft_block_after_insert
AFTER INSERT ON draft_blocks
BEGIN
  INSERT INTO search_index_queue(id, target_type, target_id, operation, status, attempt_count, last_error_code, created_at, updated_at)
  VALUES('draft-' || NEW.draft_id, 'draft', NEW.draft_id, 'upsert', 'pending', 0, NULL,
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(target_type, target_id) DO UPDATE SET
    operation = 'upsert', status = 'pending', attempt_count = 0, last_error_code = NULL,
    updated_at = excluded.updated_at;
  UPDATE search_index_state SET status = 'stale',
    stale_at = COALESCE(stale_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_error_code = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE singleton_id = 1;
END;

CREATE TRIGGER trg_search_queue_draft_block_after_update
AFTER UPDATE OF draft_id, logical_block_id, order_key, block_type, text, attributes_json, source, locked, content_hash, revision ON draft_blocks
BEGIN
  INSERT INTO search_index_queue(id, target_type, target_id, operation, status, attempt_count, last_error_code, created_at, updated_at)
  VALUES('draft-' || OLD.draft_id, 'draft', OLD.draft_id, 'upsert', 'pending', 0, NULL,
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(target_type, target_id) DO UPDATE SET
    operation = 'upsert', status = 'pending', attempt_count = 0, last_error_code = NULL,
    updated_at = excluded.updated_at;
  INSERT INTO search_index_queue(id, target_type, target_id, operation, status, attempt_count, last_error_code, created_at, updated_at)
  VALUES('draft-' || NEW.draft_id, 'draft', NEW.draft_id, 'upsert', 'pending', 0, NULL,
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(target_type, target_id) DO UPDATE SET
    operation = 'upsert', status = 'pending', attempt_count = 0, last_error_code = NULL,
    updated_at = excluded.updated_at;
  UPDATE search_index_state SET status = 'stale',
    stale_at = COALESCE(stale_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_error_code = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE singleton_id = 1;
END;

CREATE TRIGGER trg_search_queue_draft_block_after_delete
AFTER DELETE ON draft_blocks
BEGIN
  INSERT INTO search_index_queue(id, target_type, target_id, operation, status, attempt_count, last_error_code, created_at, updated_at)
  VALUES('draft-' || OLD.draft_id, 'draft', OLD.draft_id, 'upsert', 'pending', 0, NULL,
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(target_type, target_id) DO UPDATE SET
    operation = 'upsert', status = 'pending', attempt_count = 0, last_error_code = NULL,
    updated_at = excluded.updated_at;
  UPDATE search_index_state SET status = 'stale',
    stale_at = COALESCE(stale_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_error_code = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE singleton_id = 1;
END;

CREATE TRIGGER trg_search_queue_version_after_insert
AFTER INSERT ON versions
BEGIN
  INSERT INTO search_index_queue(id, target_type, target_id, operation, status, attempt_count, last_error_code, created_at, updated_at)
  VALUES('version-' || NEW.id, 'version', NEW.id, 'upsert', 'pending', 0, NULL,
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(target_type, target_id) DO UPDATE SET
    operation = 'upsert', status = 'pending', attempt_count = 0, last_error_code = NULL,
    updated_at = excluded.updated_at;
  UPDATE search_index_state SET status = 'stale',
    stale_at = COALESCE(stale_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_error_code = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE singleton_id = 1;
END;

CREATE TRIGGER trg_search_queue_version_block_after_insert
AFTER INSERT ON version_blocks
BEGIN
  INSERT INTO search_index_queue(id, target_type, target_id, operation, status, attempt_count, last_error_code, created_at, updated_at)
  VALUES('version-' || NEW.version_id, 'version', NEW.version_id, 'upsert', 'pending', 0, NULL,
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(target_type, target_id) DO UPDATE SET
    operation = 'upsert', status = 'pending', attempt_count = 0, last_error_code = NULL,
    updated_at = excluded.updated_at;
  UPDATE search_index_state SET status = 'stale',
    stale_at = COALESCE(stale_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_error_code = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE singleton_id = 1;
END;

CREATE TRIGGER trg_search_queue_entity_after_insert
AFTER INSERT ON entities
BEGIN
  INSERT INTO search_index_queue(id, target_type, target_id, operation, status, attempt_count, last_error_code, created_at, updated_at)
  VALUES('entity-' || NEW.id, 'entity', NEW.id, 'upsert', 'pending', 0, NULL,
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(target_type, target_id) DO UPDATE SET
    operation = 'upsert', status = 'pending', attempt_count = 0, last_error_code = NULL,
    updated_at = excluded.updated_at;
  UPDATE search_index_state SET status = 'stale',
    stale_at = COALESCE(stale_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_error_code = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE singleton_id = 1;
END;

CREATE TRIGGER trg_search_queue_entity_after_update
AFTER UPDATE OF entity_type, name, aliases_json, summary, status, archived_at ON entities
BEGIN
  INSERT INTO search_index_queue(id, target_type, target_id, operation, status, attempt_count, last_error_code, created_at, updated_at)
  VALUES('entity-' || NEW.id, 'entity', NEW.id, 'upsert', 'pending', 0, NULL,
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(target_type, target_id) DO UPDATE SET
    operation = 'upsert', status = 'pending', attempt_count = 0, last_error_code = NULL,
    updated_at = excluded.updated_at;
  UPDATE search_index_state SET status = 'stale',
    stale_at = COALESCE(stale_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_error_code = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE singleton_id = 1;
END;

CREATE TRIGGER trg_search_queue_entity_after_delete
AFTER DELETE ON entities
BEGIN
  INSERT INTO search_index_queue(id, target_type, target_id, operation, status, attempt_count, last_error_code, created_at, updated_at)
  VALUES('entity-' || OLD.id, 'entity', OLD.id, 'delete', 'pending', 0, NULL,
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(target_type, target_id) DO UPDATE SET
    operation = 'delete', status = 'pending', attempt_count = 0, last_error_code = NULL,
    updated_at = excluded.updated_at;
  UPDATE search_index_state SET status = 'stale',
    stale_at = COALESCE(stale_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_error_code = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE singleton_id = 1;
END;

CREATE TRIGGER trg_search_queue_canon_fact_after_insert
AFTER INSERT ON canon_facts
BEGIN
  INSERT INTO search_index_queue(id, target_type, target_id, operation, status, attempt_count, last_error_code, created_at, updated_at)
  VALUES('entity-' || NEW.entity_id, 'entity', NEW.entity_id, 'upsert', 'pending', 0, NULL,
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(target_type, target_id) DO UPDATE SET
    operation = 'upsert', status = 'pending', attempt_count = 0, last_error_code = NULL,
    updated_at = excluded.updated_at;
  UPDATE search_index_state SET status = 'stale',
    stale_at = COALESCE(stale_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_error_code = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE singleton_id = 1;
END;

CREATE TRIGGER trg_search_queue_canon_fact_after_update
AFTER UPDATE OF entity_id, fact_key, value_json, description, status ON canon_facts
BEGIN
  INSERT INTO search_index_queue(id, target_type, target_id, operation, status, attempt_count, last_error_code, created_at, updated_at)
  VALUES('entity-' || OLD.entity_id, 'entity', OLD.entity_id, 'upsert', 'pending', 0, NULL,
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(target_type, target_id) DO UPDATE SET
    operation = 'upsert', status = 'pending', attempt_count = 0, last_error_code = NULL,
    updated_at = excluded.updated_at;
  INSERT INTO search_index_queue(id, target_type, target_id, operation, status, attempt_count, last_error_code, created_at, updated_at)
  VALUES('entity-' || NEW.entity_id, 'entity', NEW.entity_id, 'upsert', 'pending', 0, NULL,
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(target_type, target_id) DO UPDATE SET
    operation = 'upsert', status = 'pending', attempt_count = 0, last_error_code = NULL,
    updated_at = excluded.updated_at;
  UPDATE search_index_state SET status = 'stale',
    stale_at = COALESCE(stale_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_error_code = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE singleton_id = 1;
END;

CREATE TRIGGER trg_search_queue_canon_fact_after_delete
AFTER DELETE ON canon_facts
BEGIN
  INSERT INTO search_index_queue(id, target_type, target_id, operation, status, attempt_count, last_error_code, created_at, updated_at)
  VALUES('entity-' || OLD.entity_id, 'entity', OLD.entity_id, 'upsert', 'pending', 0, NULL,
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT(target_type, target_id) DO UPDATE SET
    operation = 'upsert', status = 'pending', attempt_count = 0, last_error_code = NULL,
    updated_at = excluded.updated_at;
  UPDATE search_index_state SET status = 'stale',
    stale_at = COALESCE(stale_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_error_code = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE singleton_id = 1;
END;

CREATE TRIGGER trg_search_queue_chapter_projection_after_update
AFTER UPDATE OF title, volume_id, deleted_at ON chapters
BEGIN
  INSERT INTO search_index_queue(id, target_type, target_id, operation, status, attempt_count, last_error_code, created_at, updated_at)
  SELECT 'draft-' || id, 'draft', id, 'upsert', 'pending', 0, NULL,
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM drafts WHERE chapter_id = NEW.id
  ON CONFLICT(target_type, target_id) DO UPDATE SET
    operation = 'upsert', status = 'pending', attempt_count = 0, last_error_code = NULL,
    updated_at = excluded.updated_at;
  INSERT INTO search_index_queue(id, target_type, target_id, operation, status, attempt_count, last_error_code, created_at, updated_at)
  SELECT 'version-' || id, 'version', id, 'upsert', 'pending', 0, NULL,
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM versions WHERE chapter_id = NEW.id
  ON CONFLICT(target_type, target_id) DO UPDATE SET
    operation = 'upsert', status = 'pending', attempt_count = 0, last_error_code = NULL,
    updated_at = excluded.updated_at;
  UPDATE search_index_state SET status = 'stale',
    stale_at = COALESCE(stale_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_error_code = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE singleton_id = 1;
END;

CREATE TRIGGER trg_search_queue_volume_projection_after_update
AFTER UPDATE OF deleted_at ON volumes
BEGIN
  INSERT INTO search_index_queue(id, target_type, target_id, operation, status, attempt_count, last_error_code, created_at, updated_at)
  SELECT 'draft-' || draft.id, 'draft', draft.id, 'upsert', 'pending', 0, NULL,
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM drafts draft JOIN chapters chapter ON chapter.id = draft.chapter_id
   WHERE chapter.volume_id = NEW.id
  ON CONFLICT(target_type, target_id) DO UPDATE SET
    operation = 'upsert', status = 'pending', attempt_count = 0, last_error_code = NULL,
    updated_at = excluded.updated_at;
  INSERT INTO search_index_queue(id, target_type, target_id, operation, status, attempt_count, last_error_code, created_at, updated_at)
  SELECT 'version-' || version.id, 'version', version.id, 'upsert', 'pending', 0, NULL,
         strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM versions version JOIN chapters chapter ON chapter.id = version.chapter_id
   WHERE chapter.volume_id = NEW.id
  ON CONFLICT(target_type, target_id) DO UPDATE SET
    operation = 'upsert', status = 'pending', attempt_count = 0, last_error_code = NULL,
    updated_at = excluded.updated_at;
  UPDATE search_index_state SET status = 'stale',
    stale_at = COALESCE(stale_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    last_error_code = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE singleton_id = 1;
END;

UPDATE projects SET schema_version = 20;
