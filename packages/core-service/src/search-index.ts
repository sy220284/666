import type { DatabaseSync } from 'node:sqlite';

import {
  ProjectDictionaryDeleteInputSchema,
  ProjectDictionaryEntrySchema,
  ProjectDictionaryListInputSchema,
  ProjectDictionaryListSchema,
  ProjectDictionaryUpsertInputSchema,
  SearchIndexProcessInputSchema,
  SearchIndexProcessResultSchema,
  SearchIndexRebuildResultSchema,
  SearchIndexStateSchema,
  SearchProjectInputSchema,
  SearchProjectResultSchema,
  SearchResultItemSchema,
  type ProjectDictionaryDeleteInput,
  type ProjectDictionaryEntry,
  type ProjectDictionaryList,
  type ProjectDictionaryListInput,
  type ProjectDictionaryUpsertInput,
  type SearchIndexProcessInput,
  type SearchIndexProcessResult,
  type SearchIndexRebuildResult,
  type SearchIndexState,
  type SearchProjectInput,
  type SearchProjectResult,
  type SearchResultItem,
  type SearchSourceType,
} from '@worldforge/contracts';

import type { DatabaseClock } from './database/index.js';
import type { ProjectWorkspaceService } from './project-workspace.js';

const systemClock: DatabaseClock = { now: () => new Date() };
const sourceTypes = ['draft', 'version', 'entity'] as const satisfies readonly SearchSourceType[];

export type SearchIndexServiceErrorCode =
  | 'SEARCH_INDEX_INVALID'
  | 'SEARCH_INDEX_INVARIANT'
  | 'SEARCH_INDEX_WRITE_FAILED'
  | 'SEARCH_DICTIONARY_AUTHOR_REQUIRED';

export class SearchIndexServiceError extends Error {
  readonly code: SearchIndexServiceErrorCode;

  constructor(code: SearchIndexServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SearchIndexServiceError';
    this.code = code;
  }
}

export interface SearchIndexTarget {
  readonly targetType: SearchSourceType;
  readonly targetId: string;
  readonly operation: 'upsert' | 'delete';
}

export interface SearchIndexServiceOptions {
  readonly clock?: DatabaseClock;
  readonly faultInjector?: (target: SearchIndexTarget) => void;
}

interface QueueRow {
  readonly id: string;
  readonly targetType: SearchSourceType;
  readonly targetId: string;
  readonly operation: 'upsert' | 'delete';
}

interface DictionaryRow {
  readonly term: string;
  readonly normalizedTerm: string;
  readonly category: string;
  readonly action: string;
  readonly replacementTerm: string | null;
  readonly notes: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface FtsHit {
  readonly sourceType: SearchSourceType;
  readonly targetId: string;
  readonly anchorId: string | null;
  readonly score: number;
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new SearchIndexServiceError(
      'SEARCH_INDEX_INVARIANT',
      `Persisted search field ${field} is invalid.`,
    );
  }
  return value;
}

function integer(value: unknown, field: string): number {
  const parsed = typeof value === 'bigint' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed) || parsed < 0) {
    throw new SearchIndexServiceError(
      'SEARCH_INDEX_INVARIANT',
      `Persisted search count ${field} is invalid.`,
    );
  }
  return parsed;
}

function failureCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code.slice(0, 128);
  }
  return 'SEARCH_INDEX_WRITE_FAILED';
}

export function normalizeSearchTerm(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('zh-CN');
}

