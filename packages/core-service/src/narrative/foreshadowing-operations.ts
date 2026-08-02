import type { DatabaseSync } from 'node:sqlite';

import {
  ForeshadowingSaveInputSchema,
  ForeshadowingTransitionInputSchema,
  type ForeshadowingSaveInput,
  type ForeshadowingStatus,
  type ForeshadowingTransitionInput,
  type NarrativePlanningCatalog,
} from '@worldforge/contracts';
import { compareChapterPosition } from '@worldforge/domain';

import { chapterPosition } from '../continuity-validation.js';
import type { DatabaseClock } from '../database/index.js';
import type { ProjectWorkspaceService } from '../project-workspace.js';
import { readCatalog, unresolvedForeshadowingRelations } from './narrative-catalog.js';
import {
  assertChapter,
  assertForeshadowing,
  assertProject,
  authorOnly,
  NarrativePlanningServiceError,
  text,
} from './narrative-model.js';

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

function assertForeshadowingTargets(
  connection: DatabaseSync,
  projectId: string,
  sourceId: string,
  input: ForeshadowingSaveInput,
): void {
  const source = connection
    .prepare('SELECT status FROM foreshadowings WHERE id = ? AND project_id = ?')
    .get(sourceId, projectId) as { readonly status: string } | undefined;
  for (const link of input.chapterLinks) assertChapter(connection, projectId, link.chapterId);
  for (const relation of input.relations) {
    if (relation.targetForeshadowingId === sourceId) {
      throw new NarrativePlanningServiceError(
        'NARRATIVE_INVALID',
        'Foreshadowing cannot relate to itself.',
      );
    }
    const target = assertForeshadowing(connection, projectId, relation.targetForeshadowingId);
    if (
      relation.kind === 'mutually_exclusive' &&
      source &&
      isActivatedForeshadowing(source.status) &&
      isActivatedForeshadowing(target.status)
    ) {
      throw new NarrativePlanningServiceError(
        'NARRATIVE_CONFLICT',
        `Mutually exclusive foreshadowing is already active: ${target.title}.`,
      );
    }
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
    { readonly title: string; readonly status: string } | undefined;
  if (conflict) {
    throw new NarrativePlanningServiceError(
      'NARRATIVE_CONFLICT',
      `Mutually exclusive foreshadowing is already active: ${text(conflict.title)}.`,
    );
  }
}

const foreshadowingTransitions: Readonly<
  Record<ForeshadowingStatus, readonly ForeshadowingStatus[]>
> = {
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

export class ForeshadowingOperations {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;

  constructor(workspace: ProjectWorkspaceService, clock: DatabaseClock, idFactory: () => string) {
    this.#workspace = workspace;
    this.#clock = clock;
    this.#idFactory = idFactory;
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
      connection
        .prepare('DELETE FROM foreshadowing_relations WHERE source_foreshadowing_id = ?')
        .run(id);
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
        insertRelation.run(valid.projectId, id, relation.targetForeshadowingId, relation.kind, now);
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
        .run(valid.status, this.#clock.now().toISOString(), valid.foreshadowingId, valid.projectId);
      return readCatalog(connection, {
        projectId: valid.projectId,
        query: '',
        includeResolved: true,
        referenceChapterId: null,
      });
    });
  }
}
