import { randomUUID } from 'node:crypto';

import {
  CandidateApplyInputSchema,
  CandidateApplyOutcomeSchema,
  CandidateApplyRecordSchema,
  CandidateCheckpointSchema,
  CandidateConflictSetSchema,
  CandidatePreviewInputSchema,
  CandidatePreviewCancelInputSchema,
  CandidatePreviewCancelSchema,
  CandidateUndoInputSchema,
  CandidateUndoLookupInputSchema,
  CandidateUndoLookupSchema,
  CandidateUndoOutcomeSchema,
  CandidateUndoPreviewInputSchema,
  CandidateUndoPreviewSchema,
  DraftPatchOperationSchema,
  type CandidateApplyInput,
  type CandidateApplyOutcome,
  type CandidateConflictItem,
  type CandidatePreview,
  type CandidatePreviewCancel,
  type CandidatePreviewCancelInput,
  type CandidatePreviewInput,
  type CandidateUndoInput,
  type CandidateUndoLookup,
  type CandidateUndoLookupInput,
  type CandidateUndoOutcome,
  type CandidateUndoPreview,
  type CandidateUndoPreviewInput,
  type DraftPatchOperation,
} from '@worldforge/contracts';

import type { DatabaseClock } from './database/index.js';
import type { ProjectWorkspaceService } from './project-workspace.js';
import { CandidateDiffCancelledError } from './candidate-apply-diff.js';
import {
  CandidateApplyServiceError,
  type CandidateApplyServiceOptions,
  activeDraft,
  auditBlocks,
  draftDocument,
  draftOperations,
  mutableFromSnapshot,
  persistBlocks,
  persistConflictSet,
  persistedNumber,
  readApplyRecord,
  readCandidateDocument,
  readDraftBlocks,
  snapshotHash,
  stable,
} from './candidate-state.js';
import {
  buildCandidatePreview,
  buildCandidatePreviewProgressively,
  buildCandidateTarget,
  candidateConflict,
  collectApplyConflicts,
} from './candidate-apply-plan.js';

const systemClock: DatabaseClock = { now: () => new Date() };

interface PatchReplayRow {
  readonly draftId: string;
  readonly baseRevision: number | bigint;
  readonly committedRevision: number | bigint;
  readonly operationsJson: string;
  readonly beforeBlocksJson: string;
  readonly afterBlocksJson: string;
}