function compactSearchTerm(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

function fullwidthAsciiVariant(value: string): string {
  return value
    .replace(/[!-~]/gu, (character) => String.fromCharCode(character.charCodeAt(0) + 0xfee0))
    .replaceAll(' ', '　');
}

function searchTermVariants(originalValue: string, normalizedValue: string): string[] {
  return [
    ...new Set(
      [
        compactSearchTerm(originalValue),
        normalizedValue,
        fullwidthAsciiVariant(compactSearchTerm(originalValue)),
        fullwidthAsciiVariant(normalizedValue),
      ].filter((value) => value.length > 0),
    ),
  ];
}

interface NormalizedSearchView {
  readonly value: string;
  readonly starts: readonly number[];
  readonly ends: readonly number[];
}

function normalizedSearchView(value: string): NormalizedSearchView {
  let normalized = '';
  const starts: number[] = [];
  const ends: number[] = [];
  for (const match of value.matchAll(/\P{M}\p{M}*|\p{M}+/gu)) {
    const segment = match[0];
    const start = match.index;
    const end = start + segment.length;
    const transformed = segment.normalize('NFKC').toLocaleLowerCase('zh-CN');
    normalized += transformed;
    for (let index = 0; index < transformed.length; index += 1) {
      starts.push(start);
      ends.push(end);
    }
  }
  return { value: normalized, starts, ends };
}

function parseStringArrayJson(value: unknown, field: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text(value, field));
  } catch (error) {
    throw new SearchIndexServiceError(
      'SEARCH_INDEX_INVARIANT',
      `Persisted search field ${field} is not valid JSON.`,
      { cause: error },
    );
  }
  if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === 'string')) {
    throw new SearchIndexServiceError(
      'SEARCH_INDEX_INVARIANT',
      `Persisted search field ${field} is not a string array.`,
    );
  }
  return parsed;
}

function latestQueueErrorCode(connection: DatabaseSync): string | null {
  const row = connection
    .prepare(
      `SELECT last_error_code AS lastErrorCode
         FROM search_index_queue
        WHERE status = 'failed' AND last_error_code IS NOT NULL
        ORDER BY updated_at DESC, id
        LIMIT 1`,
    )
    .get();
  return row?.lastErrorCode === undefined
    ? null
    : text(row.lastErrorCode, 'lastErrorCode').slice(0, 128);
}

