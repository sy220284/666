import { z } from 'zod';

import { ErrorCodeSchema, type ErrorCode } from './error-codes.js';
import {
  APP_DATA_COMMANDS,
  APP_DATA_IPC_CHANNELS,
  CoreAppDataOperationSchema,
  CoreAppDataResultSchema,
  ProjectListRecentCommandSchema,
  ProjectRelocateRecentCommandSchema,
  ProjectRemoveRecentCommandSchema,
  SettingsGetCommandSchema,
  SettingsResetCommandSchema,
  SettingsSetCommandSchema,
  type AppSettingsSnapshot,
  type AppSettingsUpdate,
  type RecentProject,
} from './app-data.js';
import {
  ProjectIdSchema,
  TASK_PROTOCOL_VERSION,
  TaskCancelCommandSchema,
  TaskCancelDataSchema,
  TaskCommandSchema,
  TaskEventEnvelopeSchema,
  TaskGetSnapshotCommandSchema,
  TaskListActiveCommandSchema,
  TaskListActiveDataSchema,
  TaskPortConnectSchema,
  TaskSnapshotSchema,
  type TaskEventEnvelope,
  type TaskSnapshot,
} from './task-protocol.js';

export * from './error-codes.js';
export * from './ai-output-protocol.js';
export * from './task-protocol.js';
export * from './app-data.js';

export const contractsLayer = {
  name: '@worldforge/contracts',
  responsibility: 'cross-process-schemas-and-types',
} as const;

export const PROTOCOL_VERSION = TASK_PROTOCOL_VERSION;

export const IPC_CHANNELS = {
  ...APP_DATA_IPC_CHANNELS,
  appGetInfo: 'worldforge:app:get-info',
  appGetCoreStatus: 'worldforge:app:get-core-status',
  appRestartCore: 'worldforge:app:restart-core',
  appGetWindowPreferences: 'worldforge:app:get-window-preferences',
  appSetAppearancePreferences: 'worldforge:app:set-appearance-preferences',
  aiSetCredential: 'worldforge:ai:set-credential',
  aiRemoveCredential: 'worldforge:ai:remove-credential',
  aiHasCredential: 'worldforge:ai:has-credential',
  taskGetSnapshot: 'worldforge:task:get-snapshot',
  taskCancel: 'worldforge:task:cancel',
  taskListActive: 'worldforge:task:list-active',
  taskConnectEvents: 'worldforge:task:connect-events',
} as const;

export const APP_COMMANDS = {
  ...APP_DATA_COMMANDS,
  getInfo: 'app.getInfo',
  getCoreStatus: 'app.getCoreStatus',
  restartCore: 'app.restartCore',
  getWindowPreferences: 'app.getWindowPreferences',
  setAppearancePreferences: 'app.setAppearancePreferences',
  setCredential: 'ai.provider.setCredential',
  removeCredential: 'ai.provider.removeCredential',
  hasCredential: 'ai.provider.hasCredential',
  taskGetSnapshot: 'task.getSnapshot',
  taskCancel: 'task.cancel',
  taskListActive: 'task.listActive',
} as const;

export const RequestIdSchema = z.uuid();
export const EmptyPayloadSchema = z.strictObject({});
export const ProviderIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
export const CredentialRefSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^cred_[0-9a-f-]{36}$/);

export const WorkspaceAlignmentSchema = z.enum(['center', 'left', 'right']);
export const ContentWidthPreferenceSchema = z.enum(['narrow', 'normal', 'wide', 'adaptive']);
export const UiScalePercentSchema = z
  .number()
  .int()
  .min(90)
  .max(150)
  .refine((value) => value % 10 === 0, 'UI scale must use 10% steps.');
export const AppearancePreferencesSchema = z.strictObject({
  workspaceAlignment: WorkspaceAlignmentSchema,
  uiScalePercent: UiScalePercentSchema,
  bodyFontSize: z.number().int().min(14).max(28),
  contentWidth: ContentWidthPreferenceSchema,
});
export const WindowBoundsDipSchema = z.strictObject({
  x: z.number().int().min(-100_000).max(100_000),
  y: z.number().int().min(-100_000).max(100_000),
  width: z.number().int().min(320).max(16_384),
  height: z.number().int().min(240).max(16_384),
});
export const WindowPreferencesSchema = AppearancePreferencesSchema.extend({
  displayId: z.string().min(1).max(128),
  boundsDip: WindowBoundsDipSchema,
  scaleFactor: z.number().finite().min(0.5).max(8),
  maximized: z.boolean(),
}).strict();

