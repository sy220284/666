import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import { assertAuthorAuthority } from '@worldforge/domain';

import type { DatabaseClock } from './database/index.js';
import type { ProjectWorkspaceService } from './project-workspace.js';

export const systemClock: DatabaseClock = { now: () => new Date() };
export type ChapterPosition = readonly [number, number];

export type ContinuityServiceErrorCode =
  | 'CONTINUITY_NOT_FOUND'
  | 'CONTINUITY_CONFLICT'
  | 'CONTINUITY_INVALID'
  | 'CONTINUITY_AUTHOR_REQUIRED'
  | 'CONTINUITY_INVARIANT';

export class ContinuityServiceError extends Error {
  readonly code: ContinuityServiceErrorCode;

  constructor(code: ContinuityServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ContinuityServiceError';
    this.code = code;
  }
}

export interface ContinuityServiceOptions {
  readonly clock?: DatabaseClock;
  readonly idFactory?: () => string;
}

export interface ContinuityContext {
  readonly workspace: ProjectWorkspaceService;
  readonly clock: DatabaseClock;
  readonly idFactory: () => string;
}

export interface StateRow {
  readonly id: string;
  readonly projectId: string;
  readonly entityId: string;
  readonly stateKey: string;
  readonly valueJson: string;
  readonly validFromChapterId: string;
  readonly validUntilChapterId: string | null;
  readonly recordStatus: string;
  readonly evidenceJson: string;
  readonly sourceVersionId: string;
  readonly createdAt: string;
  readonly supersededAt: string | null;
}

export interface EventRow {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly startValue: string;
  readonly endValue: string | null;
  readonly precision: 'exact' | 'day' | 'month' | 'year' | 'approximate' | 'unknown';
  readonly chapterId: string | null;
  readonly locationId: string | null;
  readonly description: string;
  readonly status: string;
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface KnowledgeRow {
  readonly id: string;
  readonly projectId: string;
  readonly informationKey: string;
  readonly characterId: string;
  readonly knowledgeStatus: string;
  readonly validFromChapterId: string;
  readonly validUntilChapterId: string | null;
  readonly sourceVersionId: string | null;
  readonly sourceLogicalBlockId: string | null;
  readonly notes: string;
  readonly recordStatus: string;
  readonly createdAt: string;
  readonly supersededAt: string | null;
}

export function createContinuityContext(
  workspace: ProjectWorkspaceService,
  options: ContinuityServiceOptions,
): ContinuityContext {
  return {
    workspace,
    clock: options.clock ?? systemClock,
    idFactory: options.idFactory ?? randomUUID,
  };
}

export function authorOnly(authority: 'author' | 'ai'): void {
  try {
    assertAuthorAuthority(authority);
  } catch (error) {
    throw new ContinuityServiceError(
      'CONTINUITY_AUTHOR_REQUIRED',
      'Only an explicit author command may change continuity records.',
      { cause: error },
    );
  }
}

export function text(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ContinuityServiceError(
      'CONTINUITY_INVARIANT',
      'Persisted continuity text is invalid.',
    );
  }
  return value;
}

export function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new ContinuityServiceError(
      'CONTINUITY_INVARIANT',
      `Persisted ${label} JSON is invalid.`,
      { cause: error },
    );
  }
}

export function uniqueIds(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function currentRecord(
  connection: DatabaseSync,
  table: 'entity_states' | 'knowledge_states',
  condition: string,
  values: readonly string[],
): { readonly id: string; readonly validFromChapterId: string } | undefined {
  return connection
    .prepare(
      `SELECT id, valid_from_chapter_id AS validFromChapterId
         FROM ${table}
        WHERE ${condition} AND record_status = 'current'`,
    )
    .get(...values) as { readonly id: string; readonly validFromChapterId: string } | undefined;
}
