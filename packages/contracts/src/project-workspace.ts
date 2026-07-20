import { z } from 'zod';

import { ErrorCodeSchema } from './error-codes.js';
import { CoreDraftOperationSchema, CoreDraftResultSchema } from './draft.js';
import { CoreVersionOperationSchema, CoreVersionResultSchema } from './version.js';
import { CoreRecoveryOperationSchema, CoreRecoveryResultSchema } from './recovery.js';
import { CoreTextIoOperationSchema, CoreTextIoResultSchema } from './import-export.js';
import { CoreCandidateOperationSchema, CoreCandidateResultSchema } from './candidate.js';
import {
  CoreCandidateApplyOperationSchema,
  CoreCandidateApplyResultSchema,
} from './candidate-apply.js';
import {
  CoreProjectStructureOperationSchema,
  CoreProjectStructureResultSchema,
} from './project-structure.js';
import {
  CoreProjectPlanningOperationSchema,
  CoreProjectPlanningResultSchema,
} from './project-planning.js';
import { CoreSceneBeatOperationSchema, CoreSceneBeatResultSchema } from './scene-beat.js';
import { CoreEntityCanonOperationSchema, CoreEntityCanonResultSchema } from './entity-canon.js';
import { CoreContinuityOperationSchema, CoreContinuityResultSchema } from './continuity.js';
import {
  CoreNarrativePlanningOperationSchema,
  CoreNarrativePlanningResultSchema,
} from './narrative-planning.js';
import { ProjectIdSchema, TASK_PROTOCOL_VERSION } from './task-protocol.js';

export const PROJECT_WORKSPACE_IPC_CHANNELS = {
  getActive: 'worldforge:project:get-active',
  create: 'worldforge:project:create',
  openSelected: 'worldforge:project:open-selected',
  openRecent: 'worldforge:project:open-recent',
  close: 'worldforge:project:close',
  move: 'worldforge:project:move',
} as const;

export const PROJECT_WORKSPACE_COMMANDS = {
  getActive: 'project.getActive',
  create: 'project.create',
  openSelected: 'project.openSelected',
  openRecent: 'project.openRecent',
  close: 'project.close',
  move: 'project.move',
} as const;

export const ProjectNameSchema = z.string().trim().min(1).max(240);
export const ProjectChannelSchema = z.string().trim().min(1).max(120);

export const ProjectCreateInputSchema = z.strictObject({
  name: ProjectNameSchema,
  channel: ProjectChannelSchema,
  initialStructure: z.enum(['starter', 'blank']).optional(),
});

export const ProjectWorkspaceManifestSchema = z.strictObject({
  format: z.literal('worldforge-project'),
  manifestVersion: z.literal(1),
  projectId: ProjectIdSchema,
  displayName: ProjectNameSchema,
  databaseFile: z.literal('project.sqlite'),
  projectSchemaVersion: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
});

export const ProjectDatabaseModeSchema = z.enum(['read-write', 'read-only']);
export const ProjectDatabaseCompatibilitySchema = z.enum([
  'current',
  'migrated',
  'migration-failed',
  'future-schema',
  'checksum-mismatch',
  'integrity-failed',
]);
export const ProjectReadOnlyReasonSchema = ProjectDatabaseCompatibilitySchema.nullable();

export const ProjectWorkspaceSummarySchema = z.strictObject({
  projectId: ProjectIdSchema,
  name: ProjectNameSchema,
  channel: ProjectChannelSchema,
  workspacePath: z.string().min(1).max(32_768),
  schemaVersion: z.number().int().nonnegative(),
  databaseMode: ProjectDatabaseModeSchema,
  compatibility: ProjectDatabaseCompatibilitySchema,
  readOnlyReason: ProjectReadOnlyReasonSchema,
  createdAt: z.iso.datetime(),
});

export const ProjectMoveResultSchema = ProjectWorkspaceSummarySchema.extend({
  sourceRetained: z.boolean(),
}).strict();

export const ProjectCloseResultSchema = z.strictObject({
  projectId: ProjectIdSchema,
  closed: z.literal(true),
});

const commandEnvelope = {
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  requestId: z.uuid(),
  sentAt: z.iso.datetime(),
};

export const ProjectGetActiveCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_WORKSPACE_COMMANDS.getActive),
  payload: z.strictObject({}),
});
export const ProjectCreateCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_WORKSPACE_COMMANDS.create),
  payload: ProjectCreateInputSchema,
});
export const ProjectOpenSelectedCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_WORKSPACE_COMMANDS.openSelected),
  payload: z.strictObject({}),
});
export const ProjectOpenRecentCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_WORKSPACE_COMMANDS.openRecent),
  payload: z.strictObject({ projectId: ProjectIdSchema }),
});
export const ProjectCloseCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_WORKSPACE_COMMANDS.close),
  payload: z.strictObject({ projectId: ProjectIdSchema }),
});
export const ProjectMoveCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROJECT_WORKSPACE_COMMANDS.move),
  payload: z.strictObject({ projectId: ProjectIdSchema }),
});

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

