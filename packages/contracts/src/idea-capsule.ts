import { z } from 'zod';

import { ConstraintHashSchema } from './ai-output-protocol.js';
import { type CommandResult } from './app-runtime-contracts.js';
import { TimelineEventSaveInputSchema } from './continuity.js';
import { DraftEntityIdSchema } from './draft.js';
import { CanonFactSetInputSchema, EntityCreateInputSchema } from './entity-canon.js';
import { ErrorCodeSchema } from './error-codes.js';
import { GenerationScopeTypeSchema } from './generation-scope.js';
import { ForeshadowingSaveInputSchema } from './narrative-planning.js';
import { PlotNodeCreateInputSchema, ProjectBriefUpdateInputSchema } from './project-planning.js';
import { ProjectIdSchema, TASK_PROTOCOL_VERSION, TaskIdSchema } from './task-protocol.js';

export const IDEA_CAPSULE_IPC_CHANNELS = {
  operation: 'worldforge:idea-capsule:operation',
} as const;

export const IDEA_CAPSULE_BRIDGE_COMMAND = 'ideaCapsule.operation' as const;

export const IDEA_CAPSULE_COMMANDS = {
  list: 'idea.list',
  get: 'idea.get',
  create: 'idea.create',
  setStatus: 'idea.setStatus',
  previewConversion: 'idea.previewConversion',
  applyConversion: 'idea.applyConversion',
} as const;

export const IdeaKindSchema = z.enum([
  'new_book',
  'character',
  'plot',
  'worldbuilding',
  'foreshadowing',
  'twist',
  'relationship',
  'ending',
  'custom',
]);
export const IdeaDivergenceLevelSchema = z.enum(['safe', 'different', 'wild']);
export const IdeaDepthLevelSchema = z.enum(['spark', 'expand', 'deep']);
export const IdeaStatusSchema = z.enum(['active', 'favorite', 'converted', 'discarded']);
export const IdeaMutableStatusSchema = z.enum(['active', 'favorite', 'discarded']);
export const IdeaConversionStatusSchema = z.enum(['applied', 'target_missing', 'target_stale']);
export const IdeaConversionTargetTypeSchema = z.enum([
  'project_brief',
  'plot_node',
  'entity',
  'canon_fact',
  'timeline_event',
  'foreshadowing',
]);

export const IdeaSourceContextSchema = z.strictObject({
  scopeType: GenerationScopeTypeSchema,
  scopeId: DraftEntityIdSchema,
  chapterId: DraftEntityIdSchema.nullable(),
  label: z.string().trim().min(1).max(512).optional(),
});

export const IdeaCardSchema = z.strictObject({
  id: DraftEntityIdSchema,
  projectId: ProjectIdSchema,
  ideaKind: IdeaKindSchema,
  title: z.string().trim().min(1).max(512),
  summary: z.string().trim().min(1).max(8_000),
  content: z.string().trim().min(1).max(200_000),
  divergenceLevel: IdeaDivergenceLevelSchema,
  depthLevel: IdeaDepthLevelSchema,
  sourceContext: IdeaSourceContextSchema,
  generationRunId: TaskIdSchema.nullable(),
  status: IdeaStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const IdeaConversionSchema = z.strictObject({
  id: DraftEntityIdSchema,
  projectId: ProjectIdSchema,
  ideaId: DraftEntityIdSchema,
  targetType: IdeaConversionTargetTypeSchema,
  targetId: DraftEntityIdSchema,
  previewHash: ConstraintHashSchema,
  status: IdeaConversionStatusSchema,
  createdAt: z.iso.datetime(),
});

export const IdeaDetailSchema = z.strictObject({
  idea: IdeaCardSchema,
  conversion: IdeaConversionSchema.nullable(),
});

export const IdeaExplorePromptInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  scopeType: GenerationScopeTypeSchema,
  scopeId: DraftEntityIdSchema,
  chapterId: DraftEntityIdSchema.nullable(),
  ideaKind: IdeaKindSchema,
  divergenceLevel: IdeaDivergenceLevelSchema,
  depthLevel: IdeaDepthLevelSchema,
  authorInstruction: z.string().trim().min(1).max(32_768),
  context: z.string().max(2_000_000),
  constraintHash: ConstraintHashSchema,
  count: z.number().int().min(1).max(8).default(4),
});

export const IdeaExploreOutputItemSchema = z.strictObject({
  title: z.string().trim().min(1).max(512),
  summary: z.string().trim().min(1).max(8_000),
  content: z.string().trim().min(1).max(200_000),
});
export const IdeaExploreOutputSchema = z.strictObject({
  ideas: z.array(IdeaExploreOutputItemSchema).min(1).max(8),
});
export const IdeaExploreOutputJsonSchema = z.toJSONSchema(IdeaExploreOutputSchema);

