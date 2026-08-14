import type { DatabaseSync } from 'node:sqlite';

import {
  SearchProjectInputSchema,
  SearchProjectResultSchema,
  SearchResultItemSchema,
  type SearchProjectInput,
  type SearchProjectResult,
  type SearchResultItem,
  type SearchSourceType,
} from '@worldforge/contracts';

import type { ProjectWorkspaceService } from './project-workspace.js';
import {
  SearchIndexService as BaseSearchIndexService,
  normalizeSearchTerm,
  type SearchIndexServiceOptions,
} from './search-index.js';
import { sqliteResult } from './database/sqlite-result.js';

const SOURCE_ORDER = [
  'draft',
  'version',
  'entity',
  'research',
] as const satisfies readonly SearchSourceType[];

interface TitleRow extends Record<string, unknown> {
  readonly targetId: string;
  readonly chapterId: string;
  readonly title: string;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`SEARCH_TITLE_FIELD_INVALID:${field}`);
  return value;
}

function matchesNormalizedTitle(title: string, normalizedQuery: string): boolean {
  return normalizeSearchTerm(title).includes(normalizedQuery);
}

function titleItem(sourceType: 'draft' | 'version', row: TitleRow): SearchResultItem {
  const title = requiredText(row.title, 'title');
  return SearchResultItemSchema.parse({
    sourceType,
    targetId: requiredText(row.targetId, 'targetId'),
    anchorId: null,
    chapterId: requiredText(row.chapterId, 'chapterId'),
    title,
    excerpt: title.slice(0, 2_000),
    score: 0,
  });
}

function titleRows(
  connection: DatabaseSync,
  projectId: string,
  sourceType: 'draft' | 'version',
): TitleRow[] {
  if (sourceType === 'draft') {
    return sqliteResult<TitleRow[]>(
      connection
        .prepare(
          `SELECT draft.id AS targetId, chapter.id AS chapterId, chapter.title
           FROM drafts draft
           JOIN chapters chapter ON chapter.id = draft.chapter_id
           JOIN volumes volume ON volume.id = chapter.volume_id
          WHERE volume.project_id = ? AND draft.status = 'active'
            AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL
          ORDER BY volume.order_key, chapter.order_key, draft.id`,
        )
        .all(projectId),
    );
  }
  return sqliteResult<TitleRow[]>(
    connection
      .prepare(
        `SELECT version.id AS targetId, chapter.id AS chapterId, chapter.title
         FROM versions version
         JOIN chapters chapter ON chapter.id = version.chapter_id
         JOIN volumes volume ON volume.id = chapter.volume_id
        WHERE volume.project_id = ? AND chapter.deleted_at IS NULL
          AND volume.deleted_at IS NULL
        ORDER BY version.created_at DESC, version.id`,
      )
      .all(projectId),
  );
}

function dictionaryAction(connection: DatabaseSync, originalQuery: string): string | null {
  const row = connection
    .prepare('SELECT action FROM project_dictionary WHERE normalized_term = ?')
    .get(normalizeSearchTerm(originalQuery));
  return typeof row?.action === 'string' ? row.action : null;
}

function deduplicate(items: readonly SearchResultItem[], limit: number): SearchResultItem[] {
  const seen = new Set<string>();
  const result: SearchResultItem[] = [];
  for (const item of items) {
    const key = `${item.sourceType}:${item.targetId}:${item.anchorId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

/**
 * Public search runtime with an authoritative title fallback.
 *
 * The base service intentionally owns index maintenance and authority re-reads. This layer only
 * repairs the short-query/stale-index case where a title hit has no block anchor and would
 * otherwise be discarded by the block authority lookup.
 */
export class HardenedSearchIndexService extends BaseSearchIndexService {
  readonly #workspace: ProjectWorkspaceService;

  constructor(workspace: ProjectWorkspaceService, options: SearchIndexServiceOptions = {}) {
    super(workspace, options);
    this.#workspace = workspace;
  }

  override search(raw: SearchProjectInput): SearchProjectResult {
    const input = SearchProjectInputSchema.parse(raw);
    const base = super.search(input);
    const requestedSources = input.sourceTypes ?? [...SOURCE_ORDER];
    const usesFreshFts =
      Array.from(base.normalizedQuery).length >= 3 && base.indexStatus === 'ready';
    if (usesFreshFts || !requestedSources.some((source) => source !== 'entity')) return base;

    const titleItems = this.#workspace.readProject(input.projectId, (connection) => {
      if (
        base.strategy === 'dictionary' &&
        dictionaryAction(connection, input.query) === 'ignore'
      ) {
        return [] as SearchResultItem[];
      }
      return requestedSources.flatMap((sourceType) => {
        if (sourceType === 'entity' || sourceType === 'research') return [];
        return titleRows(connection, input.projectId, sourceType)
          .filter((row) =>
            matchesNormalizedTitle(requiredText(row.title, 'title'), base.normalizedQuery),
          )
          .map((row) => titleItem(sourceType, row));
      });
    });
    if (titleItems.length === 0) return base;

    const titleTargets = new Set(titleItems.map((item) => `${item.sourceType}:${item.targetId}`));
    const ordered = requestedSources.flatMap((sourceType) => [
      ...titleItems.filter((item) => item.sourceType === sourceType),
      ...base.items.filter(
        (item) =>
          item.sourceType === sourceType &&
          !titleTargets.has(`${item.sourceType}:${item.targetId}`),
      ),
    ]);
    return SearchProjectResultSchema.parse({
      ...base,
      items: deduplicate(ordered, input.limit),
    });
  }
}