function projectResultSchema<DataSchema extends z.ZodType>(data: DataSchema) {
  return z.union([
    z.strictObject({ ok: z.literal(true), requestId: z.uuid(), data }),
    projectFailureSchema,
  ]);
}

export const ProjectActiveResultSchema = projectResultSchema(
  ProjectWorkspaceSummarySchema.nullable(),
);
export const ProjectWorkspaceResultSchema = projectResultSchema(ProjectWorkspaceSummarySchema);
export const ProjectMoveCommandResultSchema = projectResultSchema(ProjectMoveResultSchema);
export const ProjectCloseCommandResultSchema = projectResultSchema(ProjectCloseResultSchema);

const CoreProjectWorkspaceOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal(PROJECT_WORKSPACE_COMMANDS.getActive) }),
  z.strictObject({
    operation: z.literal(PROJECT_WORKSPACE_COMMANDS.create),
    input: ProjectCreateInputSchema,
    parentDirectory: z.string().min(1).max(32_768),
  }),
  z.strictObject({
    operation: z.literal(PROJECT_WORKSPACE_COMMANDS.openSelected),
    workspacePath: z.string().min(1).max(32_768),
  }),
  z.strictObject({
    operation: z.literal(PROJECT_WORKSPACE_COMMANDS.openRecent),
    projectId: ProjectIdSchema,
  }),
  z.strictObject({
    operation: z.literal(PROJECT_WORKSPACE_COMMANDS.close),
    projectId: ProjectIdSchema,
  }),
  z.strictObject({
    operation: z.literal(PROJECT_WORKSPACE_COMMANDS.move),
    projectId: ProjectIdSchema,
    targetParentDirectory: z.string().min(1).max(32_768),
  }),
]);

export const CoreProjectOperationSchema = z.union([
  CoreProjectWorkspaceOperationSchema,
  CoreProjectStructureOperationSchema,
  CoreProjectPlanningOperationSchema,
  CoreSceneBeatOperationSchema,
  CoreEntityCanonOperationSchema,
  CoreContinuityOperationSchema,
  CoreNarrativePlanningOperationSchema,
  CoreDraftOperationSchema,
  CoreCandidateOperationSchema,
  CoreCandidateApplyOperationSchema,
  CoreVersionOperationSchema,
  CoreRecoveryOperationSchema,
  CoreTextIoOperationSchema,
]);

const coreSuccess = <Operation extends string, DataSchema extends z.ZodType>(
  operation: Operation,
  data: DataSchema,
) =>
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(operation),
    data,
  });

const CoreProjectWorkspaceResultSchema = z.union([
  coreSuccess(PROJECT_WORKSPACE_COMMANDS.getActive, ProjectWorkspaceSummarySchema.nullable()),
  coreSuccess(PROJECT_WORKSPACE_COMMANDS.create, ProjectWorkspaceSummarySchema),
  coreSuccess(PROJECT_WORKSPACE_COMMANDS.openSelected, ProjectWorkspaceSummarySchema),
  coreSuccess(PROJECT_WORKSPACE_COMMANDS.openRecent, ProjectWorkspaceSummarySchema),
  coreSuccess(PROJECT_WORKSPACE_COMMANDS.close, ProjectCloseResultSchema),
  coreSuccess(PROJECT_WORKSPACE_COMMANDS.move, ProjectMoveResultSchema),
  z.strictObject({
    ok: z.literal(false),
    operation: z.enum(PROJECT_WORKSPACE_COMMANDS),
    errorCode: ErrorCodeSchema,
  }),
]);

export const CoreProjectResultSchema = z.union([
  CoreProjectWorkspaceResultSchema,
  CoreProjectStructureResultSchema,
  CoreProjectPlanningResultSchema,
  CoreSceneBeatResultSchema,
  CoreEntityCanonResultSchema,
  CoreContinuityResultSchema,
  CoreNarrativePlanningResultSchema,
  CoreDraftResultSchema,
  CoreCandidateResultSchema,
  CoreCandidateApplyResultSchema,
  CoreVersionResultSchema,
  CoreRecoveryResultSchema,
  CoreTextIoResultSchema,
]);

export type ProjectCreateInput = z.infer<typeof ProjectCreateInputSchema>;
export type ProjectWorkspaceManifest = z.infer<typeof ProjectWorkspaceManifestSchema>;
export type ProjectWorkspaceSummary = z.infer<typeof ProjectWorkspaceSummarySchema>;
export type ProjectMoveResult = z.infer<typeof ProjectMoveResultSchema>;
export type ProjectCloseResult = z.infer<typeof ProjectCloseResultSchema>;
export type CoreProjectOperation = z.infer<typeof CoreProjectOperationSchema>;
export type CoreProjectResult = z.infer<typeof CoreProjectResultSchema>;
