import { z } from 'zod';

import { ErrorCodeSchema } from './error-codes.js';
import { OrderKeySchema, OrderPlacementSchema } from './project-structure.js';
import { ProjectIdSchema, TASK_PROTOCOL_VERSION } from './task-protocol.js';

export const SCENE_BEAT_IPC_CHANNELS = {
  listSceneBeats: 'worldforge:planning:list-scene-beats',
  createSceneBeat: 'worldforge:planning:create-scene-beat',
  updateSceneBeat: 'worldforge:planning:update-scene-beat',
  moveSceneBeat: 'worldforge:planning:move-scene-beat',
  previewMoveSceneBeat: 'worldforge:planning:preview-move-scene-beat',
  moveSceneBeatAcrossChapters: 'worldforge:planning:move-scene-beat-across-chapters',
  deleteSceneBeat: 'worldforge:planning:delete-scene-beat',
  restoreSceneBeat: 'worldforge:planning:restore-scene-beat',
  setSceneBeatBlockLinks: 'worldforge:planning:set-scene-beat-block-links',
  convertBlocksToSceneBeat: 'worldforge:planning:convert-blocks-to-scene-beat',
} as const;

export const SCENE_BEAT_COMMANDS = {
  listSceneBeats: 'planning.listSceneBeats',
  createSceneBeat: 'planning.createSceneBeat',
  updateSceneBeat: 'planning.updateSceneBeat',
  moveSceneBeat: 'planning.moveSceneBeat',
  previewMoveSceneBeat: 'planning.previewMoveSceneBeat',
  moveSceneBeatAcrossChapters: 'planning.moveSceneBeatAcrossChapters',
  deleteSceneBeat: 'planning.deleteSceneBeat',
  restoreSceneBeat: 'planning.restoreSceneBeat',
  setSceneBeatBlockLinks: 'planning.setSceneBeatBlockLinks',
  convertBlocksToSceneBeat: 'planning.convertBlocksToSceneBeat',
} as const;

export const SceneBeatIdSchema = z.uuid();
export const SceneBeatTitleSchema = z.string().trim().min(1).max(240);
export const SceneBeatTextSchema = z.string().trim().max(4_000);
export const SceneBeatTypeSchema = z.enum([
  'setup',
  'development',
  'turn',
  'climax',
  'resolution',
  'custom',
]);
export const SceneBeatWordTargetPercentSchema = z.number().int().min(0).max(100);
export const SceneBeatEntityIdsSchema = z.array(z.uuid()).max(500);

export const SceneBeatBlockLinkSchema = z.strictObject({
  draftBlockId: z.uuid(),
  logicalBlockId: z.uuid(),
  draftId: z.uuid(),
  chapterId: z.uuid(),
});

export const SceneBeatSchema = z.strictObject({
  id: SceneBeatIdSchema,
  projectId: ProjectIdSchema,
  chapterId: z.uuid(),
  plotNodeId: z.uuid().nullable(),
  title: SceneBeatTitleSchema,
  goal: SceneBeatTextSchema,
  coreConflict: SceneBeatTextSchema,
  expectedResult: SceneBeatTextSchema,
  beatType: SceneBeatTypeSchema,
  wordTargetPercent: SceneBeatWordTargetPercentSchema,
  required: z.boolean(),
  orderKey: OrderKeySchema,
  characterIds: SceneBeatEntityIdsSchema,
  locationIds: SceneBeatEntityIdsSchema,
  blockLinks: z.array(SceneBeatBlockLinkSchema).max(50_000),
  deletedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
});

export const SceneBeatListSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: z.uuid(),
  beats: z.array(SceneBeatSchema),
  deletedBeats: z.array(SceneBeatSchema),
});

const sceneBeatFields = {
  plotNodeId: z.uuid().nullable(),
  title: SceneBeatTitleSchema,
  goal: SceneBeatTextSchema,
  coreConflict: SceneBeatTextSchema,
  expectedResult: SceneBeatTextSchema,
  beatType: SceneBeatTypeSchema,
  wordTargetPercent: SceneBeatWordTargetPercentSchema,
  required: z.boolean(),
  characterIds: SceneBeatEntityIdsSchema,
  locationIds: SceneBeatEntityIdsSchema,
};