export const DEFAULT_APPEARANCE_PREFERENCES = {
  workspaceAlignment: 'center',
  uiScalePercent: 100,
  bodyFontSize: 18,
  contentWidth: 'normal',
} as const satisfies z.infer<typeof AppearancePreferencesSchema>;

const envelopeBase = {
  protocolVersion: z.literal(PROTOCOL_VERSION),
  requestId: RequestIdSchema,
  sentAt: z.iso.datetime(),
};

export const AppGetInfoCommandSchema = z.strictObject({
  ...envelopeBase,
  command: z.literal(APP_COMMANDS.getInfo),
  payload: EmptyPayloadSchema,
});

export const AppGetCoreStatusCommandSchema = z.strictObject({
  ...envelopeBase,
  command: z.literal(APP_COMMANDS.getCoreStatus),
  payload: EmptyPayloadSchema,
});

export const AppRestartCoreCommandSchema = z.strictObject({
  ...envelopeBase,
  command: z.literal(APP_COMMANDS.restartCore),
  payload: EmptyPayloadSchema,
});

export const AppGetWindowPreferencesCommandSchema = z.strictObject({
  ...envelopeBase,
  command: z.literal(APP_COMMANDS.getWindowPreferences),
  payload: EmptyPayloadSchema,
});

export const AppSetAppearancePreferencesCommandSchema = z.strictObject({
  ...envelopeBase,
  command: z.literal(APP_COMMANDS.setAppearancePreferences),
  payload: AppearancePreferencesSchema,
});

export const AiSetCredentialCommandSchema = z.strictObject({
  ...envelopeBase,
  command: z.literal(APP_COMMANDS.setCredential),
  payload: z.strictObject({
    providerId: ProviderIdSchema,
    credential: z.string().min(1).max(32_768),
  }),
});

export const AiRemoveCredentialCommandSchema = z.strictObject({
  ...envelopeBase,
  command: z.literal(APP_COMMANDS.removeCredential),
  payload: z.strictObject({ credentialRef: CredentialRefSchema }),
});

export const AiHasCredentialCommandSchema = z.strictObject({
  ...envelopeBase,
  command: z.literal(APP_COMMANDS.hasCredential),
  payload: z.strictObject({ credentialRef: CredentialRefSchema }),
});

export const RegisteredCommandSchema = z.discriminatedUnion('command', [
  AppGetInfoCommandSchema,
  AppGetCoreStatusCommandSchema,
  AppRestartCoreCommandSchema,
  AppGetWindowPreferencesCommandSchema,
  AppSetAppearancePreferencesCommandSchema,
  SettingsGetCommandSchema,
  SettingsSetCommandSchema,
  SettingsResetCommandSchema,
  ProjectListRecentCommandSchema,
  ProjectRelocateRecentCommandSchema,
  ProjectRemoveRecentCommandSchema,
  AiSetCredentialCommandSchema,
  AiRemoveCredentialCommandSchema,
  AiHasCredentialCommandSchema,
  TaskGetSnapshotCommandSchema,
  TaskCancelCommandSchema,
  TaskListActiveCommandSchema,
]);

export const AppInfoSchema = z.strictObject({
  version: z.string().min(1),
  platform: z.string().min(1),
  protocolVersion: z.literal(PROTOCOL_VERSION),
});

export const CoreStatusSchema = z.strictObject({
  status: z.enum(['stopped', 'starting', 'healthy', 'draining', 'degraded', 'crashed']),
  pid: z.number().int().positive().nullable(),
  restartCount: z.number().int().nonnegative(),
  lastErrorCode: z.string().min(1).nullable(),
  diagnosticId: z.string().min(1).nullable(),
});

export const CoreOperationSchema = z.strictObject({
  accepted: z.boolean(),
  status: CoreStatusSchema,
});

