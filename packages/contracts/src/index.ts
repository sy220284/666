import { z } from 'zod';

export const contractsLayer = {
  name: '@worldforge/contracts',
  responsibility: 'cross-process-schemas-and-types',
} as const;

export const PROTOCOL_VERSION = 1 as const;

export const IPC_CHANNELS = {
  appGetInfo: 'worldforge:app:get-info',
  appGetCoreStatus: 'worldforge:app:get-core-status',
  appRestartCore: 'worldforge:app:restart-core',
  aiSetCredential: 'worldforge:ai:set-credential',
  aiRemoveCredential: 'worldforge:ai:remove-credential',
  aiHasCredential: 'worldforge:ai:has-credential',
} as const;

export const APP_COMMANDS = {
  getInfo: 'app.getInfo',
  getCoreStatus: 'app.getCoreStatus',
  restartCore: 'app.restartCore',
  setCredential: 'ai.provider.setCredential',
  removeCredential: 'ai.provider.removeCredential',
  hasCredential: 'ai.provider.hasCredential',
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

export const CommandFailureSchema = z.strictObject({
  ok: z.literal(false),
  requestId: RequestIdSchema,
  error: z.strictObject({
    code: z.string().min(1),
    message: z.string().min(1),
    retryable: z.boolean(),
    userAction: z.string().min(1).optional(),
    diagnosticId: z.string().min(1).optional(),
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
export const CredentialReferenceResultSchema = commandResultSchema(CredentialReferenceSchema);
export const CredentialPresenceResultSchema = commandResultSchema(CredentialPresenceSchema);

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
    pendingTasks: z.literal(0),
  }),
  z.strictObject({
    type: z.literal('core.shutdown-complete'),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    requestId: RequestIdSchema,
  }),
]);

export type AppInfo = z.infer<typeof AppInfoSchema>;
export type CoreStatus = z.infer<typeof CoreStatusSchema>;
export type CoreOperation = z.infer<typeof CoreOperationSchema>;
export type CommandFailure = z.infer<typeof CommandFailureSchema>;
export type CoreControlMessage = z.infer<typeof CoreControlMessageSchema>;
export type CoreEvent = z.infer<typeof CoreEventSchema>;
export type CommandResult<T> =
  { readonly ok: true; readonly requestId: string; readonly data: T } | CommandFailure;

export interface WorldforgeBridge {
  readonly app: {
    readonly getInfo: () => Promise<CommandResult<AppInfo>>;
    readonly getCoreStatus: () => Promise<CommandResult<CoreStatus>>;
    readonly restartCore: () => Promise<CommandResult<CoreOperation>>;
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
}
