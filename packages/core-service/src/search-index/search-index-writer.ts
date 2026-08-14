import type { DatabaseSync } from 'node:sqlite';

import { parseStringArrayJson, text, type SearchIndexTarget } from './search-index-model.js';

function deleteTarget(connection: DatabaseSync, target: SearchIndexTarget): void {
  const statements = {
    draft: 'DELETE FROM fts_draft_blocks WHERE draft_id = ?',
    version: 'DELETE FROM fts_version_blocks WHERE version_id = ?',
    entity: 'DELETE FROM fts_entities WHERE entity_id = ?',
    research: 'DELETE FROM fts_research_notes WHERE note_id = ?',
  } as const;
  connection.prepare(statements[target.targetType]).run(target.targetId);
}

function indexDraft(connection: DatabaseSync, projectId: string, draftId: string): void {
  deleteTarget(connection, { targetType: 'draft', targetId: draftId, operation: 'delete' });
  const rows = connection
    .prepare(
      `SELECT draft.id AS draftId, block.logical_block_id AS logicalBlockId,
              chapter.id AS chapterId, chapter.title, block.text AS body
         FROM drafts draft
         JOIN draft_blocks block ON block.draft_id = draft.id
         JOIN chapters chapter ON chapter.id = draft.chapter_id
         JOIN volumes volume ON volume.id = chapter.volume_id
        WHERE draft.id = ? AND volume.project_id = ? AND draft.status = 'active'
          AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL
        ORDER BY block.order_key, block.id`,
    )
    .all(draftId, projectId);
  const insert = connection.prepare(
    `INSERT INTO fts_draft_blocks(
       project_id, draft_id, logical_block_id, chapter_id, title, body
     ) VALUES(?, ?, ?, ?, ?, ?)`,
  );
  for (const [index, row] of rows.entries()) {
    insert.run(
      projectId,
      text(row.draftId, 'draftId'),
      text(row.logicalBlockId, 'logicalBlockId'),
      text(row.chapterId, 'chapterId'),
      index === 0 ? text(row.title, 'title') : '',
      text(row.body, 'body'),
    );
  }
}

function indexVersion(connection: DatabaseSync, projectId: string, versionId: string): void {
  deleteTarget(connection, { targetType: 'version', targetId: versionId, operation: 'delete' });
  const rows = connection
    .prepare(
      `SELECT version.id AS versionId, block.logical_block_id AS logicalBlockId,
              chapter.id AS chapterId, chapter.title, block.text AS body
         FROM versions version
         JOIN version_blocks block ON block.version_id = version.id
         JOIN chapters chapter ON chapter.id = version.chapter_id
         JOIN volumes volume ON volume.id = chapter.volume_id
        WHERE version.id = ? AND volume.project_id = ?
          AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL
        ORDER BY block.order_key, block.logical_block_id`,
    )
    .all(versionId, projectId);
  const insert = connection.prepare(
    `INSERT INTO fts_version_blocks(
       project_id, version_id, logical_block_id, chapter_id, title, body
     ) VALUES(?, ?, ?, ?, ?, ?)`,
  );
  for (const [index, row] of rows.entries()) {
    insert.run(
      projectId,
      text(row.versionId, 'versionId'),
      text(row.logicalBlockId, 'logicalBlockId'),
      text(row.chapterId, 'chapterId'),
      index === 0 ? text(row.title, 'title') : '',
      text(row.body, 'body'),
    );
  }
}

function indexEntity(connection: DatabaseSync, projectId: string, entityId: string): void {
  deleteTarget(connection, { targetType: 'entity', targetId: entityId, operation: 'delete' });
  const row = connection
    .prepare(
      `SELECT id, entity_type, status, name, aliases_json, summary
         FROM entities WHERE id = ? AND project_id = ?`,
    )
    .get(entityId, projectId);
  if (!row) return;
  const aliases = parseStringArrayJson(row.aliases_json, 'aliasesJson');
  const facts = connection
    .prepare(
      `SELECT fact_key, value_json, description
         FROM canon_facts
        WHERE entity_id = ? AND project_id = ? AND status = 'current'
        ORDER BY fact_key, id`,
    )
    .all(entityId, projectId)
    .map(
      (fact) =>
        `${text(fact.fact_key, 'factKey')} ${text(fact.value_json, 'factValue')} ${text(
          fact.description,
          'factDescription',
        )}`,
    )
    .join('\n');
  connection
    .prepare(
      `INSERT INTO fts_entities(
         project_id, entity_id, entity_type, status, name, aliases, summary, facts
       ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      projectId,
      text(row.id, 'entityId'),
      text(row.entity_type, 'entityType'),
      text(row.status, 'entityStatus'),
      text(row.name, 'entityName'),
      aliases.join('\n'),
      text(row.summary, 'entitySummary'),
      facts,
    );
}

function indexResearch(connection: DatabaseSync, projectId: string, noteId: string): void {
  deleteTarget(connection, { targetType: 'research', targetId: noteId, operation: 'delete' });
  const row = connection
    .prepare(
      `SELECT id, status, title, body, tags_json AS tagsJson, source_uri AS sourceUri
         FROM research_notes WHERE id = ? AND project_id = ?`,
    )
    .get(noteId, projectId);
  if (!row) return;
  connection
    .prepare(
      `INSERT INTO fts_research_notes(
         project_id, note_id, status, title, body, tags, source_uri
       ) VALUES(?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      projectId,
      text(row.id, 'researchNoteId'),
      text(row.status, 'researchStatus'),
      text(row.title, 'researchTitle'),
      text(row.body, 'researchBody'),
      parseStringArrayJson(row.tagsJson, 'researchTags').join(' '),
      row.sourceUri === null ? '' : text(row.sourceUri, 'researchSourceUri'),
    );
}

export function indexTarget(
  connection: DatabaseSync,
  projectId: string,
  target: SearchIndexTarget,
): void {
  if (target.operation === 'delete') {
    deleteTarget(connection, target);
  } else if (target.targetType === 'draft') {
    indexDraft(connection, projectId, target.targetId);
  } else if (target.targetType === 'version') {
    indexVersion(connection, projectId, target.targetId);
  } else if (target.targetType === 'entity') {
    indexEntity(connection, projectId, target.targetId);
  } else {
    indexResearch(connection, projectId, target.targetId);
  }
}
