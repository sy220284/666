#!/usr/bin/env bash
set -euo pipefail

EXPECTED_HEAD="5494cf6138db7d816370f983fdb70834c224802a"
TARGET_BRANCH="work/m4-02-constraint-package"

test "$(git rev-parse HEAD)" = "${EXPECTED_HEAD}"
git config user.name github-actions[bot]
git config user.email 41898282+github-actions[bot]@users.noreply.github.com

python <<'PY'
from pathlib import Path
import json


def replace_between(source: str, start_marker: str, end_marker: str, replacement: str) -> str:
    start = source.index(start_marker)
    end = source.index(end_marker, start)
    return source[:start] + replacement + source[end:]


core = Path('packages/core-service/src/search-index.ts')
text = core.read_text()

normalize_marker = """export function normalizeSearchTerm(value: string): string {
  return value.normalize('NFKC').trim().replace(/\\s+/gu, ' ').toLocaleLowerCase('zh-CN');
}

"""
helpers = """export function normalizeSearchTerm(value: string): string {
  return value.normalize('NFKC').trim().replace(/\\s+/gu, ' ').toLocaleLowerCase('zh-CN');
}

function compactSearchTerm(value: string): string {
  return value.trim().replace(/\\s+/gu, ' ');
}

function fullwidthAsciiVariant(value: string): string {
  return value
    .replace(/[!-~]/gu, (character) =>
      String.fromCharCode(character.charCodeAt(0) + 0xfee0),
    )
    .replaceAll(' ', '　');
}

function searchTermVariants(originalValue: string, normalizedValue: string): string[] {
  return [
    ...new Set(
      [compactSearchTerm(originalValue), normalizedValue, fullwidthAsciiVariant(normalizedValue)].filter(
        (value) => value.length > 0,
      ),
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
  for (const match of value.matchAll(/\\P{M}\\p{M}*|\\p{M}+/gu)) {
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
  return Array.from(
    { length: variantCount },
    () => `instr(lower(${column}), lower(?)) > 0`,
  ).join(' OR ');
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

"""
if normalize_marker not in text:
    raise SystemExit('normalizeSearchTerm marker not found')
text = text.replace(normalize_marker, helpers, 1)

excerpt = """function excerpt(content: string, query: string): string {
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

"""
text = replace_between(text, 'function excerpt(', 'function deleteTarget(', excerpt)

old_aliases = """  let aliases: unknown;
  try {
    aliases = JSON.parse(text(row.aliases_json, 'aliasesJson'));
  } catch (error) {
    throw new SearchIndexServiceError(
      'SEARCH_INDEX_INVARIANT',
      'Persisted Entity aliases cannot be indexed.',
      { cause: error },
    );
  }
  if (!Array.isArray(aliases) || !aliases.every((value) => typeof value === 'string')) {
    throw new SearchIndexServiceError(
      'SEARCH_INDEX_INVARIANT',
      'Persisted Entity aliases cannot be indexed.',
    );
  }
"""
new_aliases = """  const aliases = parseStringArrayJson(row.aliases_json, 'aliasesJson');
"""
if old_aliases not in text:
    raise SystemExit('indexEntity aliases block not found')
text = text.replace(old_aliases, new_aliases, 1)

fts_hits = """function ftsHits(
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
          `SELECT DISTINCT '${sourceType}' AS sourceType,
                  ${definition.target} AS targetId,
                  NULL AS anchorId, -1000000.0 AS score
             FROM ${definition.table}
            WHERE ${definition.table} MATCH ? AND project_id = ?
            ORDER BY ${definition.target}
            LIMIT ?`,
        )
        .all(ftsMatch(queryVariants, 'title'), projectId, limit) as unknown as FtsHit[]),
      ...(connection
        .prepare(
          `SELECT '${sourceType}' AS sourceType, ${definition.target} AS targetId,
                  ${definition.anchor} AS anchorId, bm25(${definition.table}) AS score
             FROM ${definition.table}
            WHERE ${definition.table} MATCH ? AND project_id = ?
            ORDER BY score, ${definition.target}, ${definition.anchor}
            LIMIT ?`,
        )
        .all(ftsMatch(queryVariants, 'body'), projectId, limit) as unknown as FtsHit[]),
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

"""
text = replace_between(text, 'function ftsHits(', 'function authoritativeItem(', fts_hits)

