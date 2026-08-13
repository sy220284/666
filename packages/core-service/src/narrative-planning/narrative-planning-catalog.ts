import type { DatabaseSync } from 'node:sqlite';

import {
  ArcMilestoneSchema,
  CharacterArcSchema,
  ForeshadowingSchema,
  NarrativePlanningCatalogSchema,
  type ArcMilestone,
  type CharacterArc,
  type Foreshadowing,
  type NarrativePlanningCatalog,
  type NarrativePlanningListInput,
} from '@worldforge/contracts';
import { compareChapterPosition } from '@worldforge/domain';

import { chapterPosition } from '../continuity-validation.js';
import {
  assertProject,
  narrativeNumber,
  narrativeText,
  type ArcRow,
  type Attention,
  type ChapterPosition,
  type ForeshadowingRow,
  type MilestoneRow,
} from './narrative-planning-model.js';
import { sqliteResult } from '../database/sqlite-result.js';

function chapterLinks(connection: DatabaseSync, foreshadowingId: string) {
  return sqliteResult<
    {
      readonly chapterId: string;
      readonly role: string;
    }[]
  >(
    connection
      .prepare(
        `SELECT chapter_id AS chapterId, role
           FROM foreshadowing_chapters
          WHERE foreshadowing_id = ?
          ORDER BY chapter_id, role`,
      )
      .all(foreshadowingId),
  ).map((row) => ({ chapterId: narrativeText(row.chapterId), role: narrativeText(row.role) }));
}

function foreshadowingRelations(connection: DatabaseSync, foreshadowingId: string) {
  return sqliteResult<
    {
      readonly targetForeshadowingId: string;
      readonly kind: string;
    }[]
  >(
    connection
      .prepare(
        `SELECT target_foreshadowing_id AS targetForeshadowingId, relation_kind AS kind
           FROM foreshadowing_relations
          WHERE source_foreshadowing_id = ?
          ORDER BY relation_kind, target_foreshadowing_id`,
      )
      .all(foreshadowingId),
  ).map((row) => ({
    targetForeshadowingId: narrativeText(row.targetForeshadowingId),
    kind: narrativeText(row.kind),
  }));
}

export function unresolvedForeshadowingRelations(
  connection: DatabaseSync,
  projectId: string,
  foreshadowingId: string,
): string[] {
  const rows = sqliteResult<
    {
      readonly relationKind: string;
      readonly targetTitle: string;
      readonly targetStatus: string;
    }[]
  >(
    connection
      .prepare(
        `SELECT r.relation_kind AS relationKind, target.title AS targetTitle,
              target.status AS targetStatus
         FROM foreshadowing_relations r
         JOIN foreshadowings target
           ON target.id = r.target_foreshadowing_id AND target.project_id = r.project_id
        WHERE r.project_id = ? AND r.source_foreshadowing_id = ?
          AND r.relation_kind IN ('depends_on', 'blocks')
          AND target.status NOT IN ('revealed', 'cancelled')
        ORDER BY r.relation_kind, target.title, target.id`,
      )
      .all(projectId, foreshadowingId),
  );
  return rows.map(
    (row) =>
      `${narrativeText(row.relationKind)}: ${narrativeText(row.targetTitle)} (${narrativeText(
        row.targetStatus,
      )})`,
  );
}

function foreshadowingAttention(
  connection: DatabaseSync,
  row: ForeshadowingRow,
  reference: ChapterPosition | null,
): { readonly attention: Attention; readonly warnings: string[] } {
  if (row.status === 'revealed' || row.status === 'cancelled') {
    return { attention: 'none', warnings: [] };
  }
  const warnings = unresolvedForeshadowingRelations(connection, row.projectId, row.id);
  if (warnings.length > 0) return { attention: 'blocked', warnings };
  if (!reference) return { attention: 'none', warnings: [] };
  const end = row.revealByChapterId
    ? chapterPosition(connection, row.projectId, row.revealByChapterId)
    : null;
  const start = row.revealFromChapterId
    ? chapterPosition(connection, row.projectId, row.revealFromChapterId)
    : null;
  if (end && compareChapterPosition(end, reference) < 0) {
    return { attention: 'overdue', warnings: ['Reveal window has passed.'] };
  }
  if (start && compareChapterPosition(start, reference) <= 0) {
    return { attention: 'due', warnings: ['Reveal window is active.'] };
  }
  return { attention: 'none', warnings: [] };
}

