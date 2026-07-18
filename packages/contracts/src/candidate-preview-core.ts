import { z } from 'zod';

import {
  CANDIDATE_APPLY_COMMANDS,
  CandidateApplyInputSchema,
  CandidateApplyOutcomeSchema,
  CandidatePreviewInputSchema,
  CandidatePreviewSchema,
  CandidateUndoInputSchema,
  CandidateUndoOutcomeSchema,
  CandidateUndoPreviewInputSchema,
  CandidateUndoPreviewSchema,
} from './candidate-apply.js';
import { DraftEntityIdSchema } from './draft.js';
import { ErrorCodeSchema } from './error-codes.js';
import { ProjectIdSchema, TASK_PROTOCOL_VERSION } from './task-protocol.js';

export const CANDIDATE_UNDO_LOOKUP_COMMAND = 'candidate.findUndoRecord' as const;
export const CANDIDATE_UNDO_LOOKUP_CHANNEL = 'worldforge:candidate:find-undo-record' as const;

export const CandidateUndoLookupInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: DraftEntityIdSchema,
  candidateId: DraftEntityIdSchema,
});
export const CandidateUndoLookupSchema = z.strictObject({
  applyRecordId: DraftEntityIdSchema,
});
export const CandidateUndoLookupCommandSchema = z.strictObject({
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  requestId: z.uuid(),
  sentAt: z.iso.datetime(),
  command: z.literal(CANDIDATE_UNDO_LOOKUP_COMMAND),
  payload: CandidateUndoLookupInputSchema,
});
const lookupFailureSchema = z.strictObject({
  ok: z.literal(false),
  requestId: z.uuid(),
  error: z.strictObject({
    code: ErrorCodeSchema,
    message: z.string().min(1).max(512),
    retryable: z.boolean(),
  }),
});
export const CandidateUndoLookupResultSchema = z.union([
  z.strictObject({
    ok: z.literal(true),
    requestId: z.uuid(),
    data: CandidateUndoLookupSchema,
  }),
  lookupFailureSchema,
]);

export const CoreCandidatePreviewOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal(CANDIDATE_APPLY_COMMANDS.previewCandidate),
    input: CandidatePreviewInputSchema,
  }),
  z.strictObject({
    operation: z.literal(CANDIDATE_APPLY_COMMANDS.applyCandidate),
    input: CandidateApplyInputSchema,
  }),
  z.strictObject({
    operation: z.literal(CANDIDATE_APPLY_COMMANDS.previewUndo),
    input: CandidateUndoPreviewInputSchema,
  }),
  z.strictObject({
    operation: z.literal(CANDIDATE_APPLY_COMMANDS.undoApply),
    input: CandidateUndoInputSchema,
  }),
  z.strictObject({
    operation: z.literal(CANDIDATE_UNDO_LOOKUP_COMMAND),
    input: CandidateUndoLookupInputSchema,
  }),
]);

export const CoreCandidatePreviewResultSchema = z.union([
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(CANDIDATE_APPLY_COMMANDS.previewCandidate),
    data: CandidatePreviewSchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(CANDIDATE_APPLY_COMMANDS.applyCandidate),
    data: CandidateApplyOutcomeSchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(CANDIDATE_APPLY_COMMANDS.previewUndo),
    data: CandidateUndoPreviewSchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(CANDIDATE_APPLY_COMMANDS.undoApply),
    data: CandidateUndoOutcomeSchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(CANDIDATE_UNDO_LOOKUP_COMMAND),
    data: CandidateUndoLookupSchema,
  }),
  z.strictObject({
    ok: z.literal(false),
    operation: z.enum([
      CANDIDATE_APPLY_COMMANDS.previewCandidate,
      CANDIDATE_APPLY_COMMANDS.applyCandidate,
      CANDIDATE_APPLY_COMMANDS.previewUndo,
      CANDIDATE_APPLY_COMMANDS.undoApply,
      CANDIDATE_UNDO_LOOKUP_COMMAND,
    ]),
    errorCode: ErrorCodeSchema,
  }),
]);

export type CandidateUndoLookupInput = z.infer<typeof CandidateUndoLookupInputSchema>;
export type CandidateUndoLookup = z.infer<typeof CandidateUndoLookupSchema>;
export type CoreCandidatePreviewOperation = z.infer<typeof CoreCandidatePreviewOperationSchema>;
export type CoreCandidatePreviewResult = z.infer<typeof CoreCandidatePreviewResultSchema>;
