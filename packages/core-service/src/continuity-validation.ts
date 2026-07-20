import type { DatabaseSync } from 'node:sqlite';

import type { EvidenceAnchor, TimelineEventSaveInput } from '@worldforge/contracts';
import {
  compareChapterPosition,
  eventTimeRange,
  type ComparableTimeRange,
} from '@worldforge/domain';

import { ContinuityServiceError, type ChapterPosition } from './continuity-model.js';

export function chapterPosition(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
): ChapterPosition {
  const row = connection
    .prepare(
      `SELECT v.order_key AS volumeOrder, c.order_key AS chapterOrder
         FROM chapters c
         JOIN volumes v ON v.id = c.volume_id
        WHERE c.id = ? AND v.project_id = ?
          AND c.deleted_at IS NULL AND v.deleted_at IS NULL`,
    )
    .get(chapterId, projectId) as
    | { readonly volumeOrder: number | bigint; readonly chapterOrder: number | bigint }
    | undefined;
  if (!row) {
    throw new ContinuityServiceError('CONTINUITY_NOT_FOUND', 'The active Chapter was not found.');
  }
  return [Number(row.volumeOrder), Number(row.chapterOrder)];
}

export function validateChapterRange(
  connection: DatabaseSync,
  projectId: string,
  startId: string,
  endId: string | null,
): { readonly start: ChapterPosition; readonly end: ChapterPosition | null } {
  const start = chapterPosition(connection, projectId, startId);
  const end = endId ? chapterPosition(connection, projectId, endId) : null;
  if (end && compareChapterPosition(start, end) >= 0) {
    throw new ContinuityServiceError(
      'CONTINUITY_INVALID',
      'The chapter validity range must use an exclusive end after the start.',
    );
  }
  return { start, end };
}

export function assertEntity(
  connection: DatabaseSync,
  projectId: string,
  entityId: string,
  expectedType?: 'character' | 'location',
): void {
  const row = connection
    .prepare(
      `SELECT entity_type AS entityType
         FROM entities
        WHERE id = ? AND project_id = ? AND status = 'active'`,
    )
    .get(entityId, projectId) as { readonly entityType: string } | undefined;
  if (!row) {
    throw new ContinuityServiceError('CONTINUITY_NOT_FOUND', 'The active Entity was not found.');
  }
  if (expectedType && row.entityType !== expectedType) {
    throw new ContinuityServiceError(
      'CONTINUITY_INVALID',
      `The Entity must be an active ${expectedType}.`,
    );
  }
}

export function assertVersion(
  connection: DatabaseSync,
  projectId: string,
  versionId: string,
): void {
  const row = connection
    .prepare(
      `SELECT 1
         FROM versions ver
         JOIN chapters c ON c.id = ver.chapter_id
         JOIN volumes v ON v.id = c.volume_id
        WHERE ver.id = ? AND v.project_id = ?`,
    )
    .get(versionId, projectId);
  if (!row) {
    throw new ContinuityServiceError('CONTINUITY_NOT_FOUND', 'The source Version was not found.');
  }
}

export function assertLogicalBlock(
  connection: DatabaseSync,
  projectId: string,
  logicalBlockId: string,
): void {
  const row = connection
    .prepare(
      `SELECT 1
         FROM draft_blocks b
         JOIN drafts d ON d.id = b.draft_id
         JOIN chapters c ON c.id = d.chapter_id
         JOIN volumes v ON v.id = c.volume_id
        WHERE b.logical_block_id = ? AND v.project_id = ?`,
    )
    .get(logicalBlockId, projectId);
  if (!row) {
    throw new ContinuityServiceError(
      'CONTINUITY_NOT_FOUND',
      'The source logical block was not found.',
    );
  }
}

export function validateEvidence(
  connection: DatabaseSync,
  projectId: string,
  evidence: readonly EvidenceAnchor[],
): void {
  for (const anchor of evidence) {
    if (anchor.kind === 'chapter') chapterPosition(connection, projectId, anchor.targetId);
    if (anchor.kind === 'entity') assertEntity(connection, projectId, anchor.targetId);
    if (anchor.kind === 'version') assertVersion(connection, projectId, anchor.targetId);
    if (anchor.kind === 'logicalBlock') {
      assertLogicalBlock(connection, projectId, anchor.targetId);
    }
    if (
      anchor.kind === 'sceneBeat' &&
      !connection
        .prepare('SELECT 1 FROM scene_beats WHERE id = ? AND project_id = ?')
        .get(anchor.targetId, projectId)
    ) {
      throw new ContinuityServiceError('CONTINUITY_NOT_FOUND', 'Evidence SceneBeat not found.');
    }
  }
}

export function comparableRange(
  input: Pick<TimelineEventSaveInput, 'startValue' | 'endValue' | 'precision'>,
): ComparableTimeRange | null {
  try {
    return eventTimeRange(input.startValue, input.endValue, input.precision);
  } catch (error) {
    throw new ContinuityServiceError('CONTINUITY_INVALID', 'Timeline range is invalid.', {
      cause: error,
    });
  }
}

export function assertNoDependencyCycle(
  connection: DatabaseSync,
  projectId: string,
  eventId: string,
  dependencies: readonly string[],
): void {
  const rows = connection
    .prepare(
      `SELECT d.event_id AS eventId, d.dependency_event_id AS dependencyId
         FROM timeline_event_dependencies d
         JOIN timeline_events e ON e.id = d.event_id
        WHERE d.project_id = ? AND e.status = 'active' AND d.event_id <> ?`,
    )
    .all(projectId, eventId) as unknown as {
    readonly eventId: string;
    readonly dependencyId: string;
  }[];
  const graph = new Map<string, string[]>();
  for (const row of rows) {
    graph.set(row.eventId, [...(graph.get(row.eventId) ?? []), row.dependencyId]);
  }
  graph.set(eventId, [...dependencies]);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      throw new ContinuityServiceError('CONTINUITY_CONFLICT', 'Timeline dependency cycle.');
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of graph.get(id) ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  visit(eventId);
}