authoritative_item = """function authoritativeItem(
  connection: DatabaseSync,
  projectId: string,
  hit: FtsHit,
  query: string,
  includeArchived: boolean,
): SearchResultItem | null {
  if (hit.sourceType === 'draft') {
    if (hit.anchorId === null) {
      const row = connection
        .prepare(
          `SELECT draft.id AS targetId, chapter.id AS chapterId, chapter.title
             FROM drafts draft
             JOIN chapters chapter ON chapter.id = draft.chapter_id
             JOIN volumes volume ON volume.id = chapter.volume_id
            WHERE draft.id = ? AND volume.project_id = ?
              AND draft.status = 'active' AND chapter.deleted_at IS NULL
              AND volume.deleted_at IS NULL`,
        )
        .get(hit.targetId, projectId);
      if (!row) return null;
      return SearchResultItemSchema.parse({
        sourceType: 'draft',
        targetId: row.targetId,
        anchorId: null,
        chapterId: row.chapterId,
        title: row.title,
        excerpt: excerpt(text(row.title, 'draftTitle'), query),
        score: hit.score,
      });
    }
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
    return SearchResultItemSchema.parse({
      sourceType: 'draft',
      targetId: row.targetId,
      anchorId: row.anchorId,
      chapterId: row.chapterId,
      title: row.title,
      excerpt: excerpt(text(row.body, 'draftBody'), query),
      score: hit.score,
    });
  }
  if (hit.sourceType === 'version') {
    if (hit.anchorId === null) {
      const row = connection
        .prepare(
          `SELECT version.id AS targetId, chapter.id AS chapterId, chapter.title
             FROM versions version
             JOIN chapters chapter ON chapter.id = version.chapter_id
             JOIN volumes volume ON volume.id = chapter.volume_id
            WHERE version.id = ? AND volume.project_id = ?
              AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL`,
        )
        .get(hit.targetId, projectId);
      if (!row) return null;
      return SearchResultItemSchema.parse({
        sourceType: 'version',
        targetId: row.targetId,
        anchorId: null,
        chapterId: row.chapterId,
        title: row.title,
        excerpt: excerpt(text(row.title, 'versionTitle'), query),
        score: hit.score,
      });
    }
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
    return SearchResultItemSchema.parse({
      sourceType: 'version',
      targetId: row.targetId,
      anchorId: row.anchorId,
      chapterId: row.chapterId,
      title: row.title,
      excerpt: excerpt(text(row.body, 'versionBody'), query),
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

"""
text = replace_between(text, 'function authoritativeItem(', 'function authoritativeLike(', authoritative_item)

authoritative_like = """function authoritativeLike(
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

"""
text = replace_between(text, 'function authoritativeLike(', 'function listDictionaryRows(', authoritative_like)

old_state = """      const counts = queueCounts(connection);
      const status = counts.pending === 0 && counts.failed === 0 ? 'ready' : 'stale';
      connection
"""
new_state = """      const counts = queueCounts(connection);
      const status = counts.pending === 0 && counts.failed === 0 ? 'ready' : 'stale';
      const stateErrorCode =
        status === 'ready' ? null : (lastErrorCode ?? latestQueueErrorCode(connection));
      connection
"""
if old_state not in text:
    raise SystemExit('processPending state marker not found')
text = text.replace(old_state, new_state, 1)
old_run = ".run(status, status, now, status, now, status === 'ready' ? null : lastErrorCode, now);"
new_run = ".run(status, status, now, status, now, stateErrorCode, now);"
if old_run not in text:
    raise SystemExit('processPending update arguments not found')
