import { z } from 'zod';

import {
  CandidateBlockSchema,
  CandidateCompletenessSchema,
  CandidateDocumentSchema,
  CandidateStatusSchema,
} from './candidate-base.js';
import {
  DraftBlockAttributesSchema,
  DraftBlockSchema,
  DraftBlockTypeSchema,
  DraftContentHashValueSchema,
  DraftDocumentSchema,
  DraftEntityIdSchema,
} from './draft.js';
import { ErrorCodeSchema } from './error-codes.js';
import { ProjectIdSchema, TASK_PROTOCOL_VERSION } from './task-protocol.js';

export const CANDIDATE_APPLY_IPC_CHANNELS = {
  previewCandidate: 'worldforge:candidate:preview',
  applyCandidate: 'worldforge:candidate:apply',
  previewUndo: 'worldforge:candidate:preview-undo',
  undoApply: 'worldforge:candidate:undo-apply',
} as const;

export const CANDIDATE_APPLY_COMMANDS = {
  previewCandidate: 'candidate.preview',
  applyCandidate: 'candidate.apply',
  previewUndo: 'candidate.previewUndo',
  undoApply: 'candidate.undoApply',
} as const;

export const CandidateDiffKindSchema = z.enum([
  'unchanged',
  'modified',
  'moved',
  'added',
  'deleted',
  'split',
  'merged',
]);
export const CandidateDiffExecutionStrategySchema = z.enum([
  'main-thread',
  'cooperative-slices',
  'worker',
]);
export const CharacterDiffSegmentSchema = z.strictObject({
  type: z.enum(['equal', 'insert', 'delete']),
  text: z.string(),
});
export const CandidateCharacterDiffSchema = z.strictObject({
  key: z.string().min(1).max(512),
  before: z.string(),
  after: z.string(),
  segments: z.array(CharacterDiffSegmentSchema),
  coarse: z.boolean(),
});
export const CandidateStructureDiffSchema = z.strictObject({
  kind: CandidateDiffKindSchema,
  logicalBlockId: DraftEntityIdSchema.nullable(),
  candidateBlockIds: z.array(DraftEntityIdSchema).max(50_000),
  sourceLogicalBlockIds: z.array(DraftEntityIdSchema).max(50_000),
  currentIndexes: z.array(z.number().int().nonnegative()).max(50_000),
  candidateIndexes: z.array(z.number().int().nonnegative()).max(50_000),
  contentChanged: z.boolean(),
});
export const CandidateDiffExecutionSchema = z.strictObject({
  strategy: CandidateDiffExecutionStrategySchema,
  chapterCharacters: z.number().int().nonnegative(),
  continuousBlockingBudgetMilliseconds: z.literal(100),
  rationale: z.string().min(1).max(512),
});
export const CandidatePreviewSchema = z.strictObject({
  candidate: CandidateDocumentSchema,
  draft: DraftDocumentSchema,
  structure: z.array(CandidateStructureDiffSchema).max(100_000),
  characterDiffs: z.array(CandidateCharacterDiffSchema).max(50_000),
  execution: CandidateDiffExecutionSchema,
});

export const CandidateSelectionSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('all') }),
  z.strictObject({
    mode: z.literal('blocks'),
    candidateBlockIds: z.array(DraftEntityIdSchema).min(1).max(50_000),
    deleteLogicalBlockIds: z.array(DraftEntityIdSchema).max(50_000).default([]),
  }),
  z.strictObject({
    mode: z.literal('scene-beats'),
    beatIds: z.array(DraftEntityIdSchema).min(1).max(50_000),
    deleteLogicalBlockIds: z.array(DraftEntityIdSchema).max(50_000).default([]),
  }),
]);

