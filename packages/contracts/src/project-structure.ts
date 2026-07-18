import { z } from 'zod';

import { ErrorCodeSchema } from './error-codes.js';
import { ProjectIdSchema, TASK_PROTOCOL_VERSION } from './task-protocol.js';
import { DraftContentHashValueSchema, DraftDocumentSchema, DraftEntityIdSchema } from './draft.js';

export const PROJECT_STRUCTURE_IPC_CHANNELS = {
  listStructure: 'worldforge:planning:list-structure',
  createVolume: 'worldforge:planning:create-volume',
  updateVolume: 'worldforge:planning:update-volume',
  moveVolume: 'worldforge:planning:move-volume',
  deleteVolume: 'worldforge:planning:delete-volume',
  createChapter: 'worldforge:planning:create-chapter',
  updateChapter: 'worldforge:planning:update-chapter',
  moveChapter: 'worldforge:planning:move-chapter',
  deleteChapter: 'worldforge:planning:delete-chapter',
  listTrash: 'worldforge:trash:list',
  restoreTrashEntry: 'worldforge:trash:restore',
  previewPermanentDelete: 'worldforge:trash:preview-permanent-delete',
  permanentDelete: 'worldforge:trash:permanent-delete',
  previewSplitChapter: 'worldforge:planning:preview-split-chapter',
  splitChapter: 'worldforge:planning:split-chapter',
  previewMergeChapters: 'worldforge:planning:preview-merge-chapters',
  mergeChapters: 'worldforge:planning:merge-chapters',
  previewMoveBlocks: 'worldforge:planning:preview-move-blocks',
  moveBlocks: 'worldforge:planning:move-blocks',
} as const;

export const PROJECT_STRUCTURE_COMMANDS = {
  listStructure: 'planning.listStructure',
  createVolume: 'planning.createVolume',
  updateVolume: 'planning.updateVolume',
  moveVolume: 'planning.moveVolume',
  deleteVolume: 'planning.deleteVolume',
  createChapter: 'planning.createChapter',
  updateChapter: 'planning.updateChapter',
  moveChapter: 'planning.moveChapter',
  deleteChapter: 'planning.deleteChapter',
  listTrash: 'trash.list',
  restoreTrashEntry: 'trash.restore',
  previewPermanentDelete: 'trash.previewPermanentDelete',
  permanentDelete: 'trash.permanentDelete',
  previewSplitChapter: 'planning.previewSplitChapter',
  splitChapter: 'planning.splitChapter',
  previewMergeChapters: 'planning.previewMergeChapters',
  mergeChapters: 'planning.mergeChapters',
  previewMoveBlocks: 'planning.previewMoveBlocks',
  moveBlocks: 'planning.moveBlocks',
} as const;

export const StructureEntityIdSchema = z.uuid();
export const StructureTitleSchema = z.string().trim().min(1).max(240);
export const LifecycleStatusSchema = z.enum([
  'pending',
  'outlined',
  'writing',
  'reviewing',
  'finalized',
]);
export const OrderKeySchema = z.string().regex(/^-?\d+$/u);
export const OrderPlacementSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('start') }),
  z.strictObject({ kind: z.literal('end') }),
  z.strictObject({ kind: z.literal('before'), siblingId: StructureEntityIdSchema }),
  z.strictObject({ kind: z.literal('after'), siblingId: StructureEntityIdSchema }),
]);
export const TargetWordCountSchema = z.number().int().min(0).max(10_000_000);

export const ChapterSchema = z.strictObject({
  id: StructureEntityIdSchema,
  volumeId: StructureEntityIdSchema,
  title: StructureTitleSchema,
  orderKey: OrderKeySchema,
  status: LifecycleStatusSchema,
  targetWordMin: TargetWordCountSchema.nullable(),
  targetWordMax: TargetWordCountSchema.nullable(),
  activeDraftId: StructureEntityIdSchema.nullable(),
  finalVersionId: StructureEntityIdSchema.nullable(),
  deletedAt: z.null(),
});

