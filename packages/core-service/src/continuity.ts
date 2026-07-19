import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import {
  ContinuityCatalogSchema,
  ContinuityListInputSchema,
  EntityStateSchema,
  EntityStateSetInputSchema,
  KnowledgeStateSchema,
  KnowledgeStateSetInputSchema,
  TimelineEventSaveInputSchema,
  TimelineEventSchema,
  type ContinuityCatalog,
  type ContinuityListInput,
  type EntityState,
  type EntityStateSetInput,
  type EvidenceAnchor,
  type KnowledgeState,
  type KnowledgeStateSetInput,
  type TimelineEvent,
  type TimelineEventSaveInput,
} from '@worldforge/contracts';
import {
  assertAuthorAuthority,
  assertStoryTimeRange,
  comparableStoryTime,
  normalizeContinuityKey,
  normalizeStoryTimeValue,
  wouldCreateTimelineCycle,
} from '@worldforge/domain';

import type { DatabaseClock } from './database/index.js';
import type { ProjectWorkspaceService } from './project-workspace.js';

const systemClock: DatabaseClock = { now: () => new Date() };

export type ContinuityServiceErrorCode =
  | 'CONTINUITY_NOT_FOUND'
  | 'CONTINUITY_INVALID'
  | 'CONTINUITY_CONFLICT'
  | 'CONTINUITY_AUTHOR_REQUIRED'
  | 'CONTINUITY_CYCLE'
  | 'CONTINUITY_TIME_CONFLICT'
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

interface ChapterOrder {
  readonly volumeOrder: bigint;
  readonly chapterOrder: bigint;
}

interface EntityStateRow {
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
}