export const CandidateConflictKindSchema = z.enum([
  'project',
  'candidate-status',
  'partial-restricted',
  'revision',
  'hash',
  'locked',
  'missing-block',
  'structure',
  'duplicate-apply',
  'undo-stale',
]);
export const CandidateConflictItemSchema = z.strictObject({
  kind: CandidateConflictKindSchema,
  logicalBlockId: DraftEntityIdSchema.nullable(),
  candidateBlockId: DraftEntityIdSchema.nullable(),
  expectedHash: DraftContentHashValueSchema.nullable(),
  actualHash: DraftContentHashValueSchema.nullable(),
  message: z.string().min(1).max(512),
});
export const CandidateConflictSetSchema = z.strictObject({
  conflictSetId: DraftEntityIdSchema,
  candidateId: DraftEntityIdSchema,
  draftId: DraftEntityIdSchema,
  applyRecordId: DraftEntityIdSchema.nullable(),
  phase: z.enum(['apply', 'undo']),
  attemptedRevision: z.number().int().nonnegative(),
  currentRevision: z.number().int().nonnegative(),
  conflicts: z.array(CandidateConflictItemSchema).min(1).max(50_000),
  createdAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable(),
});

export const CandidateCheckpointSchema = z.strictObject({
  checkpointId: DraftEntityIdSchema,
  candidateId: DraftEntityIdSchema,
  draftId: DraftEntityIdSchema,
  sourceRevision: z.number().int().nonnegative(),
  contentHash: DraftContentHashValueSchema,
  createdAt: z.iso.datetime(),
});
export const CandidateApplyRecordSchema = z.strictObject({
  applyRecordId: DraftEntityIdSchema,
  requestId: DraftEntityIdSchema,
  candidateId: DraftEntityIdSchema,
  draftId: DraftEntityIdSchema,
  checkpointId: DraftEntityIdSchema,
  baseRevision: z.number().int().nonnegative(),
  committedRevision: z.number().int().nonnegative(),
  selection: CandidateSelectionSchema,
  status: z.enum(['applied', 'undone']),
  appliedAt: z.iso.datetime(),
  undoneRevision: z.number().int().nonnegative().nullable(),
  undoneAt: z.iso.datetime().nullable(),
});

export const CandidatePreviewInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: DraftEntityIdSchema,
  candidateId: DraftEntityIdSchema,
});
export const CandidateApplyInputSchema = CandidatePreviewInputSchema.extend({
  draftId: DraftEntityIdSchema,
  baseRevision: z.number().int().nonnegative(),
  selection: CandidateSelectionSchema,
}).strict();
export const CandidateUndoPreviewInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: DraftEntityIdSchema,
  applyRecordId: DraftEntityIdSchema,
});
export const CandidateUndoInputSchema = CandidateUndoPreviewInputSchema.extend({
  draftId: DraftEntityIdSchema,
  baseRevision: z.number().int().nonnegative(),
}).strict();

export const CandidateApplySuccessSchema = z.strictObject({
  outcome: z.literal('applied'),
  record: CandidateApplyRecordSchema,
  checkpoint: CandidateCheckpointSchema,
  draft: DraftDocumentSchema,
});
export const CandidateApplyConflictSchema = z.strictObject({
  outcome: z.literal('conflict'),
  conflictSet: CandidateConflictSetSchema,
});
export const CandidateApplyOutcomeSchema = z.discriminatedUnion('outcome', [
  CandidateApplySuccessSchema,
  CandidateApplyConflictSchema,
]);
export const CandidateUndoPreviewSchema = z.strictObject({
  record: CandidateApplyRecordSchema,
  checkpoint: CandidateCheckpointSchema,
  currentDraft: DraftDocumentSchema,
  restoredBlocks: z.array(DraftBlockSchema).min(1).max(50_000),
  canUndo: z.boolean(),
  conflictSet: CandidateConflictSetSchema.nullable(),
});
export const CandidateUndoSuccessSchema = z.strictObject({
  outcome: z.literal('undone'),
  record: CandidateApplyRecordSchema,
  draft: DraftDocumentSchema,
});
export const CandidateUndoOutcomeSchema = z.discriminatedUnion('outcome', [
  CandidateUndoSuccessSchema,
  CandidateApplyConflictSchema,
]);

const commandEnvelope = {
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  requestId: z.uuid(),
  sentAt: z.iso.datetime(),
};
export const CandidatePreviewCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(CANDIDATE_APPLY_COMMANDS.previewCandidate),
  payload: CandidatePreviewInputSchema,
});
export const CandidateApplyCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(CANDIDATE_APPLY_COMMANDS.applyCandidate),
  payload: CandidateApplyInputSchema,
});
export const CandidateUndoPreviewCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(CANDIDATE_APPLY_COMMANDS.previewUndo),
  payload: CandidateUndoPreviewInputSchema,
});
export const CandidateUndoCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(CANDIDATE_APPLY_COMMANDS.undoApply),
  payload: CandidateUndoInputSchema,
});

