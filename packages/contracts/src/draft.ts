import { z } from 'zod';

import { ErrorCodeSchema } from './error-codes.js';
import { ProjectIdSchema, TASK_PROTOCOL_VERSION } from './task-protocol.js';

export const DRAFT_IPC_CHANNELS = {
  openDraft: 'worldforge:draft:get',
  applyPatch: 'worldforge:draft:apply-patch',
} as const;

export const DRAFT_COMMANDS = {
  openDraft: 'draft.get',
  applyPatch: 'draft.applyPatch',
} as const;

export const DraftEntityIdSchema = z.uuid();
export const DraftBlockTypeSchema = z.enum(['paragraph', 'dialogue', 'heading', 'separator']);
export const DraftSourceSchema = z.enum(['manual', 'ai', 'mixed', 'imported']);
export const DraftStatusSchema = z.enum(['active', 'archived']);
export const DraftOrderKeySchema = z.string().regex(/^-?\d+$/u);
export const DraftBlockTextSchema = z.string().max(2_000_000);
export const DraftContentHashValueSchema = z.string().regex(/^[0-9a-f]{64}$/u);
export const DraftContentHashSchema = DraftContentHashValueSchema.nullable();
export const DraftClientBlockIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/u);
export const DraftBlockAttributesSchema = z.strictObject({
  headingLevel: z.number().int().min(1).max(6).optional(),
});

function validateBlockSemantics(
  block: {
    readonly blockType: z.infer<typeof DraftBlockTypeSchema>;
    readonly text: string;
    readonly attributes: z.infer<typeof DraftBlockAttributesSchema>;
  },
  context: z.core.$RefinementCtx,
): void {
  if (block.blockType === 'separator' && block.text !== '') {
    context.addIssue({ code: 'custom', message: 'Separator blocks cannot contain text.' });
  }
  if (block.blockType !== 'heading' && block.attributes.headingLevel !== undefined) {
    context.addIssue({ code: 'custom', message: 'Only heading blocks can declare headingLevel.' });
  }
}

function validateNewBlockSemantics(
  block: {
    readonly blockType: z.infer<typeof DraftBlockTypeSchema>;
    readonly content: string;
    readonly attributes: z.infer<typeof DraftBlockAttributesSchema>;
  },
  context: z.core.$RefinementCtx,
): void {
  validateBlockSemantics(
    { blockType: block.blockType, text: block.content, attributes: block.attributes },
    context,
  );
}

export const DraftBlockSchema = z
  .strictObject({
    logicalBlockId: DraftEntityIdSchema,
    orderKey: DraftOrderKeySchema,
    blockType: DraftBlockTypeSchema,
    text: DraftBlockTextSchema,
    attributes: DraftBlockAttributesSchema,
    source: DraftSourceSchema,
    locked: z.boolean(),
    contentHash: DraftContentHashSchema,
  })
  .superRefine(validateBlockSemantics);

export const DraftDocumentSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: DraftEntityIdSchema,
  draftId: DraftEntityIdSchema,
  status: DraftStatusSchema,
  revision: z.number().int().nonnegative(),
  blocks: z.array(DraftBlockSchema).min(1).max(50_000),
});

export const DraftOpenInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: DraftEntityIdSchema,
});

export const DraftSnapshotBlockInputSchema = z
  .strictObject({
    clientBlockId: DraftClientBlockIdSchema,
    logicalBlockId: DraftEntityIdSchema.nullable(),
    blockType: DraftBlockTypeSchema,
    text: DraftBlockTextSchema,
    attributes: DraftBlockAttributesSchema,
  })
  .superRefine(validateBlockSemantics);

export const DraftSaveSnapshotInputSchema = z
  .strictObject({
    projectId: ProjectIdSchema,
    chapterId: DraftEntityIdSchema,
    draftId: DraftEntityIdSchema,
    blocks: z.array(DraftSnapshotBlockInputSchema).min(1).max(50_000),
  })
  .superRefine((input, context) => {
    const clientIds = new Set<string>();
    const logicalIds = new Set<string>();
    for (const [index, block] of input.blocks.entries()) {
      if (clientIds.has(block.clientBlockId)) {
        context.addIssue({
          code: 'custom',
          path: ['blocks', index, 'clientBlockId'],
          message: 'clientBlockId must be unique within a snapshot.',
        });
      }
      clientIds.add(block.clientBlockId);
      if (block.logicalBlockId) {
        if (logicalIds.has(block.logicalBlockId)) {
          context.addIssue({
            code: 'custom',
            path: ['blocks', index, 'logicalBlockId'],
            message: 'logicalBlockId must be unique within a snapshot.',
          });
        }
        logicalIds.add(block.logicalBlockId);
      }
    }
  });

export const DraftPatchNewBlockSchema = z
  .strictObject({
    blockType: DraftBlockTypeSchema,
    content: DraftBlockTextSchema,
    attributes: DraftBlockAttributesSchema.default({}),
  })
  .superRefine(validateNewBlockSemantics);

