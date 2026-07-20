import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import {
  ArcMilestoneSaveInputSchema,
  ArcMilestoneSchema,
  ArcMilestoneTransitionInputSchema,
  CharacterArcSaveInputSchema,
  CharacterArcSchema,
  ForeshadowingSaveInputSchema,
  ForeshadowingSchema,
  ForeshadowingTransitionInputSchema,
  NarrativePlanningCatalogSchema,
  NarrativePlanningListInputSchema,
  type ArcMilestone,
  type ArcMilestoneSaveInput,
  type ArcMilestoneTransitionInput,
  type CharacterArc,
  type CharacterArcSaveInput,
  type Foreshadowing,
  type ForeshadowingSaveInput,
  type ForeshadowingStatus,
  type ForeshadowingTransitionInput,
  type NarrativePlanningCatalog,
  type NarrativePlanningListInput,
} from '@worldforge/contracts';
import { assertAuthorAuthority, compareChapterPosition } from '@worldforge/domain';

import type { DatabaseClock } from './database/index.js';
import { chapterPosition } from './continuity-validation.js';
import type { ProjectWorkspaceService } from './project-workspace.js';

const systemClock: DatabaseClock = { now: () => new Date() };

type Attention = 'none' | 'due' | 'overdue' | 'blocked';
type ChapterPosition = readonly [number, number];

export type NarrativePlanningServiceErrorCode =
  | 'NARRATIVE_NOT_FOUND'
  | 'NARRATIVE_INVALID'
  | 'NARRATIVE_CONFLICT'
  | 'NARRATIVE_AUTHOR_REQUIRED'
  | 'NARRATIVE_INVARIANT';

export class NarrativePlanningServiceError extends Error {
  readonly code: NarrativePlanningServiceErrorCode;

  constructor(
    code: NarrativePlanningServiceErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'NarrativePlanningServiceError';
    this.code = code;
  }
}

export interface NarrativePlanningServiceOptions {
  readonly clock?: DatabaseClock;
  readonly idFactory?: () => string;
}

