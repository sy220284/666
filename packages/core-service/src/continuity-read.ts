import type { DatabaseSync } from 'node:sqlite';

import {
  ContinuityCatalogSchema,
  CharacterRelationshipSchema,
  EntityStateSchema,
  KnowledgeStateSchema,
  TimelineEventSchema,
  type ContinuityCatalog,
  type ContinuityListInput,
  type EntityState,
  type CharacterRelationship,
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
import { sqliteResult } from './database/sqlite-result.js';

interface RelationshipRow {
  readonly id: string;
  readonly projectId: string;
  readonly fromCharacterId: string;
  readonly toCharacterId: string;
  readonly category: string;
  readonly label: string;
  readonly validFromChapterId: string;
  readonly validUntilChapterId: string | null;
  readonly sourceVersionId: string;
  readonly evidenceJson: string;
  readonly recordStatus: 'current' | 'historical' | 'invalid';
  readonly createdAt: string;
  readonly supersededAt: string | null;
}

export function parseState(row: StateRow): EntityState {
  return EntityStateSchema.parse({
    id: row.id,
    projectId: row.projectId,
    entityId: row.entityId,
    stateKey: row.stateKey,
    semanticKind: row.semanticKind,
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
  const rows = sqliteResult<{ readonly entityId: string }[]>(
    connection
      .prepare(
        `SELECT entity_id AS entityId
         FROM timeline_event_entities
        WHERE event_id = ? AND role = ?
        ORDER BY entity_id`,
      )
      .all(eventId, role),
  );
  return rows.map((row) => text(row.entityId));
}

export function dependencyIds(connection: DatabaseSync, eventId: string): string[] {
  const rows = sqliteResult<{ readonly dependencyId: string }[]>(
    connection
      .prepare(
        `SELECT dependency_event_id AS dependencyId
         FROM timeline_event_dependencies
        WHERE event_id = ?
        ORDER BY dependency_event_id`,
      )
      .all(eventId),
  );
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
  return sqliteResult<StateRow[]>(
    connection
      .prepare(
        `SELECT id, project_id AS projectId, entity_id AS entityId, state_key AS stateKey,
              semantic_kind AS semanticKind, value_json AS valueJson,
              valid_from_chapter_id AS validFromChapterId,
              valid_until_chapter_id AS validUntilChapterId, record_status AS recordStatus,
              evidence_json AS evidenceJson, source_version_id AS sourceVersionId,
              created_at AS createdAt, superseded_at AS supersededAt
         FROM entity_states
        WHERE project_id = ?
        ORDER BY entity_id, state_key, created_at DESC, id`,
      )
      .all(projectId),
  );
}

export function eventRows(connection: DatabaseSync, projectId: string): EventRow[] {
  return sqliteResult<EventRow[]>(
    connection
      .prepare(
        `SELECT id, project_id AS projectId, title, start_value AS startValue,
              end_value AS endValue, precision, chapter_id AS chapterId,
              location_id AS locationId, description, status, archived_at AS archivedAt,
              created_at AS createdAt, updated_at AS updatedAt
         FROM timeline_events
        WHERE project_id = ?
        ORDER BY status = 'archived', start_value, id`,
      )
      .all(projectId),
  );
}

export function knowledgeRows(connection: DatabaseSync, projectId: string): KnowledgeRow[] {
  return sqliteResult<KnowledgeRow[]>(
    connection
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
      .all(projectId),
  );
}

function relationshipRows(connection: DatabaseSync, projectId: string): RelationshipRow[] {
  return sqliteResult<RelationshipRow[]>(
    connection
      .prepare(
        `SELECT id, project_id AS projectId, from_character_id AS fromCharacterId,
              to_character_id AS toCharacterId, category, label,
              valid_from_chapter_id AS validFromChapterId,
              valid_until_chapter_id AS validUntilChapterId,
              source_version_id AS sourceVersionId, evidence_json AS evidenceJson,
              record_status AS recordStatus,
              created_at AS createdAt, superseded_at AS supersededAt
         FROM character_relationships
        WHERE project_id = ?
        ORDER BY from_character_id, to_character_id, category, label, created_at DESC, id`,
      )
      .all(projectId),
  );
}

function parseRelationship(row: RelationshipRow): CharacterRelationship {
  const { evidenceJson, ...fields } = row;
  return CharacterRelationshipSchema.parse({
    ...fields,
    evidence: parseJson(evidenceJson, 'CharacterRelationship evidence'),
  });
}

function selectEffective<T extends StateRow | KnowledgeRow | RelationshipRow>(
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
  const relationshipsRaw = relationshipRows(connection, input.projectId);
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
  const relationships = input.effectiveAtChapterId
    ? selectEffective(
        connection,
        input.projectId,
        relationshipsRaw,
        input.effectiveAtChapterId,
        (row) =>
          `${row.fromCharacterId}\u0000${row.toCharacterId}\u0000${row.category}\u0000${row.label}`,
      ).map(parseRelationship)
    : relationshipsRaw
        .filter((row) => input.includeHistory || row.recordStatus === 'current')
        .map(parseRelationship);
  const matches = (values: readonly string[]) =>
    !query || values.some((value) => value.toLocaleLowerCase('zh-CN').includes(query));
  return ContinuityCatalogSchema.parse({
    projectId: input.projectId,
    entityStates: states.filter((row) => matches([row.stateKey, JSON.stringify(row.value)])),
    timelineEvents: events.filter((row) => matches([row.title, row.description, row.startValue])),
    knowledgeStates: knowledge.filter((row) =>
      matches([row.informationKey, row.knowledgeStatus, row.notes]),
    ),
    relationships: relationships.filter((row) => matches([row.category, row.label])),
  });
}
