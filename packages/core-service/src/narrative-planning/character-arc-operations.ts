import type { DatabaseSync } from 'node:sqlite';

import {
  ArcMilestoneSaveInputSchema,
  ArcMilestoneTransitionInputSchema,
  CharacterArcSaveInputSchema,
  type ArcMilestoneSaveInput,
  type ArcMilestoneTransitionInput,
  type CharacterArcSaveInput,
  type NarrativePlanningCatalog,
} from '@worldforge/contracts';

import type { DatabaseClock } from '../database/index.js';
import type { ProjectWorkspaceService } from '../project-workspace.js';
import { unresolvedArcMilestoneHitDependencies } from './arc-milestone-policy.js';
import { readNarrativePlanningCatalog } from './narrative-planning-catalog.js';
import {
  assertArc,
  assertChapter,
  assertCharacter,
  assertMilestone,
  assertProject,
  authorOnly,
  unique,
  NarrativePlanningServiceError,
} from './narrative-planning-model.js';
import { sqliteResult } from '../database/sqlite-result.js';

function assertMilestoneTargets(
  connection: DatabaseSync,
  projectId: string,
  milestoneId: string,
  input: ArcMilestoneSaveInput,
): void {
  assertArc(connection, projectId, input.arcId);
  if (input.plannedChapterId) {
    assertChapter(connection, projectId, input.plannedChapterId);
  }
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
      .prepare('SELECT status FROM timeline_events WHERE id = ? AND project_id = ?')
      .get(timelineEventId, projectId) as { readonly status: string } | undefined;
    if (!row) {
      throw new NarrativePlanningServiceError(
        'NARRATIVE_NOT_FOUND',
        'Timeline event dependency not found.',
      );
    }
    if (row.status !== 'active') {
      throw new NarrativePlanningServiceError(
        'NARRATIVE_CONFLICT',
        'Arc milestone cannot depend on an archived Timeline event.',
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
  const rows = sqliteResult<
    {
      readonly milestoneId: string;
      readonly dependencyId: string;
    }[]
  >(
    connection
      .prepare(
        `SELECT milestone_id AS milestoneId, dependency_milestone_id AS dependencyId
         FROM arc_milestone_dependencies
        WHERE project_id = ? AND milestone_id <> ?`,
      )
      .all(projectId, milestoneId),
  );
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

export function applyArcMilestoneTransitionInTransaction(
  connection: DatabaseSync,
  valid: ArcMilestoneTransitionInput,
  now: string,
  confirmationSource: 'author' | 'state_proposal' = 'author',
): void {
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
    const unresolved = unresolvedArcMilestoneHitDependencies(
      connection,
      valid.projectId,
      valid.milestoneId,
      valid.actualChapterId,
    );
    if (unresolved.length > 0) {
      throw new NarrativePlanningServiceError(
        'NARRATIVE_CONFLICT',
        `Arc milestone dependencies are not satisfied: ${unresolved.join(' ')}`,
      );
    }
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
      valid.status === 'planned' ? null : confirmationSource,
      now,
      valid.milestoneId,
      valid.projectId,
    );
}

export class CharacterArcOperations {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;

  constructor(workspace: ProjectWorkspaceService, clock: DatabaseClock, idFactory: () => string) {
    this.#workspace = workspace;
    this.#clock = clock;
    this.#idFactory = idFactory;
  }

  saveArc(requestId: string, input: CharacterArcSaveInput): Promise<NarrativePlanningCatalog> {
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
      return readNarrativePlanningCatalog(connection, {
        projectId: valid.projectId,
        query: '',
        includeResolved: true,
        referenceChapterId: null,
      });
    });
  }

  saveMilestone(
    requestId: string,
    input: ArcMilestoneSaveInput,
  ): Promise<NarrativePlanningCatalog> {
    const valid = ArcMilestoneSaveInputSchema.parse(input);
    authorOnly(valid.authority);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      const id = valid.milestoneId ?? this.#idFactory();
      const current = valid.milestoneId ? assertMilestone(connection, valid.projectId, id) : null;
      assertMilestoneTargets(connection, valid.projectId, id, valid);
      assertMilestoneDependencyGraph(connection, valid.projectId, id, valid.dependencyMilestoneIds);
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
      return readNarrativePlanningCatalog(connection, {
        projectId: valid.projectId,
        query: '',
        includeResolved: true,
        referenceChapterId: null,
      });
    });
  }

  transitionMilestone(
    requestId: string,
    input: ArcMilestoneTransitionInput,
  ): Promise<NarrativePlanningCatalog> {
    const valid = ArcMilestoneTransitionInputSchema.parse(input);
    authorOnly(valid.authority);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      applyArcMilestoneTransitionInTransaction(connection, valid, this.#clock.now().toISOString());
      return readNarrativePlanningCatalog(connection, {
        projectId: valid.projectId,
        query: '',
        includeResolved: true,
        referenceChapterId: null,
      });
    });
  }
}
