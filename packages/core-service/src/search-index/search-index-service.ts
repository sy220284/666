import {
  ProjectDictionaryDeleteInputSchema,
  ProjectDictionaryListInputSchema,
  ProjectDictionaryListSchema,
  ProjectDictionaryUpsertInputSchema,
  SearchIndexProcessInputSchema,
  SearchIndexProcessResultSchema,
  SearchIndexRebuildResultSchema,
  SearchProjectInputSchema,
  SearchProjectResultSchema,
  type ProjectDictionaryDeleteInput,
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
} from '@worldforge/contracts';

import type { DatabaseClock } from '../database/index.js';
import type { ProjectWorkspaceService } from '../project-workspace.js';
import {
  deduplicateItems,
  dictionaryMatch,
  failureCode,
  latestQueueErrorCode,
  listDictionaryRows,
  normalizeSearchTerm,
  parseDictionary,
  queueCounts,
  readState,
  searchTermVariants,
  sourceTypes,
  systemClock,
  text,
  SearchIndexServiceError,
  type QueueRow,
  type SearchIndexServiceOptions,
  type SearchIndexTarget,
} from './search-index-model.js';
import { authoritativeItem, authoritativeLike, ftsHits } from './search-index-query.js';
import { indexTarget } from './search-index-writer.js';
import { sqliteResult } from '../database/sqlite-result.js';

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
      const rows = sqliteResult<QueueRow[]>(
        connection
          .prepare(
            `SELECT id, target_type AS targetType, target_id AS targetId, operation
             FROM search_index_queue
            ORDER BY status = 'failed', created_at, id
            LIMIT ?`,
          )
          .all(input.limit),
      );
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
      connection.prepare('DELETE FROM fts_research_notes').run();
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
        ...connection
          .prepare('SELECT id FROM research_notes WHERE project_id = ? ORDER BY id')
          .all(projectId)
          .map((row) => ({
            targetType: 'research' as const,
            targetId: text(row.id, 'researchNoteId'),
            operation: 'upsert' as const,
          })),
      ];
      const counts = { draft: 0, version: 0, entity: 0, research: 0 };
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
          if (target.targetType !== 'research') {
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
        researchCount: counts.research,
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