export class CandidateApplyService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;
  readonly #faultInjector:
    ((stage: 'after-checkpoint' | 'after-draft-persist' | 'before-commit') => void) | undefined;
  readonly #previewControllers = new Map<string, AbortController>();

  constructor(workspace: ProjectWorkspaceService, options: CandidateApplyServiceOptions = {}) {
    this.#workspace = workspace;
    this.#clock = options.clock ?? systemClock;
    this.#idFactory = options.idFactory ?? randomUUID;
    this.#faultInjector = options.faultInjector;
  }

  preview(raw: CandidatePreviewInput): CandidatePreview {
    const input = CandidatePreviewInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (database) => {
      const draft = activeDraft(database, input.projectId, input.chapterId);
      const blocks = readDraftBlocks(database, draft.draftId);
      return buildCandidatePreview(
        readCandidateDocument(database, input),
        draftDocument(input.projectId, input.chapterId, draft, blocks),
      );
    });
  }

  async previewProgressively(
    requestId: string,
    raw: CandidatePreviewInput,
  ): Promise<CandidatePreview> {
    const input = CandidatePreviewInputSchema.parse(raw);
    if (this.#previewControllers.has(requestId)) {
      throw new CandidateApplyServiceError(
        'CANDIDATE_APPLY_INVALID',
        'A Candidate preview with this requestId is already running.',
      );
    }
    const controller = new AbortController();
    this.#previewControllers.set(requestId, controller);
    try {
      const source = this.#workspace.readProject(input.projectId, (database) => {
        const draft = activeDraft(database, input.projectId, input.chapterId);
        const blocks = readDraftBlocks(database, draft.draftId);
        return {
          candidate: readCandidateDocument(database, input),
          draft: draftDocument(input.projectId, input.chapterId, draft, blocks),
        };
      });
      return await buildCandidatePreviewProgressively(
        source.candidate,
        source.draft,
        controller.signal,
      );
    } catch (error) {
      if (error instanceof CandidateDiffCancelledError) {
        throw new CandidateApplyServiceError(
          'CANDIDATE_PREVIEW_CANCELLED',
          'The Candidate preview was cancelled.',
          { cause: error },
        );
      }
      throw error;
    } finally {
      this.#previewControllers.delete(requestId);
    }
  }

  cancelPreview(raw: CandidatePreviewCancelInput): CandidatePreviewCancel {
    const input = CandidatePreviewCancelInputSchema.parse(raw);
    const controller = this.#previewControllers.get(input.previewRequestId);
    controller?.abort();
    return CandidatePreviewCancelSchema.parse({ cancelled: controller !== undefined });
  }

  apply(requestId: string, raw: CandidateApplyInput): Promise<CandidateApplyOutcome> {
    const input = CandidateApplyInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const replayRow = database
        .prepare(
          `SELECT ar.id AS applyRecordId, ar.candidate_id AS candidateId,
                  ar.draft_id AS draftId, ca.chapter_id AS chapterId
             FROM candidate_apply_records ar
             JOIN candidates ca ON ca.id = ar.candidate_id
            WHERE ar.request_id = ?`,
        )
        .get(requestId) as
        | {
            readonly applyRecordId: string;
            readonly candidateId: string;
            readonly draftId: string;
            readonly chapterId: string;
          }
        | undefined;
      if (replayRow) {
        if (
          replayRow.candidateId !== input.candidateId ||
          replayRow.draftId !== input.draftId ||
          replayRow.chapterId !== input.chapterId
        ) {
          throw new CandidateApplyServiceError(
            'CANDIDATE_APPLY_INVALID',
            'The requestId is already bound to a different Candidate application.',
          );
        }
        const { record, checkpointSummary, appliedBlocks } = readApplyRecord(
          database,
          input.projectId,
          input.chapterId,
          replayRow.applyRecordId,
        );
        if (
          record.candidateId !== input.candidateId ||
          record.draftId !== input.draftId ||
          record.baseRevision !== input.baseRevision ||
          stable(record.selection) !== stable(input.selection)
        ) {
          throw new CandidateApplyServiceError(
            'CANDIDATE_APPLY_INVALID',
            'The requestId is already bound to a different Candidate application.',
          );
        }
        return CandidateApplyOutcomeSchema.parse({
          outcome: 'applied',
          record: {
            ...record,
            status: 'applied',
            undoneRevision: null,
            undoneAt: null,
          },
          checkpoint: checkpointSummary,
          draft: draftDocument(
            input.projectId,
            input.chapterId,
            { draftId: record.draftId, revision: record.committedRevision, status: 'active' },
            appliedBlocks,
          ),
        });
      }
      if (database.prepare('SELECT 1 FROM draft_patch_log WHERE request_id = ?').get(requestId)) {
        throw new CandidateApplyServiceError(
          'CANDIDATE_APPLY_INVALID',
          'The requestId is already bound to a different Draft operation.',
        );
      }
      const timestamp = this.#clock.now().toISOString();
      const draft = activeDraft(database, input.projectId, input.chapterId, input.draftId);
      const currentRevision = persistedNumber(draft.revision);
      const candidate = readCandidateDocument(database, input);
      const before = readDraftBlocks(database, draft.draftId);
      const committedRevision = currentRevision + 1;
      const target = buildCandidateTarget(
        before,
        candidate,
        input.selection,
        committedRevision,
        this.#idFactory,
      );
      const duplicate = Boolean(
        database
          .prepare('SELECT 1 FROM candidate_apply_records WHERE candidate_id = ?')
          .get(candidate.candidateId),
      );
      const conflicts = collectApplyConflicts(
        candidate,
        before,
        target,
        input,
        currentRevision,
        duplicate,
      );
      if (conflicts.length > 0) {
        return CandidateApplyOutcomeSchema.parse({
          outcome: 'conflict',
          conflictSet: persistConflictSet(database, this.#idFactory, timestamp, {
            candidateId: candidate.candidateId,
            draftId: draft.draftId,
            phase: 'apply',
            attemptedRevision: input.baseRevision,
            currentRevision,
            conflicts,
          }),
        });
      }

      const checkpointId = this.#idFactory();
      const applyRecordId = this.#idFactory();
      const beforeAudit = auditBlocks(before);
      const afterAudit = auditBlocks(target);
      const beforeHash = snapshotHash(
        before.map(({ recordId: _recordId, revision: _revision, ...block }) => block),
      );
      database
        .prepare(
          `INSERT INTO candidate_apply_checkpoints(
             id, candidate_id, draft_id, source_revision, blocks_json, content_hash, created_at
           ) VALUES(?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          checkpointId,
          candidate.candidateId,
          draft.draftId,
          currentRevision,
          JSON.stringify(beforeAudit),
          beforeHash,
          timestamp,
        );
      this.#faultInjector?.('after-checkpoint');

      persistBlocks(database, draft.draftId, before, target);
      database
        .prepare('UPDATE drafts SET revision = ?, updated_at = ? WHERE id = ?')
        .run(committedRevision, timestamp, draft.draftId);
      this.#faultInjector?.('after-draft-persist');
      const forward = draftOperations(before, target);
      const inverse = draftOperations(target, before);
      database
        .prepare(
          `INSERT INTO draft_patch_log(
             id, draft_id, request_id, base_revision, committed_revision,
             operations_json, before_blocks_json, after_blocks_json, created_at
           ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          this.#idFactory(),
          draft.draftId,
          requestId,
          currentRevision,
          committedRevision,
          JSON.stringify(forward),
          JSON.stringify(beforeAudit),
          JSON.stringify(afterAudit),
          timestamp,
        );
      database
        .prepare(
          `INSERT INTO candidate_apply_records(
             id, request_id, candidate_id, draft_id, checkpoint_id, base_revision,
             committed_revision, selection_json, operations_json, inverse_operations_json,
             applied_blocks_json, status, applied_at, undone_revision, undone_at
           ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'applied', ?, NULL, NULL)`,
        )
        .run(
          applyRecordId,
          requestId,
          candidate.candidateId,
          draft.draftId,
          checkpointId,
          currentRevision,
          committedRevision,
          JSON.stringify(input.selection),
          JSON.stringify(forward),
          JSON.stringify(inverse),
          JSON.stringify(afterAudit),
          timestamp,
        );
      database
        .prepare(
          `UPDATE candidates
              SET status = 'accepted', resolved_at = ?
            WHERE id = ? AND status = 'pending'`,
        )
        .run(timestamp, candidate.candidateId);
      this.#faultInjector?.('before-commit');

      const record = CandidateApplyRecordSchema.parse({
        applyRecordId,
        requestId,
        candidateId: candidate.candidateId,
        draftId: draft.draftId,
        checkpointId,
        baseRevision: currentRevision,
        committedRevision,
        selection: input.selection,
        status: 'applied',
        appliedAt: timestamp,
        undoneRevision: null,
        undoneAt: null,
      });
      const checkpoint = CandidateCheckpointSchema.parse({
        checkpointId,
        candidateId: candidate.candidateId,
        draftId: draft.draftId,
        sourceRevision: currentRevision,
        contentHash: beforeHash,
        createdAt: timestamp,
      });
      return CandidateApplyOutcomeSchema.parse({
        outcome: 'applied',
        record,
        checkpoint,
        draft: draftDocument(
          input.projectId,
          input.chapterId,
          { ...draft, revision: committedRevision },
          target,
        ),
      });
    });
  }

  previewUndo(raw: CandidateUndoPreviewInput): CandidateUndoPreview {
    const input = CandidateUndoPreviewInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (database) => {
      const { record, checkpointBlocks, checkpointSummary, appliedBlocks } = readApplyRecord(
        database,
        input.projectId,
        input.chapterId,
        input.applyRecordId,
      );
      const draft = activeDraft(database, input.projectId, input.chapterId, record.draftId);
      const current = readDraftBlocks(database, draft.draftId);
      const currentAudit = auditBlocks(current);
      const conflicts: CandidateConflictItem[] = [];
      if (record.status !== 'applied') {
        conflicts.push(
          candidateConflict('undo-stale', 'This Candidate application was already reverted.'),
        );
      }
      if (
        persistedNumber(draft.revision) !== record.committedRevision ||
        stable(currentAudit) !== stable(auditBlocks(appliedBlocks))
      ) {
        conflicts.push(
          candidateConflict('undo-stale', 'The Draft changed after Candidate application.', {
            logicalBlockId: null,
          }),
        );
      }
      const conflictSet =
        conflicts.length === 0
          ? null
          : CandidateConflictSetSchema.parse({
              conflictSetId: this.#idFactory(),
              candidateId: record.candidateId,
              draftId: record.draftId,
              applyRecordId: record.applyRecordId,
              phase: 'undo',
              attemptedRevision: record.committedRevision,
              currentRevision: persistedNumber(draft.revision),
              conflicts,
              createdAt: this.#clock.now().toISOString(),
              resolvedAt: null,
            });
      const restored = checkpointBlocks.map((block) => ({
        ...block,
        revision: persistedNumber(draft.revision) + 1,
      }));
      return CandidateUndoPreviewSchema.parse({
        record,
        checkpoint: checkpointSummary,
        currentDraft: draftDocument(input.projectId, input.chapterId, draft, current),
        restoredBlocks: restored.map(
          ({ recordId: _recordId, revision: _revision, ...block }) => block,
        ),
        canUndo: conflictSet === null,
        conflictSet,
      });
    });
  }

  findUndoRecord(raw: CandidateUndoLookupInput): CandidateUndoLookup {
    const input = CandidateUndoLookupInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (database) => {
      const row = database
        .prepare(
          `SELECT ar.id AS applyRecordId
             FROM candidate_apply_records ar
             JOIN candidates ca ON ca.id = ar.candidate_id
             JOIN chapters ch ON ch.id = ca.chapter_id
             JOIN volumes vo ON vo.id = ch.volume_id
            WHERE ar.candidate_id = ? AND ch.id = ? AND vo.project_id = ?
            ORDER BY ar.applied_at DESC, ar.id DESC
            LIMIT 1`,
        )
        .get(input.candidateId, input.chapterId, input.projectId) as
        { readonly applyRecordId: string } | undefined;
      if (!row) {
        throw new CandidateApplyServiceError(
          'CANDIDATE_APPLY_NOT_FOUND',
          'The Candidate has no persisted ApplyRecord.',
        );
      }
      return CandidateUndoLookupSchema.parse(row);
    });
  }

  undo(requestId: string, raw: CandidateUndoInput): Promise<CandidateUndoOutcome> {
    const input = CandidateUndoInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const timestamp = this.#clock.now().toISOString();
      const { record, checkpointBlocks, appliedBlocks, inverseOperations } = readApplyRecord(
        database,
        input.projectId,
        input.chapterId,
        input.applyRecordId,
      );
      const replay = database
        .prepare(
          `SELECT draft_id AS draftId, base_revision AS baseRevision,
                  committed_revision AS committedRevision, operations_json AS operationsJson,
                  before_blocks_json AS beforeBlocksJson, after_blocks_json AS afterBlocksJson
             FROM draft_patch_log WHERE request_id = ?`,
        )
        .get(requestId) as PatchReplayRow | undefined;
      if (replay) {
        const replayBaseRevision = persistedNumber(replay.baseRevision);
        const replayCommittedRevision = persistedNumber(replay.committedRevision);
        if (
          record.status !== 'undone' ||
          record.undoneRevision !== replayCommittedRevision ||
          replay.draftId !== record.draftId ||
          input.draftId !== record.draftId ||
          input.baseRevision !== replayBaseRevision ||
          replayBaseRevision !== record.committedRevision
        ) {
          throw new CandidateApplyServiceError(
            'CANDIDATE_APPLY_INVALID',
            'The requestId is already bound to a different Draft operation.',
          );
        }
        let replayOperations: DraftPatchOperation[];
        try {
          replayOperations = DraftPatchOperationSchema.array()
            .max(150_000)
            .parse(JSON.parse(replay.operationsJson));
        } catch (error) {
          throw new CandidateApplyServiceError(
            'CANDIDATE_APPLY_INVARIANT',
            'The persisted Candidate Undo operation log is invalid.',
            { cause: error },
          );
        }
        const replayBeforeBlocks = mutableFromSnapshot(replay.beforeBlocksJson, replayBaseRevision);
        const replayBlocks = mutableFromSnapshot(replay.afterBlocksJson, replayCommittedRevision);
        const expectedBeforeBlocks = appliedBlocks.map((block) => ({
          ...block,
          revision: replayBaseRevision,
        }));
        const expectedBlocks = checkpointBlocks.map((block) => ({
          ...block,
          revision: replayCommittedRevision,
        }));
        if (
          stable(replayOperations) !== stable(inverseOperations) ||
          stable(auditBlocks(replayBeforeBlocks)) !== stable(auditBlocks(expectedBeforeBlocks)) ||
          stable(auditBlocks(replayBlocks)) !== stable(auditBlocks(expectedBlocks))
        ) {
          throw new CandidateApplyServiceError(
            'CANDIDATE_APPLY_INVARIANT',
            'The persisted Candidate Undo replay does not match its Checkpoint.',
          );
        }
        return CandidateUndoOutcomeSchema.parse({
          outcome: 'undone',
          record,
          draft: draftDocument(
            input.projectId,
            input.chapterId,
            { draftId: record.draftId, revision: replayCommittedRevision, status: 'active' },
            replayBlocks,
          ),
        });
      }
      const draft = activeDraft(database, input.projectId, input.chapterId, input.draftId);
      const currentRevision = persistedNumber(draft.revision);
      const before = readDraftBlocks(database, draft.draftId);
      const conflicts: CandidateConflictItem[] = [];
      if (record.status !== 'applied') {
        conflicts.push(
          candidateConflict('undo-stale', 'This Candidate application was already reverted.'),
        );
      }
      if (
        input.baseRevision !== currentRevision ||
        currentRevision !== record.committedRevision ||
        stable(auditBlocks(before)) !== stable(auditBlocks(appliedBlocks))
      ) {
        conflicts.push(
          candidateConflict('undo-stale', 'The Draft changed after Candidate application.'),
        );
      }
      if (conflicts.length > 0) {
        return CandidateUndoOutcomeSchema.parse({
          outcome: 'conflict',
          conflictSet: persistConflictSet(database, this.#idFactory, timestamp, {
            candidateId: record.candidateId,
            draftId: record.draftId,
            applyRecordId: record.applyRecordId,
            phase: 'undo',
            attemptedRevision: input.baseRevision,
            currentRevision,
            conflicts,
          }),
        });
      }

      const committedRevision = currentRevision + 1;
      const restored = checkpointBlocks.map((block) => ({ ...block, revision: committedRevision }));
      persistBlocks(database, draft.draftId, before, restored);
      database
        .prepare('UPDATE drafts SET revision = ?, updated_at = ? WHERE id = ?')
        .run(committedRevision, timestamp, draft.draftId);
      database
        .prepare(
          `INSERT INTO draft_patch_log(
             id, draft_id, request_id, base_revision, committed_revision,
             operations_json, before_blocks_json, after_blocks_json, created_at
           ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          this.#idFactory(),
          draft.draftId,
          requestId,
          currentRevision,
          committedRevision,
          JSON.stringify(inverseOperations),
          JSON.stringify(auditBlocks(before)),
          JSON.stringify(auditBlocks(restored)),
          timestamp,
        );
      database
        .prepare(
          `UPDATE candidate_apply_records
              SET status = 'undone', undone_revision = ?, undone_at = ?
            WHERE id = ? AND status = 'applied'`,
        )
        .run(committedRevision, timestamp, record.applyRecordId);
      return CandidateUndoOutcomeSchema.parse({
        outcome: 'undone',
        record: {
          ...record,
          status: 'undone',
          undoneRevision: committedRevision,
          undoneAt: timestamp,
        },
        draft: draftDocument(
          input.projectId,
          input.chapterId,
          { ...draft, revision: committedRevision },
          restored,
        ),
      });
    });
  }
}