export const VolumeSchema = z.strictObject({
  id: StructureEntityIdSchema,
  projectId: ProjectIdSchema,
  title: StructureTitleSchema,
  orderKey: OrderKeySchema,
  status: LifecycleStatusSchema,
  deletedAt: z.null(),
  chapters: z.array(ChapterSchema),
});

export const ProjectStructureSchema = z.strictObject({
  projectId: ProjectIdSchema,
  volumes: z.array(VolumeSchema),
});

export const TrashEntrySchema = z.strictObject({
  id: StructureEntityIdSchema,
  entityType: z.enum(['volume', 'chapter']),
  entityId: StructureEntityIdSchema,
  title: StructureTitleSchema,
  originalParentId: StructureEntityIdSchema,
  originalOrderKey: OrderKeySchema,
  deletedAt: z.iso.datetime(),
});

export const TrashEntriesSchema = z.strictObject({ entries: z.array(TrashEntrySchema) });

export const VolumeCreateInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  title: StructureTitleSchema,
  placement: OrderPlacementSchema.optional(),
});
export const VolumeUpdatePatchSchema = z
  .strictObject({
    title: StructureTitleSchema.optional(),
    status: LifecycleStatusSchema.optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, 'At least one volume field is required.');
export const VolumeUpdateInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  volumeId: StructureEntityIdSchema,
  patch: VolumeUpdatePatchSchema,
});
export const VolumeMoveInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  volumeId: StructureEntityIdSchema,
  placement: OrderPlacementSchema,
});
export const VolumeDeleteInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  volumeId: StructureEntityIdSchema,
});

export const ChapterCreateInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  volumeId: StructureEntityIdSchema,
  title: StructureTitleSchema,
  placement: OrderPlacementSchema.optional(),
});
export const ChapterUpdatePatchSchema = z
  .strictObject({
    title: StructureTitleSchema.optional(),
    status: LifecycleStatusSchema.optional(),
    targetWordMin: TargetWordCountSchema.nullable().optional(),
    targetWordMax: TargetWordCountSchema.nullable().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, 'At least one chapter field is required.')
  .superRefine((patch, context) => {
    if (
      patch.targetWordMin !== undefined &&
      patch.targetWordMin !== null &&
      patch.targetWordMax !== undefined &&
      patch.targetWordMax !== null &&
      patch.targetWordMin > patch.targetWordMax
    ) {
      context.addIssue({ code: 'custom', message: 'Target word minimum cannot exceed maximum.' });
    }
  });
export const ChapterUpdateInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: StructureEntityIdSchema,
  patch: ChapterUpdatePatchSchema,
});
export const ChapterMoveInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: StructureEntityIdSchema,
  targetVolumeId: StructureEntityIdSchema,
  placement: OrderPlacementSchema,
});
export const ChapterDeleteInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: StructureEntityIdSchema,
});

export const TrashRestoreInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  trashEntryId: StructureEntityIdSchema,
  placement: z.union([z.literal('original'), OrderPlacementSchema]),
  targetVolumeId: StructureEntityIdSchema.optional(),
});

export const StructurePlanHashSchema = DraftContentHashValueSchema;
export const StructureOperationKindSchema = z.enum([
  'split-chapter',
  'merge-chapter',
  'move-blocks',
]);

const revisionedDraft = {
  draftId: DraftEntityIdSchema,
  baseRevision: z.number().int().nonnegative(),
};

export const ChapterSplitPreviewInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: StructureEntityIdSchema,
  ...revisionedDraft,
  splitAfterLogicalBlockId: DraftEntityIdSchema,
  newChapterTitle: StructureTitleSchema,
});
export const ChapterSplitExecuteInputSchema = ChapterSplitPreviewInputSchema.extend({
  planHash: StructurePlanHashSchema,
}).strict();

