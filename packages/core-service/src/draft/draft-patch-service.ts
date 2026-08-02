import { randomUUID } from 'node:crypto';

import {
  DraftApplyPatchInputSchema,
  type DraftApplyPatchInput,
  type DraftDocument,
  type DraftLockConflict,
  type MutationOrigin,
} from '@worldforge/contracts';

import type { DatabaseClock } from '../database/index.js';
import { collectLockGuardViolations } from '../draft-lock-guard.js';
import type { ProjectWorkspaceService } from '../project-workspace.js';
import { recordDraftMutation } from '../writing-metrics.js';
import {
  DraftServiceError,
  auditBlocks,
  systemClock,
  type DraftServiceOptions,
  type PatchReplayRow,
} from './draft-model.js';
import {
  applyOperation,
  lockConflictError,
  operationLockConflict,
} from './draft-operation-policy.js';
import {
  activeChapter,
  activeDraft,
  ensureStoredHashes,
  readDocument,
  readWorkingBlocks,
} from './draft-record-reader.js';
import { replayDocument } from './draft-patch-replay.js';
import { persistBlocks } from './draft-record-writer.js';

export class DraftPatchService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;
  readonly #faultInjector: DraftServiceOptions['faultInjector'];

  constructor(workspace: ProjectWorkspaceService, options: DraftServiceOptions = {}) {
    this.#workspace = workspace;
    this.#clock = options.clock ?? systemClock;
    this.#idFactory = options.idFactory ?? randomUUID;
    this.#faultInjector = options.faultInjector;
  }

  applyPatchWithOrigin(
    requestId: string,
    input: DraftApplyPatchInput,
    mutationOrigin: MutationOrigin,
  ): Promise<DraftDocument> {
    const valid = DraftApplyPatchInputSchema.parse(input);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      const chapter = activeChapter(connection, valid.projectId, valid.chapterId);
      const draft = activeDraft(connection, valid.chapterId);
      if (!draft || chapter.activeDraftId !== draft.id || draft.id !== valid.draftId) {
        throw new DraftServiceError('DRAFT_NOT_FOUND', 'The requested active Draft was not found.');
      }

      const replay = connection
        .prepare(
          `SELECT draft_id AS draftId, base_revision AS baseRevision,
                  committed_revision AS committedRevision, operations_json AS operationsJson,
                  after_blocks_json AS afterBlocksJson
             FROM draft_patch_log WHERE request_id = ?`,
        )
        .get(requestId) as PatchReplayRow | undefined;
      if (replay) {
        return replayDocument(valid.projectId, valid.chapterId, draft, replay, valid);
      }

      ensureStoredHashes(connection, draft.id);
      if (draft.revision !== valid.baseRevision) {
        throw new DraftServiceError(
          'DRAFT_REVISION_CONFLICT',
          'The Draft revision changed after the Patch was created.',
        );
      }
      if (draft.revision >= Number.MAX_SAFE_INTEGER) {
        throw new DraftServiceError(
          'DRAFT_INVARIANT_FAILED',
          'The Draft revision exceeded the supported safe integer range.',
        );
      }

      const before = readWorkingBlocks(connection, draft.id);
      const after = before.map((block) => ({ ...block }));
      const committedRevision = draft.revision + 1;
      const directLockConflicts: DraftLockConflict[] = [];
      for (const operation of valid.operations) {
        try {
          applyOperation(after, operation, committedRevision, this.#idFactory);
        } catch (error) {
          const conflict = operationLockConflict(operation);
          if (
            error instanceof DraftServiceError &&
            error.code === 'DRAFT_BLOCK_LOCKED' &&
            conflict
          ) {
            directLockConflicts.push(conflict);
            continue;
          }
          throw error;
        }
      }
      const explicitlyUnlocked = new Set(
        valid.operations.flatMap((operation) =>
          operation.type === 'set-lock' && !operation.locked ? [operation.logicalBlockId] : [],
        ),
      );
      const lockConflicts = [
        ...directLockConflicts,
        ...collectLockGuardViolations(
          before.map((block) =>
            explicitlyUnlocked.has(block.logicalBlockId) ? { ...block, locked: false } : block,
          ),
          after,
        ),
      ];
      if (lockConflicts.length > 0) {
        throw lockConflictError(
          lockConflicts,
          valid.operations.length,
          `Draft Patch conflicts with ${lockConflicts.length} locked block change(s); the full Patch was skipped.`,
        );
      }
      if (after.length === 0) {
        throw new DraftServiceError(
          'DRAFT_PATCH_INVALID',
          'An active Draft must retain at least one DraftBlock.',
        );
      }
      if (new Set(after.map((block) => block.logicalBlockId)).size !== after.length) {
        throw new DraftServiceError(
          'DRAFT_INVARIANT_FAILED',
          'The Patch produced duplicate logicalBlockId values.',
        );
      }

      persistBlocks(connection, draft.id, before, after);
      const timestamp = this.#clock.now().toISOString();
      connection
        .prepare('UPDATE drafts SET revision = ?, updated_at = ? WHERE id = ?')
        .run(committedRevision, timestamp, draft.id);
      connection
        .prepare(
          `INSERT INTO draft_patch_log(
             id, draft_id, request_id, base_revision, committed_revision,
             operations_json, before_blocks_json, after_blocks_json, created_at,
             mutation_origin
           ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          this.#idFactory(),
          draft.id,
          requestId,
          valid.baseRevision,
          committedRevision,
          JSON.stringify(valid.operations),
          JSON.stringify(auditBlocks(before)),
          JSON.stringify(auditBlocks(after)),
          timestamp,
          mutationOrigin,
        );
      recordDraftMutation(connection, {
        projectId: valid.projectId,
        chapterId: valid.chapterId,
        draftId: draft.id,
        origin: mutationOrigin,
        beforeCharacters: before.reduce((total, block) => total + Array.from(block.text).length, 0),
        afterCharacters: after.reduce((total, block) => total + Array.from(block.text).length, 0),
        timestamp,
        idFactory: this.#idFactory,
      });
      this.#faultInjector?.('after-patch-persist');
      const document = readDocument(connection, valid.projectId, valid.chapterId, {
        ...draft,
        revision: committedRevision,
      });
      const clientIdentityByLogicalId = new Map(
        after.flatMap((block) =>
          block.clientBlockId ? [[block.logicalBlockId, block.clientBlockId] as const] : [],
        ),
      );
      return {
        ...document,
        blocks: document.blocks.map((block) => {
          const clientBlockId = clientIdentityByLogicalId.get(block.logicalBlockId);
          return clientBlockId ? { ...block, clientBlockId } : block;
        }),
      };
    });
  }
}
