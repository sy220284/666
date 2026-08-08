import { randomUUID } from 'node:crypto';

import {
  ReplaceApplyInputSchema,
  ReplaceApplyResultSchema,
  type ReplaceApplyResult,
} from '@worldforge/contracts';

import { readActiveDraftScope } from '../active-structure.js';
import { draftContentHash } from '../draft.js';
import type { DatabaseClock } from '../database/index.js';
import type { ProjectWorkspaceService } from '../project-workspace.js';
import type { RecoveryService } from '../recovery.js';
import { readReplacePlan } from './replace-plan-repository.js';
import {
  attachStaleMarkFailure,
  type DraftBlockRow,
  derivedReplaceRequestId,
  draftAudit,
  numericValue,
  SearchToolsServiceError,
} from './search-model.js';

export interface ReplaceApplyOperationsOptions {
  readonly workspace: ProjectWorkspaceService;
  readonly recovery: RecoveryService;
  readonly clock: DatabaseClock;
  readonly idFactory: () => string;
  readonly checkpointRequestId: (requestId: string) => string;
}

export class ReplaceApplyOperations {
  readonly #workspace: ProjectWorkspaceService;
  readonly #recovery: RecoveryService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;
  readonly #checkpointRequestId: (requestId: string) => string;

  constructor(options: ReplaceApplyOperationsOptions) {
    this.#workspace = options.workspace;
    this.#recovery = options.recovery;
    this.#clock = options.clock;
    this.#idFactory = options.idFactory;
    this.#checkpointRequestId = options.checkpointRequestId;
  }