const chaptersMergeInput = {
  projectId: ProjectIdSchema,
  sourceChapterId: StructureEntityIdSchema,
  sourceDraftId: DraftEntityIdSchema,
  sourceBaseRevision: z.number().int().nonnegative(),
  targetChapterId: StructureEntityIdSchema,
  targetDraftId: DraftEntityIdSchema,
  targetBaseRevision: z.number().int().nonnegative(),
};
const differentMergeChapters = (input: {
  readonly sourceChapterId: string;
  readonly targetChapterId: string;
}) => input.sourceChapterId !== input.targetChapterId;
export const ChaptersMergePreviewInputSchema = z
  .strictObject(chaptersMergeInput)
  .refine(differentMergeChapters, {
    message: 'Merge source and target chapters must differ.',
  });
export const ChaptersMergeExecuteInputSchema = z
  .strictObject({ ...chaptersMergeInput, planHash: StructurePlanHashSchema })
  .refine(differentMergeChapters, {
    message: 'Merge source and target chapters must differ.',
  });

const crossChapterMoveInput = {
  projectId: ProjectIdSchema,
  sourceChapterId: StructureEntityIdSchema,
  sourceDraftId: DraftEntityIdSchema,
  sourceBaseRevision: z.number().int().nonnegative(),
  targetChapterId: StructureEntityIdSchema,
  targetDraftId: DraftEntityIdSchema,
  targetBaseRevision: z.number().int().nonnegative(),
  logicalBlockIds: z.array(DraftEntityIdSchema).min(1).max(50_000),
  afterTargetLogicalBlockId: DraftEntityIdSchema.nullable(),
};
function validateCrossChapterMove(
  input: {
    readonly sourceChapterId: string;
    readonly targetChapterId: string;
    readonly logicalBlockIds: readonly string[];
  },
  context: z.core.$RefinementCtx,
): void {
  if (input.sourceChapterId === input.targetChapterId) {
    context.addIssue({ code: 'custom', message: 'Cross-chapter move requires two chapters.' });
  }
  if (new Set(input.logicalBlockIds).size !== input.logicalBlockIds.length) {
    context.addIssue({ code: 'custom', message: 'Moved logicalBlockIds must be unique.' });
  }
}
export const CrossChapterMovePreviewInputSchema = z
  .strictObject(crossChapterMoveInput)
  .superRefine(validateCrossChapterMove);
export const CrossChapterMoveExecuteInputSchema = z
  .strictObject({ ...crossChapterMoveInput, planHash: StructurePlanHashSchema })
  .superRefine(validateCrossChapterMove);

export const StructureOperationPreviewSchema = z.strictObject({
  operation: StructureOperationKindSchema,
  planHash: StructurePlanHashSchema,
  sourceChapterId: StructureEntityIdSchema,
  targetChapterId: StructureEntityIdSchema.nullable(),
  sourceDraftId: DraftEntityIdSchema,
  targetDraftId: DraftEntityIdSchema.nullable(),
  sourceRevision: z.number().int().nonnegative(),
  targetRevision: z.number().int().nonnegative().nullable(),
  movedLogicalBlockIds: z.array(DraftEntityIdSchema).min(1).max(50_000),
  lockedLogicalBlockIds: z.array(DraftEntityIdSchema).max(50_000),
  sourceBlockCount: z.number().int().positive(),
  targetBlockCount: z.number().int().nonnegative(),
  resultingSourceBlockCount: z.number().int().nonnegative(),
  resultingTargetBlockCount: z.number().int().positive(),
  movedCharacterCount: z.number().int().nonnegative(),
  warnings: z.array(z.string().min(1).max(512)).max(20),
  canExecute: z.boolean(),
});

export const StructureOperationResultSchema = z.strictObject({
  operation: StructureOperationKindSchema,
  planHash: StructurePlanHashSchema,
  backupId: DraftEntityIdSchema,
  structure: ProjectStructureSchema,
  drafts: z.array(DraftDocumentSchema).min(1).max(2),
  deletedChapterId: StructureEntityIdSchema.nullable(),
});

export const TrashPermanentDeletePreviewInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  trashEntryId: StructureEntityIdSchema,
});
export const TrashDeleteBlockerSchema = z.strictObject({
  kind: z.enum(['version', 'candidate']),
  count: z.number().int().positive(),
});
export const TrashDeleteImpactSchema = z.strictObject({
  volumes: z.number().int().nonnegative(),
  chapters: z.number().int().nonnegative(),
  drafts: z.number().int().nonnegative(),
  draftBlocks: z.number().int().nonnegative(),
  versions: z.number().int().nonnegative(),
  candidates: z.number().int().nonnegative(),
});
export const TrashPermanentDeletePreviewSchema = z.strictObject({
  planHash: StructurePlanHashSchema,
  entry: TrashEntrySchema,
  impact: TrashDeleteImpactSchema,
  blockers: z.array(TrashDeleteBlockerSchema).max(2),
  canDelete: z.boolean(),
});
export const TrashPermanentDeleteInputSchema = TrashPermanentDeletePreviewInputSchema.extend({
  planHash: StructurePlanHashSchema,
  confirmationTitle: StructureTitleSchema,
}).strict();
export const TrashPermanentDeleteResultSchema = z.strictObject({
  deleted: z.literal(true),
  trashEntryId: StructureEntityIdSchema,
  backupId: DraftEntityIdSchema,
  impact: TrashDeleteImpactSchema,
});

const commandEnvelope = {
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  requestId: z.uuid(),
  sentAt: z.iso.datetime(),
};
const projectOnlyPayload = z.strictObject({ projectId: ProjectIdSchema });

export const ProjectListStructureCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_STRUCTURE_COMMANDS.listStructure),
  payload: projectOnlyPayload,
});
export const ProjectCreateVolumeCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_STRUCTURE_COMMANDS.createVolume),
  payload: VolumeCreateInputSchema,
});
export const ProjectUpdateVolumeCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_STRUCTURE_COMMANDS.updateVolume),
  payload: VolumeUpdateInputSchema,
});
export const ProjectMoveVolumeCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_STRUCTURE_COMMANDS.moveVolume),
  payload: VolumeMoveInputSchema,
});
export const ProjectDeleteVolumeCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_STRUCTURE_COMMANDS.deleteVolume),
  payload: VolumeDeleteInputSchema,
});
export const ProjectCreateChapterCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_STRUCTURE_COMMANDS.createChapter),
  payload: ChapterCreateInputSchema,
});
export const ProjectUpdateChapterCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_STRUCTURE_COMMANDS.updateChapter),
  payload: ChapterUpdateInputSchema,
});
export const ProjectMoveChapterCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_STRUCTURE_COMMANDS.moveChapter),
  payload: ChapterMoveInputSchema,
});
export const ProjectDeleteChapterCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_STRUCTURE_COMMANDS.deleteChapter),
  payload: ChapterDeleteInputSchema,
});
export const ProjectListTrashCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_STRUCTURE_COMMANDS.listTrash),
  payload: projectOnlyPayload,
});
export const ProjectRestoreTrashEntryCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_STRUCTURE_COMMANDS.restoreTrashEntry),
  payload: TrashRestoreInputSchema,
});
export const ProjectPreviewPermanentDeleteCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_STRUCTURE_COMMANDS.previewPermanentDelete),
  payload: TrashPermanentDeletePreviewInputSchema,
});
export const ProjectPermanentDeleteCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_STRUCTURE_COMMANDS.permanentDelete),
  payload: TrashPermanentDeleteInputSchema,
});
export const ProjectPreviewSplitChapterCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_STRUCTURE_COMMANDS.previewSplitChapter),
  payload: ChapterSplitPreviewInputSchema,
});
export const ProjectSplitChapterCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_STRUCTURE_COMMANDS.splitChapter),
  payload: ChapterSplitExecuteInputSchema,
});
export const ProjectPreviewMergeChaptersCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_STRUCTURE_COMMANDS.previewMergeChapters),
  payload: ChaptersMergePreviewInputSchema,
});
export const ProjectMergeChaptersCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_STRUCTURE_COMMANDS.mergeChapters),
  payload: ChaptersMergeExecuteInputSchema,
});
export const ProjectPreviewMoveBlocksCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_STRUCTURE_COMMANDS.previewMoveBlocks),
  payload: CrossChapterMovePreviewInputSchema,
});
export const ProjectMoveBlocksCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_STRUCTURE_COMMANDS.moveBlocks),
  payload: CrossChapterMoveExecuteInputSchema,
});

