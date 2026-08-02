import type { DatabaseSync } from 'node:sqlite';

import { assertAuthorAuthority, compareChapterPosition } from '@worldforge/domain';

import type { DatabaseClock } from '../database/index.js';
import { chapterPosition } from '../continuity-validation.js';

export const systemClock: DatabaseClock = { now: () => new Date() };

export type Attention = 'none' | 'due' | 'overdue' | 'blocked';
export type ChapterPosition = readonly [number, number];

export type NarrativePlanningServiceErrorCode =
  | 'NARRATIVE_NOT_FOUND'
  | 'NARRATIVE_INVALID'
  | 'NARRATIVE_CONFLICT'
  | 'NARRATIVE_AUTHOR_REQUIRED'
  | 'NARRATIVE_INVARIANT';

export class NarrativePlanningServiceError extends Error {
  readonly code: NarrativePlanningServiceErrorCode;

  constructor(code: NarrativePlanningServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'NarrativePlanningServiceError';
    this.code = code;
  }
}

export interface NarrativePlanningServiceOptions {
  readonly clock?: DatabaseClock;
  readonly idFactory?: () => string;
}

export interface ForeshadowingRow {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly description: string;
  readonly status: string;
  readonly revealFromChapterId: string | null;
  readonly revealByChapterId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ArcRow {
  readonly id: string;
  readonly projectId: string;
  readonly characterId: string;
  readonly title: string;
  readonly arcType: string;
  readonly customType: string | null;
  readonly status: string;
  readonly authorIntent: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MilestoneRow {
  readonly id: string;
  readonly projectId: string;
  readonly arcId: string;
  readonly title: string;
  readonly description: string;
  readonly sortIndex: number | bigint;
  readonly plannedChapterId: string | null;
  readonly actualChapterId: string | null;
  readonly status: string;
  readonly confirmationSource: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function authorOnly(authority: 'author' | 'ai'): void {
  try {
    assertAuthorAuthority(authority);
  } catch (error) {
    throw new NarrativePlanningServiceError(
      'NARRATIVE_AUTHOR_REQUIRED',
      'Only an explicit author command may change foreshadowing or character arcs.',
      { cause: error },
    );
  }
}

export function narrativeText(value: unknown): string {
  if (typeof value !== 'string') {
    throw new NarrativePlanningServiceError(
      'NARRATIVE_INVARIANT',
      'Persisted narrative planning text is invalid.',
    );
  }
  return value;
}

export function narrativeNumber(value: unknown): number {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  throw new NarrativePlanningServiceError(
    'NARRATIVE_INVARIANT',
    'Persisted narrative planning number is invalid.',
  );
}

export function assertProject(connection: DatabaseSync, projectId: string): void {
  if (!connection.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) {
    throw new NarrativePlanningServiceError('NARRATIVE_NOT_FOUND', 'Project not found.');
  }
}

export function assertChapter(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
): void {
  chapterPosition(connection, projectId, chapterId);
}

export function assertCharacter(
  connection: DatabaseSync,
  projectId: string,
  characterId: string,
): void {
  const row = connection
    .prepare(
      `SELECT 1 FROM entities
        WHERE id = ? AND project_id = ? AND entity_type = 'character' AND status = 'active'`,
    )
    .get(characterId, projectId);
  if (!row) {
    throw new NarrativePlanningServiceError(
      'NARRATIVE_NOT_FOUND',
      'Active character entity not found.',
    );
  }
}

export function assertForeshadowing(
  connection: DatabaseSync,
  projectId: string,
  foreshadowingId: string,
): ForeshadowingRow {
  const row = connection
    .prepare(
      `SELECT id, project_id AS projectId, title, description, status,
              reveal_from_chapter_id AS revealFromChapterId,
              reveal_by_chapter_id AS revealByChapterId,
              created_at AS createdAt, updated_at AS updatedAt
         FROM foreshadowings
        WHERE id = ? AND project_id = ?`,
    )
    .get(foreshadowingId, projectId) as ForeshadowingRow | undefined;
  if (!row) {
    throw new NarrativePlanningServiceError('NARRATIVE_NOT_FOUND', 'Foreshadowing not found.');
  }
  return row;
}

export function assertArc(
  connection: DatabaseSync,
  projectId: string,
  arcId: string,
): ArcRow {
  const row = connection
    .prepare(
      `SELECT id, project_id AS projectId, character_id AS characterId, title,
              arc_type AS arcType, custom_type AS customType, status,
              author_intent AS authorIntent, created_at AS createdAt, updated_at AS updatedAt
         FROM character_arcs
        WHERE id = ? AND project_id = ?`,
    )
    .get(arcId, projectId) as ArcRow | undefined;
  if (!row) {
    throw new NarrativePlanningServiceError('NARRATIVE_NOT_FOUND', 'Character arc not found.');
  }
  return row;
}

export function assertMilestone(
  connection: DatabaseSync,
  projectId: string,
  milestoneId: string,
): MilestoneRow {
  const row = connection
    .prepare(
      `SELECT id, project_id AS projectId, arc_id AS arcId, title, description,
              sort_index AS sortIndex, planned_chapter_id AS plannedChapterId,
              actual_chapter_id AS actualChapterId, status,
              confirmation_source AS confirmationSource,
              created_at AS createdAt, updated_at AS updatedAt
         FROM arc_milestones
        WHERE id = ? AND project_id = ?`,
    )
    .get(milestoneId, projectId) as MilestoneRow | undefined;
  if (!row) {
    throw new NarrativePlanningServiceError('NARRATIVE_NOT_FOUND', 'Arc milestone not found.');
  }
  return row;
}

export function validateRevealWindow(
  connection: DatabaseSync,
  projectId: string,
  revealFromChapterId: string | null,
  revealByChapterId: string | null,
): void {
  const start = revealFromChapterId
    ? chapterPosition(connection, projectId, revealFromChapterId)
    : null;
  const end = revealByChapterId ? chapterPosition(connection, projectId, revealByChapterId) : null;
  if (start && end && compareChapterPosition(start, end) > 0) {
    throw new NarrativePlanningServiceError(
      'NARRATIVE_INVALID',
      'Foreshadowing reveal window must end at or after its start chapter.',
    );
  }
}

export function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export function isActivatedForeshadowing(status: string): boolean {
  return ['planted', 'reinforced', 'partially_revealed', 'revealed'].includes(status);
}
