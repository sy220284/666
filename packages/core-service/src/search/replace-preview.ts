import {
  ReplacePreviewInputSchema,
  type ReplacePlan,
  type ReplacePreviewInput,
} from '@worldforge/contracts';

import type { DatabaseClock } from '../database/index.js';
import type { ProjectWorkspaceService } from '../project-workspace.js';
import { readReplacePlan } from './replace-plan-repository.js';
import { type DraftBlockRow, findOccurrences, SearchToolsServiceError } from './search-model.js';
import { sqliteResult } from '../database/sqlite-result.js';

export interface ReplacePreviewOperationsOptions {
  readonly workspace: ProjectWorkspaceService;
  readonly clock: DatabaseClock;
  readonly idFactory: () => string;
}

export class ReplacePreviewOperations {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;

  constructor(options: ReplacePreviewOperationsOptions) {
    this.#workspace = options.workspace;
    this.#clock = options.clock;
    this.#idFactory = options.idFactory;
  }

  preview(requestId: string, raw: ReplacePreviewInput): Promise<ReplacePlan> {
    const input = ReplacePreviewInputSchema.parse(raw);
    if (!input.query) {
      throw new SearchToolsServiceError(
        'SEARCH_REPLACE_INVALID',
        'A replacement query is required.',
      );
    }

    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const blocks = sqliteResult<DraftBlockRow[]>(
        database
          .prepare(
            `SELECT block.id AS recordId, volume.project_id AS projectId,
                  chapter.id AS chapterId, draft.id AS draftId, draft.revision,
                  block.logical_block_id AS logicalBlockId, block.order_key AS orderKey,
                  block.block_type AS blockType, block.text,
                  block.attributes_json AS attributesJson, block.source, block.locked,
                  block.content_hash AS contentHash
             FROM drafts draft
             JOIN draft_blocks block ON block.draft_id = draft.id
             JOIN chapters chapter ON chapter.id = draft.chapter_id
             JOIN volumes volume ON volume.id = chapter.volume_id
            WHERE volume.project_id = ? AND draft.status = 'active'
              AND chapter.active_draft_id = draft.id
              AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL
            ORDER BY volume.order_key, chapter.order_key, block.order_key, block.id`,
          )
          .all(input.projectId),
      );
      const found = blocks.flatMap((block) =>
        findOccurrences(block.text, input.query, input.matchCase).map(([start, end]) => ({
          block,
          start,
          end,
          matchedText: block.text.slice(start, end),
        })),
      );
      if (found.length > input.maxMatches) {
        throw new SearchToolsServiceError(
          'SEARCH_REPLACE_INVALID',
          `The replacement exceeds the ${input.maxMatches} match preview limit.`,
        );
      }

      const planId = this.#idFactory();
      const now = this.#clock.now().toISOString();
      const lockedCount = found.filter((match) => Boolean(match.block.locked)).length;
      database
        .prepare(
          `INSERT INTO replace_plans(
             id, project_id, query, replacement, match_case, status,
             item_count, eligible_count, locked_count, checkpoint_id,
             created_at, updated_at, applied_at
           ) VALUES(?, ?, ?, ?, ?, 'preview', ?, ?, ?, NULL, ?, ?, NULL)`,
        )
        .run(
          planId,
          input.projectId,
          input.query,
          input.replacement,
          input.matchCase ? 1 : 0,
          found.length,
          found.length - lockedCount,
          lockedCount,
          now,
          now,
        );
      const insert = database.prepare(
        `INSERT INTO replace_plan_items(
           id, plan_id, project_id, chapter_id, draft_id, logical_block_id,
           base_revision, expected_block_hash, matched_text, match_start,
           match_end, replacement, locked, created_at
         ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const match of found) {
        insert.run(
          this.#idFactory(),
          planId,
          input.projectId,
          match.block.chapterId,
          match.block.draftId,
          match.block.logicalBlockId,
          match.block.revision,
          match.block.contentHash,
          match.matchedText,
          match.start,
          match.end,
          input.replacement,
          match.block.locked ? 1 : 0,
          now,
        );
      }
      return readReplacePlan(database, input.projectId, planId);
    });
  }
}