export const SceneBeatListInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: z.uuid(),
});
export const SceneBeatCreateInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: z.uuid(),
  ...sceneBeatFields,
  placement: OrderPlacementSchema.optional(),
});
export const SceneBeatUpdatePatchSchema = z
  .strictObject({
    plotNodeId: z.uuid().nullable().optional(),
    title: SceneBeatTitleSchema.optional(),
    goal: SceneBeatTextSchema.optional(),
    coreConflict: SceneBeatTextSchema.optional(),
    expectedResult: SceneBeatTextSchema.optional(),
    beatType: SceneBeatTypeSchema.optional(),
    wordTargetPercent: SceneBeatWordTargetPercentSchema.optional(),
    required: z.boolean().optional(),
    characterIds: SceneBeatEntityIdsSchema.optional(),
    locationIds: SceneBeatEntityIdsSchema.optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, 'At least one SceneBeat field is required.');
export const SceneBeatUpdateInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  sceneBeatId: SceneBeatIdSchema,
  patch: SceneBeatUpdatePatchSchema,
});
export const SceneBeatMoveInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  sceneBeatId: SceneBeatIdSchema,
  chapterId: z.uuid(),
  placement: OrderPlacementSchema,
});
export const SceneBeatCrossChapterMovePreviewInputSchema = z
  .strictObject({
    projectId: ProjectIdSchema,
    sceneBeatId: SceneBeatIdSchema,
    targetChapterId: z.uuid(),
    placement: OrderPlacementSchema,
  })
  .refine((input) => input.targetChapterId.length > 0, 'Target chapter is required.');
export const SceneBeatCrossChapterMovePreviewSchema = z.strictObject({
  planHash: z.string().regex(/^[0-9a-f]{64}$/),
  sceneBeatId: SceneBeatIdSchema,
  sourceChapterId: z.uuid(),
  targetChapterId: z.uuid(),
  linkedLogicalBlockIds: z.array(z.uuid()).max(50_000),
  linkedBlockCount: z.number().int().nonnegative(),
  linkedCharacterCount: z.number().int().nonnegative(),
  warnings: z.array(z.string().min(1).max(512)).max(20),
  canExecute: z.boolean(),
});
export const SceneBeatCrossChapterMoveInputSchema =
  SceneBeatCrossChapterMovePreviewInputSchema.extend({
    planHash: z.string().regex(/^[0-9a-f]{64}$/),
  }).strict();
export const SceneBeatDeleteInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  sceneBeatId: SceneBeatIdSchema,
});
export const SceneBeatRestoreInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  sceneBeatId: SceneBeatIdSchema,
  placement: OrderPlacementSchema.optional(),
});
export const SceneBeatSetBlockLinksInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  sceneBeatId: SceneBeatIdSchema,
  logicalBlockIds: z.array(z.uuid()).max(50_000),
});
export const SceneBeatConvertBlocksInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: z.uuid(),
  logicalBlockIds: z.array(z.uuid()).min(1).max(50_000),
  ...sceneBeatFields,
  placement: OrderPlacementSchema.optional(),
});

const commandEnvelope = {
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  requestId: z.uuid(),
  sentAt: z.iso.datetime(),
};

export const SceneBeatListCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(SCENE_BEAT_COMMANDS.listSceneBeats),
  payload: SceneBeatListInputSchema,
});
export const SceneBeatCreateCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(SCENE_BEAT_COMMANDS.createSceneBeat),
  payload: SceneBeatCreateInputSchema,
});
export const SceneBeatUpdateCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(SCENE_BEAT_COMMANDS.updateSceneBeat),
  payload: SceneBeatUpdateInputSchema,
});
export const SceneBeatMoveCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(SCENE_BEAT_COMMANDS.moveSceneBeat),
  payload: SceneBeatMoveInputSchema,
});
export const SceneBeatPreviewCrossChapterMoveCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(SCENE_BEAT_COMMANDS.previewMoveSceneBeat),
  payload: SceneBeatCrossChapterMovePreviewInputSchema,
});
export const SceneBeatMoveAcrossChaptersCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(SCENE_BEAT_COMMANDS.moveSceneBeatAcrossChapters),
  payload: SceneBeatCrossChapterMoveInputSchema,
});
export const SceneBeatDeleteCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(SCENE_BEAT_COMMANDS.deleteSceneBeat),
  payload: SceneBeatDeleteInputSchema,
});
export const SceneBeatRestoreCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(SCENE_BEAT_COMMANDS.restoreSceneBeat),
  payload: SceneBeatRestoreInputSchema,
});
export const SceneBeatSetBlockLinksCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(SCENE_BEAT_COMMANDS.setSceneBeatBlockLinks),
  payload: SceneBeatSetBlockLinksInputSchema,
});
export const SceneBeatConvertBlocksCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(SCENE_BEAT_COMMANDS.convertBlocksToSceneBeat),
  payload: SceneBeatConvertBlocksInputSchema,
});

