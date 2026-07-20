import type { DatabaseSync } from 'node:sqlite';

import {
  ContinuityCatalogSchema,
  EntityStateSchema,
  KnowledgeStateSchema,
  TimelineEventSchema,
  type ContinuityCatalog,
  type ContinuityListInput,
  type EntityState,
  type TimelineEvent,
} from '@worldforge/contracts';
import { chapterRangeContains, compareChapterPosition } from '@worldforge/domain';

import {
  parseJson,
  text,
  type EventRow,
  type KnowledgeRow,
  type StateRow,
} from './continuity-model.js';
import { chapterPosition } from './continuity-validation.js';

export function parseState(row: StateRow): EntityState {
  return EntityStateSchema.parse({
    id: row.id,
    projectId: row.projectId,
    entityId: row.entityId,
    stateKey: row.stateKey,
    value: parseJson(text(row.valueJson), 'EntityState value'),
    validFromChapterId: row.validFromChapterId,
    validUntilChapterId: row.validUntilChapterId,
    recordStatus: row.recordStatus,
    evidence: parseJson(text(row.evidenceJson), 'EntityState evidence'),
    sourceVersionId: row.sourceVersionId,
    createdAt: row.createdAt,
    supersededAt: row.supersededAt,
  });
}

export function roleIds(connection: DatabaseSync, eventId: string, role: string): string[] {
  const rows = connection
    .prepare(
      `SELECT entity_id AS entityId
         FROM timeline_event_entities
        WHERE event_id = ? AND role = ?
        ORDER BY entity_id`,
    )
    .all(eventId, role) as unknown as { readonly entityId: string }[];
  return rows.map((row) => text(row.entityId));
}

export function dependencyIds(connection: DatabaseSync, eventId: string): string[] {
  const rows = connection
    .prepare(
      `SELECT dependency_event_id AS dependencyId
         FROM timeline_event_dependencies
        WHERE event_id = ?
        ORDER BY dependency_event_id`,
    )
    .all(eventId) as unknown as { readonly dependencyId: string }[];
  return rows.map((row) => text(row.dependencyId));
}

export function parseEvent(connection: DatabaseSync, row: EventRow): TimelineEvent {
  return TimelineEventSchema.parse({
    ...row,
    participantIds: roleIds(connection, row.id, 'participant'),
    witnessIds: roleIds(connection, row.id, 'witness'),
    subjectIds: roleIds(connection, row.id, 'subject'),
    dependencyIds: dependencyIds(connection, row.id),
  });
}

export function stateRows(connection: DatabaseSync, projectId: string): StateRow[] {
  return connection
    .prepare(
      `SELECT id, project_id AS projectId, entity_id AS entityId, state_key AS stateKey,
              value_json AS valueJson, valid_from_chapter_id AS validFromChapterId,
              valid_until_chapter_id AS validUntilChapterId, record_status AS recordStatus,
              evidence_json AS evidenceJson, source_version_id AS sourceVersionId,
              created_at AS createdAt, superseded_at AS supersededAt
         FROM entity_states
        WHERE project_id = ?
        ORDER BY entity_id, state_key, created_at DESC, id`,
    )
    .all(projectId) as unknown as StateRow[];
}

export function eventRows(connection: DatabaseSync, projectId: string): EventRow[] {
  return connection
    .prepare(
      `SELECT id, project_id AS projectId, title, start_value AS startValue,
              end_value AS endValue, precision, chapter_id AS chapterId,
              location_id AS locationId, description, status, archived_at AS archivedAt,
              created_at AS createdAt, updated_at AS updatedAt
         FROM timeline_events
        WHERE project_id = ?
        ORDER BY status = 'archived', start_value, id`,
    )
    .all(projectId) as unknown as EventRow[];
}

export function knowledgeRows(connection: DatabaseSync, projectId: string): KnowledgeRow[] {
  return connection
    .prepare(
      `SELECT id, project_id AS projectId, information_key AS informationKey,
              character_id AS characterId, knowledge_status AS knowledgeStatus,
              valid_from_chapter_id AS validFromChapterId,
              valid_until_chapter_id AS validUntilChapterId,
              source_version_id AS sourceVersionId,
              source_logical_block_id AS sourceLogicalBlockId,
              notes, record_status AS recordStatus, created_at AS createdAt,
              superseded_at AS supersededAt
         FROM knowledge_states
        WHERE project_id = ?
        ORDER BY character_id, information_key, created_at DESC, id`,
    )
    .all(projectId) as unknown as KnowledgeRow[];
}

function selectEffective<T extends StateRow | KnowledgeRow>(
  connection: DatabaseSync,
  projectId: string,
  rows: readonly T[],
  chapterId: string,
  keyFor: (row: T) => string,
): T[] {
  const target = chapterPosition(connection, projectId, chapterId);
  const selected = new Map<
    string,
    { readonly row: T; readonly start: readonly [number, number] }
  >();
  for (const row of rows) {
    if (row.recordStatus === 'invalid' || row.recordStatus === 'superseded') continue;
    const start = chapterPosition(connection, projectId, row.validFromChapterId);
    const end = row.validUntilChapterId
      ? chapterPosition(connection, projectId, row.validUntilChapterId)
      : null;
    if (!chapterRangeContains(start, end, target)) continue;
    const key = keyFor(row);
    const existing = selected.get(key);
    if (!existing || compareChapterPosition(existing.start, start) < 0) {
      selected.set(key, { row, start });
    }
  }
  return [...selected.values()].map(({ row }) => row);
}

export function readCatalog(
  connection: DatabaseSync,
  input: ContinuityListInput,
): ContinuityCatalog {
  const query = input.query.toLocaleLowerCase('zh-CN');
  const statesRaw = stateRows(connection, input.projectId);
  const knowledgeRaw = knowledgeRows(connection, input.projectId);
  const states = input.effectiveAtChapterId
    ? selectEffective(
        connection,
        input.projectId,
        statesRaw,
        input.effectiveAtChapterId,
        (row) => `${row.entityId}\u0000${row.stateKey}`,
      ).map(parseState)
    : statesRaw
        .filter((row) => input.includeHistory || row.recordStatus === 'current')
        .map(parseState);
  const knowledge = input.effectiveAtChapterId
    ? selectEffective(
        connection,
        input.projectId,
        knowledgeRaw,
        input.effectiveAtChapterId,
        (row) => `${row.characterId}\u0000${row.informationKey}`,
      ).map((row) => KnowledgeStateSchema.parse(row))
    : knowledgeRaw
        .filter((row) => input.includeHistory || row.recordStatus === 'current')
        .map((row) => KnowledgeStateSchema.parse(row));
  const events = eventRows(connection, input.projectId)
    .filter((row) => input.includeArchivedEvents || row.status === 'active')
    .map((row) => parseEvent(connection, row));
  const matches = (values: readonly string[]) =>
    !query || values.some((value) => value.toLocaleLowerCase('zh-CN').includes(query));
  return ContinuityCatalogSchema.parse({
    projectId: input.projectId,
    entityStates: states.filter((row) => matches([row.stateKey, JSON.stringify(row.value)])),
    timelineEvents: events.filter((row) => matches([row.title, row.description, row.startValue])),
    knowledgeStates: knowledge.filter((row) =>
      matches([row.informationKey, row.knowledgeStatus, row.notes]),
    ),
  });
}
