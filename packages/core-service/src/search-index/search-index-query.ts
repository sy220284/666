import type { DatabaseSync } from 'node:sqlite';

import {
  SearchResultItemSchema,
  type SearchResultItem,
  type SearchSourceType,
} from '@worldforge/contracts';

import {
  deduplicateItems,
  excerpt,
  ftsMatch,
  likeClause,
  normalizeSearchTerm,
  normalizedSearchView,
  parseStringArrayJson,
  text,
  type FtsHit,
} from './search-index-model.js';
import { sqliteResult } from '../database/sqlite-result.js';

export function ftsHits(
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
        ...sqliteResult<FtsHit[]>(
          connection
            .prepare(
              `SELECT 'entity' AS sourceType, entity_id AS targetId,
                    NULL AS anchorId, bm25(fts_entities) AS score
               FROM fts_entities
              WHERE fts_entities MATCH ? AND project_id = ?
                AND (? = 1 OR status = 'active')
              ORDER BY score, entity_id
              LIMIT ?`,
            )
            .all(ftsMatch(queryVariants), projectId, includeArchived ? 1 : 0, limit),
        ),
      );
      continue;
    }
    const definition = definitions[sourceType];
    hits.push(
      ...sqliteResult<FtsHit[]>(
        connection
          .prepare(
            `SELECT '${sourceType}' AS sourceType, ${definition.target} AS targetId,
                  ${definition.anchor} AS anchorId, bm25(${definition.table}) AS score
             FROM ${definition.table}
            WHERE ${definition.table} MATCH ? AND project_id = ?
            ORDER BY score, ${definition.target}, ${definition.anchor}
            LIMIT ?`,
          )
          .all(ftsMatch(queryVariants), projectId, limit),
      ),
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

export function authoritativeItem(
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
                SELECT group_concat(fact.fact_key || ' ' || fact.value_json || ' ' || fact.description, '\n')
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

export function authoritativeLike(
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
      ...sqliteResult<FtsHit[]>(
        connection
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
          .all(projectId, ...queryVariants, limit),
      ),
      ...sqliteResult<FtsHit[]>(
        connection
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
          .all(projectId, ...queryVariants, limit),
      ),
    );
  }
  if (requestedSources.includes('version')) {
    hits.push(
      ...sqliteResult<FtsHit[]>(
        connection
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
          .all(projectId, ...queryVariants, limit),
      ),
      ...sqliteResult<FtsHit[]>(
        connection
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
          .all(projectId, ...queryVariants, limit),
      ),
    );
  }
  if (requestedSources.includes('entity')) {
    hits.push(
      ...sqliteResult<FtsHit[]>(
        connection
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
          ),
      ),
    );
  }
  return deduplicateItems(
    hits
      .map((hit) => authoritativeItem(connection, projectId, hit, query, includeArchived))
      .filter((item): item is SearchResultItem => item !== null),
    limit,
  );
}
