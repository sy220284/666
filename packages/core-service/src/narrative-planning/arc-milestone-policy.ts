import type { DatabaseSync } from 'node:sqlite';

import { chapterPosition } from '../continuity-validation.js';
import { unresolvedMilestoneTimelineDependencies } from './narrative-planning-catalog.js';
import { sqliteResult } from '../database/sqlite-result.js';

export function unresolvedArcMilestoneHitDependencies(
  connection: DatabaseSync,
  projectId: string,
  milestoneId: string,
  actualChapterId: string,
): string[] {
  const unresolvedMilestones = sqliteResult<{ readonly title: string }[]>(
    connection
      .prepare(
        `SELECT dependency.title
         FROM arc_milestone_dependencies dependency_link
         JOIN arc_milestones dependency
           ON dependency.id = dependency_link.dependency_milestone_id
          AND dependency.project_id = dependency_link.project_id
        WHERE dependency_link.project_id = ? AND dependency_link.milestone_id = ?
          AND dependency.status <> 'hit'
        ORDER BY dependency.title, dependency.id`,
      )
      .all(projectId, milestoneId),
  );
  const warnings = unresolvedMilestones.map(
    (dependency) => `Waiting for milestone: ${String(dependency.title)}`,
  );
  warnings.push(
    ...unresolvedMilestoneTimelineDependencies(
      connection,
      projectId,
      milestoneId,
      chapterPosition(connection, projectId, actualChapterId),
    ),
  );
  return warnings;
}