export const ProjectStructureCommandSchema = z.discriminatedUnion('command', [
  ProjectListStructureCommandSchema,
  ProjectCreateVolumeCommandSchema,
  ProjectUpdateVolumeCommandSchema,
  ProjectMoveVolumeCommandSchema,
  ProjectDeleteVolumeCommandSchema,
  ProjectCreateChapterCommandSchema,
  ProjectUpdateChapterCommandSchema,
  ProjectMoveChapterCommandSchema,
  ProjectDeleteChapterCommandSchema,
  ProjectListTrashCommandSchema,
  ProjectRestoreTrashEntryCommandSchema,
  ProjectPreviewPermanentDeleteCommandSchema,
  ProjectPermanentDeleteCommandSchema,
  ProjectPreviewSplitChapterCommandSchema,
  ProjectSplitChapterCommandSchema,
  ProjectPreviewMergeChaptersCommandSchema,
  ProjectMergeChaptersCommandSchema,
  ProjectPreviewMoveBlocksCommandSchema,
  ProjectMoveBlocksCommandSchema,
]);

const projectFailureSchema = z.strictObject({
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
    projectFailureSchema,
  ]);

export const ProjectStructureResultSchema = commandResultSchema(ProjectStructureSchema);
export const ProjectTrashEntriesResultSchema = commandResultSchema(TrashEntriesSchema);
export const ProjectStructureOperationPreviewResultSchema = commandResultSchema(
  StructureOperationPreviewSchema,
);
export const ProjectStructureOperationResultSchema = commandResultSchema(
  StructureOperationResultSchema,
);
export const ProjectTrashPermanentDeletePreviewResultSchema = commandResultSchema(
  TrashPermanentDeletePreviewSchema,
);
export const ProjectTrashPermanentDeleteResultSchema = commandResultSchema(
  TrashPermanentDeleteResultSchema,
);