function parseForeshadowing(
  connection: DatabaseSync,
  row: ForeshadowingRow,
  reference: ChapterPosition | null,
): Foreshadowing {
  return ForeshadowingSchema.parse({
    ...row,
    chapterLinks: chapterLinks(connection, row.id),
    relations: foreshadowingRelations(connection, row.id),
    ...foreshadowingAttention(connection, row, reference),
  });
}

function milestoneDependencyIds(connection: DatabaseSync, milestoneId: string): string[] {
  const rows = sqliteResult<{ readonly dependencyId: string }[]>(
    connection
      .prepare(
        `SELECT dependency_milestone_id AS dependencyId
         FROM arc_milestone_dependencies
        WHERE milestone_id = ?
        ORDER BY dependency_milestone_id`,
      )
      .all(milestoneId),
  );
  return rows.map((row) => narrativeText(row.dependencyId));
}

function milestoneTimelineDependencyIds(connection: DatabaseSync, milestoneId: string): string[] {
  const rows = sqliteResult<{ readonly timelineEventId: string }[]>(
    connection
      .prepare(
        `SELECT timeline_event_id AS timelineEventId
         FROM arc_milestone_timeline_dependencies
        WHERE milestone_id = ?
        ORDER BY timeline_event_id`,
      )
      .all(milestoneId),
  );
  return rows.map((row) => narrativeText(row.timelineEventId));
}

export function unresolvedMilestoneTimelineDependencies(
  connection: DatabaseSync,
  projectId: string,
  milestoneId: string,
  reference: ChapterPosition | null,
): string[] {
  const rows = sqliteResult<
    {
      readonly eventId: string;
      readonly title: string;
      readonly chapterId: string | null;
      readonly status: string;
    }[]
  >(
    connection
      .prepare(
        `SELECT event.id AS eventId, event.title, event.chapter_id AS chapterId, event.status
         FROM arc_milestone_timeline_dependencies dependency
         JOIN timeline_events event
           ON event.id = dependency.timeline_event_id
          AND event.project_id = dependency.project_id
        WHERE dependency.project_id = ? AND dependency.milestone_id = ?
        ORDER BY event.title, event.id`,
      )
      .all(projectId, milestoneId),
  );
  const warnings: string[] = [];
  for (const row of rows) {
    const title = narrativeText(row.title);
    if (row.status !== 'active') {
      warnings.push(`Timeline event is archived: ${title}`);
      continue;
    }
    if (row.chapterId === null) {
      warnings.push(`Timeline event has no chapter anchor: ${title}`);
      continue;
    }
    if (
      reference &&
      compareChapterPosition(chapterPosition(connection, projectId, row.chapterId), reference) > 0
    ) {
      warnings.push(`Waiting for timeline event: ${title}`);
    }
  }
  return warnings;
}

function milestoneAttention(
  connection: DatabaseSync,
  row: MilestoneRow,
  reference: ChapterPosition | null,
): { readonly attention: Attention; readonly warnings: string[] } {
  if (row.status !== 'planned') return { attention: 'none', warnings: [] };
  const unresolved = sqliteResult<{ readonly title: string }[]>(
    connection
      .prepare(
        `SELECT dep.title
         FROM arc_milestone_dependencies d
         JOIN arc_milestones dep
           ON dep.id = d.dependency_milestone_id AND dep.project_id = d.project_id
        WHERE d.project_id = ? AND d.milestone_id = ? AND dep.status <> 'hit'
        ORDER BY dep.title, dep.id`,
      )
      .all(row.projectId, row.id),
  );
  if (unresolved.length > 0) {
    return {
      attention: 'blocked',
      warnings: unresolved.map(
        (dependency) => `Waiting for milestone: ${narrativeText(dependency.title)}`,
      ),
    };
  }
  const timelineWarnings = unresolvedMilestoneTimelineDependencies(
    connection,
    row.projectId,
    row.id,
    reference,
  );
  if (timelineWarnings.length > 0) {
    return { attention: 'blocked', warnings: timelineWarnings };
  }
  if (!reference || !row.plannedChapterId) return { attention: 'none', warnings: [] };
  const planned = chapterPosition(connection, row.projectId, row.plannedChapterId);
  const ordering = compareChapterPosition(planned, reference);
  if (ordering < 0) return { attention: 'overdue', warnings: ['Planned chapter has passed.'] };
  if (ordering === 0) return { attention: 'due', warnings: ['Milestone is due in this chapter.'] };
  return { attention: 'none', warnings: [] };
}