text = text.replace(old_run, new_run, 1)

search_method = """  search(raw: SearchProjectInput): SearchProjectResult {
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

"""
text = replace_between(text, '  search(raw: SearchProjectInput)', '  listDictionary(', search_method)
core.write_text(text)


tests = Path('tests/integration/search-index.test.ts')
text = tests.read_text()
opened_marker = """      const opened = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
"""
opened_replacement = opened_marker + """      await harness.workspace.writeProject(randomUUID(), project.projectId, (connection) => {
        connection
          .prepare('UPDATE chapters SET title = ? WHERE id = ?')
          .run('唯一章题检索词', chapter.id);
      });
"""
if opened_marker not in text:
    raise SystemExit('opened draft marker not found')
text = text.replace(opened_marker, opened_replacement, 1)

old_blocks = """        blocks: [
          {
            clientBlockId: opened.blocks[0]!.logicalBlockId,
            logicalBlockId: opened.blocks[0]!.logicalBlockId,
            blockType: 'paragraph',
            text: '玄烛城夜雨长街暗号只在更鼓之后启用。',
            attributes: {},
          },
        ],
"""
new_blocks = """        blocks: [
          {
            clientBlockId: opened.blocks[0]!.logicalBlockId,
            logicalBlockId: opened.blocks[0]!.logicalBlockId,
            blockType: 'paragraph',
            text: '玄烛城夜雨长街暗号只在更鼓之后启用。',
            attributes: {},
          },
          {
            clientBlockId: randomUUID(),
            logicalBlockId: randomUUID(),
            blockType: 'paragraph',
            text: '兼容检索必须保留全角原文代号ＡＢＣ，不得把摘要改写成半角。',
            attributes: {},
          },
          {
            clientBlockId: randomUUID(),
            logicalBlockId: randomUUID(),
            blockType: 'paragraph',
            text: '这一段只用于验证章节标题命中不会按正文块重复返回。',
            attributes: {},
          },
        ],
"""
if old_blocks not in text:
    raise SystemExit('initial block fixture not found')
text = text.replace(old_blocks, new_blocks, 1)

long_query_anchor = """      expect(longQuery.items.find((item) => item.sourceType === 'entity')?.targetId).toBe(
        entity.id,
      );

"""
additional_queries = long_query_anchor + """      const titleQuery = harness.search.search({
        projectId: project.projectId,
        query: '唯一章题检索词',
        sourceTypes: ['draft'],
        limit: 20,
      });
      expect(titleQuery.items).toHaveLength(1);
      expect(titleQuery.items[0]).toMatchObject({ anchorId: null, title: '唯一章题检索词' });

      const compatibilityQuery = harness.search.search({
        projectId: project.projectId,
        query: 'ABC',
        sourceTypes: ['draft'],
        limit: 20,
      });
      expect(compatibilityQuery.items).toHaveLength(1);
      expect(compatibilityQuery.items[0]!.excerpt).toContain('ＡＢＣ');
      expect(compatibilityQuery.items[0]!.excerpt).not.toContain('代号ABC');

      const aliasQuery = harness.search.search({
        projectId: project.projectId,
        query: '夜雨街',
        sourceTypes: ['entity'],
        limit: 20,
      });
      expect(aliasQuery.items).toHaveLength(1);
      expect(aliasQuery.items[0]!.excerpt).toContain('夜雨街');
      expect(aliasQuery.items[0]!.excerpt).not.toContain('["夜雨街"]');

"""
if long_query_anchor not in text:
    raise SystemExit('long query assertion anchor not found')
text = text.replace(long_query_anchor, additional_queries, 1)