export const CoreProjectStructureOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal(PROJECT_STRUCTURE_COMMANDS.listStructure),
    projectId: ProjectIdSchema,
  }),
  z.strictObject({
    operation: z.literal(PROJECT_STRUCTURE_COMMANDS.createVolume),
    input: VolumeCreateInputSchema,
  }),
  z.strictObject({
    operation: z.literal(PROJECT_STRUCTURE_COMMANDS.updateVolume),
    input: VolumeUpdateInputSchema,
  }),
  z.strictObject({
    operation: z.literal(PROJECT_STRUCTURE_COMMANDS.moveVolume),
    input: VolumeMoveInputSchema,
  }),
  z.strictObject({
    operation: z.literal(PROJECT_STRUCTURE_COMMANDS.deleteVolume),
    input: VolumeDeleteInputSchema,
  }),
  z.strictObject({
    operation: z.literal(PROJECT_STRUCTURE_COMMANDS.createChapter),
    input: ChapterCreateInputSchema,
  }),
  z.strictObject({
    operation: z.literal(PROJECT_STRUCTURE_COMMANDS.updateChapter),
    input: ChapterUpdateInputSchema,
  }),
  z.strictObject({
    operation: z.literal(PROJECT_STRUCTURE_COMMANDS.moveChapter),
    input: ChapterMoveInputSchema,
  }),
  z.strictObject({
    operation: z.literal(PROJECT_STRUCTURE_COMMANDS.deleteChapter),
    input: ChapterDeleteInputSchema,
  }),
  z.strictObject({
    operation: z.literal(PROJECT_STRUCTURE_COMMANDS.listTrash),
    projectId: ProjectIdSchema,
  }),
  z.strictObject({
    operation: z.literal(PROJECT_STRUCTURE_COMMANDS.restoreTrashEntry),
    input: TrashRestoreInputSchema,
  }),
  z.strictObject({
    operation: z.literal(PROJECT_STRUCTURE_COMMANDS.previewPermanentDelete),
    input: TrashPermanentDeletePreviewInputSchema,
  }),
  z.strictObject({
    operation: z.literal(PROJECT_STRUCTURE_COMMANDS.permanentDelete),
    input: TrashPermanentDeleteInputSchema,
  }),
  z.strictObject({
    operation: z.literal(PROJECT_STRUCTURE_COMMANDS.previewSplitChapter),
    input: ChapterSplitPreviewInputSchema,
  }),
  z.strictObject({
    operation: z.literal(PROJECT_STRUCTURE_COMMANDS.splitChapter),
    input: ChapterSplitExecuteInputSchema,
  }),
  z.strictObject({
    operation: z.literal(PROJECT_STRUCTURE_COMMANDS.previewMergeChapters),
    input: ChaptersMergePreviewInputSchema,
  }),
  z.strictObject({
    operation: z.literal(PROJECT_STRUCTURE_COMMANDS.mergeChapters),
    input: ChaptersMergeExecuteInputSchema,
  }),
  z.strictObject({
    operation: z.literal(PROJECT_STRUCTURE_COMMANDS.previewMoveBlocks),
    input: CrossChapterMovePreviewInputSchema,
  }),
  z.strictObject({
    operation: z.literal(PROJECT_STRUCTURE_COMMANDS.moveBlocks),
    input: CrossChapterMoveExecuteInputSchema,
  }),
]);

const coreStructureSuccess = <Operation extends string, DataSchema extends z.ZodType>(
  operation: Operation,
  data: DataSchema,
) => z.strictObject({ ok: z.literal(true), operation: z.literal(operation), data });

export const CoreProjectStructureResultSchema = z.union([
  coreStructureSuccess(PROJECT_STRUCTURE_COMMANDS.listStructure, ProjectStructureSchema),
  coreStructureSuccess(PROJECT_STRUCTURE_COMMANDS.createVolume, ProjectStructureSchema),
  coreStructureSuccess(PROJECT_STRUCTURE_COMMANDS.updateVolume, ProjectStructureSchema),
  coreStructureSuccess(PROJECT_STRUCTURE_COMMANDS.moveVolume, ProjectStructureSchema),
  coreStructureSuccess(PROJECT_STRUCTURE_COMMANDS.deleteVolume, ProjectStructureSchema),
  coreStructureSuccess(PROJECT_STRUCTURE_COMMANDS.createChapter, ProjectStructureSchema),
  coreStructureSuccess(PROJECT_STRUCTURE_COMMANDS.updateChapter, ProjectStructureSchema),
  coreStructureSuccess(PROJECT_STRUCTURE_COMMANDS.moveChapter, ProjectStructureSchema),
  coreStructureSuccess(PROJECT_STRUCTURE_COMMANDS.deleteChapter, ProjectStructureSchema),
  coreStructureSuccess(PROJECT_STRUCTURE_COMMANDS.listTrash, TrashEntriesSchema),
  coreStructureSuccess(PROJECT_STRUCTURE_COMMANDS.restoreTrashEntry, ProjectStructureSchema),
  coreStructureSuccess(
    PROJECT_STRUCTURE_COMMANDS.previewPermanentDelete,
    TrashPermanentDeletePreviewSchema,
  ),
  coreStructureSuccess(
    PROJECT_STRUCTURE_COMMANDS.permanentDelete,
    TrashPermanentDeleteResultSchema,
  ),
  coreStructureSuccess(
    PROJECT_STRUCTURE_COMMANDS.previewSplitChapter,
    StructureOperationPreviewSchema,
  ),
  coreStructureSuccess(PROJECT_STRUCTURE_COMMANDS.splitChapter, StructureOperationResultSchema),
  coreStructureSuccess(
    PROJECT_STRUCTURE_COMMANDS.previewMergeChapters,
    StructureOperationPreviewSchema,
  ),
  coreStructureSuccess(PROJECT_STRUCTURE_COMMANDS.mergeChapters, StructureOperationResultSchema),
  coreStructureSuccess(
    PROJECT_STRUCTURE_COMMANDS.previewMoveBlocks,
    StructureOperationPreviewSchema,
  ),
  coreStructureSuccess(PROJECT_STRUCTURE_COMMANDS.moveBlocks, StructureOperationResultSchema),
  z.strictObject({
    ok: z.literal(false),
    operation: z.enum(PROJECT_STRUCTURE_COMMANDS),
    errorCode: ErrorCodeSchema,
  }),
]);