export const DraftPatchInsertOperationSchema = z.strictObject({
  type: z.literal('insert'),
  afterLogicalBlockId: DraftEntityIdSchema.nullable(),
  block: DraftPatchNewBlockSchema,
});

export const DraftPatchUpdateOperationSchema = z.strictObject({
  type: z.literal('update'),
  logicalBlockId: DraftEntityIdSchema,
  expectedHash: DraftContentHashValueSchema,
  blockType: DraftBlockTypeSchema.optional(),
  content: DraftBlockTextSchema,
  attributes: DraftBlockAttributesSchema.optional(),
});

export const DraftPatchDeleteOperationSchema = z.strictObject({
  type: z.literal('delete'),
  logicalBlockId: DraftEntityIdSchema,
  expectedHash: DraftContentHashValueSchema,
});

export const DraftPatchMoveOperationSchema = z.strictObject({
  type: z.literal('move'),
  logicalBlockId: DraftEntityIdSchema,
  expectedHash: DraftContentHashValueSchema,
  afterLogicalBlockId: DraftEntityIdSchema.nullable(),
});

export const DraftPatchSetLockOperationSchema = z.strictObject({
  type: z.literal('set-lock'),
  logicalBlockId: DraftEntityIdSchema,
  expectedHash: DraftContentHashValueSchema,
  locked: z.boolean(),
});

export const DraftPatchOperationSchema = z.discriminatedUnion('type', [
  DraftPatchInsertOperationSchema,
  DraftPatchUpdateOperationSchema,
  DraftPatchDeleteOperationSchema,
  DraftPatchMoveOperationSchema,
  DraftPatchSetLockOperationSchema,
]);

export const DraftApplyPatchInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: DraftEntityIdSchema,
  draftId: DraftEntityIdSchema,
  baseRevision: z.number().int().nonnegative(),
  operations: z.array(DraftPatchOperationSchema).min(1).max(10_000),
});

const commandEnvelope = {
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  requestId: z.uuid(),
  sentAt: z.iso.datetime(),
};

export const DraftOpenCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(DRAFT_COMMANDS.openDraft),
  payload: DraftOpenInputSchema,
});

export const DraftApplyPatchCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(DRAFT_COMMANDS.applyPatch),
  payload: DraftApplyPatchInputSchema,
});

const draftFailureSchema = z.strictObject({
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

export const DraftDocumentResultSchema = z.union([
  z.strictObject({ ok: z.literal(true), requestId: z.uuid(), data: DraftDocumentSchema }),
  draftFailureSchema,
]);

export const CoreDraftOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal(DRAFT_COMMANDS.openDraft), input: DraftOpenInputSchema }),
  z.strictObject({
    operation: z.literal(DRAFT_COMMANDS.applyPatch),
    input: DraftApplyPatchInputSchema,
  }),
]);

const coreDraftSuccess = <Operation extends string>(operation: Operation) =>
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(operation),
    data: DraftDocumentSchema,
  });

export const CoreDraftResultSchema = z.union([
  coreDraftSuccess(DRAFT_COMMANDS.openDraft),
  coreDraftSuccess(DRAFT_COMMANDS.applyPatch),
  z.strictObject({
    ok: z.literal(false),
    operation: z.enum(DRAFT_COMMANDS),
    errorCode: ErrorCodeSchema,
  }),
]);

export type DraftBlockType = z.infer<typeof DraftBlockTypeSchema>;
export type DraftBlockAttributes = z.infer<typeof DraftBlockAttributesSchema>;
export type DraftBlock = z.infer<typeof DraftBlockSchema>;
export type DraftDocument = z.infer<typeof DraftDocumentSchema>;
export type DraftOpenInput = z.infer<typeof DraftOpenInputSchema>;
export type DraftSnapshotBlockInput = z.infer<typeof DraftSnapshotBlockInputSchema>;
export type DraftSaveSnapshotInput = z.infer<typeof DraftSaveSnapshotInputSchema>;
export type DraftPatchNewBlock = z.infer<typeof DraftPatchNewBlockSchema>;
export type DraftPatchInsertOperation = z.infer<typeof DraftPatchInsertOperationSchema>;
export type DraftPatchUpdateOperation = z.infer<typeof DraftPatchUpdateOperationSchema>;
export type DraftPatchDeleteOperation = z.infer<typeof DraftPatchDeleteOperationSchema>;
export type DraftPatchMoveOperation = z.infer<typeof DraftPatchMoveOperationSchema>;
export type DraftPatchSetLockOperation = z.infer<typeof DraftPatchSetLockOperationSchema>;
export type DraftPatchOperation = z.infer<typeof DraftPatchOperationSchema>;
export type DraftApplyPatchInput = z.infer<typeof DraftApplyPatchInputSchema>;
export type CoreDraftOperation = z.infer<typeof CoreDraftOperationSchema>;
export type CoreDraftResult = z.infer<typeof CoreDraftResultSchema>;