  async apply(requestId: string, raw: unknown): Promise<ReplaceApplyResult> {
    const input = ReplaceApplyInputSchema.parse(raw);
    const preview = this.#workspace.readProject(input.projectId, (database) =>
      readReplacePlan(database, input.projectId, input.planId),
    );
    if (preview.status !== 'preview') {
      throw new SearchToolsServiceError(
        'SEARCH_REPLACE_CONFLICT',
        'Only a current preview ReplacePlan may be applied.',
      );
    }
    const checkpoint = await this.#recovery.createOperationCheckpoint(
      this.#checkpointRequestId(requestId),
      { projectId: input.projectId, operation: 'replace' },
    );

    try {
      return await this.#workspace.writeProject(requestId, input.projectId, (database) => {
        const plan = readReplacePlan(database, input.projectId, input.planId);
        if (plan.status !== 'preview') {
          throw new SearchToolsServiceError(
            'SEARCH_REPLACE_CONFLICT',
            'The ReplacePlan has already changed.',
          );
        }
        const eligible = plan.items.filter((item) => !item.locked);
        const byDraft = new Map<string, typeof eligible>();
        for (const item of eligible) {
          const existing = byDraft.get(item.draftId) ?? [];
          byDraft.set(item.draftId, [...existing, item]);
        }
        const drafts = new Map<
          string,
          {
            readonly chapterId: string;
            readonly revision: number;
            readonly blocks: DraftBlockRow[];
          }
        >();
        for (const [draftId, items] of byDraft) {
          const activeScope = readActiveDraftScope(database, input.projectId, draftId);
          if (!activeScope) {
            throw new SearchToolsServiceError(
              'SEARCH_REPLACE_STALE',
              'A target chapter, volume or active Draft changed after the ReplacePlan preview.',
            );
          }
          const blocks = database
            .prepare(
              `SELECT block.id AS recordId, volume.project_id AS projectId,
                      chapter.id AS chapterId, draft.id AS draftId,
                      draft.revision AS draftRevision, block.revision AS revision,
                      block.logical_block_id AS logicalBlockId, block.order_key AS orderKey,
                      block.block_type AS blockType, block.text,
                      block.attributes_json AS attributesJson, block.source, block.locked,
                      block.content_hash AS contentHash
                 FROM drafts draft
                 JOIN draft_blocks block ON block.draft_id = draft.id
                 JOIN chapters chapter ON chapter.id = draft.chapter_id
                 JOIN volumes volume ON volume.id = chapter.volume_id
                WHERE draft.id = ? AND volume.project_id = ?
                  AND draft.status = 'active' AND chapter.active_draft_id = draft.id
                  AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL
                ORDER BY block.order_key, block.id`,
            )
            .all(draftId, input.projectId) as unknown as DraftBlockRow[];
          const draftRevision = blocks[0] ? numericValue(blocks[0].draftRevision) : -1;
          if (
            blocks.length === 0 ||
            numericValue(activeScope.draftRevision) !== draftRevision ||
            items.some((item) => item.baseRevision !== draftRevision)
          ) {
            throw new SearchToolsServiceError(
              'SEARCH_REPLACE_STALE',
              'A target Draft revision changed after the ReplacePlan preview.',
            );
          }
          drafts.set(draftId, {
            chapterId: blocks[0]!.chapterId,
            revision: draftRevision,
            blocks,
          });
          for (const item of items) {
            const block = blocks.find(
              (candidate) => candidate.logicalBlockId === item.logicalBlockId,
            );
            if (
              !block ||
              block.locked ||
              block.contentHash !== item.expectedBlockHash ||
              block.text.slice(item.matchStart, item.matchEnd) !== item.matchedText
            ) {
              throw new SearchToolsServiceError(
                'SEARCH_REPLACE_STALE',
                'A target block changed or became locked after the ReplacePlan preview.',
              );
            }
          }
        }

        const now = this.#clock.now().toISOString();
        const changedDrafts: ReplaceApplyResult['changedDrafts'][number][] = [];
        for (const [draftId, target] of drafts) {
          const items = byDraft.get(draftId)!;
          const before = target.blocks.map((block) => ({ ...block }));
          const byBlock = new Map<string, typeof items>();
          for (const item of items) {
            byBlock.set(item.logicalBlockId, [...(byBlock.get(item.logicalBlockId) ?? []), item]);
          }
          for (const [logicalBlockId, matches] of byBlock) {
            const block = target.blocks.find(
              (candidate) => candidate.logicalBlockId === logicalBlockId,
            )!;
            let next = block.text;
            for (const match of [...matches].sort(
              (left, right) => right.matchStart - left.matchStart,
            )) {
              next =
                next.slice(0, match.matchStart) + match.replacement + next.slice(match.matchEnd);
            }
            const attributes = JSON.parse(block.attributesJson) as Record<string, unknown>;
            block.text = next;
            block.contentHash = draftContentHash({
              blockType: block.blockType,
              content: next,
              attributes,
            });
          }

          const committedRevision = target.revision + 1;
          const update = database.prepare(
            `UPDATE draft_blocks
                SET text = ?, content_hash = ?, revision = ?
              WHERE id = ? AND draft_id = ? AND revision = ? AND content_hash = ?`,
          );
          for (const logicalBlockId of byBlock.keys()) {
            const previous = before.find((block) => block.logicalBlockId === logicalBlockId)!;
            const block = target.blocks.find(
              (candidate) => candidate.logicalBlockId === logicalBlockId,
            )!;
            const changed = update.run(
              block.text,
              block.contentHash,
              committedRevision,
              block.recordId,
              draftId,
              previous.revision,
              previous.contentHash,
            );
            if (numericValue(changed.changes) !== 1) {
              throw new SearchToolsServiceError(
                'SEARCH_REPLACE_STALE',
                'A target block changed before the replacement transaction committed.',
              );
            }
            block.revision = committedRevision;
          }
          const changed = database
            .prepare('UPDATE drafts SET revision = ?, updated_at = ? WHERE id = ? AND revision = ?')
            .run(committedRevision, now, draftId, target.revision);
          if (numericValue(changed.changes) !== 1) {
            throw new SearchToolsServiceError(
              'SEARCH_REPLACE_STALE',
              'The Draft changed before the replacement transaction committed.',
            );
          }
          const operations = [...byBlock.entries()].map(([logicalBlockId]) => {
            const previous = before.find((block) => block.logicalBlockId === logicalBlockId)!;
            const current = target.blocks.find((block) => block.logicalBlockId === logicalBlockId)!;
            return {
              type: 'update',
              logicalBlockId,
              expectedHash: previous.contentHash,
              content: current.text,
            };
          });
          database
            .prepare(
              `INSERT INTO draft_patch_log(
                 id, draft_id, request_id, base_revision, committed_revision,
                 operations_json, before_blocks_json, after_blocks_json, created_at,
                 mutation_origin
               ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 'safe_replace')`,
            )
            .run(
              this.#idFactory(),
              draftId,
              derivedReplaceRequestId(requestId, draftId),
              target.revision,
              committedRevision,
              JSON.stringify(operations),
              JSON.stringify(draftAudit(before)),
              JSON.stringify(draftAudit(target.blocks)),
              now,
            );
          changedDrafts.push({
            draftId,
            chapterId: target.chapterId,
            previousRevision: target.revision,
            committedRevision,
            replacementCount: items.length,
          });
        }
        const applied = database
          .prepare(
            `UPDATE replace_plans
                SET status = 'applied', checkpoint_id = ?, updated_at = ?, applied_at = ?
              WHERE id = ? AND project_id = ? AND status = 'preview'`,
          )
          .run(checkpoint.backupId, now, now, input.planId, input.projectId);
        if (numericValue(applied.changes) !== 1) {
          throw new SearchToolsServiceError(
            'SEARCH_REPLACE_CONFLICT',
            'The ReplacePlan changed before the replacement transaction committed.',
          );
        }
        return ReplaceApplyResultSchema.parse({
          plan: readReplacePlan(database, input.projectId, input.planId),
          checkpoint,
          changedDrafts,
          skippedLockedCount: plan.lockedCount,
        });
      });
    } catch (error) {
      try {
        await this.#workspace.writeProject(randomUUID(), input.projectId, (database) => {
          database
            .prepare(
              `UPDATE replace_plans SET status = 'stale', updated_at = ?
                WHERE id = ? AND project_id = ? AND status = 'preview'`,
            )
            .run(this.#clock.now().toISOString(), input.planId, input.projectId);
        });
      } catch (staleMarkError) {
        attachStaleMarkFailure(error, staleMarkError);
      }
      throw error;
    }
  }
}
