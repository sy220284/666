import { z } from 'zod';

import { ErrorCodeSchema } from './error-codes.js';
import { LifecycleStatusSchema, OrderKeySchema, OrderPlacementSchema } from './project-structure.js';
import { ProjectIdSchema, TASK_PROTOCOL_VERSION } from './task-protocol.js';

export const PROJECT_PLANNING_IPC_CHANNELS = {
  getBrief: 'worldforge:planning:get-brief',
  updateBrief: 'worldforge:planning:update-brief',
  listPlotNodes: 'worldforge:planning:list-plot-nodes',
  createPlotNode: 'worldforge:planning:create-plot-node',
  updatePlotNode: 'worldforge:planning:update-plot-node',
  movePlotNode: 'worldforge:planning:move-plot-node',
  deletePlotNode: 'worldforge:planning:delete-plot-node',
} as const;

export const PROJECT_PLANNING_COMMANDS = {
  getBrief: 'planning.getBrief',
  updateBrief: 'planning.updateBrief',
  listPlotNodes: 'planning.listPlotNodes',
  createPlotNode: 'planning.createPlotNode',
  updatePlotNode: 'planning.updatePlotNode',
  movePlotNode: 'planning.movePlotNode',
  deletePlotNode: 'planning.deletePlotNode',
} as const;

export const ProjectBriefTextSchema = z.string().trim().max(4_000);
export const ProjectBriefRuleSchema = z.string().trim().min(1).max(500);
export const ProjectBriefRulesSchema = z.array(ProjectBriefRuleSchema).max(100);

export const ProjectBriefSchema = z.strictObject({
  id: z.uuid().nullable(),
  projectId: ProjectIdSchema,
  concept: ProjectBriefTextSchema,
  readingPromise: ProjectBriefTextSchema,
  protagonistGoal: ProjectBriefTextSchema,
  coreConflict: ProjectBriefTextSchema,
  endingIntent: ProjectBriefTextSchema,
  required: ProjectBriefRulesSchema,
  forbidden: ProjectBriefRulesSchema,
  updatedAt: z.iso.datetime().nullable(),
});

export const ProjectBriefUpdateInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  concept: ProjectBriefTextSchema,
  readingPromise: ProjectBriefTextSchema,
  protagonistGoal: ProjectBriefTextSchema,
  coreConflict: ProjectBriefTextSchema,
  endingIntent: ProjectBriefTextSchema,
  required: ProjectBriefRulesSchema,
  forbidden: ProjectBriefRulesSchema,
});

export const PlotNodeTypeSchema = z.enum(['volume', 'arc', 'chapter']);
export const PlotNodeTitleSchema = z.string().trim().min(1).max(240);
export const PlotNodeTextSchema = z.string().trim().max(4_000);
export const PlotNodeSchema = z.strictObject({
  id: z.uuid(),
  projectId: ProjectIdSchema,
  parentId: z.uuid().nullable(),
  nodeType: PlotNodeTypeSchema,
  title: PlotNodeTitleSchema,
  goal: PlotNodeTextSchema,
  coreConflict: PlotNodeTextSchema,
  expectedResult: PlotNodeTextSchema,
  orderKey: OrderKeySchema,
  status: LifecycleStatusSchema,
});
export const PlotNodeListSchema = z.strictObject({
  projectId: ProjectIdSchema,
  nodes: z.array(PlotNodeSchema),
});

const plotNodeFields = {
  nodeType: PlotNodeTypeSchema,
  title: PlotNodeTitleSchema,
  goal: PlotNodeTextSchema,
  coreConflict: PlotNodeTextSchema,
  expectedResult: PlotNodeTextSchema,
  status: LifecycleStatusSchema,
};
export const PlotNodeCreateInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  parentId: z.uuid().nullable(),
  ...plotNodeFields,
  placement: OrderPlacementSchema.optional(),
});
export const PlotNodeUpdatePatchSchema = z
  .strictObject({
    nodeType: PlotNodeTypeSchema.optional(),
    title: PlotNodeTitleSchema.optional(),
    goal: PlotNodeTextSchema.optional(),
    coreConflict: PlotNodeTextSchema.optional(),
    expectedResult: PlotNodeTextSchema.optional(),
    status: LifecycleStatusSchema.optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, 'At least one PlotNode field is required.');
export const PlotNodeUpdateInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  nodeId: z.uuid(),
  patch: PlotNodeUpdatePatchSchema,
});
export const PlotNodeMoveInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  nodeId: z.uuid(),
  targetParentId: z.uuid().nullable(),
  placement: OrderPlacementSchema,
});
export const PlotNodeDeleteInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  nodeId: z.uuid(),
});

const commandEnvelope = {
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  requestId: z.uuid(),
  sentAt: z.iso.datetime(),
};
const projectOnlyPayload = z.strictObject({ projectId: ProjectIdSchema });