const failureSchema = z.strictObject({
  ok: z.literal(false),
  requestId: z.uuid(),
  error: z.strictObject({
    code: ErrorCodeSchema,
    message: z.string().min(1).max(512),
    retryable: z.boolean(),
    userAction: z.string().min(1).max(512).optional(),
    diagnosticId: z.string().min(1).max(128).optional(),
  }),
});
const resultSchema = <Schema extends z.ZodType>(schema: Schema) =>
  z.union([
    z.strictObject({ ok: z.literal(true), requestId: z.uuid(), data: schema }),
    failureSchema,
  ]);
export const CandidatePreviewResultSchema = resultSchema(CandidatePreviewSchema);
export const CandidateApplyResultSchema = resultSchema(CandidateApplyOutcomeSchema);
export const CandidateUndoPreviewResultSchema = resultSchema(CandidateUndoPreviewSchema);
export const CandidateUndoResultSchema = resultSchema(CandidateUndoOutcomeSchema);

export const CoreCandidateApplyOperationSchema = z.discriminatedUnion('operation', [
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
]);
const coreSuccess = <Operation extends string, Schema extends z.ZodType>(
  operation: Operation,
  data: Schema,
) =>
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(operation),
    data,
  });
export const CoreCandidateApplyResultSchema = z.union([
  coreSuccess(CANDIDATE_APPLY_COMMANDS.previewCandidate, CandidatePreviewSchema),
  coreSuccess(CANDIDATE_APPLY_COMMANDS.applyCandidate, CandidateApplyOutcomeSchema),
  coreSuccess(CANDIDATE_APPLY_COMMANDS.previewUndo, CandidateUndoPreviewSchema),
  coreSuccess(CANDIDATE_APPLY_COMMANDS.undoApply, CandidateUndoOutcomeSchema),
  z.strictObject({
    ok: z.literal(false),
    operation: z.enum(CANDIDATE_APPLY_COMMANDS),
    errorCode: ErrorCodeSchema,
  }),
]);

export type CandidateDiffKind = z.infer<typeof CandidateDiffKindSchema>;
export type CandidateStructureDiff = z.infer<typeof CandidateStructureDiffSchema>;
export type CandidateCharacterDiff = z.infer<typeof CandidateCharacterDiffSchema>;
export type CandidatePreview = z.infer<typeof CandidatePreviewSchema>;
export type CandidateSelection = z.infer<typeof CandidateSelectionSchema>;
export type CandidateConflictItem = z.infer<typeof CandidateConflictItemSchema>;
export type CandidateConflictSet = z.infer<typeof CandidateConflictSetSchema>;
export type CandidateCheckpoint = z.infer<typeof CandidateCheckpointSchema>;
export type CandidateApplyRecord = z.infer<typeof CandidateApplyRecordSchema>;
export type CandidatePreviewInput = z.infer<typeof CandidatePreviewInputSchema>;
export type CandidateApplyInput = z.infer<typeof CandidateApplyInputSchema>;
export type CandidateUndoPreviewInput = z.infer<typeof CandidateUndoPreviewInputSchema>;
export type CandidateUndoInput = z.infer<typeof CandidateUndoInputSchema>;
export type CandidateApplyOutcome = z.infer<typeof CandidateApplyOutcomeSchema>;
export type CandidateUndoPreview = z.infer<typeof CandidateUndoPreviewSchema>;
export type CandidateUndoOutcome = z.infer<typeof CandidateUndoOutcomeSchema>;
export type CoreCandidateApplyOperation = z.infer<typeof CoreCandidateApplyOperationSchema>;
export type CoreCandidateApplyResult = z.infer<typeof CoreCandidateApplyResultSchema>;

export const CandidateApplyInvariantSchema = z.strictObject({
  candidateStatus: CandidateStatusSchema,
  completeness: CandidateCompletenessSchema,
  candidateBlocks: z.array(CandidateBlockSchema).min(1),
  draftBlockTypes: z.array(DraftBlockTypeSchema),
  draftAttributes: z.array(DraftBlockAttributesSchema),
});
