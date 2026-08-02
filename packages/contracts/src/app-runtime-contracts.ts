import { z } from 'zod';

import { ErrorCodeSchema } from './error-codes.js';
import { CoreAppDataOperationSchema, CoreAppDataResultSchema } from './app-data.js';
import { CoreProviderOperationSchema, CoreProviderResultSchema } from './provider.js';
import { CoreGenerationOperationSchema, CoreGenerationResultSchema } from './generation.js';
import {
  TaskCancelDataSchema,
  TaskCommandSchema,
  TaskListActiveDataSchema,
  TaskPortConnectSchema,
  TaskSnapshotSchema,
  type TaskEventEnvelope,
  type TaskSnapshot,
} from './task-protocol.js';
import { CoreProjectOperationSchema, CoreProjectResultSchema } from './project-workspace.js';
import { DraftLockConflictSummarySchema } from './draft.js';
import {
  CredentialRefSchema,
  PROTOCOL_VERSION,
  RequestIdSchema,
  WindowPreferencesSchema,
  type AppearancePreferencesSchema,
  type RegisteredCommandSchema,
  type WindowBoundsDipSchema,
} from './protocol-registry.js';

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

export const DiagnosticManifestSchema = z.strictObject({
  generatedAt: z.iso.datetime(),
  included: z.array(z.enum(['app-info', 'core-status', 'display-summary', 'log-metadata'])),
  excluded: z.array(
    z.enum([
      'project-content',
      'project-database',
      'prompts',
      'provider-credentials',
      'absolute-paths',
    ]),
  ),
  contentIncluded: z.literal(false),
  credentialIncluded: z.literal(false),
});

export const DiagnosticPreviewSchema = z.strictObject({
  manifest: DiagnosticManifestSchema,
  app: AppInfoSchema,
  core: CoreStatusSchema,
  display: z.strictObject({
    platform: z.string().min(1),
    scaleFactor: z.number().finite().min(0.5).max(8),
  }),
  logs: z.strictObject({
    includedFiles: z.literal(0),
    includedEntries: z.literal(0),
    redacted: z.literal(true),
  }),
});

export const DiagnosticExportSchema = z.strictObject({
  fileName: z.string().min(1).max(240),
  bytes: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/u),
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
  lockConflict: DraftLockConflictSummarySchema.optional(),
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
export const DiagnosticPreviewResultSchema = commandResultSchema(DiagnosticPreviewSchema);
export const DiagnosticExportResultSchema = commandResultSchema(DiagnosticExportSchema);
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
  z.strictObject({
    type: z.literal('core.provider.command'),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    requestId: RequestIdSchema,
    operation: CoreProviderOperationSchema,
  }),
  z.strictObject({
    type: z.literal('core.generation.command'),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    requestId: RequestIdSchema,
    operation: CoreGenerationOperationSchema,
  }),
  z.strictObject({
    type: z.literal('core.project.command'),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    requestId: RequestIdSchema,
    operation: CoreProjectOperationSchema,
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
  z.strictObject({
    type: z.literal('core.provider.result'),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    requestId: RequestIdSchema,
    result: CoreProviderResultSchema,
  }),
  z.strictObject({
    type: z.literal('core.generation.result'),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    requestId: RequestIdSchema,
    result: CoreGenerationResultSchema,
  }),
  z.strictObject({
    type: z.literal('core.project.result'),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    requestId: RequestIdSchema,
    result: CoreProjectResultSchema,
  }),
]);

export type AppInfo = z.infer<typeof AppInfoSchema>;
export type CoreStatus = z.infer<typeof CoreStatusSchema>;
export type CoreOperation = z.infer<typeof CoreOperationSchema>;
export type AppearancePreferences = z.infer<typeof AppearancePreferencesSchema>;
export type WindowBoundsDip = z.infer<typeof WindowBoundsDipSchema>;
export type WindowPreferences = z.infer<typeof WindowPreferencesSchema>;
export type DiagnosticManifest = z.infer<typeof DiagnosticManifestSchema>;
export type DiagnosticPreview = z.infer<typeof DiagnosticPreviewSchema>;
export type DiagnosticExport = z.infer<typeof DiagnosticExportSchema>;
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
