import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import {
  ContinuityCatalogSchema,
  ContinuityListInputSchema,
  EntityStateInvalidateInputSchema,
  EntityStateSchema,
  EntityStateSetInputSchema,
  KnowledgeStateInvalidateInputSchema,
  KnowledgeStateSchema,
  KnowledgeStateSetInputSchema,
  TimelineEventArchiveInputSchema,
  TimelineEventSaveInputSchema,
  TimelineEventSchema,
  type ContinuityCatalog,
  type ContinuityListInput,
  type EntityState,
  type EntityStateInvalidateInput,
  type EntityStateSetInput,
  type EvidenceAnchor,
  type KnowledgeState,
  type KnowledgeStateInvalidateInput,
  type KnowledgeStateSetInput,
  type TimelineEvent,
  type TimelineEventArchiveInput,
  type TimelineEventSaveInput,
} from '@worldforge/contracts';
import {
  assertAuthorAuthority,
  chapterRangeContains,
  compareChapterPosition,
  dependencyDefinitelyOutOfOrder,
  eventTimeRange,
  normalizeContinuityKey,
  timeRangesOverlap,
  type ComparableTimeRange,
} from '@worldforge/domain';

import type { DatabaseClock } from './database/index.js';
import type { ProjectWorkspaceService } from './project-workspace.js';

const systemClock: DatabaseClock = { now: () => new Date() };

type ChapterPosition = readonly [number, number];

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

