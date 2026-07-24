from pathlib import Path
import sys

script = Path(sys.argv[1])
text = script.read_text()
start = text.index('fts_hits = """function ftsHits(')
end_marker = "text = replace_between(text, 'function ftsHits(', 'function authoritativeItem(', fts_hits)"
end = text.index(end_marker, start)
replacement = '''fts_hits = """function ftsHits(
  connection: DatabaseSync,
  projectId: string,
  queryVariants: readonly string[],
  requestedSources: readonly SearchSourceType[],
  includeArchived: boolean,
  limit: number,
): FtsHit[] {
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
    if (sourceType === 'draft') {
      hits.push(
        ...(connection
          .prepare(
            `SELECT 'draft' AS sourceType, draft.id AS targetId,
                    NULL AS anchorId, -1000000.0 AS score
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
            `SELECT 'draft' AS sourceType, draft_id AS targetId,
                    logical_block_id AS anchorId, bm25(fts_draft_blocks) AS score
               FROM fts_draft_blocks
              WHERE fts_draft_blocks MATCH ? AND project_id = ?
                AND (${likeClause('body', queryVariants.length)})
              ORDER BY score, draft_id, logical_block_id
              LIMIT ?`,
          )
          .all(
            ftsMatch(queryVariants),
            projectId,
            ...queryVariants,
            limit,
          ) as unknown as FtsHit[]),
      );
      continue;
    }
    hits.push(
      ...(connection
        .prepare(
          `SELECT 'version' AS sourceType, version.id AS targetId,
                  NULL AS anchorId, -1000000.0 AS score
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
          `SELECT 'version' AS sourceType, version_id AS targetId,
                  logical_block_id AS anchorId, bm25(fts_version_blocks) AS score
             FROM fts_version_blocks
            WHERE fts_version_blocks MATCH ? AND project_id = ?
              AND (${likeClause('body', queryVariants.length)})
            ORDER BY score, version_id, logical_block_id
            LIMIT ?`,
        )
        .all(
          ftsMatch(queryVariants),
          projectId,
          ...queryVariants,
          limit,
        ) as unknown as FtsHit[]),
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
text = text[:start] + replacement + text[end:]
script.write_text(text)