export const CredentialReferenceSchema = z.strictObject({
  credentialRef: CredentialRefSchema,
});

export const CredentialPresenceSchema = z.strictObject({
  exists: z.boolean(),
});

export const SafeErrorDetailsSchema = z.strictObject({
  taskId: z.uuid().optional(),
  expectedProtocolVersion: z.number().int().positive().optional(),
  expectedSequence: z.number().int().positive().optional(),
  receivedSequence: z.number().int().positive().optional(),
  field: z.string().min(1).max(128).optional(),
});

export const CommandFailureSchema = z.strictObject({
  ok: z.literal(false),
  requestId: RequestIdSchema,
  error: z.strictObject({
    code: ErrorCodeSchema,
    message: z.string().min(1).max(512),
    retryable: z.boolean(),
    userAction: z.string().min(1).max(512).optional(),
    diagnosticId: z.string().min(1).max(128).optional(),
    details: SafeErrorDetailsSchema.optional(),
  }),
});

export function commandResultSchema<DataSchema extends z.ZodType>(dataSchema: DataSchema) {
  return z.discriminatedUnion('ok', [
    z.strictObject({
      ok: z.literal(true),
      requestId: RequestIdSchema,
      data: dataSchema,
    }),
    CommandFailureSchema,
  ]);
}

export const AppInfoResultSchema = commandResultSchema(AppInfoSchema);
export const CoreStatusResultSchema = commandResultSchema(CoreStatusSchema);
export const CoreOperationResultSchema = commandResultSchema(CoreOperationSchema);
export const WindowPreferencesResultSchema = commandResultSchema(WindowPreferencesSchema);
export const CredentialReferenceResultSchema = commandResultSchema(CredentialReferenceSchema);
export const CredentialPresenceResultSchema = commandResultSchema(CredentialPresenceSchema);
export const TaskSnapshotResultSchema = commandResultSchema(TaskSnapshotSchema);
export const TaskCancelResultSchema = commandResultSchema(TaskCancelDataSchema);
export const TaskListActiveResultSchema = commandResultSchema(TaskListActiveDataSchema);
export const TaskCommandResultSchema = z.union([
  TaskSnapshotResultSchema,
  TaskCancelResultSchema,
  TaskListActiveResultSchema,
]);

export const CoreWindowPreferencesResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), preferences: WindowPreferencesSchema.nullable() }),
  z.strictObject({ ok: z.literal(false), errorCode: ErrorCodeSchema }),
]);

export const CoreControlMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('core.ping'),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    requestId: RequestIdSchema,
  }),
  z.strictObject({
    type: z.literal('core.drain'),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    requestId: RequestIdSchema,
  }),
  z.strictObject({
    type: z.literal('core.shutdown'),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    requestId: RequestIdSchema,
  }),
  z.strictObject({
    type: z.literal('core.command'),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    requestId: RequestIdSchema,
    envelope: TaskCommandSchema,
  }),
  z.strictObject({
    type: z.literal('core.attach-task-port'),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    connection: TaskPortConnectSchema,
  }),
  z.strictObject({
    type: z.literal('core.window-preferences.get'),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    requestId: RequestIdSchema,
  }),
  z.strictObject({
    type: z.literal('core.window-preferences.set'),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    requestId: RequestIdSchema,
    preferences: WindowPreferencesSchema,
  }),
  z.strictObject({
    type: z.literal('core.app-data.command'),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    requestId: RequestIdSchema,
    operation: CoreAppDataOperationSchema,
  }),
]);

export const CoreEventSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('core.ready'),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    startedAt: z.iso.datetime(),
  }),
  z.strictObject({
    type: z.literal('core.health'),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    requestId: RequestIdSchema,
    status: z.literal('healthy'),
    uptimeMs: z.number().int().nonnegative(),
  }),
  z.strictObject({
    type: z.literal('core.drained'),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    requestId: RequestIdSchema,
    pendingTasks: z.number().int().nonnegative(),
  }),
  z.strictObject({
    type: z.literal('core.shutdown-complete'),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    requestId: RequestIdSchema,
  }),
  z.strictObject({
    type: z.literal('core.command-result'),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    requestId: RequestIdSchema,
    result: TaskCommandResultSchema,
  }),
  z.strictObject({
    type: z.literal('core.window-preferences-result'),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    requestId: RequestIdSchema,
    result: CoreWindowPreferencesResultSchema,
  }),
  z.strictObject({
    type: z.literal('core.app-data.result'),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    requestId: RequestIdSchema,
    result: CoreAppDataResultSchema,
  }),
]);