interface StateRow {
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

interface TimelineRow {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly startValue: string;
  readonly endValue: string | null;
  readonly precision: TimelineEvent['precision'];
  readonly chapterId: string | null;
  readonly locationId: string | null;
  readonly description: string;
  readonly status: string;
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface KnowledgeRow {
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

function text(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ContinuityServiceError('CONTINUITY_INVARIANT', 'Persisted continuity text is invalid.');
  }
  return value;
}

function authorOnly(authority: 'author' | 'ai'): void {
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

function uniqueIds(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function chapterPosition(
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
    throw new ContinuityServiceError(
      'CONTINUITY_NOT_FOUND',
      'The chapter does not belong to the active project.',
    );
  }
  return [Number(row.volumeOrder), Number(row.chapterOrder)];
}

function validateChapterRange(
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

function assertEntity(
  connection: DatabaseSync,
  projectId: string,
  entityId: string,
  requiredType?: string,
): void {
  const row = connection
    .prepare('SELECT entity_type AS entityType, status FROM entities WHERE id = ? AND project_id = ?')
    .get(entityId, projectId) as { readonly entityType: string; readonly status: string } | undefined;
  if (!row || row.status !== 'active' || (requiredType && row.entityType !== requiredType)) {
    throw new ContinuityServiceError(
      'CONTINUITY_NOT_FOUND',
      requiredType ? `An active ${requiredType} Entity is required.` : 'An active Entity is required.',
    );
  }
}

function assertVersion(connection: DatabaseSync, projectId: string, versionId: string): void {
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
    throw new ContinuityServiceError(
      'CONTINUITY_NOT_FOUND',
      'The source Version does not belong to the active project.',
    );
  }
}

function validateEvidence(
  connection: DatabaseSync,
  projectId: string,
  evidence: readonly EvidenceAnchor[],
): void {
  for (const anchor of evidence) {
    switch (anchor.kind) {
      case 'chapter':
        chapterPosition(connection, projectId, anchor.targetId);
        break;
      case 'sceneBeat':
        if (
          !connection
            .prepare('SELECT 1 FROM scene_beats WHERE id = ? AND project_id = ?')
            .get(anchor.targetId, projectId)
        ) {
          throw new ContinuityServiceError('CONTINUITY_NOT_FOUND', 'Evidence SceneBeat not found.');
        }
        break;
      case 'version':
        assertVersion(connection, projectId, anchor.targetId);
        break;
      case 'entity':
        assertEntity(connection, projectId, anchor.targetId);
        break;
      case 'logicalBlock':
        if (!anchor.targetId.trim()) {
          throw new ContinuityServiceError('CONTINUITY_INVALID', 'Evidence block ID is empty.');
        }
        break;
    }
  }
}

function parseState(row: StateRow): EntityState {
  let value: unknown;
  let evidence: unknown;
  try {
    value = JSON.parse(text(row.valueJson));
    evidence = JSON.parse(text(row.evidenceJson));
  } catch (error) {
    throw new ContinuityServiceError('CONTINUITY_INVARIANT', 'Persisted state JSON is invalid.', {
      cause: error,
    });
  }
  return EntityStateSchema.parse({ ...row, value, evidence });
}

function roleIds(connection: DatabaseSync, eventId: string, role: string): string[] {
  return (
    connection
      .prepare(
        `SELECT entity_id AS entityId
           FROM timeline_event_entities
          WHERE event_id = ? AND role = ?
          ORDER BY entity_id`,
      )
      .all(eventId, role) as unknown as { readonly entityId: string }[]
  ).map((row) => text(row.entityId));
}

function dependencyIds(connection: DatabaseSync, eventId: string): string[] {
  return (
    connection
      .prepare(
        `SELECT dependency_event_id AS dependencyId
           FROM timeline_event_dependencies
          WHERE event_id = ?
          ORDER BY dependency_event_id`,
      )
      .all(eventId) as unknown as { readonly dependencyId: string }[]
  ).map((row) => text(row.dependencyId));
}

function parseTimeline(connection: DatabaseSync, row: TimelineRow): TimelineEvent {
  return TimelineEventSchema.parse({
    ...row,
    participantIds: roleIds(connection, row.id, 'participant'),
    witnessIds: roleIds(connection, row.id, 'witness'),
    subjectIds: roleIds(connection, row.id, 'subject'),
    dependencyIds: dependencyIds(connection, row.id),
  });
}

function parseKnowledge(row: KnowledgeRow): KnowledgeState {
  return KnowledgeStateSchema.parse(row);
}

function stateRows(connection: DatabaseSync, projectId: string): StateRow[] {
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

function timelineRows(connection: DatabaseSync, projectId: string): TimelineRow[] {
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
    .all(projectId) as unknown as TimelineRow[];
}

function knowledgeRows(connection: DatabaseSync, projectId: string): KnowledgeRow[] {
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

function effectiveStates(
  connection: DatabaseSync,
  projectId: string,
  rows: readonly StateRow[],
  chapterId: string,
): EntityState[] {
  const target = chapterPosition(connection, projectId, chapterId);
  const selected = new Map<string, { row: StateRow; start: ChapterPosition }>();
  for (const row of rows) {
    if (row.recordStatus === 'invalid' || row.recordStatus === 'superseded') continue;
    const start = chapterPosition(connection, projectId, row.validFromChapterId);
    const end = row.validUntilChapterId
      ? chapterPosition(connection, projectId, row.validUntilChapterId)
      : null;
    if (!chapterRangeContains(start, end, target)) continue;
    const key = `${row.entityId}\u0000${row.stateKey}`;
    const existing = selected.get(key);
    if (!existing || compareChapterPosition(existing.start, start) < 0) selected.set(key, { row, start });
  }
  return [...selected.values()].map(({ row }) => parseState(row));
}

function effectiveKnowledge(
  connection: DatabaseSync,
  projectId: string,
  rows: readonly KnowledgeRow[],
  chapterId: string,
): KnowledgeState[] {
  const target = chapterPosition(connection, projectId, chapterId);
  const selected = new Map<string, { row: KnowledgeRow; start: ChapterPosition }>();
  for (const row of rows) {
    if (row.recordStatus === 'invalid') continue;
    const start = chapterPosition(connection, projectId, row.validFromChapterId);
    const end = row.validUntilChapterId
      ? chapterPosition(connection, projectId, row.validUntilChapterId)
      : null;
    if (!chapterRangeContains(start, end, target)) continue;
    const key = `${row.characterId}\u0000${row.informationKey}`;
    const existing = selected.get(key);
    if (!existing || compareChapterPosition(existing.start, start) < 0) selected.set(key, { row, start });
  }
  return [...selected.values()].map(({ row }) => parseKnowledge(row));
}

function readCatalog(connection: DatabaseSync, input: ContinuityListInput): ContinuityCatalog {
  const query = input.query.toLocaleLowerCase('zh-CN');
  const rawStates = stateRows(connection, input.projectId);
  const rawKnowledge = knowledgeRows(connection, input.projectId);
  const states = input.effectiveAtChapterId
    ? effectiveStates(connection, input.projectId, rawStates, input.effectiveAtChapterId)
    : rawStates
        .filter((row) => input.includeHistory || row.recordStatus === 'current')
        .map(parseState);
  const knowledge = input.effectiveAtChapterId
    ? effectiveKnowledge(connection, input.projectId, rawKnowledge, input.effectiveAtChapterId)
    : rawKnowledge
        .filter((row) => input.includeHistory || row.recordStatus === 'current')
        .map(parseKnowledge);
  const events = timelineRows(connection, input.projectId)
    .filter((row) => input.includeArchivedEvents || row.status === 'active')
    .map((row) => parseTimeline(connection, row));
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

function timelineRange(input: Pick<TimelineEventSaveInput, 'startValue' | 'endValue' | 'precision'>): ComparableTimeRange | null {
  try {
    return eventTimeRange(input.startValue, input.endValue, input.precision);
  } catch (error) {
    throw new ContinuityServiceError('CONTINUITY_INVALID', 'Timeline value or range is invalid.', {
      cause: error,
    });
  }
}

function assertNoDependencyCycle(
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
  for (const row of rows) graph.set(row.eventId, [...(graph.get(row.eventId) ?? []), row.dependencyId]);
  graph.set(eventId, [...dependencies]);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      throw new ContinuityServiceError('CONTINUITY_CONFLICT', 'Timeline dependencies contain a cycle.');
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of graph.get(id) ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  visit(eventId);
}

function rowTimeRange(row: TimelineRow): ComparableTimeRange | null {
  return timelineRange(row);
}

export class ContinuityService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;

  constructor(workspace: ProjectWorkspaceService, options: ContinuityServiceOptions = {}) {
    this.#workspace = workspace;
    this.#clock = options.clock ?? systemClock;
    this.#idFactory = options.idFactory ?? randomUUID;
  }

  list(input: ContinuityListInput): ContinuityCatalog {
    const valid = ContinuityListInputSchema.parse(input);
    return this.#workspace.readProject(valid.projectId, (connection) => readCatalog(connection, valid));
  }

  async setEntityState(requestId: string, input: EntityStateSetInput): Promise<ContinuityCatalog> {
    const valid = EntityStateSetInputSchema.parse(input);
    authorOnly(valid.authority);
    const stateKey = normalizeContinuityKey(valid.stateKey, 120);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      assertEntity(connection, valid.projectId, valid.entityId);
      const nextRange = validateChapterRange(
        connection,
        valid.projectId,
        valid.validFromChapterId,
        valid.validUntilChapterId,
      );
      assertVersion(connection, valid.projectId, valid.sourceVersionId);
      validateEvidence(connection, valid.projectId, valid.evidence);
      const current = connection
        .prepare(
          `SELECT id, valid_from_chapter_id AS validFromChapterId
             FROM entity_states
            WHERE entity_id = ? AND state_key = ? AND record_status = 'current'`,
        )
        .get(valid.entityId, stateKey) as
        | { readonly id: string; readonly validFromChapterId: string }
        | undefined;
      const now = this.#clock.now().toISOString();
      if (current) {
        const currentStart = chapterPosition(connection, valid.projectId, current.validFromChapterId);
        const ordering = compareChapterPosition(currentStart, nextRange.start);
        if (ordering > 0) {
          throw new ContinuityServiceError(
            'CONTINUITY_CONFLICT',
            'Historical backfill before the current state requires an explicit migration workflow.',
          );
        }
        connection
          .prepare(
            `UPDATE entity_states
                SET record_status = ?, valid_until_chapter_id = ?, superseded_at = ?
              WHERE id = ?`,
          )
          .run(
            ordering === 0 ? 'superseded' : 'historical',
            ordering === 0 ? current.validFromChapterId : valid.validFromChapterId,
            now,
            current.id,
          );
      }
      connection
        .prepare(
          `INSERT INTO entity_states(
             id, project_id, entity_id, state_key, value_json,
             valid_from_chapter_id, valid_until_chapter_id, record_status,
             evidence_json, source_version_id, created_at, superseded_at
           ) VALUES(?, ?, ?, ?, ?, ?, ?, 'current', ?, ?, ?, NULL)`,
        )
        .run(
          this.#idFactory(),
          valid.projectId,
          valid.entityId,
          stateKey,
          JSON.stringify(valid.value),
          valid.validFromChapterId,
          valid.validUntilChapterId,
          JSON.stringify(valid.evidence),
          valid.sourceVersionId,
          now,
        );
      return readCatalog(connection, {
        projectId: valid.projectId,
        includeHistory: true,
        includeArchivedEvents: false,
        effectiveAtChapterId: null,
        query: '',
      });
    });
  }

  async invalidateEntityState(
    requestId: string,
    input: EntityStateInvalidateInput,
  ): Promise<ContinuityCatalog> {
    const valid = EntityStateInvalidateInputSchema.parse(input);
    authorOnly(valid.authority);
    const stateKey = normalizeContinuityKey(valid.stateKey, 120);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      const result = connection
        .prepare(
          `UPDATE entity_states
              SET record_status = 'invalid', superseded_at = ?
            WHERE entity_id = ? AND state_key = ? AND record_status = 'current'`,
        )
        .run(this.#clock.now().toISOString(), valid.entityId, stateKey);
      if (Number(result.changes) !== 1) {
        throw new ContinuityServiceError('CONTINUITY_NOT_FOUND', 'Current EntityState not found.');
      }
      return readCatalog(connection, {
        projectId: valid.projectId,
        includeHistory: true,
        includeArchivedEvents: false,
        effectiveAtChapterId: null,
        query: '',
      });
    });
  }

  async saveTimelineEvent(
    requestId: string,
    input: TimelineEventSaveInput,
  ): Promise<ContinuityCatalog> {
    const valid = TimelineEventSaveInputSchema.parse(input);
    authorOnly(valid.authority);
    const eventId = valid.eventId ?? this.#idFactory();
    const participants = uniqueIds(valid.participantIds);
    const witnesses = uniqueIds(valid.witnessIds);
    const subjects = uniqueIds(valid.subjectIds);
    const dependencies = uniqueIds(valid.dependencyIds);
    const nextRange = timelineRange(valid);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      if (valid.eventId) {
        const existing = connection
          .prepare('SELECT 1 FROM timeline_events WHERE id = ? AND project_id = ?')
          .get(eventId, valid.projectId);
        if (!existing) throw new ContinuityServiceError('CONTINUITY_NOT_FOUND', 'TimelineEvent not found.');
      }
      if (valid.chapterId) chapterPosition(connection, valid.projectId, valid.chapterId);
      if (valid.locationId) assertEntity(connection, valid.projectId, valid.locationId, 'location');
      for (const entityId of [...participants, ...witnesses, ...subjects]) {
        assertEntity(connection, valid.projectId, entityId);
      }
      for (const dependencyId of dependencies) {
        if (dependencyId === eventId) {
          throw new ContinuityServiceError('CONTINUITY_CONFLICT', 'An event cannot depend on itself.');
        }
        const dependency = connection
          .prepare(
            `SELECT id, project_id AS projectId, title, start_value AS startValue,
                    end_value AS endValue, precision, chapter_id AS chapterId,
                    location_id AS locationId, description, status, archived_at AS archivedAt,
                    created_at AS createdAt, updated_at AS updatedAt
               FROM timeline_events
              WHERE id = ? AND project_id = ? AND status = 'active'`,
          )
          .get(dependencyId, valid.projectId) as TimelineRow | undefined;
        if (!dependency) {
          throw new ContinuityServiceError('CONTINUITY_NOT_FOUND', 'Dependency event not found.');
        }
        const dependencyRange = rowTimeRange(dependency);
        if (
          dependencyRange &&
          nextRange &&
          dependencyDefinitelyOutOfOrder(dependencyRange, nextRange)
        ) {
          throw new ContinuityServiceError(
            'CONTINUITY_CONFLICT',
            'A dependency is definitely later than the dependent event.',
          );
        }
      }
      assertNoDependencyCycle(connection, valid.projectId, eventId, dependencies);
      if (nextRange && valid.locationId && participants.length > 0) {
        for (const row of timelineRows(connection, valid.projectId)) {
          if (row.id === eventId || row.status !== 'active' || !row.locationId || row.locationId === valid.locationId) {
            continue;
          }
          const existingRange = rowTimeRange(row);
          if (!existingRange || !timeRangesOverlap(nextRange, existingRange)) continue;
          const existingParticipants = new Set(roleIds(connection, row.id, 'participant'));
          if (participants.some((id) => existingParticipants.has(id))) {
            throw new ContinuityServiceError(
              'CONTINUITY_CONFLICT',
              'The same participant cannot occupy different locations in overlapping comparable time ranges.',
            );
          }
        }
      }
      const now = this.#clock.now().toISOString();
      if (valid.eventId) {
        connection
          .prepare(
            `UPDATE timeline_events
                SET title = ?, start_value = ?, end_value = ?, precision = ?, chapter_id = ?,
                    location_id = ?, description = ?, status = 'active', archived_at = NULL,
                    updated_at = ?
              WHERE id = ? AND project_id = ?`,
          )
          .run(
            valid.title.trim(),
            valid.startValue.trim(),
            valid.endValue?.trim() ?? null,
            valid.precision,
            valid.chapterId,
            valid.locationId,
            valid.description.trim(),
            now,
            eventId,
            valid.projectId,
          );
      } else {
        connection
          .prepare(
            `INSERT INTO timeline_events(
               id, project_id, title, start_value, end_value, precision, chapter_id,
               location_id, description, status, archived_at, created_at, updated_at
             ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?)`,
          )
          .run(
            eventId,
            valid.projectId,
            valid.title.trim(),
            valid.startValue.trim(),
            valid.endValue?.trim() ?? null,
            valid.precision,
            valid.chapterId,
            valid.locationId,
            valid.description.trim(),
            now,
            now,
          );
      }
      connection.prepare('DELETE FROM timeline_event_entities WHERE event_id = ?').run(eventId);
      connection.prepare('DELETE FROM timeline_event_dependencies WHERE event_id = ?').run(eventId);
      const insertEntity = connection.prepare(
        `INSERT INTO timeline_event_entities(project_id, event_id, entity_id, role, created_at)
         VALUES(?, ?, ?, ?, ?)`,
      );
      for (const [role, ids] of [
        ['participant', participants],
        ['witness', witnesses],
        ['subject', subjects],
      ] as const) {
        for (const entityId of ids) insertEntity.run(valid.projectId, eventId, entityId, role, now);
      }
      const insertDependency = connection.prepare(
        `INSERT INTO timeline_event_dependencies(
           project_id, event_id, dependency_event_id, created_at
         ) VALUES(?, ?, ?, ?)`,
      );
      for (const dependencyId of dependencies) {
        insertDependency.run(valid.projectId, eventId, dependencyId, now);
      }
      return readCatalog(connection, {
        projectId: valid.projectId,
        includeHistory: true,
        includeArchivedEvents: true,
        effectiveAtChapterId: null,
        query: '',
      });
    });
  }

