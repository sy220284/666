import {
  TimelineEventArchiveInputSchema,
  TimelineEventSaveInputSchema,
  type ContinuityCatalog,
  type TimelineEventArchiveInput,
  type TimelineEventSaveInput,
} from '@worldforge/contracts';
import { dependencyDefinitelyOutOfOrder, timeRangesOverlap } from '@worldforge/domain';

import {
  ContinuityServiceError,
  authorOnly,
  uniqueIds,
  type ContinuityContext,
} from './continuity-model.js';
import { eventRows, readCatalog, roleIds } from './continuity-read.js';
import {
  assertEntity,
  assertNoDependencyCycle,
  chapterPosition,
  comparableRange,
} from './continuity-validation.js';

export async function saveTimelineEvent(
  context: ContinuityContext,
  requestId: string,
  input: TimelineEventSaveInput,
): Promise<ContinuityCatalog> {
  const valid = TimelineEventSaveInputSchema.parse(input);
  authorOnly(valid.authority);
  const eventId = valid.eventId ?? context.idFactory();
  const participants = uniqueIds(valid.participantIds);
  const witnesses = uniqueIds(valid.witnessIds);
  const subjects = uniqueIds(valid.subjectIds);
  const dependencies = uniqueIds(valid.dependencyIds);
  const nextRange = comparableRange(valid);
  return context.workspace.writeProject(requestId, valid.projectId, (connection) => {
    if (valid.eventId) {
      const existing = connection
        .prepare('SELECT 1 FROM timeline_events WHERE id = ? AND project_id = ?')
        .get(eventId, valid.projectId);
      if (!existing) {
        throw new ContinuityServiceError('CONTINUITY_NOT_FOUND', 'TimelineEvent not found.');
      }
    }
    if (valid.chapterId) chapterPosition(connection, valid.projectId, valid.chapterId);
    if (valid.locationId) assertEntity(connection, valid.projectId, valid.locationId, 'location');
    for (const entityId of [...participants, ...witnesses, ...subjects]) {
      assertEntity(connection, valid.projectId, entityId);
    }
    const existingEvents = eventRows(connection, valid.projectId);
    for (const dependencyId of dependencies) {
      if (dependencyId === eventId) {
        throw new ContinuityServiceError(
          'CONTINUITY_CONFLICT',
          'An event cannot depend on itself.',
        );
      }
      const dependency = existingEvents.find(
        (row) => row.id === dependencyId && row.status === 'active',
      );
      if (!dependency) {
        throw new ContinuityServiceError('CONTINUITY_NOT_FOUND', 'Dependency event not found.');
      }
      const dependencyRange = comparableRange(dependency);
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
      for (const row of existingEvents) {
        if (
          row.id === eventId ||
          row.status !== 'active' ||
          !row.locationId ||
          row.locationId === valid.locationId
        ) {
          continue;
        }
        const existingRange = comparableRange(row);
        if (!existingRange || !timeRangesOverlap(nextRange, existingRange)) continue;
        const existingParticipants = new Set(roleIds(connection, row.id, 'participant'));
        if (participants.some((id) => existingParticipants.has(id))) {
          throw new ContinuityServiceError(
            'CONTINUITY_CONFLICT',
            'The same participant cannot occupy different locations in overlapping time ranges.',
          );
        }
      }
    }
    const now = context.clock.now().toISOString();
    connection
      .prepare(
        `INSERT INTO timeline_events(
           id, project_id, title, start_value, end_value, precision, chapter_id,
           location_id, description, status, archived_at, created_at, updated_at
         ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           start_value = excluded.start_value,
           end_value = excluded.end_value,
           precision = excluded.precision,
           chapter_id = excluded.chapter_id,
           location_id = excluded.location_id,
           description = excluded.description,
           status = 'active',
           archived_at = NULL,
           updated_at = excluded.updated_at`,
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
      for (const entityId of ids) {
        insertEntity.run(valid.projectId, eventId, entityId, role, now);
      }
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
      query: '',
      includeHistory: true,
      includeArchivedEvents: true,
      effectiveAtChapterId: null,
    });
  });
}

export async function archiveTimelineEvent(
  context: ContinuityContext,
  requestId: string,
  input: TimelineEventArchiveInput,
): Promise<ContinuityCatalog> {
  const valid = TimelineEventArchiveInputSchema.parse(input);
  authorOnly(valid.authority);
  return context.workspace.writeProject(requestId, valid.projectId, (connection) => {
    const now = context.clock.now().toISOString();
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
      query: '',
      includeHistory: true,
      includeArchivedEvents: true,
      effectiveAtChapterId: null,
    });
  });
}