export const IdeaListCursorSchema = z.strictObject({
  updatedAt: z.iso.datetime(),
  id: DraftEntityIdSchema,
});
export const IdeaListInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  status: IdeaStatusSchema.nullable().default(null),
  limit: z.number().int().min(1).max(100).default(50),
  cursor: IdeaListCursorSchema.nullable().default(null),
});
export const IdeaListSchema = z.strictObject({
  projectId: ProjectIdSchema,
  ideas: z.array(IdeaCardSchema).max(100),
  nextCursor: IdeaListCursorSchema.nullable(),
});
export const IdeaGetInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  ideaId: DraftEntityIdSchema,
});
export const IdeaCreateInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  ideaKind: IdeaKindSchema,
  title: z.string().trim().min(1).max(512),
  summary: z.string().trim().min(1).max(8_000),
  content: z.string().trim().min(1).max(200_000),
  divergenceLevel: IdeaDivergenceLevelSchema,
  depthLevel: IdeaDepthLevelSchema,
  sourceContext: IdeaSourceContextSchema,
});
export const IdeaSetStatusInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  ideaId: DraftEntityIdSchema,
  status: IdeaMutableStatusSchema,
});

const ProjectBriefConversionDraftSchema = ProjectBriefUpdateInputSchema.omit({ projectId: true });
const PlotNodeConversionDraftSchema = PlotNodeCreateInputSchema.omit({ projectId: true });
const EntityConversionDraftSchema = EntityCreateInputSchema.omit({
  projectId: true,
  authority: true,
});
const CanonFactConversionDraftSchema = CanonFactSetInputSchema.omit({
  projectId: true,
  authority: true,
  sourceType: true,
  sourceId: true,
});
const TimelineEventConversionDraftSchema = TimelineEventSaveInputSchema.omit({
  projectId: true,
  authority: true,
  eventId: true,
});
const ForeshadowingConversionDraftSchema = ForeshadowingSaveInputSchema.omit({
  projectId: true,
  authority: true,
  foreshadowingId: true,
});

export const IdeaConversionTargetSchema = z.discriminatedUnion('targetType', [
  z.strictObject({
    targetType: z.literal('project_brief'),
    draft: ProjectBriefConversionDraftSchema,
  }),
  z.strictObject({
    targetType: z.literal('plot_node'),
    draft: PlotNodeConversionDraftSchema,
  }),
  z.strictObject({ targetType: z.literal('entity'), draft: EntityConversionDraftSchema }),
  z.strictObject({ targetType: z.literal('canon_fact'), draft: CanonFactConversionDraftSchema }),
  z.strictObject({
    targetType: z.literal('timeline_event'),
    draft: TimelineEventConversionDraftSchema,
  }),
  z.strictObject({
    targetType: z.literal('foreshadowing'),
    draft: ForeshadowingConversionDraftSchema,
  }),
]);

export const IdeaConversionPreviewInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  ideaId: DraftEntityIdSchema,
  target: IdeaConversionTargetSchema,
});
export const IdeaConversionPreviewSchema = z.strictObject({
  projectId: ProjectIdSchema,
  ideaId: DraftEntityIdSchema,
  ideaUpdatedAt: z.iso.datetime(),
  target: IdeaConversionTargetSchema,
  previewHash: ConstraintHashSchema,
  summary: z.string().trim().min(1).max(2_000),
});
export const IdeaConversionApplyInputSchema = IdeaConversionPreviewInputSchema.extend({
  previewHash: ConstraintHashSchema,
}).strict();
export const IdeaConversionApplyResultSchema = z.strictObject({
  idea: IdeaCardSchema,
  conversion: IdeaConversionSchema,
});

export const CoreIdeaOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal(IDEA_CAPSULE_COMMANDS.list), input: IdeaListInputSchema }),
  z.strictObject({ operation: z.literal(IDEA_CAPSULE_COMMANDS.get), input: IdeaGetInputSchema }),
  z.strictObject({ operation: z.literal(IDEA_CAPSULE_COMMANDS.create), input: IdeaCreateInputSchema }),
  z.strictObject({
    operation: z.literal(IDEA_CAPSULE_COMMANDS.setStatus),
    input: IdeaSetStatusInputSchema,
  }),
  z.strictObject({
    operation: z.literal(IDEA_CAPSULE_COMMANDS.previewConversion),
    input: IdeaConversionPreviewInputSchema,
  }),
  z.strictObject({
    operation: z.literal(IDEA_CAPSULE_COMMANDS.applyConversion),
    input: IdeaConversionApplyInputSchema,
  }),
]);

