import { z } from 'zod';

import {
  ProviderConfigIdSchema,
  ProviderConfigInputSchema,
  ProviderConfigSchema,
} from './app-data.js';
import { ProviderProtocolSchema } from './ai-output-protocol.js';
import { ErrorCodeSchema } from './error-codes.js';
import { TASK_PROTOCOL_VERSION } from './task-protocol.js';

export const PROVIDER_IPC_CHANNELS = {
  providerList: 'worldforge:provider:list',
  providerSave: 'worldforge:provider:save',
  providerRemove: 'worldforge:provider:remove',
  providerTestConnection: 'worldforge:provider:test-connection',
} as const;

export const PROVIDER_COMMANDS = {
  providerList: 'ai.provider.list',
  providerSave: 'ai.provider.save',
  providerRemove: 'ai.provider.remove',
  providerTestConnection: 'ai.provider.testConnection',
} as const;

export const PROVIDER_CORE_OPERATIONS = {
  list: 'provider.config.list',
  get: 'provider.config.get',
  upsert: 'provider.config.upsert',
  remove: 'provider.config.remove',
  testConnection: 'provider.connection.test',
} as const;

export const ProviderEndpointScopeSchema = z.enum(['loopback', 'lan', 'external']);
export const ProviderEndpointInfoSchema = z.strictObject({
  scope: ProviderEndpointScopeSchema,
  origin: z.string().min(1).max(2_048),
  secureTransport: z.boolean(),
  warnings: z.array(z.string().min(1).max(512)).max(16),
});

const [
  OpenAiCompatibleProviderConfigInputSchema,
  AnthropicProviderConfigInputSchema,
  CustomProviderConfigInputSchema,
] = ProviderConfigInputSchema.options;

const OpenAiCompatibleProviderEditableConfigSchema = OpenAiCompatibleProviderConfigInputSchema.omit(
  { credentialRef: true },
);
const AnthropicProviderEditableConfigSchema = AnthropicProviderConfigInputSchema.omit({
  credentialRef: true,
});
const CustomProviderEditableConfigSchema = CustomProviderConfigInputSchema.omit({
  credentialRef: true,
});

export const ProviderEditableConfigSchema = z.discriminatedUnion('protocol', [
  OpenAiCompatibleProviderEditableConfigSchema,
  AnthropicProviderEditableConfigSchema,
  CustomProviderEditableConfigSchema,
]);

export const ProviderCredentialChangeSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('preserve') }),
  z.strictObject({ action: z.literal('remove') }),
  z.strictObject({
    action: z.literal('replace'),
    credential: z.string().min(1).max(32_768),
  }),
]);

export const ProviderSaveInputSchema = z
  .strictObject({
    config: ProviderEditableConfigSchema,
    credential: ProviderCredentialChangeSchema,
  })
  .superRefine((input, context) => {
    if (input.config.protocol === 'custom') {
      context.addIssue({
        code: 'custom',
        path: ['config', 'protocol'],
        message: 'Legacy custom providers are read-only and cannot be created or updated.',
      });
    }
  });

const providerSummaryFields = {
  credentialConfigured: z.boolean(),
  endpoint: ProviderEndpointInfoSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
} as const;
export const ProviderSummarySchema = z.discriminatedUnion('protocol', [
  OpenAiCompatibleProviderEditableConfigSchema.extend(providerSummaryFields),
  AnthropicProviderEditableConfigSchema.extend(providerSummaryFields),
  CustomProviderEditableConfigSchema.extend(providerSummaryFields),
]);

export const ProviderConnectionTestResultSchema = z.strictObject({
  providerId: ProviderConfigIdSchema,
  protocol: ProviderProtocolSchema,
  endpoint: ProviderEndpointInfoSchema,
  reachable: z.literal(true),
  authentication: z.enum(['not-required', 'verified']),
  modelList: z.enum(['verified', 'unsupported']),
  actualModel: z.string().min(1).max(512),
  streaming: z.boolean(),
  structuredOutput: z.boolean(),
  tokenUsageAvailable: z.boolean(),
  latencyMs: z.number().int().nonnegative().max(3_600_000),
  checkedAt: z.iso.datetime(),
  warnings: z.array(z.string().min(1).max(512)).max(32),
});