  async archiveTimelineEvent(
    requestId: string,
    input: TimelineEventArchiveInput,
  ): Promise<ContinuityCatalog> {
    const valid = TimelineEventArchiveInputSchema.parse(input);
    authorOnly(valid.authority);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      const now = this.#clock.now().toISOString();
      const result = connection
        .prepare(
          `UPDATE timeline_events
              SET status = 'archived', archived_at = ?, updated_at = ?
            WHERE id = ? AND project_id = ? AND status = 'active'`,
        )
        .run(now, now, valid.eventId, valid.projectId);
      if (Number(result.changes) !== 1) {
        throw new ContinuityServiceError('CONTINUITY_NOT_FOUND', 'Active TimelineEvent not found.');
      }
      return readCatalog(connection, {
        projectId: valid.projectId,
        includeHistory: true,
        includeArchivedEvents: true,
        effectiveAtChapterId: null,
        query: '',
      });
    });
  }

  async setKnowledgeState(
    requestId: string,
    input: KnowledgeStateSetInput,
  ): Promise<ContinuityCatalog> {
    const valid = KnowledgeStateSetInputSchema.parse(input);
    authorOnly(valid.authority);
    const informationKey = normalizeContinuityKey(valid.informationKey);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      assertEntity(connection, valid.projectId, valid.characterId, 'character');
      const nextRange = validateChapterRange(
        connection,
        valid.projectId,
        valid.validFromChapterId,
        valid.validUntilChapterId,
      );
      if (valid.sourceVersionId) assertVersion(connection, valid.projectId, valid.sourceVersionId);
      if (!valid.sourceVersionId && !valid.sourceLogicalBlockId) {
        throw new ContinuityServiceError(
          'CONTINUITY_INVALID',
          'KnowledgeState requires a stable Version or logical block source anchor.',
        );
      }
      const current = connection
        .prepare(
          `SELECT id, valid_from_chapter_id AS validFromChapterId
             FROM knowledge_states
            WHERE character_id = ? AND information_key = ? AND record_status = 'current'`,
        )
        .get(valid.characterId, informationKey) as
        | { readonly id: string; readonly validFromChapterId: string }
        | undefined;
      const now = this.#clock.now().toISOString();
      if (current) {
        const currentStart = chapterPosition(connection, valid.projectId, current.validFromChapterId);
        const ordering = compareChapterPosition(currentStart, nextRange.start);
        if (ordering > 0) {
          throw new ContinuityServiceError(
            'CONTINUITY_CONFLICT',
            'Historical knowledge backfill requires an explicit migration workflow.',
          );
        }
        connection
          .prepare(
            `UPDATE knowledge_states
                SET record_status = 'historical', valid_until_chapter_id = ?, superseded_at = ?
              WHERE id = ?`,
          )
          .run(
            ordering === 0 ? current.validFromChapterId : valid.validFromChapterId,
            now,
            current.id,
          );
      }
      connection
        .prepare(
          `INSERT INTO knowledge_states(
             id, project_id, information_key, character_id, knowledge_status,
             valid_from_chapter_id, valid_until_chapter_id, source_version_id,
             source_logical_block_id, notes, record_status, created_at, superseded_at
           ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'current', ?, NULL)`,
        )
        .run(
          this.#idFactory(),
          valid.projectId,
          informationKey,
          valid.characterId,
          valid.knowledgeStatus,
          valid.validFromChapterId,
          valid.validUntilChapterId,
          valid.sourceVersionId,
          valid.sourceLogicalBlockId?.trim() ?? null,
          valid.notes.trim(),
          now,
        );
      return readCatalog(connection, {
        projectId: valid.projectId,
        includeHistory: true,
        includeArchivedEvents: false,
        effectiveAtChapterId: null,
        query: '',
      });
    });
  }

  async invalidateKnowledgeState(
    requestId: string,
    input: KnowledgeStateInvalidateInput,
  ): Promise<ContinuityCatalog> {
    const valid = KnowledgeStateInvalidateInputSchema.parse(input);
    authorOnly(valid.authority);
    const informationKey = normalizeContinuityKey(valid.informationKey);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      const result = connection
        .prepare(
          `UPDATE knowledge_states
              SET record_status = 'invalid', superseded_at = ?
            WHERE character_id = ? AND information_key = ? AND record_status = 'current'`,
        )
        .run(this.#clock.now().toISOString(), valid.characterId, informationKey);
      if (Number(result.changes) !== 1) {
        throw new ContinuityServiceError('CONTINUITY_NOT_FOUND', 'Current KnowledgeState not found.');
      }
      return readCatalog(connection, {
        projectId: valid.projectId,
        includeHistory: true,
        includeArchivedEvents: false,
        effectiveAtChapterId: null,
        query: '',
      });
    });
  }
}