const commandFailureSchema = z.strictObject({
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
const commandResultSchema = <DataSchema extends z.ZodType>(data: DataSchema) =>
  z.union([
    z.strictObject({ ok: z.literal(true), requestId: z.uuid(), data }),
    commandFailureSchema,
  ]);

export const SceneBeatListResultSchema = commandResultSchema(SceneBeatListSchema);
export const SceneBeatMovePreviewResultSchema = commandResultSchema(
  SceneBeatCrossChapterMovePreviewSchema,
);

export const CoreSceneBeatOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal(SCENE_BEAT_COMMANDS.listSceneBeats),
    input: SceneBeatListInputSchema,
  }),
  z.strictObject({
    operation: z.literal(SCENE_BEAT_COMMANDS.createSceneBeat),
    input: SceneBeatCreateInputSchema,
  }),
  z.strictObject({
    operation: z.literal(SCENE_BEAT_COMMANDS.updateSceneBeat),
    input: SceneBeatUpdateInputSchema,
  }),
  z.strictObject({
    operation: z.literal(SCENE_BEAT_COMMANDS.moveSceneBeat),
    input: SceneBeatMoveInputSchema,
  }),
  z.strictObject({
    operation: z.literal(SCENE_BEAT_COMMANDS.previewMoveSceneBeat),
    input: SceneBeatCrossChapterMovePreviewInputSchema,
  }),
  z.strictObject({
    operation: z.literal(SCENE_BEAT_COMMANDS.moveSceneBeatAcrossChapters),
    input: SceneBeatCrossChapterMoveInputSchema,
  }),
  z.strictObject({
    operation: z.literal(SCENE_BEAT_COMMANDS.deleteSceneBeat),
    input: SceneBeatDeleteInputSchema,
  }),
  z.strictObject({
    operation: z.literal(SCENE_BEAT_COMMANDS.restoreSceneBeat),
    input: SceneBeatRestoreInputSchema,
  }),
  z.strictObject({
    operation: z.literal(SCENE_BEAT_COMMANDS.setSceneBeatBlockLinks),
    input: SceneBeatSetBlockLinksInputSchema,
  }),
  z.strictObject({
    operation: z.literal(SCENE_BEAT_COMMANDS.convertBlocksToSceneBeat),
    input: SceneBeatConvertBlocksInputSchema,
  }),
]);

const coreSuccess = <Operation extends string, DataSchema extends z.ZodType>(
  operation: Operation,
  data: DataSchema,
) => z.strictObject({ ok: z.literal(true), operation: z.literal(operation), data });

export const CoreSceneBeatResultSchema = z.union([
  coreSuccess(SCENE_BEAT_COMMANDS.listSceneBeats, SceneBeatListSchema),
  coreSuccess(SCENE_BEAT_COMMANDS.createSceneBeat, SceneBeatListSchema),
  coreSuccess(SCENE_BEAT_COMMANDS.updateSceneBeat, SceneBeatListSchema),
  coreSuccess(SCENE_BEAT_COMMANDS.moveSceneBeat, SceneBeatListSchema),
  coreSuccess(SCENE_BEAT_COMMANDS.previewMoveSceneBeat, SceneBeatCrossChapterMovePreviewSchema),
  coreSuccess(SCENE_BEAT_COMMANDS.moveSceneBeatAcrossChapters, SceneBeatListSchema),
  coreSuccess(SCENE_BEAT_COMMANDS.deleteSceneBeat, SceneBeatListSchema),
  coreSuccess(SCENE_BEAT_COMMANDS.restoreSceneBeat, SceneBeatListSchema),
  coreSuccess(SCENE_BEAT_COMMANDS.setSceneBeatBlockLinks, SceneBeatListSchema),
  coreSuccess(SCENE_BEAT_COMMANDS.convertBlocksToSceneBeat, SceneBeatListSchema),
  z.strictObject({
    ok: z.literal(false),
    operation: z.enum(SCENE_BEAT_COMMANDS),
    errorCode: ErrorCodeSchema,
  }),
]);

export type SceneBeatType = z.infer<typeof SceneBeatTypeSchema>;
export type SceneBeat = z.infer<typeof SceneBeatSchema>;
export type SceneBeatList = z.infer<typeof SceneBeatListSchema>;
export type SceneBeatListInput = z.infer<typeof SceneBeatListInputSchema>;
export type SceneBeatCreateInput = z.infer<typeof SceneBeatCreateInputSchema>;
export type SceneBeatUpdateInput = z.infer<typeof SceneBeatUpdateInputSchema>;
export type SceneBeatMoveInput = z.infer<typeof SceneBeatMoveInputSchema>;
export type SceneBeatCrossChapterMovePreviewInput = z.infer<
  typeof SceneBeatCrossChapterMovePreviewInputSchema
>;
export type SceneBeatCrossChapterMovePreview = z.infer<
  typeof SceneBeatCrossChapterMovePreviewSchema
>;
export type SceneBeatCrossChapterMoveInput = z.infer<typeof SceneBeatCrossChapterMoveInputSchema>;
export type SceneBeatDeleteInput = z.infer<typeof SceneBeatDeleteInputSchema>;
export type SceneBeatRestoreInput = z.infer<typeof SceneBeatRestoreInputSchema>;
export type SceneBeatSetBlockLinksInput = z.infer<typeof SceneBeatSetBlockLinksInputSchema>;
export type SceneBeatConvertBlocksInput = z.infer<typeof SceneBeatConvertBlocksInputSchema>;
export type CoreSceneBeatOperation = z.infer<typeof CoreSceneBeatOperationSchema>;
export type CoreSceneBeatResult = z.infer<typeof CoreSceneBeatResultSchema>;