export const ProjectGetBriefCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_PLANNING_COMMANDS.getBrief),
  payload: projectOnlyPayload,
});
export const ProjectUpdateBriefCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_PLANNING_COMMANDS.updateBrief),
  payload: ProjectBriefUpdateInputSchema,
});
export const ProjectListPlotNodesCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_PLANNING_COMMANDS.listPlotNodes),
  payload: projectOnlyPayload,
});
export const ProjectCreatePlotNodeCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_PLANNING_COMMANDS.createPlotNode),
  payload: PlotNodeCreateInputSchema,
});
export const ProjectUpdatePlotNodeCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_PLANNING_COMMANDS.updatePlotNode),
  payload: PlotNodeUpdateInputSchema,
});
export const ProjectMovePlotNodeCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_PLANNING_COMMANDS.movePlotNode),
  payload: PlotNodeMoveInputSchema,
});
export const ProjectDeletePlotNodeCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_PLANNING_COMMANDS.deletePlotNode),
  payload: PlotNodeDeleteInputSchema,
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

export const ProjectBriefResultSchema = commandResultSchema(ProjectBriefSchema);
export const ProjectPlotNodeListResultSchema = commandResultSchema(PlotNodeListSchema);

export const CoreProjectPlanningOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal(PROJECT_PLANNING_COMMANDS.getBrief),
    projectId: ProjectIdSchema,
  }),
  z.strictObject({
    operation: z.literal(PROJECT_PLANNING_COMMANDS.updateBrief),
    input: ProjectBriefUpdateInputSchema,
  }),
  z.strictObject({
    operation: z.literal(PROJECT_PLANNING_COMMANDS.listPlotNodes),
    projectId: ProjectIdSchema,
  }),
  z.strictObject({
    operation: z.literal(PROJECT_PLANNING_COMMANDS.createPlotNode),
    input: PlotNodeCreateInputSchema,
  }),
  z.strictObject({
    operation: z.literal(PROJECT_PLANNING_COMMANDS.updatePlotNode),
    input: PlotNodeUpdateInputSchema,
  }),
  z.strictObject({
    operation: z.literal(PROJECT_PLANNING_COMMANDS.movePlotNode),
    input: PlotNodeMoveInputSchema,
  }),
  z.strictObject({
    operation: z.literal(PROJECT_PLANNING_COMMANDS.deletePlotNode),
    input: PlotNodeDeleteInputSchema,
  }),
]);

const coreSuccess = <Operation extends string, DataSchema extends z.ZodType>(
  operation: Operation,
  data: DataSchema,
) => z.strictObject({ ok: z.literal(true), operation: z.literal(operation), data });

export const CoreProjectPlanningResultSchema = z.union([
  coreSuccess(PROJECT_PLANNING_COMMANDS.getBrief, ProjectBriefSchema),
  coreSuccess(PROJECT_PLANNING_COMMANDS.updateBrief, ProjectBriefSchema),
  coreSuccess(PROJECT_PLANNING_COMMANDS.listPlotNodes, PlotNodeListSchema),
  coreSuccess(PROJECT_PLANNING_COMMANDS.createPlotNode, PlotNodeListSchema),
  coreSuccess(PROJECT_PLANNING_COMMANDS.updatePlotNode, PlotNodeListSchema),
  coreSuccess(PROJECT_PLANNING_COMMANDS.movePlotNode, PlotNodeListSchema),
  coreSuccess(PROJECT_PLANNING_COMMANDS.deletePlotNode, PlotNodeListSchema),
  z.strictObject({
    ok: z.literal(false),
    operation: z.enum(PROJECT_PLANNING_COMMANDS),
    errorCode: ErrorCodeSchema,
  }),
]);

export type ProjectBrief = z.infer<typeof ProjectBriefSchema>;
export type ProjectBriefUpdateInput = z.infer<typeof ProjectBriefUpdateInputSchema>;
export type PlotNodeType = z.infer<typeof PlotNodeTypeSchema>;
export type PlotNode = z.infer<typeof PlotNodeSchema>;
export type PlotNodeList = z.infer<typeof PlotNodeListSchema>;
export type PlotNodeCreateInput = z.infer<typeof PlotNodeCreateInputSchema>;
export type PlotNodeUpdateInput = z.infer<typeof PlotNodeUpdateInputSchema>;
export type PlotNodeMoveInput = z.infer<typeof PlotNodeMoveInputSchema>;
export type PlotNodeDeleteInput = z.infer<typeof PlotNodeDeleteInputSchema>;
export type CoreProjectPlanningOperation = z.infer<typeof CoreProjectPlanningOperationSchema>;
export type CoreProjectPlanningResult = z.infer<typeof CoreProjectPlanningResultSchema>;