interface TimelineEventRow {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly startValue: string;
  readonly endValue: string | null;
  readonly precision: string;
  readonly chapterId: string | null;
  readonly locationId: string | null;
  readonly description: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface KnowledgeStateRow {
  readonly id: string;
  readonly projectId: string;
  readonly informationKey: string;
  readonly characterId: string;
  readonly knowledgeStatus: string;
  readonly acquiredChapterId: string | null;
  readonly sourceBlockId: string | null;
  readonly sourceVersionId: string | null;
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

function integer(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  throw new ContinuityServiceError(
    'CONTINUITY_INVARIANT',
    'Persisted continuity order is invalid.',
  );
}

function parseJson(value: string, label: string): unknown {
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

function authorOnly(authority: 'author' | 'ai'): void {
  try {
    assertAuthorAuthority(authority);
  } catch (error) {
    throw new ContinuityServiceError(
      'CONTINUITY_AUTHOR_REQUIRED',
      'Only an explicit author command may change continuity truth.',
      { cause: error },
    );
  }
}

function assertProject(connection: DatabaseSync, projectId: string): void {
  if (!connection.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) {
    throw new ContinuityServiceError('CONTINUITY_NOT_FOUND', 'The project was not found.');
  }
}

function entity(
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
    .get(entityId, projectId);
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

function chapterOrder(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
): ChapterOrder {
  const row = connection
    .prepare(
      `SELECT v.order_key AS volumeOrder, c.order_key AS chapterOrder
         FROM chapters c
         JOIN volumes v ON v.id = c.volume_id
        WHERE c.id = ? AND v.project_id = ?
          AND c.deleted_at IS NULL AND v.deleted_at IS NULL`,
    )
    .get(chapterId, projectId);
  if (!row) {
    throw new ContinuityServiceError('CONTINUITY_NOT_FOUND', 'The active Chapter was not found.');
  }
  return {
    volumeOrder: integer(row.volumeOrder),
    chapterOrder: integer(row.chapterOrder),
  };
}

function compareChapter(left: ChapterOrder, right: ChapterOrder): number {
  if (left.volumeOrder < right.volumeOrder) return -1;
  if (left.volumeOrder > right.volumeOrder) return 1;
  if (left.chapterOrder < right.chapterOrder) return -1;
  if (left.chapterOrder > right.chapterOrder) return 1;
  return 0;
}

function versionChapter(connection: DatabaseSync, projectId: string, versionId: string): string {
  const row = connection
    .prepare(
      `SELECT ver.chapter_id AS chapterId
         FROM versions ver
         JOIN chapters c ON c.id = ver.chapter_id
         JOIN volumes v ON v.id = c.volume_id
        WHERE ver.id = ? AND v.project_id = ?`,
    )
    .get(versionId, projectId);
  if (!row) {
    throw new ContinuityServiceError('CONTINUITY_NOT_FOUND', 'The source Version was not found.');
  }
  return text(row.chapterId);
}

function assertBlock(connection: DatabaseSync, projectId: string, blockId: string): void {
  const row = connection
    .prepare(
      `SELECT 1
         FROM draft_blocks b
         JOIN drafts d ON d.id = b.draft_id
         JOIN chapters c ON c.id = d.chapter_id
         JOIN volumes v ON v.id = c.volume_id
        WHERE b.id = ? AND v.project_id = ?`,
    )
    .get(blockId, projectId);
  if (!row) {
    throw new ContinuityServiceError('CONTINUITY_NOT_FOUND', 'The source DraftBlock was not found.');
  }
}

function validateEvidence(
  connection: DatabaseSync,
  projectId: string,
  evidence: readonly EvidenceAnchor[],
): void {
  for (const anchor of evidence) {
    let found: unknown;
    switch (anchor.kind) {
      case 'entity':
        found = connection
          .prepare('SELECT 1 FROM entities WHERE id = ? AND project_id = ?')
          .get(anchor.targetId, projectId);
        break;
      case 'chapter':
        found = connection
          .prepare(
            `SELECT 1 FROM chapters c
              JOIN volumes v ON v.id = c.volume_id
             WHERE c.id = ? AND v.project_id = ?`,
          )
          .get(anchor.targetId, projectId);
        break;
      case 'sceneBeat':
        found = connection
          .prepare(
            `SELECT 1 FROM scene_beats b
              JOIN chapters c ON c.id = b.chapter_id
              JOIN volumes v ON v.id = c.volume_id
             WHERE b.id = ? AND v.project_id = ?`,
          )
          .get(anchor.targetId, projectId);
        break;
      case 'block':
        found = connection
          .prepare(
            `SELECT 1 FROM draft_blocks b
              JOIN drafts d ON d.id = b.draft_id
              JOIN chapters c ON c.id = d.chapter_id
              JOIN volumes v ON v.id = c.volume_id
             WHERE b.id = ? AND v.project_id = ?`,
          )
          .get(anchor.targetId, projectId);
        break;
      case 'version':
        found = connection
          .prepare(
            `SELECT 1 FROM versions ver
              JOIN chapters c ON c.id = ver.chapter_id
              JOIN volumes v ON v.id = c.volume_id
             WHERE ver.id = ? AND v.project_id = ?`,
          )
          .get(anchor.targetId, projectId);
        break;
    }
    if (!found) {
      throw new ContinuityServiceError(
        'CONTINUITY_NOT_FOUND',
        `Evidence anchor ${anchor.kind} does not belong to the project.`,
      );
    }
  }
}

function parseEntityState(row: EntityStateRow): EntityState {
  return EntityStateSchema.parse({
    id: text(row.id),
    projectId: text(row.projectId),
    entityId: text(row.entityId),
    stateKey: text(row.stateKey),
    value: parseJson(text(row.valueJson), 'EntityState value'),
    validFromChapterId: text(row.validFromChapterId),
    validUntilChapterId: row.validUntilChapterId === null ? null : text(row.validUntilChapterId),
    recordStatus: text(row.recordStatus),
    evidence: parseJson(text(row.evidenceJson), 'EntityState evidence'),
    sourceVersionId: text(row.sourceVersionId),
    createdAt: text(row.createdAt),
  });
}

function parseKnowledgeState(row: KnowledgeStateRow): KnowledgeState {
  return KnowledgeStateSchema.parse({
    id: text(row.id),
    projectId: text(row.projectId),
    informationKey: text(row.informationKey),
    characterId: text(row.characterId),
    knowledgeStatus: text(row.knowledgeStatus),
    acquiredChapterId: row.acquiredChapterId === null ? null : text(row.acquiredChapterId),
    sourceBlockId: row.sourceBlockId === null ? null : text(row.sourceBlockId),
    sourceVersionId: row.sourceVersionId === null ? null : text(row.sourceVersionId),
    notes: text(row.notes),
    recordStatus: text(row.recordStatus),
    createdAt: text(row.createdAt),
    supersededAt: row.supersededAt === null ? null : text(row.supersededAt),
  });
}

function timelineEvent(connection: DatabaseSync, row: TimelineEventRow): TimelineEvent {
  const participantIds = (
    connection
      .prepare(
        `SELECT entity_id AS entityId
           FROM timeline_event_entities
          WHERE event_id = ? AND project_id = ?
          ORDER BY entity_id`,
      )
      .all(row.id, row.projectId) as unknown as { readonly entityId: string }[]
  ).map((entry) => text(entry.entityId));
  const dependencyIds = (
    connection
      .prepare(
        `SELECT depends_on_event_id AS dependencyId
           FROM timeline_dependencies
          WHERE event_id = ? AND project_id = ?
          ORDER BY depends_on_event_id`,
      )
      .all(row.id, row.projectId) as unknown as { readonly dependencyId: string }[]
  ).map((entry) => text(entry.dependencyId));
  return TimelineEventSchema.parse({
    id: text(row.id),
    projectId: text(row.projectId),
    title: text(row.title),
    startValue: text(row.startValue),
    endValue: row.endValue === null ? null : text(row.endValue),
    precision: text(row.precision),
    chapterId: row.chapterId === null ? null : text(row.chapterId),
    locationId: row.locationId === null ? null : text(row.locationId),
    description: text(row.description),
    participantIds,
    dependencyIds,
    createdAt: text(row.createdAt),
    updatedAt: text(row.updatedAt),
  });
}

function effectiveAt(
  connection: DatabaseSync,
  projectId: string,
  state: EntityState,
  chapterId: string,
): boolean {
  if (state.recordStatus === 'invalid' || state.recordStatus === 'superseded') return false;
  const target = chapterOrder(connection, projectId, chapterId);
  const start = chapterOrder(connection, projectId, state.validFromChapterId);
  if (compareChapter(start, target) > 0) return false;
  if (state.validUntilChapterId === null) return true;
  const end = chapterOrder(connection, projectId, state.validUntilChapterId);
  return compareChapter(target, end) < 0;
}

function readCatalog(connection: DatabaseSync, input: ContinuityListInput): ContinuityCatalog {
  assertProject(connection, input.projectId);
  const query = input.query.toLocaleLowerCase('en-US');

  let entityStates = (
    connection
      .prepare(
        `SELECT id, project_id AS projectId, entity_id AS entityId, state_key AS stateKey,
                value_json AS valueJson, valid_from_chapter_id AS validFromChapterId,
                valid_until_chapter_id AS validUntilChapterId, record_status AS recordStatus,
                evidence_json AS evidenceJson, source_version_id AS sourceVersionId,
                created_at AS createdAt
           FROM entity_states
          WHERE project_id = ?
          ORDER BY entity_id, state_key, created_at DESC, id`,
      )
      .all(input.projectId) as unknown as EntityStateRow[]
  ).map(parseEntityState);
  if (!input.includeHistory) {
    entityStates = entityStates.filter((state) => state.recordStatus === 'current');
  }
  if (input.effectiveAtChapterId) {
    chapterOrder(connection, input.projectId, input.effectiveAtChapterId);
    entityStates = entityStates.filter((state) =>
      effectiveAt(connection, input.projectId, state, input.effectiveAtChapterId!),
    );
  }
  if (query) {
    entityStates = entityStates.filter(
      (state) =>
        state.stateKey.toLocaleLowerCase('en-US').includes(query) ||
        JSON.stringify(state.value).toLocaleLowerCase('en-US').includes(query),
    );
  }

  let timelineEvents = (
    connection
      .prepare(
        `SELECT id, project_id AS projectId, title, start_value AS startValue,
                end_value AS endValue, precision, chapter_id AS chapterId,
                location_id AS locationId, description, created_at AS createdAt,
                updated_at AS updatedAt
           FROM timeline_events
          WHERE project_id = ?
          ORDER BY start_value, title, id`,
      )
      .all(input.projectId) as unknown as TimelineEventRow[]
  ).map((row) => timelineEvent(connection, row));
  if (query) {
    timelineEvents = timelineEvents.filter(
      (event) =>
        event.title.toLocaleLowerCase('en-US').includes(query) ||
        event.description.toLocaleLowerCase('en-US').includes(query) ||
        event.startValue.toLocaleLowerCase('en-US').includes(query),
    );
  }

  let knowledgeStates = (
    connection
      .prepare(
        `SELECT id, project_id AS projectId, information_key AS informationKey,
                character_id AS characterId, knowledge_status AS knowledgeStatus,
                acquired_chapter_id AS acquiredChapterId, source_block_id AS sourceBlockId,
                source_version_id AS sourceVersionId, notes, record_status AS recordStatus,
                created_at AS createdAt, superseded_at AS supersededAt
           FROM knowledge_states
          WHERE project_id = ?
          ORDER BY character_id, information_key, created_at DESC, id`,
      )
      .all(input.projectId) as unknown as KnowledgeStateRow[]
  ).map(parseKnowledgeState);
  if (!input.includeHistory) {
    knowledgeStates = knowledgeStates.filter((state) => state.recordStatus === 'current');
  }
  if (query) {
    knowledgeStates = knowledgeStates.filter(
      (state) =>
        state.informationKey.toLocaleLowerCase('en-US').includes(query) ||
        state.notes.toLocaleLowerCase('en-US').includes(query) ||
        state.knowledgeStatus.includes(query),
    );
  }

  return ContinuityCatalogSchema.parse({
    projectId: input.projectId,
    entityStates,
    timelineEvents,
    knowledgeStates,
  });
}

function timelineGraph(connection: DatabaseSync, projectId: string): Map<string, readonly string[]> {
  const graph = new Map<string, string[]>();
  const rows = connection
    .prepare(
      `SELECT event_id AS eventId, depends_on_event_id AS dependencyId
         FROM timeline_dependencies
        WHERE project_id = ?`,
    )
    .all(projectId) as unknown as {
    readonly eventId: string;
    readonly dependencyId: string;
  }[];
  for (const row of rows) {
    const dependencies = graph.get(row.eventId) ?? [];
    dependencies.push(row.dependencyId);
    graph.set(row.eventId, dependencies);
  }
  return graph;
}

function existingTimelineEvent(
  connection: DatabaseSync,
  projectId: string,
  eventId: string,
): TimelineEvent {
  const row = connection
    .prepare(
      `SELECT id, project_id AS projectId, title, start_value AS startValue,
              end_value AS endValue, precision, chapter_id AS chapterId,
              location_id AS locationId, description, created_at AS createdAt,
              updated_at AS updatedAt
         FROM timeline_events
        WHERE id = ? AND project_id = ?`,
    )
    .get(eventId, projectId) as TimelineEventRow | undefined;
  if (!row) {
    throw new ContinuityServiceError('CONTINUITY_NOT_FOUND', 'The TimelineEvent was not found.');
  }
  return timelineEvent(connection, row);
}

function assertTimelinePersonLocation(
  connection: DatabaseSync,
  input: TimelineEventSaveInput,
  eventId: string,
  startValue: string,
  endValue: string | null,
): void {
  if (
    !input.locationId ||
    input.participantIds.length === 0 ||
    comparableStoryTime(startValue, input.precision) === null
  ) {
    return;
  }
  const placeholders = input.participantIds.map(() => '?').join(', ');
  const row = connection
    .prepare(
      `SELECT te.id
         FROM timeline_events te
         JOIN timeline_event_entities link
           ON link.event_id = te.id AND link.project_id = te.project_id
        WHERE te.project_id = ?
          AND te.id <> ?
          AND te.precision = ?
          AND te.start_value = ?
          AND COALESCE(te.end_value, '') = COALESCE(?, '')
          AND te.location_id IS NOT NULL
          AND te.location_id <> ?
          AND link.entity_id IN (${placeholders})
        LIMIT 1`,
    )
    .get(
      input.projectId,
      eventId,
      input.precision,
      startValue,
      endValue,
      input.locationId,
      ...input.participantIds,
    );
  if (row) {
    throw new ContinuityServiceError(
      'CONTINUITY_TIME_CONFLICT',
      'One participant cannot occupy different locations at the same deterministic time.',
    );
  }
}

function assertTimelineDependencyOrder(
  connection: DatabaseSync,
  input: TimelineEventSaveInput,
  eventId: string,
  startValue: string,
  endValue: string | null,
): void {
  const eventStart = comparableStoryTime(startValue, input.precision);
  const eventEnd = comparableStoryTime(endValue ?? startValue, input.precision);
  for (const dependencyId of input.dependencyIds) {
    const dependency = existingTimelineEvent(connection, input.projectId, dependencyId);
    const dependencyEnd = comparableStoryTime(
      dependency.endValue ?? dependency.startValue,
      dependency.precision,
    );
    if (eventStart !== null && dependencyEnd !== null && dependencyEnd > eventStart) {
      throw new ContinuityServiceError(
        'CONTINUITY_TIME_CONFLICT',
        'A Timeline dependency cannot occur after the dependent event starts.',
      );
    }
  }
  const dependents = connection
    .prepare(
      `SELECT event_id AS eventId
         FROM timeline_dependencies
        WHERE project_id = ? AND depends_on_event_id = ?`,
    )
    .all(input.projectId, eventId) as unknown as { readonly eventId: string }[];
  for (const dependentRow of dependents) {
    const dependent = existingTimelineEvent(connection, input.projectId, dependentRow.eventId);
    const dependentStart = comparableStoryTime(dependent.startValue, dependent.precision);
    if (eventEnd !== null && dependentStart !== null && eventEnd > dependentStart) {
      throw new ContinuityServiceError(
        'CONTINUITY_TIME_CONFLICT',
        'A Timeline event cannot be moved after an event that depends on it.',
      );
    }
  }
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
    return this.#workspace.readProject(valid.projectId, (connection) =>
      readCatalog(connection, valid),
    );
  }

  async setEntityState(
    requestId: string,
    input: EntityStateSetInput,
  ): Promise<ContinuityCatalog> {
    const valid = EntityStateSetInputSchema.parse(input);
    authorOnly(valid.authority);
    const stateKey = normalizeContinuityKey(valid.stateKey, 120);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      assertProject(connection, valid.projectId);
      entity(connection, valid.projectId, valid.entityId);
      const start = chapterOrder(connection, valid.projectId, valid.validFromChapterId);
      if (valid.validUntilChapterId) {
        const end = chapterOrder(connection, valid.projectId, valid.validUntilChapterId);
        if (compareChapter(end, start) <= 0) {
          throw new ContinuityServiceError(
            'CONTINUITY_INVALID',
            'validUntilChapterId is exclusive and must follow validFromChapterId.',
          );
        }
      }
      const sourceChapterId = versionChapter(connection, valid.projectId, valid.sourceVersionId);
      if (
        compareChapter(chapterOrder(connection, valid.projectId, sourceChapterId), start) > 0
      ) {
        throw new ContinuityServiceError(
          'CONTINUITY_INVALID',
          'The source Version cannot be later than the state effective chapter.',
        );
      }
      validateEvidence(connection, valid.projectId, valid.evidence);
      const now = this.#clock.now().toISOString();
      connection
        .prepare(
          `UPDATE entity_states
              SET record_status = 'historical',
                  valid_until_chapter_id = COALESCE(valid_until_chapter_id, ?)
            WHERE entity_id = ? AND state_key = ? AND record_status = 'current'`,
        )
        .run(valid.validFromChapterId, valid.entityId, stateKey);
      connection
        .prepare(
          `INSERT INTO entity_states(
             id, project_id, entity_id, state_key, value_json,
             valid_from_chapter_id, valid_until_chapter_id, record_status,
             evidence_json, source_version_id, created_at
           ) VALUES(?, ?, ?, ?, ?, ?, ?, 'current', ?, ?, ?)`,
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
        query: '',
        includeHistory: true,
        effectiveAtChapterId: null,
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
    const startValue = normalizeStoryTimeValue(valid.startValue, valid.precision);
    const endValue = valid.endValue
      ? normalizeStoryTimeValue(valid.endValue, valid.precision)
      : null;
    try {
      assertStoryTimeRange(startValue, endValue, valid.precision);
    } catch (error) {
      throw new ContinuityServiceError('CONTINUITY_INVALID', 'The Timeline range is invalid.', {
        cause: error,
      });
    }
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      assertProject(connection, valid.projectId);
      if (valid.eventId) existingTimelineEvent(connection, valid.projectId, valid.eventId);
      if (valid.chapterId) chapterOrder(connection, valid.projectId, valid.chapterId);
      if (valid.locationId) entity(connection, valid.projectId, valid.locationId, 'location');
      const participantIds = [...new Set(valid.participantIds)];
      const dependencyIds = [...new Set(valid.dependencyIds)];
      for (const participantId of participantIds) {
        entity(connection, valid.projectId, participantId);
      }
      for (const dependencyId of dependencyIds) {
        if (dependencyId === eventId) {
          throw new ContinuityServiceError(
            'CONTINUITY_CYCLE',
            'A TimelineEvent cannot depend on itself.',
          );
        }
        existingTimelineEvent(connection, valid.projectId, dependencyId);
      }
      const graph = timelineGraph(connection, valid.projectId);
      graph.delete(eventId);
      if (wouldCreateTimelineCycle(eventId, dependencyIds, graph)) {
        throw new ContinuityServiceError(
          'CONTINUITY_CYCLE',
          'The Timeline dependency graph would contain a cycle.',
        );
      }
      const normalizedInput = { ...valid, participantIds, dependencyIds };
      assertTimelinePersonLocation(connection, normalizedInput, eventId, startValue, endValue);
      assertTimelineDependencyOrder(connection, normalizedInput, eventId, startValue, endValue);
      const now = this.#clock.now().toISOString();
      if (valid.eventId) {
        connection
          .prepare(
            `UPDATE timeline_events
                SET title = ?, start_value = ?, end_value = ?, precision = ?,
                    chapter_id = ?, location_id = ?, description = ?, updated_at = ?
              WHERE id = ? AND project_id = ?`,
          )
          .run(
            valid.title.trim(),
            startValue,
            endValue,
            valid.precision,
            valid.chapterId,
            valid.locationId,
            valid.description.trim(),
            now,
            eventId,
            valid.projectId,
          );
        connection
          .prepare('DELETE FROM timeline_event_entities WHERE event_id = ? AND project_id = ?')
          .run(eventId, valid.projectId);
        connection
          .prepare('DELETE FROM timeline_dependencies WHERE event_id = ? AND project_id = ?')
          .run(eventId, valid.projectId);
      } else {
        connection
          .prepare(
            `INSERT INTO timeline_events(
               id, project_id, title, start_value, end_value, precision,
               chapter_id, location_id, description, created_at, updated_at
             ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            eventId,
            valid.projectId,
            valid.title.trim(),
            startValue,
            endValue,
            valid.precision,
            valid.chapterId,
            valid.locationId,
            valid.description.trim(),
            now,
            now,
          );
      }
      for (const participantId of participantIds) {
        connection
          .prepare(
            `INSERT INTO timeline_event_entities(
               project_id, event_id, entity_id, role, created_at
             ) VALUES(?, ?, ?, 'participant', ?)`,
          )
          .run(valid.projectId, eventId, participantId, now);
      }
      for (const dependencyId of dependencyIds) {
        connection
          .prepare(
            `INSERT INTO timeline_dependencies(
               project_id, event_id, depends_on_event_id, created_at
             ) VALUES(?, ?, ?, ?)`,
          )
          .run(valid.projectId, eventId, dependencyId, now);
      }
      return readCatalog(connection, {
        projectId: valid.projectId,
        query: '',
        includeHistory: true,
        effectiveAtChapterId: null,
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
      assertProject(connection, valid.projectId);
      entity(connection, valid.projectId, valid.characterId, 'character');
      if (valid.acquiredChapterId) {
        chapterOrder(connection, valid.projectId, valid.acquiredChapterId);
      }
      if (valid.sourceBlockId) assertBlock(connection, valid.projectId, valid.sourceBlockId);
      if (valid.sourceVersionId) versionChapter(connection, valid.projectId, valid.sourceVersionId);
      if (
        valid.knowledgeStatus !== 'unknown' &&
        (!valid.acquiredChapterId || (!valid.sourceBlockId && !valid.sourceVersionId))
      ) {
        throw new ContinuityServiceError(
          'CONTINUITY_INVALID',
          'Known, believed, suspected or misunderstood information needs a chapter and source anchor.',
        );
      }
      if (valid.knowledgeStatus === 'misunderstands' && !valid.notes.trim()) {
        throw new ContinuityServiceError(
          'CONTINUITY_INVALID',
          'A misunderstanding requires explanatory notes.',
        );
      }
      const now = this.#clock.now().toISOString();
      connection
        .prepare(
          `UPDATE knowledge_states
              SET record_status = 'historical', superseded_at = ?
            WHERE character_id = ? AND information_key = ? AND record_status = 'current'`,
        )
        .run(now, valid.characterId, informationKey);
      connection
        .prepare(
          `INSERT INTO knowledge_states(
             id, project_id, information_key, character_id, knowledge_status,
             acquired_chapter_id, source_block_id, source_version_id, notes,
             record_status, created_at, superseded_at
           ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 'current', ?, NULL)`,
        )
        .run(
          this.#idFactory(),
          valid.projectId,
          informationKey,
          valid.characterId,
          valid.knowledgeStatus,
          valid.acquiredChapterId,
          valid.sourceBlockId,
          valid.sourceVersionId,
          valid.notes.trim(),
          now,
        );
      return readCatalog(connection, {
        projectId: valid.projectId,
        query: '',
        includeHistory: true,
        effectiveAtChapterId: null,
      });
    });
  }
}