function ftsPhrase(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function ftsMatch(variants: readonly string[], column?: 'title' | 'body'): string {
  const prefix = column ? `${column}:` : '';
  return variants.map((variant) => `${prefix}${ftsPhrase(variant)}`).join(' OR ');
}

function likeClause(column: string, variantCount: number): string {
  return Array.from({ length: variantCount }, () => `instr(lower(${column}), lower(?)) > 0`).join(
    ' OR ',
  );
}

function deduplicateItems(items: readonly SearchResultItem[], limit: number): SearchResultItem[] {
  const seen = new Set<string>();
  return items
    .filter((item) => {
      const key = `${item.sourceType}:${item.targetId}:${item.anchorId ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function parseDictionary(row: DictionaryRow): ProjectDictionaryEntry {
  return ProjectDictionaryEntrySchema.parse(row);
}

function queueCounts(connection: DatabaseSync): { pending: number; failed: number } {
  const row = connection
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
       FROM search_index_queue`,
    )
    .get();
  return {
    pending: integer(row?.pending ?? 0, 'pending'),
    failed: integer(row?.failed ?? 0, 'failed'),
  };
}

function readState(connection: DatabaseSync, projectId: string): SearchIndexState {
  const row = connection
    .prepare(
      `SELECT status, last_indexed_at AS lastIndexedAt, stale_at AS staleAt,
              last_error_code AS lastErrorCode, updated_at AS updatedAt
         FROM search_index_state WHERE singleton_id = 1`,
    )
    .get();
  if (!row) {
    throw new SearchIndexServiceError(
      'SEARCH_INDEX_INVARIANT',
      'The search index state row is missing.',
    );
  }
  const counts = queueCounts(connection);
  return SearchIndexStateSchema.parse({
    projectId,
    status: row.status,
    pendingCount: counts.pending,
    failedCount: counts.failed,
    lastIndexedAt: row.lastIndexedAt,
    staleAt: row.staleAt,
    lastErrorCode: row.lastErrorCode,
    updatedAt: row.updatedAt,
  });
}

function excerpt(content: string, query: string): string {
  const loweredQuery = query.toLocaleLowerCase('zh-CN');
  const directIndex = content.toLocaleLowerCase('zh-CN').indexOf(loweredQuery);
  if (directIndex >= 0) {
    const start = Math.max(0, directIndex - 80);
    const end = Math.min(content.length, directIndex + query.length + 120);
    const value = content.slice(start, end).trim();
    return `${start > 0 ? '…' : ''}${value}${end < content.length ? '…' : ''}`.slice(0, 2_000);
  }
  const view = normalizedSearchView(content);
  const normalizedQuery = normalizeSearchTerm(query);
  const index = view.value.indexOf(normalizedQuery);
  const matchStart = index < 0 ? 0 : (view.starts[index] ?? 0);
  const matchEndIndex = Math.min(
    view.ends.length - 1,
    Math.max(index, index + normalizedQuery.length - 1),
  );
  const matchEnd = index < 0 ? 0 : (view.ends[matchEndIndex] ?? matchStart);
  const start = Math.max(0, matchStart - 80);
  const end = Math.min(content.length, index < 0 ? 120 : matchEnd + 120);
  const value = content.slice(start, end).trim();
  return `${start > 0 ? '…' : ''}${value}${end < content.length ? '…' : ''}`.slice(0, 2_000);
}

function deleteTarget(connection: DatabaseSync, target: SearchIndexTarget): void {
  const statements = {
    draft: 'DELETE FROM fts_draft_blocks WHERE draft_id = ?',
    version: 'DELETE FROM fts_version_blocks WHERE version_id = ?',
    entity: 'DELETE FROM fts_entities WHERE entity_id = ?',
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

function indexTarget(connection: DatabaseSync, projectId: string, target: SearchIndexTarget): void {
  if (target.operation === 'delete') {
    deleteTarget(connection, target);
  } else if (target.targetType === 'draft') {
    indexDraft(connection, projectId, target.targetId);
  } else if (target.targetType === 'version') {
    indexVersion(connection, projectId, target.targetId);
  } else {
    indexEntity(connection, projectId, target.targetId);
  }
}

function dictionaryMatch(
  connection: DatabaseSync,
  normalizedTerm: string,
): ProjectDictionaryEntry | null {
  const row = connection
    .prepare(
      `SELECT term, normalized_term AS normalizedTerm, category, action,
              replacement_term AS replacementTerm, notes,
              created_at AS createdAt, updated_at AS updatedAt
         FROM project_dictionary WHERE normalized_term = ?`,
    )
    .get(normalizedTerm) as DictionaryRow | undefined;
  return row ? parseDictionary(row) : null;
}

function ftsHits(
  connection: DatabaseSync,
  projectId: string,
  queryVariants: readonly string[],
  requestedSources: readonly SearchSourceType[],
  includeArchived: boolean,
  limit: number,
): FtsHit[] {
  const definitions = {
    draft: {
      table: 'fts_draft_blocks',
      target: 'draft_id',
      anchor: 'logical_block_id',
    },
    version: {
      table: 'fts_version_blocks',
      target: 'version_id',
      anchor: 'logical_block_id',
    },
  } as const;
  const hits: FtsHit[] = [];
  for (const sourceType of requestedSources) {
    if (sourceType === 'entity') {
      hits.push(
        ...(connection
          .prepare(
            `SELECT 'entity' AS sourceType, entity_id AS targetId,
                    NULL AS anchorId, bm25(fts_entities) AS score
               FROM fts_entities
              WHERE fts_entities MATCH ? AND project_id = ?
                AND (? = 1 OR status = 'active')
              ORDER BY score, entity_id
              LIMIT ?`,
          )
          .all(
            ftsMatch(queryVariants),
            projectId,
            includeArchived ? 1 : 0,
            limit,
          ) as unknown as FtsHit[]),
      );
      continue;
    }
    const definition = definitions[sourceType];
    hits.push(
      ...(connection
        .prepare(
          `SELECT '${sourceType}' AS sourceType, ${definition.target} AS targetId,
                  ${definition.anchor} AS anchorId, bm25(${definition.table}) AS score
             FROM ${definition.table}
            WHERE ${definition.table} MATCH ? AND project_id = ?
            ORDER BY score, ${definition.target}, ${definition.anchor}
            LIMIT ?`,
        )
        .all(ftsMatch(queryVariants), projectId, limit) as unknown as FtsHit[]),
    );
  }
  return hits
    .map((hit) => ({ ...hit, score: Number(hit.score) }))
    .sort(
      (left, right) =>
        left.score - right.score ||
        left.sourceType.localeCompare(right.sourceType, 'en') ||
        left.targetId.localeCompare(right.targetId, 'en') ||
        (left.anchorId ?? '').localeCompare(right.anchorId ?? '', 'en'),
    )
    .slice(0, limit);
}

function authoritativeItem(
  connection: DatabaseSync,
  projectId: string,
  hit: FtsHit,
  query: string,
  includeArchived: boolean,
): SearchResultItem | null {
  if (hit.sourceType === 'draft') {
    const row = connection
      .prepare(
        `SELECT draft.id AS targetId, block.logical_block_id AS anchorId,
                chapter.id AS chapterId, chapter.title, block.text AS body
           FROM drafts draft
           JOIN draft_blocks block ON block.draft_id = draft.id
           JOIN chapters chapter ON chapter.id = draft.chapter_id
           JOIN volumes volume ON volume.id = chapter.volume_id
          WHERE draft.id = ? AND block.logical_block_id = ? AND volume.project_id = ?
            AND draft.status = 'active' AND chapter.deleted_at IS NULL
            AND volume.deleted_at IS NULL`,
      )
      .get(hit.targetId, hit.anchorId, projectId);
    if (!row) return null;
    const title = text(row.title, 'draftTitle');
    const body = text(row.body, 'draftBody');
    const normalizedQuery = normalizeSearchTerm(query);
    const loweredQuery = query.toLocaleLowerCase('zh-CN');
    const bodyMatches =
      body.toLocaleLowerCase('zh-CN').includes(loweredQuery) ||
      normalizedSearchView(body).value.includes(normalizedQuery);
    const titleMatches =
      title.toLocaleLowerCase('zh-CN').includes(loweredQuery) ||
      normalizedSearchView(title).value.includes(normalizedQuery);
    const anchorId = !bodyMatches && titleMatches ? null : row.anchorId;
    return SearchResultItemSchema.parse({
      sourceType: 'draft',
      targetId: row.targetId,
      anchorId,
      chapterId: row.chapterId,
      title,
      excerpt: excerpt(anchorId === null ? title : body, query),
      score: hit.score,
    });
  }
  if (hit.sourceType === 'version') {
    const row = connection
      .prepare(
        `SELECT version.id AS targetId, block.logical_block_id AS anchorId,
                chapter.id AS chapterId, chapter.title, block.text AS body
           FROM versions version
           JOIN version_blocks block ON block.version_id = version.id
           JOIN chapters chapter ON chapter.id = version.chapter_id
           JOIN volumes volume ON volume.id = chapter.volume_id
          WHERE version.id = ? AND block.logical_block_id = ? AND volume.project_id = ?
            AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL`,
      )
      .get(hit.targetId, hit.anchorId, projectId);
    if (!row) return null;
    const title = text(row.title, 'versionTitle');
    const body = text(row.body, 'versionBody');
    const normalizedQuery = normalizeSearchTerm(query);
    const loweredQuery = query.toLocaleLowerCase('zh-CN');
    const bodyMatches =
      body.toLocaleLowerCase('zh-CN').includes(loweredQuery) ||
      normalizedSearchView(body).value.includes(normalizedQuery);
    const titleMatches =
      title.toLocaleLowerCase('zh-CN').includes(loweredQuery) ||
      normalizedSearchView(title).value.includes(normalizedQuery);
    const anchorId = !bodyMatches && titleMatches ? null : row.anchorId;
    return SearchResultItemSchema.parse({
      sourceType: 'version',
      targetId: row.targetId,
      anchorId,
      chapterId: row.chapterId,
      title,
      excerpt: excerpt(anchorId === null ? title : body, query),
      score: hit.score,
    });
  }
  const row = connection
    .prepare(
      `SELECT entity.id AS targetId, entity.name, entity.aliases_json AS aliasesJson,
              entity.summary,
              COALESCE((
                SELECT group_concat(fact.fact_key || ' ' || fact.value_json || ' ' || fact.description, '
')
                  FROM canon_facts fact
                 WHERE fact.entity_id = entity.id AND fact.project_id = entity.project_id
                   AND fact.status = 'current'
              ), '') AS facts
         FROM entities entity
        WHERE entity.id = ? AND entity.project_id = ?
          AND (? = 1 OR entity.status = 'active')`,
    )
    .get(hit.targetId, projectId, includeArchived ? 1 : 0);
  if (!row) return null;
  const aliases = parseStringArrayJson(row.aliasesJson, 'aliasesJson');
  const content = `${text(row.name, 'entityName')} ${aliases.join(' ')} ${text(
    row.summary,
    'entitySummary',
  )} ${text(row.facts, 'entityFacts')}`;
  return SearchResultItemSchema.parse({
    sourceType: 'entity',
    targetId: row.targetId,
    anchorId: null,
    chapterId: null,
    title: row.name,
    excerpt: excerpt(content, query),
    score: hit.score,
  });
}

function authoritativeLike(
  connection: DatabaseSync,
  projectId: string,
  queryVariants: readonly string[],
  query: string,
  requestedSources: readonly SearchSourceType[],
  includeArchived: boolean,
  limit: number,
): SearchResultItem[] {
  const hits: FtsHit[] = [];
  if (requestedSources.includes('draft')) {
    hits.push(
      ...(connection
        .prepare(
          `SELECT 'draft' AS sourceType, draft.id AS targetId,
                  NULL AS anchorId, 0 AS score
             FROM drafts draft
             JOIN chapters chapter ON chapter.id = draft.chapter_id
             JOIN volumes volume ON volume.id = chapter.volume_id
            WHERE volume.project_id = ? AND draft.status = 'active'
              AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL
              AND (${likeClause('chapter.title', queryVariants.length)})
            ORDER BY volume.order_key, chapter.order_key, draft.id
            LIMIT ?`,
        )
        .all(projectId, ...queryVariants, limit) as unknown as FtsHit[]),
      ...(connection
        .prepare(
          `SELECT 'draft' AS sourceType, draft.id AS targetId,
                  block.logical_block_id AS anchorId, 0 AS score
             FROM drafts draft
             JOIN draft_blocks block ON block.draft_id = draft.id
             JOIN chapters chapter ON chapter.id = draft.chapter_id
             JOIN volumes volume ON volume.id = chapter.volume_id
            WHERE volume.project_id = ? AND draft.status = 'active'
              AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL
              AND (${likeClause('block.text', queryVariants.length)})
            ORDER BY volume.order_key, chapter.order_key, block.order_key, block.id
            LIMIT ?`,
        )
        .all(projectId, ...queryVariants, limit) as unknown as FtsHit[]),
    );
  }
  if (requestedSources.includes('version')) {
    hits.push(
      ...(connection
        .prepare(
          `SELECT 'version' AS sourceType, version.id AS targetId,
                  NULL AS anchorId, 0 AS score
             FROM versions version
             JOIN chapters chapter ON chapter.id = version.chapter_id
             JOIN volumes volume ON volume.id = chapter.volume_id
            WHERE volume.project_id = ? AND chapter.deleted_at IS NULL
              AND volume.deleted_at IS NULL
              AND (${likeClause('chapter.title', queryVariants.length)})
            ORDER BY version.created_at DESC, version.id
            LIMIT ?`,
        )
        .all(projectId, ...queryVariants, limit) as unknown as FtsHit[]),
      ...(connection
        .prepare(
          `SELECT 'version' AS sourceType, version.id AS targetId,
                  block.logical_block_id AS anchorId, 0 AS score
             FROM versions version
             JOIN version_blocks block ON block.version_id = version.id
             JOIN chapters chapter ON chapter.id = version.chapter_id
             JOIN volumes volume ON volume.id = chapter.volume_id
            WHERE volume.project_id = ? AND chapter.deleted_at IS NULL
              AND volume.deleted_at IS NULL
              AND (${likeClause('block.text', queryVariants.length)})
            ORDER BY version.created_at DESC, block.order_key, block.logical_block_id
            LIMIT ?`,
        )
        .all(projectId, ...queryVariants, limit) as unknown as FtsHit[]),
    );
  }
  if (requestedSources.includes('entity')) {
    hits.push(
      ...(connection
        .prepare(
          `SELECT 'entity' AS sourceType, entity.id AS targetId,
                  NULL AS anchorId, 0 AS score
             FROM entities entity
            WHERE entity.project_id = ? AND (? = 1 OR entity.status = 'active')
              AND (
                (${likeClause('entity.name', queryVariants.length)}) OR
                (${likeClause('entity.aliases_json', queryVariants.length)}) OR
                (${likeClause('entity.summary', queryVariants.length)}) OR
                EXISTS (
                  SELECT 1 FROM canon_facts fact
                   WHERE fact.entity_id = entity.id AND fact.project_id = entity.project_id
                     AND fact.status = 'current'
                     AND (
                       (${likeClause('fact.fact_key', queryVariants.length)}) OR
                       (${likeClause('fact.value_json', queryVariants.length)}) OR
                       (${likeClause('fact.description', queryVariants.length)})
                     )
                )
              )
            ORDER BY entity.status = 'archived', lower(entity.name), entity.id
            LIMIT ?`,
        )
        .all(
          projectId,
          includeArchived ? 1 : 0,
          ...queryVariants,
          ...queryVariants,
          ...queryVariants,
          ...queryVariants,
          ...queryVariants,
          ...queryVariants,
          limit,
        ) as unknown as FtsHit[]),
    );
  }
  return deduplicateItems(
    hits
      .map((hit) => authoritativeItem(connection, projectId, hit, query, includeArchived))
      .filter((item): item is SearchResultItem => item !== null),
    limit,
  );
}

function listDictionaryRows(connection: DatabaseSync): DictionaryRow[] {
  return connection
    .prepare(
      `SELECT term, normalized_term AS normalizedTerm, category, action,
              replacement_term AS replacementTerm, notes,
              created_at AS createdAt, updated_at AS updatedAt
         FROM project_dictionary
        ORDER BY category, normalized_term, term`,
    )
    .all() as unknown as DictionaryRow[];
}

export class SearchIndexService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #faultInjector: ((target: SearchIndexTarget) => void) | undefined;

  constructor(workspace: ProjectWorkspaceService, options: SearchIndexServiceOptions = {}) {
    this.#workspace = workspace;
    this.#clock = options.clock ?? systemClock;
    this.#faultInjector = options.faultInjector;
  }

  getState(projectId: string): SearchIndexState {
    this.#workspace.assertActiveProject(projectId);
    return this.#workspace.readProject(projectId, (connection) => readState(connection, projectId));
  }

  processPending(
    requestId: string,
    raw: SearchIndexProcessInput,
  ): Promise<SearchIndexProcessResult> {
    const input = SearchIndexProcessInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (connection) => {
      const rows = connection
        .prepare(
          `SELECT id, target_type AS targetType, target_id AS targetId, operation
             FROM search_index_queue
            ORDER BY status = 'failed', created_at, id
            LIMIT ?`,
        )
        .all(input.limit) as unknown as QueueRow[];
      const now = this.#clock.now().toISOString();
      let succeeded = 0;
      let failed = 0;
      let lastErrorCode: string | null = null;
      for (const row of rows) {
        const target: SearchIndexTarget = {
          targetType: row.targetType,
          targetId: row.targetId,
          operation: row.operation,
        };
        try {
          this.#faultInjector?.(target);
          indexTarget(connection, input.projectId, target);
          connection.prepare('DELETE FROM search_index_queue WHERE id = ?').run(row.id);
          succeeded += 1;
        } catch (error) {
          lastErrorCode = failureCode(error);
          connection
            .prepare(
              `UPDATE search_index_queue
                  SET status = 'failed', attempt_count = attempt_count + 1,
                      last_error_code = ?, updated_at = ?
                WHERE id = ?`,
            )
            .run(lastErrorCode, now, row.id);
          failed += 1;
        }
      }
      const counts = queueCounts(connection);
      const status = counts.pending === 0 && counts.failed === 0 ? 'ready' : 'stale';
      const stateErrorCode =
        status === 'ready' ? null : (lastErrorCode ?? latestQueueErrorCode(connection));
      connection
        .prepare(
          `UPDATE search_index_state
              SET status = ?,
                  last_indexed_at = CASE WHEN ? = 'ready' THEN ? ELSE last_indexed_at END,
                  stale_at = CASE WHEN ? = 'ready' THEN NULL ELSE COALESCE(stale_at, ?) END,
                  last_error_code = ?, updated_at = ?
            WHERE singleton_id = 1`,
        )
        .run(status, status, now, status, now, stateErrorCode, now);
      return SearchIndexProcessResultSchema.parse({
        projectId: input.projectId,
        processed: rows.length,
        succeeded,
        failed,
        remaining: counts.pending + counts.failed,
        status,
      });
    });
  }

  rebuild(requestId: string, projectId: string): Promise<SearchIndexRebuildResult> {
    this.#workspace.assertActiveProject(projectId, true);
    return this.#workspace.writeProject(requestId, projectId, (connection) => {
      const now = this.#clock.now().toISOString();
      connection
        .prepare(
          `UPDATE search_index_state
              SET status = 'rebuilding', stale_at = COALESCE(stale_at, ?),
                  last_error_code = NULL, updated_at = ?
            WHERE singleton_id = 1`,
        )
        .run(now, now);
      connection.prepare('DELETE FROM fts_draft_blocks').run();
      connection.prepare('DELETE FROM fts_version_blocks').run();
      connection.prepare('DELETE FROM fts_entities').run();
      connection.prepare('DELETE FROM search_index_queue').run();
      const targets: SearchIndexTarget[] = [
        ...connection
          .prepare(
            `SELECT draft.id FROM drafts draft
             JOIN chapters chapter ON chapter.id = draft.chapter_id
             JOIN volumes volume ON volume.id = chapter.volume_id
            WHERE volume.project_id = ? AND draft.status = 'active'
            ORDER BY draft.id`,
          )
          .all(projectId)
          .map((row) => ({
            targetType: 'draft' as const,
            targetId: text(row.id, 'draftId'),
            operation: 'upsert' as const,
          })),
        ...connection
          .prepare(
            `SELECT version.id FROM versions version
             JOIN chapters chapter ON chapter.id = version.chapter_id
             JOIN volumes volume ON volume.id = chapter.volume_id
            WHERE volume.project_id = ? ORDER BY version.id`,
          )
          .all(projectId)
          .map((row) => ({
            targetType: 'version' as const,
            targetId: text(row.id, 'versionId'),
            operation: 'upsert' as const,
          })),
        ...connection
          .prepare('SELECT id FROM entities WHERE project_id = ? ORDER BY id')
          .all(projectId)
          .map((row) => ({
            targetType: 'entity' as const,
            targetId: text(row.id, 'entityId'),
            operation: 'upsert' as const,
          })),
      ];
      const counts = { draft: 0, version: 0, entity: 0 };
      let failedCount = 0;
      let lastErrorCode: string | null = null;
      for (const target of targets) {
        try {
          this.#faultInjector?.(target);
          indexTarget(connection, projectId, target);
          counts[target.targetType] += 1;
        } catch (error) {
          failedCount += 1;
          lastErrorCode = failureCode(error);
          connection
            .prepare(
              `INSERT INTO search_index_queue(
                 id, target_type, target_id, operation, status, attempt_count,
                 last_error_code, created_at, updated_at
               ) VALUES(?, ?, ?, ?, 'failed', 1, ?, ?, ?)`,
            )
            .run(
              `rebuild-${target.targetType}-${target.targetId}`,
              target.targetType,
              target.targetId,
              target.operation,
              lastErrorCode,
              now,
              now,
            );
        }
      }
      const status = failedCount === 0 ? 'ready' : 'stale';
      connection
        .prepare(
          `UPDATE search_index_state
              SET status = ?,
                  last_indexed_at = CASE WHEN ? = 'ready' THEN ? ELSE last_indexed_at END,
                  stale_at = CASE WHEN ? = 'ready' THEN NULL ELSE COALESCE(stale_at, ?) END,
                  last_error_code = ?, updated_at = ?
            WHERE singleton_id = 1`,
        )
        .run(status, status, now, status, now, lastErrorCode, now);
      return SearchIndexRebuildResultSchema.parse({
        projectId,
        draftCount: counts.draft,
        versionCount: counts.version,
        entityCount: counts.entity,
        failedCount,
        status,
      });
    });
  }

  search(raw: SearchProjectInput): SearchProjectResult {
    const input = SearchProjectInputSchema.parse(raw);
    const originalQuery = normalizeSearchTerm(input.query);
    if (!originalQuery) {
      throw new SearchIndexServiceError('SEARCH_INDEX_INVALID', 'A search query is required.');
    }
    return this.#workspace.readProject(input.projectId, (connection) => {
      const state = readState(connection, input.projectId);
      const dictionary = dictionaryMatch(connection, originalQuery);
      if (dictionary?.action === 'ignore') {
        return SearchProjectResultSchema.parse({
          projectId: input.projectId,
          query: input.query.trim(),
          normalizedQuery: originalQuery,
          strategy: 'dictionary',
          indexStatus: state.status,
          items: [],
        });
      }
      const effectiveQuery =
        dictionary?.action === 'alias' || dictionary?.action === 'replace'
          ? normalizeSearchTerm(dictionary.replacementTerm ?? '')
          : originalQuery;
      if (!effectiveQuery) {
        throw new SearchIndexServiceError(
          'SEARCH_INDEX_INVARIANT',
          'The dictionary replacement term is invalid.',
        );
      }
      const queryVariants = searchTermVariants(
        dictionary ? effectiveQuery : input.query,
        effectiveQuery,
      );
      const requestedSources = input.sourceTypes ?? [...sourceTypes];
      const useFts = Array.from(effectiveQuery).length >= 3 && state.status === 'ready';
      const items = useFts
        ? deduplicateItems(
            ftsHits(
              connection,
              input.projectId,
              queryVariants,
              requestedSources,
              input.includeArchived,
              input.limit,
            )
              .map((hit) =>
                authoritativeItem(
                  connection,
                  input.projectId,
                  hit,
                  effectiveQuery,
                  input.includeArchived,
                ),
              )
              .filter((item): item is SearchResultItem => item !== null),
            input.limit,
          )
        : authoritativeLike(
            connection,
            input.projectId,
            queryVariants,
            effectiveQuery,
            requestedSources,
            input.includeArchived,
            input.limit,
          );
      return SearchProjectResultSchema.parse({
        projectId: input.projectId,
        query: input.query.trim(),
        normalizedQuery: effectiveQuery,
        strategy: dictionary ? 'dictionary' : useFts ? 'fts' : 'authoritative-like',
        indexStatus: state.status,
        items,
      });
    });
  }

  listDictionary(raw: ProjectDictionaryListInput): ProjectDictionaryList {
    const input = ProjectDictionaryListInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (connection) => {
      const entries = listDictionaryRows(connection)
        .filter((entry) => input.category === undefined || entry.category === input.category)
        .filter((entry) => input.action === undefined || entry.action === input.action)
        .map(parseDictionary);
      return ProjectDictionaryListSchema.parse({ projectId: input.projectId, entries });
    });
  }

  upsertDictionary(
    requestId: string,
    raw: ProjectDictionaryUpsertInput,
  ): Promise<ProjectDictionaryList> {
    const input = ProjectDictionaryUpsertInputSchema.parse(raw);
    if (input.authority !== 'author') {
      throw new SearchIndexServiceError(
        'SEARCH_DICTIONARY_AUTHOR_REQUIRED',
        'Only the author may change the project dictionary.',
      );
    }
    const normalizedTerm = normalizeSearchTerm(input.term);
    const replacementTerm = input.replacementTerm
      ? normalizeSearchTerm(input.replacementTerm)
      : null;
    if (
      (input.action === 'alias' || input.action === 'replace') &&
      replacementTerm === normalizedTerm
    ) {
      throw new SearchIndexServiceError(
        'SEARCH_INDEX_INVALID',
        'A dictionary alias or replacement cannot point to itself.',
      );
    }
    return this.#workspace.writeProject(requestId, input.projectId, (connection) => {
      const now = this.#clock.now().toISOString();
      connection
        .prepare(
          `INSERT INTO project_dictionary(
             term, normalized_term, category, action, replacement_term,
             notes, created_at, updated_at
           ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(normalized_term) DO UPDATE SET
             term = excluded.term, category = excluded.category,
             action = excluded.action, replacement_term = excluded.replacement_term,
             notes = excluded.notes, updated_at = excluded.updated_at`,
        )
        .run(
          input.term.trim(),
          normalizedTerm,
          input.category,
          input.action,
          replacementTerm,
          input.notes,
          now,
          now,
        );
      return ProjectDictionaryListSchema.parse({
        projectId: input.projectId,
        entries: listDictionaryRows(connection).map(parseDictionary),
      });
    });
  }

  deleteDictionary(
    requestId: string,
    raw: ProjectDictionaryDeleteInput,
  ): Promise<ProjectDictionaryList> {
    const input = ProjectDictionaryDeleteInputSchema.parse(raw);
    if (input.authority !== 'author') {
      throw new SearchIndexServiceError(
        'SEARCH_DICTIONARY_AUTHOR_REQUIRED',
        'Only the author may change the project dictionary.',
      );
    }
    return this.#workspace.writeProject(requestId, input.projectId, (connection) => {
      connection
        .prepare('DELETE FROM project_dictionary WHERE normalized_term = ?')
        .run(normalizeSearchTerm(input.term));
      return ProjectDictionaryListSchema.parse({
        projectId: input.projectId,
        entries: listDictionaryRows(connection).map(parseDictionary),
      });
    });
  }
}