export type LifecycleStatus = z.infer<typeof LifecycleStatusSchema>;
export type OrderPlacement = z.infer<typeof OrderPlacementSchema>;
export type Chapter = z.infer<typeof ChapterSchema>;
export type Volume = z.infer<typeof VolumeSchema>;
export type ProjectStructure = z.infer<typeof ProjectStructureSchema>;
export type TrashEntry = z.infer<typeof TrashEntrySchema>;
export type VolumeCreateInput = z.infer<typeof VolumeCreateInputSchema>;
export type VolumeUpdateInput = z.infer<typeof VolumeUpdateInputSchema>;
export type VolumeMoveInput = z.infer<typeof VolumeMoveInputSchema>;
export type VolumeDeleteInput = z.infer<typeof VolumeDeleteInputSchema>;
export type ChapterCreateInput = z.infer<typeof ChapterCreateInputSchema>;
export type ChapterUpdateInput = z.infer<typeof ChapterUpdateInputSchema>;
export type ChapterMoveInput = z.infer<typeof ChapterMoveInputSchema>;
export type ChapterDeleteInput = z.infer<typeof ChapterDeleteInputSchema>;
export type TrashRestoreInput = z.infer<typeof TrashRestoreInputSchema>;
export type ChapterSplitPreviewInput = z.infer<typeof ChapterSplitPreviewInputSchema>;
export type ChapterSplitExecuteInput = z.infer<typeof ChapterSplitExecuteInputSchema>;
export type ChaptersMergePreviewInput = z.infer<typeof ChaptersMergePreviewInputSchema>;
export type ChaptersMergeExecuteInput = z.infer<typeof ChaptersMergeExecuteInputSchema>;
export type CrossChapterMovePreviewInput = z.infer<typeof CrossChapterMovePreviewInputSchema>;
export type CrossChapterMoveExecuteInput = z.infer<typeof CrossChapterMoveExecuteInputSchema>;
export type StructureOperationPreview = z.infer<typeof StructureOperationPreviewSchema>;
export type StructureOperationResult = z.infer<typeof StructureOperationResultSchema>;
export type TrashPermanentDeletePreviewInput = z.infer<
  typeof TrashPermanentDeletePreviewInputSchema
>;
export type TrashPermanentDeleteInput = z.infer<typeof TrashPermanentDeleteInputSchema>;
export type TrashPermanentDeletePreview = z.infer<typeof TrashPermanentDeletePreviewSchema>;
export type TrashPermanentDeleteResult = z.infer<typeof TrashPermanentDeleteResultSchema>;
export type TrashDeleteImpact = z.infer<typeof TrashDeleteImpactSchema>;
export type CoreProjectStructureOperation = z.infer<typeof CoreProjectStructureOperationSchema>;
export type CoreProjectStructureResult = z.infer<typeof CoreProjectStructureResultSchema>;