function parseMilestone(
  connection: DatabaseSync,
  row: MilestoneRow,
  reference: ChapterPosition | null,
): ArcMilestone {
  return ArcMilestoneSchema.parse({
    ...row,
    sortIndex: narrativeNumber(row.sortIndex),
    dependencyMilestoneIds: milestoneDependencyIds(connection, row.id),
    dependencyTimelineEventIds: milestoneTimelineDependencyIds(connection, row.id),
    ...milestoneAttention(connection, row, reference),
  });
}

function milestonesFor(
  connection: DatabaseSync,
  projectId: string,
  arcId: string,
  reference: ChapterPosition | null,
): ArcMilestone[] {
  const rows = sqliteResult<MilestoneRow[]>(
    connection
      .prepare(
        `SELECT id, project_id AS projectId, arc_id AS arcId, title, description,
              sort_index AS sortIndex, planned_chapter_id AS plannedChapterId,
              actual_chapter_id AS actualChapterId, status,
              confirmation_source AS confirmationSource,
              created_at AS createdAt, updated_at AS updatedAt
         FROM arc_milestones
        WHERE project_id = ? AND arc_id = ?
        ORDER BY sort_index, id`,
      )
      .all(projectId, arcId),
  );
  return rows.map((row) => parseMilestone(connection, row, reference));
}

function parseArc(
  connection: DatabaseSync,
  row: ArcRow,
  reference: ChapterPosition | null,
): CharacterArc {
  return CharacterArcSchema.parse({
    ...row,
    milestones: milestonesFor(connection, row.projectId, row.id, reference),
  });
}

export function readNarrativePlanningCatalog(
  connection: DatabaseSync,
  input: NarrativePlanningListInput,
): NarrativePlanningCatalog {
  assertProject(connection, input.projectId);
  const reference = input.referenceChapterId
    ? chapterPosition(connection, input.projectId, input.referenceChapterId)
    : null;
  const query = input.query.toLocaleLowerCase('zh-CN');
  const matches = (values: readonly string[]) =>
    !query || values.some((value) => value.toLocaleLowerCase('zh-CN').includes(query));
  const foreshadowingRows = sqliteResult<ForeshadowingRow[]>(
    connection
      .prepare(
        `SELECT id, project_id AS projectId, title, description, status,
              reveal_from_chapter_id AS revealFromChapterId,
              reveal_by_chapter_id AS revealByChapterId,
              created_at AS createdAt, updated_at AS updatedAt
         FROM foreshadowings
        WHERE project_id = ? AND (? = 1 OR status NOT IN ('revealed', 'cancelled'))
        ORDER BY status IN ('revealed', 'cancelled'), updated_at DESC, id`,
      )
      .all(input.projectId, input.includeResolved ? 1 : 0),
  );
  const arcRows = sqliteResult<ArcRow[]>(
    connection
      .prepare(
        `SELECT id, project_id AS projectId, character_id AS characterId, title,
              arc_type AS arcType, custom_type AS customType, status,
              author_intent AS authorIntent, created_at AS createdAt, updated_at AS updatedAt
         FROM character_arcs
        WHERE project_id = ? AND (? = 1 OR status NOT IN ('completed', 'abandoned'))
        ORDER BY status IN ('completed', 'abandoned'), updated_at DESC, id`,
      )
      .all(input.projectId, input.includeResolved ? 1 : 0),
  );
  return NarrativePlanningCatalogSchema.parse({
    projectId: input.projectId,
    foreshadowings: foreshadowingRows
      .map((row) => parseForeshadowing(connection, row, reference))
      .filter((item) => matches([item.title, item.description, item.status])),
    characterArcs: arcRows
      .map((row) => parseArc(connection, row, reference))
      .filter((item) =>
        matches([
          item.title,
          item.authorIntent,
          item.arcType,
          item.customType ?? '',
          ...item.milestones.flatMap((milestone) => [milestone.title, milestone.description]),
        ]),
      ),
  });
}