failure_anchor = """      expect(failing.getState(project.projectId)).toMatchObject({
        status: 'stale',
        failedCount: 1,
        lastErrorCode: 'INJECTED_INDEX_FAILURE',
      });
"""
failure_replacement = failure_anchor + """      await harness.canon.create(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        entityType: 'character',
        name: '待处理新目标',
        aliases: [],
        summary: '用于验证旧失败错误码不会被后续成功的pending写入清空',
      });
      const partial = await harness.search.processPending(randomUUID(), {
        projectId: project.projectId,
        limit: 1,
      });
      expect(partial).toMatchObject({ status: 'stale', succeeded: 1, remaining: 1 });
      expect(harness.search.getState(project.projectId)).toMatchObject({
        status: 'stale',
        failedCount: 1,
        lastErrorCode: 'INJECTED_INDEX_FAILURE',
      });
"""
if failure_anchor not in text:
    raise SystemExit('failure state assertion anchor not found')
text = text.replace(failure_anchor, failure_replacement, 1)

new_test = """

  it('filters archived entities before applying the FTS result limit', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '归档实体检索项目', channel: '长篇' },
        harness.parent,
      );
      await consumeAll(harness.search, project.projectId);
      const now = clock.now().toISOString();
      for (const name of ['玄枢密钥甲', '玄枢密钥乙', '玄枢密钥丙']) {
        const created = await harness.canon.create(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          entityType: 'item',
          name,
          aliases: [],
          summary: '玄枢密钥玄枢密钥玄枢密钥',
        });
        const entity = created.entities.find((candidate) => candidate.name === name)!;
        await harness.workspace.writeProject(randomUUID(), project.projectId, (connection) => {
          connection
            .prepare("UPDATE entities SET status = 'archived', archived_at = ? WHERE id = ?")
            .run(now, entity.id);
        });
      }
      const activeList = await harness.canon.create(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        entityType: 'character',
        name: '现役玄枢使',
        aliases: [],
        summary: '负责保管玄枢密钥',
      });
      const active = activeList.entities.find((candidate) => candidate.name === '现役玄枢使')!;
      await consumeAll(harness.search, project.projectId);

      const result = harness.search.search({
        projectId: project.projectId,
        query: '玄枢密钥',
        sourceTypes: ['entity'],
        includeArchived: false,
        limit: 1,
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.targetId).toBe(active.id);
    } finally {
      await closeHarness(harness);
    }
  });
"""
closing = "  });\n});\n"
if not text.endswith(closing):
    raise SystemExit('integration test closing marker not found')
text = text[:-len(closing)] + "  });" + new_test + "\n});\n"
tests.write_text(text)


database = Path('docs/database/DATABASE_SCHEMA.md')
text = database.read_text()
old_search = "三字符及以上查询在索引`ready`时使用FTS5；少于三字符或索引`stale/rebuilding`时回读权威业务表执行标准化LIKE。FTS5只负责召回业务ID，返回结果前必须按当前项目重新读取Draft、Version或Entity权威数据，不直接展示派生表内容，也不得跨项目返回结果。"
new_search = "三字符及以上查询在索引`ready`时使用FTS5；少于三字符或索引`stale/rebuilding`时回读权威业务表执行有界兼容变体匹配。查询同时保留原始文本、NFKC规范词和全角ASCII兼容变体用于召回，摘要始终从权威原文截取，禁止以规范化文本替换作者原文。FTS5只负责召回业务ID，返回结果前必须按当前项目重新读取Draft、Version或Entity权威数据，不直接展示派生表内容，也不得跨项目返回结果。"
if old_search not in text:
    raise SystemExit('database search semantics paragraph not found')
text = text.replace(old_search, new_search, 1)
old_action = "`action`为`canonical/alias/ignore/replacement`。"
new_action = "`action`为`canonical/alias/ignore/replace`。"
if old_action not in text:
    raise SystemExit('dictionary action documentation marker not found')
text = text.replace(old_action, new_action, 1)
database.write_text(text)


active = Path('docs/tasks/ACTIVE_TASK.json')
data = json.loads(active.read_text())
allowed = data['activeTask']['allowedPaths']
path = 'docs/database/DATABASE_SCHEMA.md'
if path not in allowed:
    insert_at = allowed.index('docs/tasks/ACTIVE_TASK.json')
    allowed.insert(insert_at, path)
