import type { DatabaseSync } from 'node:sqlite';

import {
  ProjectDictionaryEntrySchema,
  SearchIndexStateSchema,
  type ProjectDictionaryEntry,
  type SearchIndexState,
  type SearchResultItem,
  type SearchSourceType,
} from '@worldforge/contracts';

import type { DatabaseClock } from '../database/index.js';
import { sqliteResult } from '../database/sqlite-result.js';

export const systemClock: DatabaseClock = { now: () => new Date() };
export const sourceTypes = [
  'draft',
  'version',
  'entity',
] as const satisfies readonly SearchSourceType[];

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

export interface QueueRow {
  readonly id: string;
  readonly targetType: SearchSourceType;
  readonly targetId: string;
  readonly operation: 'upsert' | 'delete';
}

export interface DictionaryRow {
  readonly term: string;
  readonly normalizedTerm: string;
  readonly category: string;
  readonly action: string;
  readonly replacementTerm: string | null;
  readonly notes: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FtsHit {
  readonly sourceType: SearchSourceType;
  readonly targetId: string;
  readonly anchorId: string | null;
  readonly score: number;
}

export interface NormalizedSearchView {
  readonly value: string;
  readonly starts: readonly number[];
  readonly ends: readonly number[];
}

export function text(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new SearchIndexServiceError(
      'SEARCH_INDEX_INVARIANT',
      `Persisted search field ${field} is invalid.`,
    );
  }
  return value;
}

export function integer(value: unknown, field: string): number {
  const parsed = typeof value === 'bigint' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed) || parsed < 0) {
    throw new SearchIndexServiceError(
      'SEARCH_INDEX_INVARIANT',
      `Persisted search count ${field} is invalid.`,
    );
  }
  return parsed;
}

export function failureCode(error: unknown): string {
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

export function searchTermVariants(originalValue: string, normalizedValue: string): string[] {
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

export function normalizedSearchView(value: string): NormalizedSearchView {
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

export function parseStringArrayJson(value: unknown, field: string): string[] {
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

export function latestQueueErrorCode(connection: DatabaseSync): string | null {
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

export function ftsMatch(variants: readonly string[], column?: 'title' | 'body'): string {
  const prefix = column ? `${column}:` : '';
  return variants.map((variant) => `${prefix}${ftsPhrase(variant)}`).join(' OR ');
}

export function likeClause(column: string, variantCount: number): string {
  return Array.from({ length: variantCount }, () => `instr(lower(${column}), lower(?)) > 0`).join(
    ' OR ',
  );
}

export function deduplicateItems(
  items: readonly SearchResultItem[],
  limit: number,
): SearchResultItem[] {
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

export function parseDictionary(row: DictionaryRow): ProjectDictionaryEntry {
  return ProjectDictionaryEntrySchema.parse(row);
}

export function queueCounts(connection: DatabaseSync): { pending: number; failed: number } {
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

export function readState(connection: DatabaseSync, projectId: string): SearchIndexState {
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

export function excerpt(content: string, query: string): string {
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

export function dictionaryMatch(
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

export function listDictionaryRows(connection: DatabaseSync): DictionaryRow[] {
  return sqliteResult<DictionaryRow[]>(
    connection
      .prepare(
        `SELECT term, normalized_term AS normalizedTerm, category, action,
              replacement_term AS replacementTerm, notes,
              created_at AS createdAt, updated_at AS updatedAt
         FROM project_dictionary
        ORDER BY category, normalized_term, term`,
      )
      .all(),
  );
}
