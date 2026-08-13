import type { DatabaseSync } from 'node:sqlite';

import { ReplacePlanSchema, type ReplacePlan } from '@worldforge/contracts';

import {
  type ItemRow,
  type PlanRow,
  numericValue,
  SearchToolsServiceError,
} from './search-model.js';
import { sqliteResult } from '../database/sqlite-result.js';

export function mapReplacePlan(database: DatabaseSync, row: PlanRow): ReplacePlan {
  const items = sqliteResult<ItemRow[]>(
    database
      .prepare(
        `SELECT id AS planItemId, project_id AS projectId, chapter_id AS chapterId,
              draft_id AS draftId, logical_block_id AS logicalBlockId,
              base_revision AS baseRevision, expected_block_hash AS expectedBlockHash,
              matched_text AS matchedText, match_start AS matchStart,
              match_end AS matchEnd, replacement, locked
         FROM replace_plan_items WHERE plan_id = ?
        ORDER BY chapter_id, draft_id, logical_block_id, match_start`,
      )
      .all(row.planId),
  );

  return ReplacePlanSchema.parse({
    ...row,
    matchCase: Boolean(row.matchCase),
    itemCount: numericValue(row.itemCount),
    eligibleCount: numericValue(row.eligibleCount),
    lockedCount: numericValue(row.lockedCount),
    items: items.map((item) => ({
      ...item,
      baseRevision: numericValue(item.baseRevision),
      matchStart: numericValue(item.matchStart),
      matchEnd: numericValue(item.matchEnd),
      locked: Boolean(item.locked),
    })),
  });
}

export function readReplacePlan(
  database: DatabaseSync,
  projectId: string,
  planId: string,
): ReplacePlan {
  const row = database
    .prepare(
      `SELECT id AS planId, project_id AS projectId, query, replacement,
              match_case AS matchCase, status, item_count AS itemCount,
              eligible_count AS eligibleCount, locked_count AS lockedCount,
              checkpoint_id AS checkpointId, created_at AS createdAt,
              updated_at AS updatedAt, applied_at AS appliedAt
         FROM replace_plans WHERE id = ? AND project_id = ?`,
    )
    .get(planId, projectId) as PlanRow | undefined;

  if (!row) {
    throw new SearchToolsServiceError('SEARCH_REPLACE_NOT_FOUND', 'The ReplacePlan was not found.');
  }
  return mapReplacePlan(database, row);
}