const commandEnvelope = {
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  requestId: z.uuid(),
  sentAt: z.iso.datetime(),
};

export const ProviderListCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROVIDER_COMMANDS.providerList),
  payload: z.strictObject({}),
});
export const ProviderSaveCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROVIDER_COMMANDS.providerSave),
  payload: ProviderSaveInputSchema,
});
export const ProviderRemoveCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROVIDER_COMMANDS.providerRemove),
  payload: z.strictObject({ providerId: ProviderConfigIdSchema }),
});
export const ProviderTestConnectionCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROVIDER_COMMANDS.providerTestConnection),
  payload: z.strictObject({ providerId: ProviderConfigIdSchema }),
});

const publicFailure = z.strictObject({
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

function resultSchema<Data extends z.ZodType>(data: Data) {
  return z.union([
    z.strictObject({ ok: z.literal(true), requestId: z.uuid(), data }),
    publicFailure,
  ]);
}

export const ProviderListResultSchema = resultSchema(
  z.strictObject({ providers: z.array(ProviderSummarySchema) }),
);
export const ProviderSummaryResultSchema = resultSchema(ProviderSummarySchema);
export const ProviderRemoveResultSchema = resultSchema(z.strictObject({ removed: z.boolean() }));
export const ProviderConnectionTestResultEnvelopeSchema = resultSchema(
  ProviderConnectionTestResultSchema,
);

export const CoreProviderOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal(PROVIDER_CORE_OPERATIONS.list) }),
  z.strictObject({
    operation: z.literal(PROVIDER_CORE_OPERATIONS.get),
    providerId: ProviderConfigIdSchema,
  }),
  z.strictObject({
    operation: z.literal(PROVIDER_CORE_OPERATIONS.upsert),
    config: ProviderConfigInputSchema,
  }),
  z.strictObject({
    operation: z.literal(PROVIDER_CORE_OPERATIONS.remove),
    providerId: ProviderConfigIdSchema,
  }),
  z.strictObject({
    operation: z.literal(PROVIDER_CORE_OPERATIONS.testConnection),
    config: ProviderConfigSchema,
    credential: z.string().min(1).max(32_768).nullable(),
  }),
]);

const coreSuccess = <Operation extends string, Data extends z.ZodType>(
  operation: Operation,
  data: Data,
) =>
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(operation),
    data,
  });

export const CoreProviderResultSchema = z.union([
  coreSuccess(
    PROVIDER_CORE_OPERATIONS.list,
    z.strictObject({ providers: z.array(ProviderSummarySchema) }),
  ),
  coreSuccess(
    PROVIDER_CORE_OPERATIONS.get,
    z.strictObject({ provider: ProviderConfigSchema.nullable() }),
  ),
  coreSuccess(PROVIDER_CORE_OPERATIONS.upsert, ProviderSummarySchema),
  coreSuccess(PROVIDER_CORE_OPERATIONS.remove, z.strictObject({ removed: z.boolean() })),
  coreSuccess(PROVIDER_CORE_OPERATIONS.testConnection, ProviderConnectionTestResultSchema),
  z.strictObject({
    ok: z.literal(false),
    operation: z.enum(PROVIDER_CORE_OPERATIONS),
    errorCode: ErrorCodeSchema,
  }),
]);

export type ProviderEndpointScope = z.infer<typeof ProviderEndpointScopeSchema>;
export type ProviderEndpointInfo = z.infer<typeof ProviderEndpointInfoSchema>;
export type ProviderEditableConfig = z.infer<typeof ProviderEditableConfigSchema>;
export type ProviderCredentialChange = z.infer<typeof ProviderCredentialChangeSchema>;
export type ProviderSaveInput = z.infer<typeof ProviderSaveInputSchema>;
export type ProviderSummary = z.infer<typeof ProviderSummarySchema>;
export type ProviderConnectionTestResult = z.infer<typeof ProviderConnectionTestResultSchema>;
export type CoreProviderOperation = z.infer<typeof CoreProviderOperationSchema>;
export type CoreProviderResult = z.infer<typeof CoreProviderResultSchema>;
