import { z } from 'zod';

import {
  CandidateCombinedOperationSchema,
  CandidateCombinedResultSchema,
} from './candidate-combined.js';
import {
  DraftBlockAttributesSchema,
  DraftBlockTextSchema,
  DraftBlockTypeSchema,
  DraftContentHashValueSchema,
  DraftEntityIdSchema,
  DraftOrderKeySchema,
} from './draft.js';
import { ErrorCodeSchema } from './error-codes.js';
import { ProjectIdSchema, TASK_PROTOCOL_VERSION } from './task-protocol.js';

export const CANDIDATE_IPC_CHANNELS = {
  createFixtureCandidate: 'worldforge:candidate:create-fixture',
  listCandidates: 'worldforge:candidate:list',
  getCandidate: 'worldforge:candidate:get',
  discardCandidate: 'worldforge:candidate:discard',
} as const;

export const CANDIDATE_COMMANDS = {
  createFixtureCandidate: 'candidate.createFixture',
  listCandidates: 'candidate.list',
  getCandidate: 'candidate.get',
  discardCandidate: 'candidate.discard',
} as const;

export const CandidateTypeSchema = z.enum(['skeleton', 'full', 'rewrite', 'merge']);
export const CandidateCompletenessSchema = z.enum(['complete', 'partial']);
export const CandidateStatusSchema = z.enum(['pending', 'accepted', 'discarded']);
export const CandidateTitleSchema = z.string().trim().min(1).max(240);

function validateCandidateBlock(
  block: {
    readonly blockType: z.infer<typeof DraftBlockTypeSchema>;
    readonly text: string;
    readonly attributes: z.infer<typeof DraftBlockAttributesSchema>;
  },
  context: z.core.$RefinementCtx,
): void {
  if (block.blockType === 'separator' && block.text !== '') {
    context.addIssue({ code: 'custom', message: 'Separator CandidateBlocks cannot contain text.' });
  }
  if (block.blockType !== 'heading' && block.attributes.headingLevel !== undefined) {
    context.addIssue({
      code: 'custom',
      message: 'Only heading CandidateBlocks can declare headingLevel.',
    });
  }
}

export const CandidateBlockInputSchema = z
  .strictObject({
    logicalBlockId: DraftEntityIdSchema.nullable().optional(),
    sourceLogicalBlockIds: z.array(DraftEntityIdSchema).max(50_000).optional(),
    blockType: DraftBlockTypeSchema,
    text: DraftBlockTextSchema,
    attributes: DraftBlockAttributesSchema.default({}),
    beatId: DraftEntityIdSchema.nullable().optional(),
    sourceBlockHash: DraftContentHashValueSchema.nullable().optional(),
  })
  .superRefine(validateCandidateBlock);

export const CandidateBlockSchema = z
  .strictObject({
    candidateBlockId: DraftEntityIdSchema,
    logicalBlockId: DraftEntityIdSchema,
    sourceLogicalBlockIds: z.array(DraftEntityIdSchema).max(50_000).default([]),
    orderKey: DraftOrderKeySchema,
    blockType: DraftBlockTypeSchema,
    text: DraftBlockTextSchema,
    attributes: DraftBlockAttributesSchema,
    beatId: DraftEntityIdSchema.nullable(),
    sourceBlockHash: DraftContentHashValueSchema.nullable(),
    contentHash: DraftContentHashValueSchema,
  })
  .superRefine(validateCandidateBlock);

export const CandidateSummarySchema = z.strictObject({
  candidateId: DraftEntityIdSchema,
  projectId: ProjectIdSchema,
  chapterId: DraftEntityIdSchema,
  generationRunId: DraftEntityIdSchema.nullable(),
  candidateType: CandidateTypeSchema,
  baseDraftId: DraftEntityIdSchema,
  baseDraftRevision: z.number().int().nonnegative(),
  completeness: CandidateCompletenessSchema,
  status: CandidateStatusSchema,
  title: CandidateTitleSchema,
  sourceVersionId: DraftEntityIdSchema.nullable(),
  contentHash: DraftContentHashValueSchema,
  blockCount: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable(),
});

export const CandidateDocumentSchema = CandidateSummarySchema.extend({
  blocks: z.array(CandidateBlockSchema).min(1).max(50_000),
}).strict();

export const CandidateListSchema = z.strictObject({
  candidates: z.array(CandidateSummarySchema),
});