const coreSuccess = <Operation extends string, DataSchema extends z.ZodType>(
  operation: Operation,
  data: DataSchema,
) => z.strictObject({ ok: z.literal(true), operation: z.literal(operation), data });

export const CoreIdeaResultSchema = z.union([
  coreSuccess(IDEA_CAPSULE_COMMANDS.list, IdeaListSchema),
  coreSuccess(IDEA_CAPSULE_COMMANDS.get, IdeaDetailSchema),
  coreSuccess(IDEA_CAPSULE_COMMANDS.create, IdeaCardSchema),
  coreSuccess(IDEA_CAPSULE_COMMANDS.setStatus, IdeaCardSchema),
  coreSuccess(IDEA_CAPSULE_COMMANDS.previewConversion, IdeaConversionPreviewSchema),
  coreSuccess(IDEA_CAPSULE_COMMANDS.applyConversion, IdeaConversionApplyResultSchema),
  z.strictObject({
    ok: z.literal(false),
    operation: z.enum(IDEA_CAPSULE_COMMANDS),
    errorCode: ErrorCodeSchema,
  }),
]);

export const IdeaOperationDataSchema = z.union([
  IdeaListSchema,
  IdeaDetailSchema,
  IdeaCardSchema,
  IdeaConversionPreviewSchema,
  IdeaConversionApplyResultSchema,
]);

const commandFailureSchema = z.strictObject({
  ok: z.literal(false),
  requestId: TaskIdSchema,
  error: z.strictObject({
    code: ErrorCodeSchema,
    message: z.string().min(1).max(512),
    retryable: z.boolean(),
    userAction: z.string().min(1).max(512).optional(),
    diagnosticId: z.string().min(1).max(128).optional(),
  }),
});
export const IdeaOperationCommandSchema = z.strictObject({
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  requestId: TaskIdSchema,
  sentAt: z.iso.datetime(),
  command: z.literal(IDEA_CAPSULE_BRIDGE_COMMAND),
  payload: CoreIdeaOperationSchema,
});
export const IdeaOperationResultSchema = z.union([
  z.strictObject({ ok: z.literal(true), requestId: TaskIdSchema, data: IdeaOperationDataSchema }),
  commandFailureSchema,
]);

export interface IdeaCapsuleBridge {
  operate(operation: CoreIdeaOperation): Promise<CommandResult<IdeaOperationData>>;
}

export type IdeaKind = z.infer<typeof IdeaKindSchema>;
export type IdeaDivergenceLevel = z.infer<typeof IdeaDivergenceLevelSchema>;
export type IdeaDepthLevel = z.infer<typeof IdeaDepthLevelSchema>;
export type IdeaStatus = z.infer<typeof IdeaStatusSchema>;
export type IdeaConversionStatus = z.infer<typeof IdeaConversionStatusSchema>;
export type IdeaConversionTargetType = z.infer<typeof IdeaConversionTargetTypeSchema>;
export type IdeaSourceContext = z.infer<typeof IdeaSourceContextSchema>;
export type IdeaCard = z.infer<typeof IdeaCardSchema>;
export type IdeaConversion = z.infer<typeof IdeaConversionSchema>;
export type IdeaDetail = z.infer<typeof IdeaDetailSchema>;
export type IdeaExplorePromptInput = z.input<typeof IdeaExplorePromptInputSchema>;
export type IdeaExploreOutputItem = z.infer<typeof IdeaExploreOutputItemSchema>;
export type IdeaExploreOutput = z.infer<typeof IdeaExploreOutputSchema>;
export type IdeaListInput = z.input<typeof IdeaListInputSchema>;
export type IdeaList = z.infer<typeof IdeaListSchema>;
export type IdeaGetInput = z.infer<typeof IdeaGetInputSchema>;
export type IdeaCreateInput = z.infer<typeof IdeaCreateInputSchema>;
export type IdeaSetStatusInput = z.infer<typeof IdeaSetStatusInputSchema>;
export type IdeaConversionTarget = z.infer<typeof IdeaConversionTargetSchema>;
export type IdeaConversionPreviewInput = z.infer<typeof IdeaConversionPreviewInputSchema>;
export type IdeaConversionPreview = z.infer<typeof IdeaConversionPreviewSchema>;
export type IdeaConversionApplyInput = z.infer<typeof IdeaConversionApplyInputSchema>;
export type IdeaConversionApplyResult = z.infer<typeof IdeaConversionApplyResultSchema>;
export type CoreIdeaOperation = z.infer<typeof CoreIdeaOperationSchema>;
export type CoreIdeaResult = z.infer<typeof CoreIdeaResultSchema>;
export type IdeaOperationData = z.infer<typeof IdeaOperationDataSchema>;
