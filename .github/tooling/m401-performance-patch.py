from pathlib import Path
import sys

script = Path(sys.argv[1])
text = script.read_text()

start = text.index('fts_hits = """function ftsHits(')
end_marker = "text = replace_between(text, 'function ftsHits(', 'function authoritativeItem(', fts_hits)"
end = text.index(end_marker, start)
fts_replacement = '''fts_hits = """function ftsHits(
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

"""
'''
text = text[:start] + fts_replacement + text[end:]

start = text.index('authoritative_item = """function authoritativeItem(')
end_marker = "text = replace_between(text, 'function authoritativeItem(', 'function authoritativeLike(', authoritative_item)"
end = text.index(end_marker, start)
authoritative_replacement = '''authoritative_item = """function authoritativeItem(
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
    const bodyMatches = normalizedSearchView(body).value.includes(normalizedQuery);
    const titleMatches = normalizedSearchView(title).value.includes(normalizedQuery);
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
    const bodyMatches = normalizedSearchView(body).value.includes(normalizedQuery);
    const titleMatches = normalizedSearchView(title).value.includes(normalizedQuery);
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
                SELECT group_concat(fact.fact_key || ' ' || fact.value_json || ' ' || fact.description, '\\n')
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
'''
text = text[:start] + authoritative_replacement + text[end:]

write_marker = 'core.write_text(text)'
injection = '''old_draft_index_loop = """  for (const row of rows) {
    insert.run(
      projectId,
      text(row.draftId, 'draftId'),
      text(row.logicalBlockId, 'logicalBlockId'),
      text(row.chapterId, 'chapterId'),
      text(row.title, 'title'),
      text(row.body, 'body'),
    );
  }
"""
new_draft_index_loop = """  for (const [index, row] of rows.entries()) {
    insert.run(
      projectId,
      text(row.draftId, 'draftId'),
      text(row.logicalBlockId, 'logicalBlockId'),
      text(row.chapterId, 'chapterId'),
      index === 0 ? text(row.title, 'title') : '',
      text(row.body, 'body'),
    );
  }
"""
if old_draft_index_loop not in text:
    raise SystemExit('draft index title deduplication target not found')
text = text.replace(old_draft_index_loop, new_draft_index_loop, 1)

old_version_index_loop = """  for (const row of rows) {
    insert.run(
      projectId,
      text(row.versionId, 'versionId'),
      text(row.logicalBlockId, 'logicalBlockId'),
      text(row.chapterId, 'chapterId'),
      text(row.title, 'title'),
      text(row.body, 'body'),
    );
  }
"""
new_version_index_loop = """  for (const [index, row] of rows.entries()) {
    insert.run(
      projectId,
      text(row.versionId, 'versionId'),
      text(row.logicalBlockId, 'logicalBlockId'),
      text(row.chapterId, 'chapterId'),
      index === 0 ? text(row.title, 'title') : '',
      text(row.body, 'body'),
    );
  }
"""
if old_version_index_loop not in text:
    raise SystemExit('version index title deduplication target not found')
text = text.replace(old_version_index_loop, new_version_index_loop, 1)

'''
if text.count(write_marker) != 1:
    raise SystemExit('core write marker is not unique')
text = text.replace(write_marker, injection + write_marker, 1)
script.write_text(text)
