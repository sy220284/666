import { randomUUID } from 'node:crypto';

import {
  CandidateApplyInputSchema,
  CandidateApplyOutcomeSchema,
  CandidateApplyRecordSchema,
  CandidateCheckpointSchema,
  CandidateConflictSetSchema,
  CandidatePreviewInputSchema,
  CandidateUndoInputSchema,
  CandidateUndoOutcomeSchema,
  CandidateUndoPreviewInputSchema,
  CandidateUndoPreviewSchema,
  type CandidateApplyInput,
  type CandidateApplyOutcome,
  type CandidateConflictItem,
  type CandidatePreview,
  type CandidatePreviewInput,
  type CandidateUndoInput,
  type CandidateUndoOutcome,
  type CandidateUndoPreview,
} from '@worldforge/contracts';

import type { DatabaseClock } from './database/index.js';
import type { ProjectWorkspaceService } from './project-workspace.js';
import {
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
  buildCandidateTarget,
  candidateConflict,
  collectApplyConflicts,
} from './candidate-apply-plan.js';

const systemClock: DatabaseClock = { now: () => new Date() };

export class CandidateApplyService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;
  readonly #faultInjector:
    ((stage: 'after-checkpoint' | 'after-draft-persist') => void) | undefined;

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

  apply(requestId: string, raw: CandidateApplyInput): Promise<CandidateApplyOutcome> {
    const input = CandidateApplyInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
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
      this.#faultInjector?.('after-draft-persist');

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
      const { row, record, checkpoint, checkpointSummary } = readApplyRecord(
        database,
        input.projectId,
        input.chapterId,
        input.applyRecordId,
      );
      const draft = activeDraft(database, input.projectId, input.chapterId, record.draftId);
      const current = readDraftBlocks(database, draft.draftId);
      const currentAudit = auditBlocks(current);
      const expectedApplied = JSON.parse(row.appliedBlocksJson) as unknown;
      const conflicts: CandidateConflictItem[] = [];
      if (record.status !== 'applied') {
        conflicts.push(
          candidateConflict('undo-stale', 'This Candidate application was already reverted.'),
        );
      }
      if (
        persistedNumber(draft.revision) !== record.committedRevision ||
        stable(currentAudit) !== stable(expectedApplied)
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
      const restored = mutableFromSnapshot(
        checkpoint.blocksJson,
        persistedNumber(draft.revision) + 1,
      );
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

  undo(requestId: string, raw: CandidateUndoInput): Promise<CandidateUndoOutcome> {
    const input = CandidateUndoInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const timestamp = this.#clock.now().toISOString();
      const { row, record, checkpoint } = readApplyRecord(
        database,
        input.projectId,
        input.chapterId,
        input.applyRecordId,
      );
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
        stable(auditBlocks(before)) !== stable(JSON.parse(row.appliedBlocksJson))
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
      const restored = mutableFromSnapshot(checkpoint.blocksJson, committedRevision);
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
          row.inverseOperationsJson,
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
