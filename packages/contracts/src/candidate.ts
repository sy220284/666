import { z } from 'zod';

import { SkeletonCandidateOutputSchema } from './ai-output-protocol.js';
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
  editSkeleton: 'worldforge:candidate:edit-skeleton',
} as const;

export const CANDIDATE_COMMANDS = {
  createFixtureCandidate: 'candidate.createFixture',
  listCandidates: 'candidate.list',
  getCandidate: 'candidate.get',
  discardCandidate: 'candidate.discard',
  editSkeleton: 'candidate.editSkeleton',
} as const;

export const CandidateTypeSchema = z.enum(['skeleton', 'full', 'rewrite', 'merge']);
export const ProseCandidateTypeSchema = z.enum(['full', 'rewrite', 'merge']);
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

const CandidateSummaryBaseSchema = z.strictObject({
  candidateId: DraftEntityIdSchema,
  projectId: ProjectIdSchema,
  chapterId: DraftEntityIdSchema,
  generationRunId: DraftEntityIdSchema.nullable(),
  baseDraftId: DraftEntityIdSchema,
  baseDraftRevision: z.number().int().nonnegative(),
  completeness: CandidateCompletenessSchema,
  status: CandidateStatusSchema,
  title: CandidateTitleSchema,
  sourceVersionId: DraftEntityIdSchema.nullable(),
  contentHash: DraftContentHashValueSchema,
  createdAt: z.iso.datetime(),
  resolvedAt: z.iso.datetime().nullable(),
});

export const ProseCandidateSummarySchema = CandidateSummaryBaseSchema.extend({
  candidateType: ProseCandidateTypeSchema,
  blockCount: z.number().int().positive(),
}).strict();

export const SkeletonSourceStateSchema = z.enum(['current', 'stale']);
export const SkeletonRevisionEditorSchema = z.enum(['ai', 'author']);
export const SkeletonCandidateSummarySchema = CandidateSummaryBaseSchema.extend({
  candidateType: z.literal('skeleton'),
  blockCount: z.literal(0),
  skeletonRevisionId: DraftEntityIdSchema,
  skeletonRevision: z.number().int().positive(),
  payloadSchemaVersion: z.number().int().positive(),
  payloadHash: DraftContentHashValueSchema,
  sourceState: SkeletonSourceStateSchema,
  parentSkeletonRevisionId: DraftEntityIdSchema.nullable(),
  editedBy: SkeletonRevisionEditorSchema,
}).strict();

export const CandidateSummarySchema = z.discriminatedUnion('candidateType', [
  ProseCandidateSummarySchema,
  SkeletonCandidateSummarySchema,
]);

export const ProseCandidateDocumentSchema = ProseCandidateSummarySchema.extend({
  blocks: z.array(CandidateBlockSchema).min(1).max(50_000),
}).strict();

export const SkeletonCandidateDocumentSchema = SkeletonCandidateSummarySchema.extend({
  structuredPayload: SkeletonCandidateOutputSchema,
}).strict();

export const CandidateDocumentSchema = z.discriminatedUnion('candidateType', [
  ProseCandidateDocumentSchema,
  SkeletonCandidateDocumentSchema,
]);

export const CandidateListSchema = z.strictObject({
  candidates: z.array(CandidateSummarySchema),
});

export const CandidateListInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: DraftEntityIdSchema.optional(),
});

export const CandidateChapterInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: DraftEntityIdSchema,
});

export const CandidateCreateFixtureInputSchema = CandidateChapterInputSchema.extend({
  draftId: DraftEntityIdSchema,
  baseDraftRevision: z.number().int().nonnegative(),
  candidateType: ProseCandidateTypeSchema,
  completeness: CandidateCompletenessSchema,
  title: CandidateTitleSchema,
  sourceVersionId: DraftEntityIdSchema.nullable().optional(),
  blocks: z.array(CandidateBlockInputSchema).min(1).max(50_000),
}).strict();

export const CandidateGetInputSchema = CandidateChapterInputSchema.extend({
  candidateId: DraftEntityIdSchema,
}).strict();

export const CandidateDiscardInputSchema = CandidateGetInputSchema;
export const CandidateEditSkeletonInputSchema = CandidateGetInputSchema.extend({
  expectedSkeletonRevisionId: DraftEntityIdSchema,
  structuredPayload: SkeletonCandidateOutputSchema,
}).strict();

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
  payload: CandidateListInputSchema,
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

export const CandidateEditSkeletonCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(CANDIDATE_COMMANDS.editSkeleton),
  payload: CandidateEditSkeletonInputSchema,
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

export const CoreCandidateOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal(CANDIDATE_COMMANDS.createFixtureCandidate),
    input: CandidateCreateFixtureInputSchema,
  }),
  z.strictObject({
    operation: z.literal(CANDIDATE_COMMANDS.listCandidates),
    input: CandidateListInputSchema,
  }),
  z.strictObject({
    operation: z.literal(CANDIDATE_COMMANDS.getCandidate),
    input: CandidateGetInputSchema,
  }),
  z.strictObject({
    operation: z.literal(CANDIDATE_COMMANDS.discardCandidate),
    input: CandidateDiscardInputSchema,
  }),
  z.strictObject({
    operation: z.literal(CANDIDATE_COMMANDS.editSkeleton),
    input: CandidateEditSkeletonInputSchema,
  }),
]);

export const CoreCandidateResultSchema = z.union([
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
    ok: z.literal(true),
    operation: z.literal(CANDIDATE_COMMANDS.editSkeleton),
    data: SkeletonCandidateDocumentSchema,
  }),
  z.strictObject({
    ok: z.literal(false),
    operation: z.enum(CANDIDATE_COMMANDS),
    errorCode: ErrorCodeSchema,
  }),
]);

export type CandidateType = z.infer<typeof CandidateTypeSchema>;
export type ProseCandidateType = z.infer<typeof ProseCandidateTypeSchema>;
export type CandidateCompleteness = z.infer<typeof CandidateCompletenessSchema>;
export type CandidateStatus = z.infer<typeof CandidateStatusSchema>;
export type CandidateBlockInput = z.infer<typeof CandidateBlockInputSchema>;
export type CandidateBlock = z.infer<typeof CandidateBlockSchema>;
export type CandidateSummary = z.infer<typeof CandidateSummarySchema>;
export type CandidateDocument = z.infer<typeof CandidateDocumentSchema>;
export type ProseCandidateSummary = z.infer<typeof ProseCandidateSummarySchema>;
export type ProseCandidateDocument = z.infer<typeof ProseCandidateDocumentSchema>;
export type SkeletonCandidateSummary = z.infer<typeof SkeletonCandidateSummarySchema>;
export type SkeletonCandidateDocument = z.infer<typeof SkeletonCandidateDocumentSchema>;
export type CandidateList = z.infer<typeof CandidateListSchema>;
export type CandidateListInput = z.infer<typeof CandidateListInputSchema>;
export type CandidateChapterInput = z.infer<typeof CandidateChapterInputSchema>;
export type CandidateCreateFixtureInput = z.infer<typeof CandidateCreateFixtureInputSchema>;
export type CandidateGetInput = z.infer<typeof CandidateGetInputSchema>;
export type CandidateDiscardInput = z.infer<typeof CandidateDiscardInputSchema>;
export type CandidateEditSkeletonInput = z.infer<typeof CandidateEditSkeletonInputSchema>;
export type CoreCandidateOperation = z.infer<typeof CoreCandidateOperationSchema>;
export type CoreCandidateResult = z.infer<typeof CoreCandidateResultSchema>;
