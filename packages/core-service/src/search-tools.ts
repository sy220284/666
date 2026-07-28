import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import {
  ReplaceApplyInputSchema,
  ReplaceApplyResultSchema,
  ReplacePlanSchema,
  ReplacePreviewInputSchema,
  type ProjectDictionaryDeleteInput,
  type ProjectDictionaryListInput,
  type ProjectDictionaryUpsertInput,
  type ReplaceApplyResult,
  type ReplacePlan,
  type ReplacePreviewInput,
  type SearchProjectInput,
} from '@worldforge/contracts';

import { draftContentHash } from './draft.js';
import type { DatabaseClock } from './database/index.js';
import type { ProjectWorkspaceService } from './project-workspace.js';
import type { RecoveryService } from './recovery.js';
import { HardenedSearchIndexService } from './search-index-hardening.js';

const systemClock: DatabaseClock = { now: () => new Date() };

export type SearchToolsServiceErrorCode =
  | 'SEARCH_REPLACE_NOT_FOUND'
  | 'SEARCH_REPLACE_INVALID'
  | 'SEARCH_REPLACE_STALE'
  | 'SEARCH_REPLACE_CONFLICT';

export class SearchToolsServiceError extends Error {
  readonly code: SearchToolsServiceErrorCode;
  constructor(code: SearchToolsServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SearchToolsServiceError';
    this.code = code;
  }
}

interface PlanRow {
  readonly planId: string;
  readonly projectId: string;
  readonly query: string;
  readonly replacement: string;
  readonly matchCase: number | bigint;
  readonly status: string;
  readonly itemCount: number | bigint;
  readonly eligibleCount: number | bigint;
  readonly lockedCount: number | bigint;
  readonly checkpointId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly appliedAt: string | null;
}

interface ItemRow {
  readonly planItemId: string;
  readonly projectId: string;
  readonly chapterId: string;
  readonly draftId: string;
  readonly logicalBlockId: string;
  readonly baseRevision: number | bigint;
  readonly expectedBlockHash: string;
  readonly matchedText: string;
  readonly matchStart: number | bigint;
  readonly matchEnd: number | bigint;
  readonly replacement: string;
  readonly locked: number | bigint;
}

interface DraftBlockRow {
  readonly recordId: string;
  readonly projectId: string;
  readonly chapterId: string;
  readonly draftId: string;
  readonly revision: number | bigint;
  readonly logicalBlockId: string;
  readonly orderKey: number | bigint;
  readonly blockType: 'paragraph' | 'dialogue' | 'heading' | 'separator';
  text: string;
  readonly attributesJson: string;
  readonly source: 'manual' | 'ai' | 'mixed' | 'imported';
  readonly locked: number | bigint;
  contentHash: string;
}

function number(value: number | bigint): number {
  return typeof value === 'bigint' ? Number(value) : value;
}

function mapPlan(database: DatabaseSync, row: PlanRow): ReplacePlan {
  const items = database
    .prepare(
      `SELECT id AS planItemId, project_id AS projectId, chapter_id AS chapterId,
              draft_id AS draftId, logical_block_id AS logicalBlockId,
              base_revision AS baseRevision, expected_block_hash AS expectedBlockHash,
              matched_text AS matchedText, match_start AS matchStart,
              match_end AS matchEnd, replacement, locked
         FROM replace_plan_items WHERE plan_id = ?
        ORDER BY chapter_id, draft_id, logical_block_id, match_start`,
    )
    .all(row.planId) as unknown as ItemRow[];
  return ReplacePlanSchema.parse({
    ...row,
    matchCase: Boolean(row.matchCase),
    itemCount: number(row.itemCount),
    eligibleCount: number(row.eligibleCount),
    lockedCount: number(row.lockedCount),
    items: items.map((item) => ({
      ...item,
      baseRevision: number(item.baseRevision),
      matchStart: number(item.matchStart),
      matchEnd: number(item.matchEnd),
      locked: Boolean(item.locked),
    })),
  });
}

function readPlan(database: DatabaseSync, projectId: string, planId: string): ReplacePlan {
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
  return mapPlan(database, row);
}

function occurrences(text: string, query: string, matchCase: boolean): Array<[number, number]> {
  const matches: Array<[number, number]> = [];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const expression = new RegExp(escaped, matchCase ? 'gu' : 'giu');
  for (const match of text.matchAll(expression)) {
    if (match.index === undefined || match[0].length === 0) continue;
    matches.push([match.index, match.index + match[0].length]);
  }
  return matches;
}