interface ForeshadowingRow {
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

interface ArcRow {
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

interface MilestoneRow {
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

function authorOnly(authority: 'author' | 'ai'): void {
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

function text(value: unknown): string {
  if (typeof value !== 'string') {
    throw new NarrativePlanningServiceError(
      'NARRATIVE_INVARIANT',
      'Persisted narrative planning text is invalid.',
    );
  }
  return value;
}

function number(value: unknown): number {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  throw new NarrativePlanningServiceError(
    'NARRATIVE_INVARIANT',
    'Persisted narrative planning number is invalid.',
  );
}

function assertProject(connection: DatabaseSync, projectId: string): void {
  if (!connection.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) {
    throw new NarrativePlanningServiceError('NARRATIVE_NOT_FOUND', 'Project not found.');
  }
}

function assertChapter(connection: DatabaseSync, projectId: string, chapterId: string): void {
  chapterPosition(connection, projectId, chapterId);
}

function assertCharacter(connection: DatabaseSync, projectId: string, characterId: string): void {
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

function assertForeshadowing(
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

function assertArc(connection: DatabaseSync, projectId: string, arcId: string): ArcRow {
  const row = connection
    .prepare(
      `SELECT id, project_id AS projectId, character_id AS characterId, title,
              arc_type AS arcType, custom_type AS customType, status,
              author_intent AS authorIntent, created_at AS createdAt, updated_at AS updatedAt
         FROM character_arcs
        WHERE id = ? AND project_id = ?`,
    )
    .get(arcId, projectId) as ArcRow | undefined;
  if (!row) throw new NarrativePlanningServiceError('NARRATIVE_NOT_FOUND', 'Character arc not found.');
  return row;
}

function assertMilestone(
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
  if (!row) throw new NarrativePlanningServiceError('NARRATIVE_NOT_FOUND', 'Arc milestone not found.');
  return row;
}

function validateRevealWindow(
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

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function chapterLinks(connection: DatabaseSync, foreshadowingId: string) {
  return (
    connection
      .prepare(
        `SELECT chapter_id AS chapterId, role
           FROM foreshadowing_chapters
          WHERE foreshadowing_id = ?
          ORDER BY chapter_id, role`,
      )
      .all(foreshadowingId) as unknown as {
      readonly chapterId: string;
      readonly role: string;
    }[]
  ).map((row) => ({ chapterId: text(row.chapterId), role: text(row.role) }));
}

function foreshadowingRelations(connection: DatabaseSync, foreshadowingId: string) {
  return (
    connection
      .prepare(
        `SELECT target_foreshadowing_id AS targetForeshadowingId, relation_kind AS kind
           FROM foreshadowing_relations
          WHERE source_foreshadowing_id = ?
          ORDER BY relation_kind, target_foreshadowing_id`,
      )
      .all(foreshadowingId) as unknown as {
      readonly targetForeshadowingId: string;
      readonly kind: string;
    }[]
  ).map((row) => ({
    targetForeshadowingId: text(row.targetForeshadowingId),
    kind: text(row.kind),
  }));
}

function unresolvedForeshadowingRelations(
  connection: DatabaseSync,
  projectId: string,
  foreshadowingId: string,
): string[] {
  const rows = connection
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
    .all(projectId, foreshadowingId) as unknown as {
    readonly relationKind: string;
    readonly targetTitle: string;
    readonly targetStatus: string;
  }[];
  return rows.map(
    (row) => `${text(row.relationKind)}: ${text(row.targetTitle)} (${text(row.targetStatus)})`,
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
  const attention = foreshadowingAttention(connection, row, reference);
  return ForeshadowingSchema.parse({
    ...row,
    chapterLinks: chapterLinks(connection, row.id),
    relations: foreshadowingRelations(connection, row.id),
    ...attention,
  });
}

function milestoneDependencyIds(connection: DatabaseSync, milestoneId: string): string[] {
  const rows = connection
    .prepare(
      `SELECT dependency_milestone_id AS dependencyId
         FROM arc_milestone_dependencies
        WHERE milestone_id = ?
        ORDER BY dependency_milestone_id`,
    )
    .all(milestoneId) as unknown as { readonly dependencyId: string }[];
  return rows.map((row) => text(row.dependencyId));
}

function milestoneTimelineDependencyIds(connection: DatabaseSync, milestoneId: string): string[] {
  const rows = connection
    .prepare(
      `SELECT timeline_event_id AS timelineEventId
         FROM arc_milestone_timeline_dependencies
        WHERE milestone_id = ?
        ORDER BY timeline_event_id`,
    )
    .all(milestoneId) as unknown as { readonly timelineEventId: string }[];
  return rows.map((row) => text(row.timelineEventId));
}

function milestoneAttention(
  connection: DatabaseSync,
  row: MilestoneRow,
  reference: ChapterPosition | null,
): { readonly attention: Attention; readonly warnings: string[] } {
  if (row.status !== 'planned') return { attention: 'none', warnings: [] };
  const unresolved = connection
    .prepare(
      `SELECT dep.title
         FROM arc_milestone_dependencies d
         JOIN arc_milestones dep
           ON dep.id = d.dependency_milestone_id AND dep.project_id = d.project_id
        WHERE d.project_id = ? AND d.milestone_id = ? AND dep.status <> 'hit'
        ORDER BY dep.title, dep.id`,
    )
    .all(row.projectId, row.id) as unknown as { readonly title: string }[];
  if (unresolved.length > 0) {
    return {
      attention: 'blocked',
      warnings: unresolved.map((dependency) => `Waiting for milestone: ${text(dependency.title)}`),
    };
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
    sortIndex: number(row.sortIndex),
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
  const rows = connection
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
    .all(projectId, arcId) as unknown as MilestoneRow[];
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

function readCatalog(
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
  const foreshadowingRows = connection
    .prepare(
      `SELECT id, project_id AS projectId, title, description, status,
              reveal_from_chapter_id AS revealFromChapterId,
              reveal_by_chapter_id AS revealByChapterId,
              created_at AS createdAt, updated_at AS updatedAt
         FROM foreshadowings
        WHERE project_id = ? AND (? = 1 OR status NOT IN ('revealed', 'cancelled'))
        ORDER BY status IN ('revealed', 'cancelled'), updated_at DESC, id`,
    )
    .all(input.projectId, input.includeResolved ? 1 : 0) as unknown as ForeshadowingRow[];
  const arcRows = connection
    .prepare(
      `SELECT id, project_id AS projectId, character_id AS characterId, title,
              arc_type AS arcType, custom_type AS customType, status,
              author_intent AS authorIntent, created_at AS createdAt, updated_at AS updatedAt
         FROM character_arcs
        WHERE project_id = ? AND (? = 1 OR status NOT IN ('completed', 'abandoned'))
        ORDER BY status IN ('completed', 'abandoned'), updated_at DESC, id`,
    )
    .all(input.projectId, input.includeResolved ? 1 : 0) as unknown as ArcRow[];
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

function assertForeshadowingTargets(
  connection: DatabaseSync,
  projectId: string,
  sourceId: string,
  input: ForeshadowingSaveInput,
): void {
  for (const link of input.chapterLinks) assertChapter(connection, projectId, link.chapterId);
  for (const relation of input.relations) {
    if (relation.targetForeshadowingId === sourceId) {
      throw new NarrativePlanningServiceError(
        'NARRATIVE_INVALID',
        'Foreshadowing cannot relate to itself.',
      );
    }
    assertForeshadowing(connection, projectId, relation.targetForeshadowingId);
  }
}

function assertForeshadowingDependencyGraph(
  connection: DatabaseSync,
  projectId: string,
  sourceId: string,
  input: ForeshadowingSaveInput,
): void {
  const rows = connection
    .prepare(
      `SELECT source_foreshadowing_id AS sourceId, target_foreshadowing_id AS targetId
         FROM foreshadowing_relations
        WHERE project_id = ? AND relation_kind = 'depends_on'
          AND source_foreshadowing_id <> ?`,
    )
    .all(projectId, sourceId) as unknown as {
    readonly sourceId: string;
    readonly targetId: string;
  }[];
  const graph = new Map<string, string[]>();
  for (const row of rows) {
    graph.set(row.sourceId, [...(graph.get(row.sourceId) ?? []), row.targetId]);
  }
  graph.set(
    sourceId,
    input.relations
      .filter((relation) => relation.kind === 'depends_on')
      .map((relation) => relation.targetForeshadowingId),
  );
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      throw new NarrativePlanningServiceError(
        'NARRATIVE_CONFLICT',
        'Foreshadowing dependency cycle detected.',
      );
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of graph.get(id) ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  visit(sourceId);
}

function isActivatedForeshadowing(status: string): boolean {
  return ['planted', 'reinforced', 'partially_revealed', 'revealed'].includes(status);
}

function assertNoMutualExclusionConflict(
  connection: DatabaseSync,
  projectId: string,
  foreshadowingId: string,
  nextStatus: string,
): void {
  if (!isActivatedForeshadowing(nextStatus)) return;
  const conflict = connection
    .prepare(
      `SELECT other.title, other.status
         FROM foreshadowing_relations r
         JOIN foreshadowings other
           ON other.project_id = r.project_id
          AND other.id = CASE
            WHEN r.source_foreshadowing_id = ? THEN r.target_foreshadowing_id
            ELSE r.source_foreshadowing_id
          END
        WHERE r.project_id = ? AND r.relation_kind = 'mutually_exclusive'
          AND (r.source_foreshadowing_id = ? OR r.target_foreshadowing_id = ?)
          AND other.status IN ('planted', 'reinforced', 'partially_revealed', 'revealed')
        LIMIT 1`,
    )
    .get(foreshadowingId, projectId, foreshadowingId, foreshadowingId) as
    | { readonly title: string; readonly status: string }
    | undefined;
  if (conflict) {
    throw new NarrativePlanningServiceError(
      'NARRATIVE_CONFLICT',
      `Mutually exclusive foreshadowing is already active: ${text(conflict.title)}.`,
    );
  }
}

const foreshadowingTransitions: Readonly<Record<ForeshadowingStatus, readonly ForeshadowingStatus[]>> = {
  planned: ['planted', 'cancelled'],
  planted: ['reinforced', 'partially_revealed', 'revealed', 'cancelled'],
  reinforced: ['partially_revealed', 'revealed', 'cancelled'],
  partially_revealed: ['reinforced', 'revealed', 'cancelled'],
  revealed: [],
  cancelled: [],
};

function assertForeshadowingTransition(
  current: ForeshadowingStatus,
  next: ForeshadowingStatus,
): void {
  if (!foreshadowingTransitions[current].includes(next)) {
    throw new NarrativePlanningServiceError(
      'NARRATIVE_CONFLICT',
      `Illegal foreshadowing transition: ${current} -> ${next}.`,
    );
  }
}

function assertMilestoneTargets(
  connection: DatabaseSync,
  projectId: string,
  milestoneId: string,
  input: ArcMilestoneSaveInput,
): void {
  assertArc(connection, projectId, input.arcId);
  if (input.plannedChapterId) assertChapter(connection, projectId, input.plannedChapterId);
  for (const dependencyId of input.dependencyMilestoneIds) {
    if (dependencyId === milestoneId) {
      throw new NarrativePlanningServiceError(
        'NARRATIVE_INVALID',
        'Arc milestone cannot depend on itself.',
      );
    }
    assertMilestone(connection, projectId, dependencyId);
  }
  for (const timelineEventId of input.dependencyTimelineEventIds) {
    const row = connection
      .prepare('SELECT 1 FROM timeline_events WHERE id = ? AND project_id = ?')
      .get(timelineEventId, projectId);
    if (!row) {
      throw new NarrativePlanningServiceError(
        'NARRATIVE_NOT_FOUND',
        'Timeline event dependency not found.',
      );
    }
  }
}

function assertMilestoneDependencyGraph(
  connection: DatabaseSync,
  projectId: string,
  milestoneId: string,
  dependencies: readonly string[],
): void {
  const rows = connection
    .prepare(
      `SELECT milestone_id AS milestoneId, dependency_milestone_id AS dependencyId
         FROM arc_milestone_dependencies
        WHERE project_id = ? AND milestone_id <> ?`,
    )
    .all(projectId, milestoneId) as unknown as {
    readonly milestoneId: string;
    readonly dependencyId: string;
  }[];
  const graph = new Map<string, string[]>();
  for (const row of rows) {
    graph.set(row.milestoneId, [...(graph.get(row.milestoneId) ?? []), row.dependencyId]);
  }
  graph.set(milestoneId, [...dependencies]);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      throw new NarrativePlanningServiceError(
        'NARRATIVE_CONFLICT',
        'Arc milestone dependency cycle detected.',
      );
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of graph.get(id) ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  visit(milestoneId);
}

function assertMilestoneDependenciesHit(
  connection: DatabaseSync,
  projectId: string,
  milestoneId: string,
): void {
  const unresolved = connection
    .prepare(
      `SELECT 1
         FROM arc_milestone_dependencies d
         JOIN arc_milestones dependency
           ON dependency.id = d.dependency_milestone_id
          AND dependency.project_id = d.project_id
        WHERE d.project_id = ? AND d.milestone_id = ? AND dependency.status <> 'hit'
        LIMIT 1`,
    )
    .get(projectId, milestoneId);
  if (unresolved) {
    throw new NarrativePlanningServiceError(
      'NARRATIVE_CONFLICT',
      'Arc milestone dependencies must be hit first.',
    );
  }
}

export class NarrativePlanningService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;

  constructor(
    workspace: ProjectWorkspaceService,
    options: NarrativePlanningServiceOptions = {},
  ) {
    this.#workspace = workspace;
    this.#clock = options.clock ?? systemClock;
    this.#idFactory = options.idFactory ?? randomUUID;
  }

  list(input: NarrativePlanningListInput): NarrativePlanningCatalog {
    const valid = NarrativePlanningListInputSchema.parse(input);
    return this.#workspace.readProject(valid.projectId, (connection) => readCatalog(connection, valid));
  }

  async saveForeshadowing(
    requestId: string,
    input: ForeshadowingSaveInput,
  ): Promise<NarrativePlanningCatalog> {
    const valid = ForeshadowingSaveInputSchema.parse(input);
    authorOnly(valid.authority);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      assertProject(connection, valid.projectId);
      validateRevealWindow(
        connection,
        valid.projectId,
        valid.revealFromChapterId,
        valid.revealByChapterId,
      );
      const id = valid.foreshadowingId ?? this.#idFactory();
      if (valid.foreshadowingId) assertForeshadowing(connection, valid.projectId, id);
      assertForeshadowingTargets(connection, valid.projectId, id, valid);
      assertForeshadowingDependencyGraph(connection, valid.projectId, id, valid);
      const now = this.#clock.now().toISOString();
      if (valid.foreshadowingId) {
        connection
          .prepare(
            `UPDATE foreshadowings
                SET title = ?, description = ?, reveal_from_chapter_id = ?,
                    reveal_by_chapter_id = ?, updated_at = ?
              WHERE id = ? AND project_id = ?`,
          )
          .run(
            valid.title.trim(),
            valid.description.trim(),
            valid.revealFromChapterId,
            valid.revealByChapterId,
            now,
            id,
            valid.projectId,
          );
      } else {
        connection
          .prepare(
            `INSERT INTO foreshadowings(
               id, project_id, title, description, status,
               reveal_from_chapter_id, reveal_by_chapter_id, created_at, updated_at
             ) VALUES(?, ?, ?, ?, 'planned', ?, ?, ?, ?)`,
          )
          .run(
            id,
            valid.projectId,
            valid.title.trim(),
            valid.description.trim(),
            valid.revealFromChapterId,
            valid.revealByChapterId,
            now,
            now,
          );
      }
      connection.prepare('DELETE FROM foreshadowing_chapters WHERE foreshadowing_id = ?').run(id);
      connection.prepare('DELETE FROM foreshadowing_relations WHERE source_foreshadowing_id = ?').run(id);
      const insertChapter = connection.prepare(
        `INSERT INTO foreshadowing_chapters(
           project_id, foreshadowing_id, chapter_id, role, created_at
         ) VALUES(?, ?, ?, ?, ?)`,
      );
      for (const link of valid.chapterLinks) {
        insertChapter.run(valid.projectId, id, link.chapterId, link.role, now);
      }
      const insertRelation = connection.prepare(
        `INSERT INTO foreshadowing_relations(
           project_id, source_foreshadowing_id, target_foreshadowing_id,
           relation_kind, created_at
         ) VALUES(?, ?, ?, ?, ?)`,
      );
      for (const relation of valid.relations) {
        insertRelation.run(
          valid.projectId,
          id,
          relation.targetForeshadowingId,
          relation.kind,
          now,
        );
      }
      return readCatalog(connection, {
        projectId: valid.projectId,
        query: '',
        includeResolved: true,
        referenceChapterId: null,
      });
    });
  }

  async transitionForeshadowing(
    requestId: string,
    input: ForeshadowingTransitionInput,
  ): Promise<NarrativePlanningCatalog> {
    const valid = ForeshadowingTransitionInputSchema.parse(input);
    authorOnly(valid.authority);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      const current = assertForeshadowing(connection, valid.projectId, valid.foreshadowingId);
      const currentStatus = current.status as ForeshadowingStatus;
      assertForeshadowingTransition(currentStatus, valid.status);
      assertNoMutualExclusionConflict(
        connection,
        valid.projectId,
        valid.foreshadowingId,
        valid.status,
      );
      if (valid.status === 'revealed') {
        const unresolved = unresolvedForeshadowingRelations(
          connection,
          valid.projectId,
          valid.foreshadowingId,
        );
        if (unresolved.length > 0) {
          throw new NarrativePlanningServiceError(
            'NARRATIVE_CONFLICT',
            'Foreshadowing cannot be revealed while dependencies remain unresolved.',
          );
        }
      }
      connection
        .prepare(
          `UPDATE foreshadowings SET status = ?, updated_at = ?
            WHERE id = ? AND project_id = ?`,
        )
        .run(
          valid.status,
          this.#clock.now().toISOString(),
          valid.foreshadowingId,
          valid.projectId,
        );
      return readCatalog(connection, {
        projectId: valid.projectId,
        query: '',
        includeResolved: true,
        referenceChapterId: null,
      });
    });
  }

  async saveCharacterArc(
    requestId: string,
    input: CharacterArcSaveInput,
  ): Promise<NarrativePlanningCatalog> {
    const valid = CharacterArcSaveInputSchema.parse(input);
    authorOnly(valid.authority);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      assertProject(connection, valid.projectId);
      assertCharacter(connection, valid.projectId, valid.characterId);
      const now = this.#clock.now().toISOString();
      const id = valid.arcId ?? this.#idFactory();
      if (valid.arcId) {
        assertArc(connection, valid.projectId, id);
        connection
          .prepare(
            `UPDATE character_arcs
                SET character_id = ?, title = ?, arc_type = ?, custom_type = ?,
                    status = ?, author_intent = ?, updated_at = ?
              WHERE id = ? AND project_id = ?`,
          )
          .run(
            valid.characterId,
            valid.title.trim(),
            valid.arcType,
            valid.customType,
            valid.status,
            valid.authorIntent.trim(),
            now,
            id,
            valid.projectId,
          );
      } else {
        connection
          .prepare(
            `INSERT INTO character_arcs(
               id, project_id, character_id, title, arc_type, custom_type,
               status, author_intent, created_at, updated_at
             ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            id,
            valid.projectId,
            valid.characterId,
            valid.title.trim(),
            valid.arcType,
            valid.customType,
            valid.status,
            valid.authorIntent.trim(),
            now,
            now,
          );
      }
      return readCatalog(connection, {
        projectId: valid.projectId,
        query: '',
        includeResolved: true,
        referenceChapterId: null,
      });
    });
  }

  async saveArcMilestone(
    requestId: string,
    input: ArcMilestoneSaveInput,
  ): Promise<NarrativePlanningCatalog> {
    const valid = ArcMilestoneSaveInputSchema.parse(input);
    authorOnly(valid.authority);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      const id = valid.milestoneId ?? this.#idFactory();
      const current = valid.milestoneId
        ? assertMilestone(connection, valid.projectId, id)
        : null;
      assertMilestoneTargets(connection, valid.projectId, id, valid);
      assertMilestoneDependencyGraph(
        connection,
        valid.projectId,
        id,
        valid.dependencyMilestoneIds,
      );
      const now = this.#clock.now().toISOString();
      if (current) {
        connection
          .prepare(
            `UPDATE arc_milestones
                SET arc_id = ?, title = ?, description = ?, sort_index = ?,
                    planned_chapter_id = ?, updated_at = ?
              WHERE id = ? AND project_id = ?`,
          )
          .run(
            valid.arcId,
            valid.title.trim(),
            valid.description.trim(),
            valid.sortIndex,
            valid.plannedChapterId,
            now,
            id,
            valid.projectId,
          );
      } else {
        connection
          .prepare(
            `INSERT INTO arc_milestones(
               id, project_id, arc_id, title, description, sort_index,
               planned_chapter_id, actual_chapter_id, status,
               confirmation_source, created_at, updated_at
             ) VALUES(?, ?, ?, ?, ?, ?, ?, NULL, 'planned', NULL, ?, ?)`,
          )
          .run(
            id,
            valid.projectId,
            valid.arcId,
            valid.title.trim(),
            valid.description.trim(),
            valid.sortIndex,
            valid.plannedChapterId,
            now,
            now,
          );
      }
      connection.prepare('DELETE FROM arc_milestone_dependencies WHERE milestone_id = ?').run(id);
      connection
        .prepare('DELETE FROM arc_milestone_timeline_dependencies WHERE milestone_id = ?')
        .run(id);
      const insertMilestoneDependency = connection.prepare(
        `INSERT INTO arc_milestone_dependencies(
           project_id, milestone_id, dependency_milestone_id, created_at
         ) VALUES(?, ?, ?, ?)`,
      );
      for (const dependencyId of unique(valid.dependencyMilestoneIds)) {
        insertMilestoneDependency.run(valid.projectId, id, dependencyId, now);
      }
      const insertTimelineDependency = connection.prepare(
        `INSERT INTO arc_milestone_timeline_dependencies(
           project_id, milestone_id, timeline_event_id, created_at
         ) VALUES(?, ?, ?, ?)`,
      );
      for (const eventId of unique(valid.dependencyTimelineEventIds)) {
        insertTimelineDependency.run(valid.projectId, id, eventId, now);
      }
      return readCatalog(connection, {
        projectId: valid.projectId,
        query: '',
        includeResolved: true,
        referenceChapterId: null,
      });
    });
  }

  async transitionArcMilestone(
    requestId: string,
    input: ArcMilestoneTransitionInput,
  ): Promise<NarrativePlanningCatalog> {
    const valid = ArcMilestoneTransitionInputSchema.parse(input);
    authorOnly(valid.authority);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      const current = assertMilestone(connection, valid.projectId, valid.milestoneId);
      if (current.status === valid.status) {
        throw new NarrativePlanningServiceError(
          'NARRATIVE_CONFLICT',
          'Arc milestone is already in the requested status.',
        );
      }
      if (current.status !== 'planned' && valid.status !== 'planned') {
        throw new NarrativePlanningServiceError(
          'NARRATIVE_CONFLICT',
          'Hit and skipped milestones must return to planned before another terminal decision.',
        );
      }
      if (valid.status === 'hit') {
        if (!valid.actualChapterId) {
          throw new NarrativePlanningServiceError(
            'NARRATIVE_INVALID',
            'A hit milestone requires the actual chapter.',
          );
        }
        assertChapter(connection, valid.projectId, valid.actualChapterId);
        assertMilestoneDependenciesHit(connection, valid.projectId, valid.milestoneId);
      }
      if (valid.status === 'planned' && valid.actualChapterId) {
        throw new NarrativePlanningServiceError(
          'NARRATIVE_INVALID',
          'A planned milestone cannot keep an actual chapter.',
        );
      }
      if (valid.status === 'skipped' && valid.actualChapterId) {
        assertChapter(connection, valid.projectId, valid.actualChapterId);
      }
      connection
        .prepare(
          `UPDATE arc_milestones
              SET status = ?, actual_chapter_id = ?, confirmation_source = ?, updated_at = ?
            WHERE id = ? AND project_id = ?`,
        )
        .run(
          valid.status,
          valid.status === 'planned' ? null : valid.actualChapterId,
          valid.status === 'planned' ? null : 'author',
          this.#clock.now().toISOString(),
          valid.milestoneId,
          valid.projectId,
        );
      return readCatalog(connection, {
        projectId: valid.projectId,
        query: '',
        includeResolved: true,
        referenceChapterId: null,
      });
    });
  }
}
