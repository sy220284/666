import { z } from 'zod';

import { ErrorCodeSchema } from './error-codes.js';
import { ProjectIdSchema, TASK_PROTOCOL_VERSION } from './task-protocol.js';

export const DRAFT_IPC_CHANNELS = {
  openDraft: 'worldforge:draft:get',
  saveDraftSnapshot: 'worldforge:draft:save-snapshot',
} as const;

export const DRAFT_COMMANDS = {
  openDraft: 'draft.get',
  saveDraftSnapshot: 'draft.saveSnapshot',
} as const;

export const DraftEntityIdSchema = z.uuid();
export const DraftBlockTypeSchema = z.enum(['paragraph', 'dialogue', 'heading', 'separator']);
export const DraftSourceSchema = z.enum(['manual', 'ai', 'mixed', 'imported']);
export const DraftStatusSchema = z.enum(['active', 'archived']);
export const DraftOrderKeySchema = z.string().regex(/^-?\d+$/u);
export const DraftBlockTextSchema = z.string().max(2_000_000);
export const DraftContentHashSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/u)
  .nullable();
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

export const DraftSaveSnapshotCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(DRAFT_COMMANDS.saveDraftSnapshot),
  payload: DraftSaveSnapshotInputSchema,
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
    operation: z.literal(DRAFT_COMMANDS.saveDraftSnapshot),
    input: DraftSaveSnapshotInputSchema,
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
  coreDraftSuccess(DRAFT_COMMANDS.saveDraftSnapshot),
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
export type CoreDraftOperation = z.infer<typeof CoreDraftOperationSchema>;
export type CoreDraftResult = z.infer<typeof CoreDraftResultSchema>;