export const CandidateChapterInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: DraftEntityIdSchema,
});

export const CandidateCreateFixtureInputSchema = CandidateChapterInputSchema.extend({
  draftId: DraftEntityIdSchema,
  baseDraftRevision: z.number().int().nonnegative(),
  candidateType: CandidateTypeSchema,
  completeness: CandidateCompletenessSchema,
  title: CandidateTitleSchema,
  sourceVersionId: DraftEntityIdSchema.nullable().optional(),
  blocks: z.array(CandidateBlockInputSchema).min(1).max(50_000),
}).strict();

export const CandidateGetInputSchema = CandidateChapterInputSchema.extend({
  candidateId: DraftEntityIdSchema,
}).strict();

export const CandidateDiscardInputSchema = CandidateGetInputSchema;

const commandEnvelope = {
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  requestId: z.uuid(),
  sentAt: z.iso.datetime(),
};

export const CandidateCreateFixtureCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(CANDIDATE_COMMANDS.createFixtureCandidate),
  payload: CandidateCreateFixtureInputSchema,
});

export const CandidateListCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(CANDIDATE_COMMANDS.listCandidates),
  payload: CandidateChapterInputSchema,
});

export const CandidateGetCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(CANDIDATE_COMMANDS.getCandidate),
  payload: CandidateGetInputSchema,
});

export const CandidateDiscardCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(CANDIDATE_COMMANDS.discardCandidate),
  payload: CandidateDiscardInputSchema,
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

export const CandidateDocumentResultSchema = resultSchema(CandidateDocumentSchema);
export const CandidateListResultSchema = resultSchema(CandidateListSchema);
export const CandidateSummaryResultSchema = resultSchema(CandidateSummarySchema);

const CoreCandidateBaseOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal(CANDIDATE_COMMANDS.createFixtureCandidate),
    input: CandidateCreateFixtureInputSchema,
  }),
  z.strictObject({
    operation: z.literal(CANDIDATE_COMMANDS.listCandidates),
    input: CandidateChapterInputSchema,
  }),
  z.strictObject({
    operation: z.literal(CANDIDATE_COMMANDS.getCandidate),
    input: CandidateGetInputSchema,
  }),
  z.strictObject({
    operation: z.literal(CANDIDATE_COMMANDS.discardCandidate),
    input: CandidateDiscardInputSchema,
  }),
]);

const CoreCandidateBaseResultSchema = z.union([
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(CANDIDATE_COMMANDS.createFixtureCandidate),
    data: CandidateDocumentSchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(CANDIDATE_COMMANDS.listCandidates),
    data: CandidateListSchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(CANDIDATE_COMMANDS.getCandidate),
    data: CandidateDocumentSchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(CANDIDATE_COMMANDS.discardCandidate),
    data: CandidateSummarySchema,
  }),
  z.strictObject({
    ok: z.literal(false),
    operation: z.enum(CANDIDATE_COMMANDS),
    errorCode: ErrorCodeSchema,
  }),
]);

void CoreCandidateBaseOperationSchema;
void CoreCandidateBaseResultSchema;

export const CoreCandidateOperationSchema = CandidateCombinedOperationSchema;
export const CoreCandidateResultSchema = CandidateCombinedResultSchema;

export type CandidateType = z.infer<typeof CandidateTypeSchema>;
export type CandidateCompleteness = z.infer<typeof CandidateCompletenessSchema>;
export type CandidateStatus = z.infer<typeof CandidateStatusSchema>;
export type CandidateBlockInput = z.infer<typeof CandidateBlockInputSchema>;
export type CandidateBlock = z.infer<typeof CandidateBlockSchema>;
export type CandidateSummary = z.infer<typeof CandidateSummarySchema>;
export type CandidateDocument = z.infer<typeof CandidateDocumentSchema>;
export type CandidateList = z.infer<typeof CandidateListSchema>;
export type CandidateChapterInput = z.infer<typeof CandidateChapterInputSchema>;
export type CandidateCreateFixtureInput = z.infer<typeof CandidateCreateFixtureInputSchema>;
export type CandidateGetInput = z.infer<typeof CandidateGetInputSchema>;
export type CandidateDiscardInput = z.infer<typeof CandidateDiscardInputSchema>;
export type CoreCandidateOperation = z.infer<typeof CoreCandidateOperationSchema>;
export type CoreCandidateResult = z.infer<typeof CoreCandidateResultSchema>;