function derivedRequestId(requestId: string, draftId: string): string {
  const hash = createHash('sha256').update(`${requestId}:${draftId}`, 'utf8').digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(
    17,
    20,
  )}-${hash.slice(20, 32)}`;
}

function audit(blocks: readonly DraftBlockRow[], revision: number) {
  return blocks.map((block, index) => ({
    logicalBlockId: block.logicalBlockId,
    orderKey: String((index + 1) * 1024),
    blockType: block.blockType,
    text: block.text,
    attributes: JSON.parse(block.attributesJson) as unknown,
    source: block.source,
    locked: Boolean(block.locked),
    contentHash: block.contentHash,
    revision,
  }));
}

export interface SearchToolsServiceOptions {
  readonly clock?: DatabaseClock;
  readonly idFactory?: () => string;
}

export class SearchToolsService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #recovery: RecoveryService;
  readonly #search: HardenedSearchIndexService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;
  readonly #checkpointRequestId: (requestId: string) => string;

  constructor(
    workspace: ProjectWorkspaceService,
    recovery: RecoveryService,
    checkpointRequestId: (requestId: string) => string,
    options: SearchToolsServiceOptions = {},
  ) {
    this.#workspace = workspace;
    this.#recovery = recovery;
    this.#checkpointRequestId = checkpointRequestId;
    this.#search = new HardenedSearchIndexService(
      workspace,
      options.clock ? { clock: options.clock } : {},
    );
    this.#clock = options.clock ?? systemClock;
    this.#idFactory = options.idFactory ?? randomUUID;
  }

  search(raw: SearchProjectInput) {
    return this.#search.search(raw);
  }

  getIndexState(projectId: string) {
    return this.#search.getState(projectId);
  }

  rebuildIndex(requestId: string, projectId: string) {
    return this.#search.rebuild(requestId, projectId);
  }

  listDictionary(raw: ProjectDictionaryListInput) {
    return this.#search.listDictionary(raw);
  }

  upsertDictionary(requestId: string, raw: ProjectDictionaryUpsertInput) {
    return this.#search.upsertDictionary(requestId, raw);
  }

  deleteDictionary(requestId: string, raw: ProjectDictionaryDeleteInput) {
    return this.#search.deleteDictionary(requestId, raw);
  }

  previewReplace(requestId: string, raw: ReplacePreviewInput): Promise<ReplacePlan> {
    const input = ReplacePreviewInputSchema.parse(raw);
    if (!input.query) {
      throw new SearchToolsServiceError(
        'SEARCH_REPLACE_INVALID',
        'A replacement query is required.',
      );
    }
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const blocks = database
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
        .all(input.projectId) as unknown as DraftBlockRow[];
      const found = blocks.flatMap((block) =>
        occurrences(block.text, input.query, input.matchCase).map(([start, end]) => ({
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
      return readPlan(database, input.projectId, planId);
    });
  }

  async applyReplace(requestId: string, raw: unknown): Promise<ReplaceApplyResult> {
    const input = ReplaceApplyInputSchema.parse(raw);
    const preview = this.#workspace.readProject(input.projectId, (database) =>
      readPlan(database, input.projectId, input.planId),
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
        const plan = readPlan(database, input.projectId, input.planId);
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
          const blocks = database
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
                WHERE draft.id = ? AND volume.project_id = ?
                  AND draft.status = 'active' AND chapter.active_draft_id = draft.id
                ORDER BY block.order_key, block.id`,
            )
            .all(draftId, input.projectId) as unknown as DraftBlockRow[];
          if (
            blocks.length === 0 ||
            items.some((item) => item.baseRevision !== number(blocks[0]!.revision))
          ) {
            throw new SearchToolsServiceError(
              'SEARCH_REPLACE_STALE',
              'A target Draft revision changed after the ReplacePlan preview.',
            );
          }
          drafts.set(draftId, {
            chapterId: blocks[0]!.chapterId,
            revision: number(blocks[0]!.revision),
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
              WHERE id = ? AND draft_id = ?`,
          );
          for (const block of target.blocks) {
            update.run(block.text, block.contentHash, committedRevision, block.recordId, draftId);
          }
          const changed = database
            .prepare('UPDATE drafts SET revision = ?, updated_at = ? WHERE id = ? AND revision = ?')
            .run(committedRevision, now, draftId, target.revision);
          if (number(changed.changes) !== 1) {
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
              derivedRequestId(requestId, draftId),
              target.revision,
              committedRevision,
              JSON.stringify(operations),
              JSON.stringify(audit(before, target.revision)),
              JSON.stringify(audit(target.blocks, committedRevision)),
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
        database
          .prepare(
            `UPDATE replace_plans
                SET status = 'applied', checkpoint_id = ?, updated_at = ?, applied_at = ?
              WHERE id = ? AND project_id = ? AND status = 'preview'`,
          )
          .run(checkpoint.backupId, now, now, input.planId, input.projectId);
        return ReplaceApplyResultSchema.parse({
          plan: readPlan(database, input.projectId, input.planId),
          checkpoint,
          changedDrafts,
          skippedLockedCount: plan.lockedCount,
        });
      });
    } catch (error) {
      await this.#workspace.writeProject(randomUUID(), input.projectId, (database) => {
        database
          .prepare(
            `UPDATE replace_plans SET status = 'stale', updated_at = ?
              WHERE id = ? AND project_id = ? AND status = 'preview'`,
          )
          .run(this.#clock.now().toISOString(), input.planId, input.projectId);
      });
      throw error;
    }
  }
}