export type AppInfo = z.infer<typeof AppInfoSchema>;
export type CoreStatus = z.infer<typeof CoreStatusSchema>;
export type CoreOperation = z.infer<typeof CoreOperationSchema>;
export type AppearancePreferences = z.infer<typeof AppearancePreferencesSchema>;
export type WindowBoundsDip = z.infer<typeof WindowBoundsDipSchema>;
export type WindowPreferences = z.infer<typeof WindowPreferencesSchema>;
export type CoreWindowPreferencesResult = z.infer<typeof CoreWindowPreferencesResultSchema>;
export type CommandFailure = z.infer<typeof CommandFailureSchema>;
export type CoreControlMessage = z.infer<typeof CoreControlMessageSchema>;
export type CoreEvent = z.infer<typeof CoreEventSchema>;
export type RegisteredCommand = z.infer<typeof RegisteredCommandSchema>;
export type TaskCancelData = z.infer<typeof TaskCancelDataSchema>;
export type TaskListActiveData = z.infer<typeof TaskListActiveDataSchema>;
export type TaskCommandResult = z.infer<typeof TaskCommandResultSchema>;
export type CommandResult<T> =
  { readonly ok: true; readonly requestId: string; readonly data: T } | CommandFailure;

export type TaskStreamUpdate =
  | { readonly kind: 'event'; readonly event: TaskEventEnvelope }
  | {
      readonly kind: 'snapshot';
      readonly snapshot: TaskSnapshot;
      readonly reason: 'sequence-gap';
    };

export interface WorldforgeBridge {
  readonly app: {
    readonly getInfo: () => Promise<CommandResult<AppInfo>>;
    readonly getCoreStatus: () => Promise<CommandResult<CoreStatus>>;
    readonly restartCore: () => Promise<CommandResult<CoreOperation>>;
    readonly getWindowPreferences: () => Promise<CommandResult<WindowPreferences>>;
    readonly setAppearancePreferences: (
      preferences: AppearancePreferences,
    ) => Promise<CommandResult<WindowPreferences>>;
  };
  readonly settings: {
    readonly get: () => Promise<CommandResult<AppSettingsSnapshot>>;
    readonly set: (settings: AppSettingsUpdate) => Promise<CommandResult<AppSettingsSnapshot>>;
    readonly reset: () => Promise<CommandResult<AppSettingsSnapshot>>;
  };
  readonly project: {
    readonly listRecent: () => Promise<CommandResult<{ readonly projects: RecentProject[] }>>;
    readonly relocateRecent: (projectId: string) => Promise<CommandResult<RecentProject>>;
    readonly removeRecent: (
      projectId: string,
    ) => Promise<CommandResult<{ readonly removed: boolean }>>;
  };
  readonly ai: {
    readonly setCredential: (
      providerId: string,
      credential: string,
    ) => Promise<CommandResult<{ readonly credentialRef: string }>>;
    readonly removeCredential: (
      credentialRef: string,
    ) => Promise<CommandResult<{ readonly exists: boolean }>>;
    readonly hasCredential: (
      credentialRef: string,
    ) => Promise<CommandResult<{ readonly exists: boolean }>>;
  };
  readonly task: {
    readonly getSnapshot: (
      taskId: string,
      projectId?: string,
    ) => Promise<CommandResult<TaskSnapshot>>;
    readonly cancel: (taskId: string, projectId?: string) => Promise<CommandResult<TaskCancelData>>;
    readonly listActive: (projectId?: string) => Promise<CommandResult<TaskListActiveData>>;
    readonly subscribe: (
      listener: (update: TaskStreamUpdate) => void,
      projectId?: string,
    ) => () => void;
  };
}

export type StableErrorCode = ErrorCode;
export const ProtocolProjectIdSchema = ProjectIdSchema;
export const ProtocolTaskEventSchema = TaskEventEnvelopeSchema;