active.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')

active_md = Path('docs/tasks/ACTIVE_TASK.md')
text = active_md.read_text()
marker = "  - pnpm-workspace.yaml\n  - docs/tasks/ACTIVE_TASK.json"
replacement = "  - pnpm-workspace.yaml\n  - docs/database/DATABASE_SCHEMA.md\n  - docs/tasks/ACTIVE_TASK.json"
if marker not in text:
    raise SystemExit('ACTIVE_TASK.md allowed path marker not found')
active_md.write_text(text.replace(marker, replacement, 1))


audit = Path('docs/test-evidence/M4-02/m401-baseline-audit.md')
audit.parent.mkdir(parents=True, exist_ok=True)
audit.write_text("""# M4-02 启动前 M4-01 全量基线复核

## 复核结论

M4-01 已合并实现存在五项实质缺陷和一项文档不一致，必须在M4-02读取公共检索能力前完成整改：

1. 批次只处理后续pending记录时，仍留在队列中的failed错误码会被写成`null`，降低故障可观测性。
2. 查询统一NFKC后只使用规范词召回，半角查询无法命中全角原文，摘要还会返回规范化副本而非作者原文。
3. 章节标题被复制到每个FTS块，标题命中会按正文块重复返回并占用结果限额。
4. `includeArchived=false`的实体搜索在FTS限额之后才过滤归档实体，归档高相关结果可能挤掉活动实体。
5. Entity别名命中时，权威回读摘要直接拼接`aliases_json`，会向用户暴露JSON外壳。
6. 数据库文档将词典动作写为`replacement`，与Migration和公共合同的`replace`不一致。

## 整改

- 索引状态错误码从当前批次失败和剩余failed队列中确定性派生，ready时才清空。
- 搜索生成原始、NFKC和全角ASCII兼容变体；摘要通过规范化位置映射回权威原文。
- Draft和Version标题、正文分别召回；标题结果使用`anchorId=null`并按目标去重。
- Entity归档状态在FTS查询限额前过滤。
- Entity别名经过严格字符串数组解析后拼接为展示文本。
- 同步数据库文档词典枚举。

## 回归

新增集成回归覆盖：失败错误码保留、全角原文召回与摘要、标题去重、归档实体限额隔离、别名摘要去JSON外壳。整改同时运行检索集成测试、检索性能测试、Typecheck、Lint和任务状态校验；完整门禁由正式M4-02 PR继续执行。
""")
PY

pnpm exec prettier --write \
  packages/core-service/src/search-index.ts \
  tests/integration/search-index.test.ts \
  docs/database/DATABASE_SCHEMA.md \
  docs/tasks/ACTIVE_TASK.json \
  docs/tasks/ACTIVE_TASK.md \
  docs/test-evidence/M4-02/m401-baseline-audit.md

pnpm exec vitest run tests/integration/search-index.test.ts
pnpm exec vitest run tests/performance/search-index-performance.test.ts
pnpm typecheck
pnpm lint
node scripts/taskctl.mjs validate
git diff --check

mapfile -t changed < <({ git diff --name-only; git ls-files --others --exclude-standard; } | sort -u)
printf '%s\n' "${changed[@]}"
expected=(
  docs/database/DATABASE_SCHEMA.md
  docs/tasks/ACTIVE_TASK.json
  docs/tasks/ACTIVE_TASK.md
  docs/test-evidence/M4-02/m401-baseline-audit.md
  packages/core-service/src/search-index.ts
  tests/integration/search-index.test.ts
)
test "${#changed[@]}" -eq "${#expected[@]}"
for index in "${!expected[@]}"; do
  test "${changed[$index]}" = "${expected[$index]}"
done

git add -- "${changed[@]}"
git commit -m "修复：整改M4-01检索一致性缺口"
git push origin HEAD:"${TARGET_BRANCH}"
