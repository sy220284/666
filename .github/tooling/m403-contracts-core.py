from pathlib import Path


def write(path: str, content: str) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


def replace_once(path: str, old: str, new: str, label: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one target, found {count}')
    target.write_text(text.replace(old, new, 1))


write(
    'packages/contracts/src/provider.ts',
    r'''import { z } from 'zod';

import {
  ProviderConfigIdSchema,
  ProviderConfigInputSchema,
  ProviderConfigSchema,
} from './app-data.js';
import { ProviderProtocolSchema } from './ai-output-protocol.js';
import { ErrorCodeSchema } from './error-codes.js';
import { TASK_PROTOCOL_VERSION } from './task-protocol.js';

export const PROVIDER_IPC_CHANNELS = {
  list: 'worldforge:provider:list',
  save: 'worldforge:provider:save',
  remove: 'worldforge:provider:remove',
  testConnection: 'worldforge:provider:test-connection',
} as const;

export const PROVIDER_COMMANDS = {
  list: 'ai.provider.list',
  save: 'ai.provider.save',
  remove: 'ai.provider.remove',
  testConnection: 'ai.provider.testConnection',
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

export const ProviderEditableConfigSchema = ProviderConfigInputSchema.omit({
  credentialRef: true,
});

export const ProviderCredentialChangeSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('preserve') }),
  z.strictObject({ action: z.literal('remove') }),
  z.strictObject({
    action: z.literal('replace'),
    credential: z.string().min(1).max(32_768),
  }),
]);

export const ProviderSaveInputSchema = z.strictObject({
  config: ProviderEditableConfigSchema,
  credential: ProviderCredentialChangeSchema,
});

export const ProviderSummarySchema = ProviderEditableConfigSchema.extend({
  credentialConfigured: z.boolean(),
  endpoint: ProviderEndpointInfoSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).strict();

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
  command: z.literal(PROVIDER_COMMANDS.list),
  payload: z.strictObject({}),
});
export const ProviderSaveCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROVIDER_COMMANDS.save),
  payload: ProviderSaveInputSchema,
});
export const ProviderRemoveCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROVIDER_COMMANDS.remove),
  payload: z.strictObject({ providerId: ProviderConfigIdSchema }),
});
export const ProviderTestConnectionCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(PROVIDER_COMMANDS.testConnection),
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
    config: ProviderConfigInputSchema,
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
''',
)

replace_once(
    'packages/contracts/src/error-codes.ts',
    "  'AI_RUN_ALREADY_FINISHED_012',\n",
    "  'AI_RUN_ALREADY_FINISHED_012',\n  'AI_ENDPOINT_UNSAFE_013',\n",
    'provider unsafe error code',
)

replace_once(
    'packages/contracts/src/index.ts',
    "import {\n  ProjectIdSchema,\n",
    "import {\n  CoreProviderOperationSchema,\n  CoreProviderResultSchema,\n  PROVIDER_COMMANDS,\n  PROVIDER_IPC_CHANNELS,\n  ProviderConnectionTestResultEnvelopeSchema,\n  ProviderListCommandSchema,\n  ProviderListResultSchema,\n  ProviderRemoveCommandSchema,\n  ProviderRemoveResultSchema,\n  ProviderSaveCommandSchema,\n  ProviderSummaryResultSchema,\n  ProviderTestConnectionCommandSchema,\n  type ProviderConnectionTestResult,\n  type ProviderSaveInput,\n  type ProviderSummary,\n} from './provider.js';\nimport {\n  ProjectIdSchema,\n",
    'provider imports',
)
replace_once(
    'packages/contracts/src/index.ts',
    "export * from './app-data.js';\n",
    "export * from './app-data.js';\nexport * from './provider.js';\n",
    'provider export',
)
replace_once(
    'packages/contracts/src/index.ts',
    "  ...APP_DATA_IPC_CHANNELS,\n",
    "  ...APP_DATA_IPC_CHANNELS,\n  ...PROVIDER_IPC_CHANNELS,\n",
    'provider ipc channels',
)
replace_once(
    'packages/contracts/src/index.ts',
    "  ...APP_DATA_COMMANDS,\n",
    "  ...APP_DATA_COMMANDS,\n  ...PROVIDER_COMMANDS,\n",
    'provider commands',
)
replace_once(
    'packages/contracts/src/index.ts',
    "  ProjectRemoveRecentCommandSchema,\n",
    "  ProjectRemoveRecentCommandSchema,\n  ProviderListCommandSchema,\n  ProviderSaveCommandSchema,\n  ProviderRemoveCommandSchema,\n  ProviderTestConnectionCommandSchema,\n",
    'registered provider commands',
)
replace_once(
    'packages/contracts/src/index.ts',
    "  z.strictObject({\n    type: z.literal('core.project.command'),\n",
    "  z.strictObject({\n    type: z.literal('core.provider.command'),\n    protocolVersion: z.literal(PROTOCOL_VERSION),\n    requestId: RequestIdSchema,\n    operation: CoreProviderOperationSchema,\n  }),\n  z.strictObject({\n    type: z.literal('core.project.command'),\n",
    'core provider control message',
)
replace_once(
    'packages/contracts/src/index.ts',
    "  z.strictObject({\n    type: z.literal('core.project.result'),\n",
    "  z.strictObject({\n    type: z.literal('core.provider.result'),\n    protocolVersion: z.literal(PROTOCOL_VERSION),\n    requestId: RequestIdSchema,\n    result: CoreProviderResultSchema,\n  }),\n  z.strictObject({\n    type: z.literal('core.project.result'),\n",
    'core provider event',
)
replace_once(
    'packages/contracts/src/index.ts',
    "  readonly ai: {\n",
    "  readonly providers: {\n    readonly list: () => Promise<CommandResult<{ readonly providers: ProviderSummary[] }>>;\n    readonly save: (input: ProviderSaveInput) => Promise<CommandResult<ProviderSummary>>;\n    readonly remove: (providerId: string) => Promise<CommandResult<{ readonly removed: boolean }>>;\n    readonly testConnection: (\n      providerId: string,\n    ) => Promise<CommandResult<ProviderConnectionTestResult>>;\n  };\n  readonly ai: {\n",
    'provider bridge domain',
)

write(
    'packages/core-service/src/provider-errors.ts',
    r'''import type { ErrorCode } from '@worldforge/contracts';

export class ProviderRuntimeError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;

  constructor(code: ErrorCode, message: string, retryable = false) {
    super(message);
    this.name = 'ProviderRuntimeError';
    this.code = code;
    this.retryable = retryable;
  }
}

export function providerErrorCode(error: unknown): ErrorCode {
  return error instanceof ProviderRuntimeError ? error.code : 'AI_CONNECTION_FAILED_003';
}
''',
)

write(
    'packages/core-service/src/provider-endpoint.ts',
    r'''import { lookup as systemLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import {
  ProviderBaseUrlSchema,
  ProviderEndpointInfoSchema,
  type ProviderEndpointInfo,
  type ProviderEndpointScope,
} from '@worldforge/contracts';

import { ProviderRuntimeError } from './provider-errors.js';

export type ProviderDnsLookup = typeof systemLookup;

function unsafe(message: string): never {
  throw new ProviderRuntimeError('AI_ENDPOINT_UNSAFE_013', message, false);
}

function normalizedHost(hostname: string): string {
  return hostname.replace(/^\[/u, '').replace(/\]$/u, '').replace(/\.$/u, '').toLowerCase();
}

function ipv4Scope(host: string): ProviderEndpointScope | 'unsafe' {
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return 'unsafe';
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 127) return 'loopback';
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'lan';
  if (
    a === 0 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    a >= 224
  ) {
    return 'unsafe';
  }
  return 'external';
}

function literalScope(hostname: string): ProviderEndpointScope | 'unsafe' | null {
  const host = normalizedHost(hostname);
  const version = isIP(host);
  if (version === 4) return ipv4Scope(host);
  if (version !== 6) return null;
  if (host === '::1') return 'loopback';
  if (host === '::') return 'unsafe';
  if (host.startsWith('fe8') || host.startsWith('fe9') || host.startsWith('fea') || host.startsWith('feb')) {
    return 'unsafe';
  }
  if (host.startsWith('ff')) return 'unsafe';
  if (host.startsWith('fc') || host.startsWith('fd')) return 'lan';
  const mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/u)?.[1];
  return mapped ? ipv4Scope(mapped) : 'external';
}

function hostnameScope(hostname: string): ProviderEndpointScope {
  const host = normalizedHost(hostname);
  const literal = literalScope(host);
  if (literal === 'unsafe') unsafe('The Provider endpoint uses a blocked or non-routable address.');
  if (literal) return literal;
  if (host === 'localhost' || host.endsWith('.localhost')) return 'loopback';
  if (host.endsWith('.local')) return 'lan';
  if (host === 'metadata.google.internal') {
    unsafe('The Provider endpoint targets a blocked instance metadata host.');
  }
  return 'external';
}

function endpointWarnings(scope: ProviderEndpointScope, secureTransport: boolean): string[] {
  const warnings =
    scope === 'loopback'
      ? ['请求仅发送到当前设备上的用户配置服务。']
      : scope === 'lan'
        ? ['项目内容将发送到局域网设备，请确认该设备可信。']
        : ['项目内容将通过HTTPS发送到外部Provider。'];
  if (!secureTransport) warnings.push('当前连接未使用TLS，仅允许本机或受信局域网端点。');
  return warnings;
}

export function validateProviderEndpoint(baseUrl: string): ProviderEndpointInfo {
  const parsedValue = ProviderBaseUrlSchema.safeParse(baseUrl);
  if (!parsedValue.success) unsafe('The Provider URL is invalid or contains embedded credentials.');
  const url = new URL(parsedValue.data);
  if (url.port === '0') unsafe('The Provider endpoint cannot use port 0.');
  const scope = hostnameScope(url.hostname);
  const secureTransport = url.protocol === 'https:';
  if (scope === 'external' && !secureTransport) {
    unsafe('External Provider endpoints must use HTTPS.');
  }
  return ProviderEndpointInfoSchema.parse({
    scope,
    origin: url.origin,
    secureTransport,
    warnings: endpointWarnings(scope, secureTransport),
  });
}

export async function inspectProviderEndpoint(
  baseUrl: string,
  lookup: ProviderDnsLookup = systemLookup,
): Promise<ProviderEndpointInfo> {
  const initial = validateProviderEndpoint(baseUrl);
  const url = new URL(baseUrl);
  const host = normalizedHost(url.hostname);
  if (literalScope(host) || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return initial;
  }
  let addresses: readonly { readonly address: string; readonly family: number }[];
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new ProviderRuntimeError(
      'AI_CONNECTION_FAILED_003',
      'The Provider hostname could not be resolved.',
      true,
    );
  }
  if (addresses.length === 0) {
    throw new ProviderRuntimeError('AI_CONNECTION_FAILED_003', 'The Provider hostname has no address.', true);
  }
  const scopes = new Set<ProviderEndpointScope>();
  for (const address of addresses) {
    const scope = literalScope(address.address);
    if (!scope || scope === 'unsafe') unsafe('The Provider hostname resolved to an unsafe address.');
    scopes.add(scope);
  }
  if (scopes.size !== 1) unsafe('The Provider hostname resolved across mixed network trust boundaries.');
  const [resolvedScope] = scopes;
  if (!resolvedScope) unsafe('The Provider endpoint scope could not be determined.');
  if (resolvedScope === 'external' && url.protocol !== 'https:') {
    unsafe('External Provider endpoints must use HTTPS.');
  }
  return ProviderEndpointInfoSchema.parse({
    scope: resolvedScope,
    origin: url.origin,
    secureTransport: url.protocol === 'https:',
    warnings: endpointWarnings(resolvedScope, url.protocol === 'https:'),
  });
}
''',
)

write(
    'packages/core-service/src/provider-adapters.ts',
    r'''import type {
  GenerationRequest,
  ProviderConfig,
  ProviderEvent,
  ProviderProtocol,
} from '@worldforge/contracts';
import { GenerationRequestSchema, ProviderEventSchema } from '@worldforge/contracts';

import { ProviderRuntimeError } from './provider-errors.js';

export interface ProviderAdapterProbeResult {
  readonly modelList: 'verified' | 'unsupported';
  readonly actualModel: string;
  readonly streaming: boolean;
  readonly structuredOutput: boolean;
  readonly tokenUsageAvailable: boolean;
  readonly warnings: readonly string[];
}

export interface AIProvider {
  readonly protocol: ProviderProtocol;
  testConnection(signal?: AbortSignal): Promise<ProviderAdapterProbeResult>;
  generate(request: GenerationRequest, signal: AbortSignal): AsyncIterable<ProviderEvent>;
}

export interface ProviderAdapterDependencies {
  readonly fetch?: typeof fetch;
}

type JsonRecord = Record<string, unknown>;

function object(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function array(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function integer(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function endpoint(baseUrl: string, relative: string): URL {
  const normalized = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(relative, normalized);
}

function mapHttpError(status: number): ProviderRuntimeError {
  if (status === 401 || status === 403) {
    return new ProviderRuntimeError('AI_AUTH_FAILED_004', 'Provider authentication failed.', false);
  }
  if (status === 429) {
    return new ProviderRuntimeError('AI_RATE_LIMITED_005', 'The Provider rate limit was reached.', true);
  }
  if (status === 408 || status === 504) {
    return new ProviderRuntimeError('AI_REQUEST_TIMEOUT_006', 'The Provider request timed out.', true);
  }
  if (status >= 500) {
    return new ProviderRuntimeError('AI_CONNECTION_FAILED_003', 'The Provider is temporarily unavailable.', true);
  }
  return new ProviderRuntimeError('AI_CONNECTION_FAILED_003', 'The Provider rejected the request.', false);
}

async function request(
  fetchImplementation: typeof fetch,
  url: URL,
  init: RequestInit,
  timeoutMs: number,
  userSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = (): void => controller.abort();
  if (userSignal?.aborted) {
    throw new ProviderRuntimeError('COMMON_CANCELLED_004', 'The Provider request was cancelled.', false);
  }
  userSignal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetchImplementation(url, {
      ...init,
      redirect: 'manual',
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      throw new ProviderRuntimeError(
        'AI_ENDPOINT_UNSAFE_013',
        'Provider redirects are blocked unless an adapter explicitly approves them.',
        false,
      );
    }
    return response;
  } catch (error) {
    if (error instanceof ProviderRuntimeError) throw error;
    if (userSignal?.aborted) {
      throw new ProviderRuntimeError('COMMON_CANCELLED_004', 'The Provider request was cancelled.', false);
    }
    if (timedOut) {
      throw new ProviderRuntimeError('AI_REQUEST_TIMEOUT_006', 'The Provider request timed out.', true);
    }
    throw new ProviderRuntimeError('AI_CONNECTION_FAILED_003', 'The Provider could not be reached.', true);
  } finally {
    clearTimeout(timer);
    userSignal?.removeEventListener('abort', onAbort);
  }
}

async function requireJson(response: Response): Promise<unknown> {
  if (!response.ok) throw mapHttpError(response.status);
  try {
    return await response.json();
  } catch {
    throw new ProviderRuntimeError('AI_OUTPUT_INVALID_008', 'The Provider returned invalid JSON.', false);
  }
}

async function* sseData(response: Response, signal: AbortSignal): AsyncGenerator<string> {
  if (!response.ok) throw mapHttpError(response.status);
  if (!response.body) {
    throw new ProviderRuntimeError('AI_STREAM_INTERRUPTED_009', 'The Provider stream was empty.', true);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      if (signal.aborted) {
        throw new ProviderRuntimeError('COMMON_CANCELLED_004', 'The Provider request was cancelled.', false);
      }
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/u);
      buffer = events.pop() ?? '';
      for (const event of events) {
        const data = event
          .split(/\r?\n/u)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (data) yield data;
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      const data = buffer
        .split(/\r?\n/u)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (data) yield data;
    }
  } catch (error) {
    if (error instanceof ProviderRuntimeError) throw error;
    if (signal.aborted) {
      throw new ProviderRuntimeError('COMMON_CANCELLED_004', 'The Provider request was cancelled.', false);
    }
    throw new ProviderRuntimeError('AI_STREAM_INTERRUPTED_009', 'The Provider stream was interrupted.', true);
  } finally {
    reader.releaseLock();
  }
}

function connectionRequest(model: string, structuredOutput = false): GenerationRequest {
  return GenerationRequestSchema.parse({
    runId: '550e8400-e29b-41d4-a716-446655440000',
    model,
    systemPrompt: 'WorldForge connection test.',
    messages: [{ role: 'user', content: structuredOutput ? 'Return {"ok":true}.' : 'Reply OK.' }],
    maxOutputTokens: 16,
    temperature: 0,
    ...(structuredOutput
      ? {
          structuredOutput: {
            name: 'worldforge_connection_test',
            schema: {
              type: 'object',
              properties: { ok: { type: 'boolean' } },
              required: ['ok'],
              additionalProperties: false,
            },
          },
        }
      : {}),
    metadata: {
      taskType: 'validate',
      promptId: 'provider.connection-test',
      promptVersion: 1,
      constraintHash: '0'.repeat(64),
    },
  });
}

abstract class BaseProvider implements AIProvider {
  abstract readonly protocol: ProviderProtocol;
  protected readonly config: ProviderConfig;
  protected readonly credential: string | null;
  protected readonly fetchImplementation: typeof fetch;

  constructor(
    config: ProviderConfig,
    credential: string | null,
    dependencies: ProviderAdapterDependencies,
  ) {
    this.config = config;
    this.credential = credential;
    this.fetchImplementation = dependencies.fetch ?? globalThis.fetch;
  }

  abstract testConnection(signal?: AbortSignal): Promise<ProviderAdapterProbeResult>;
  abstract generate(request: GenerationRequest, signal: AbortSignal): AsyncIterable<ProviderEvent>;

  protected async collectStreaming(signal?: AbortSignal): Promise<{ text: string; usage: boolean }> {
    const controller = new AbortController();
    const abort = (): void => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      let text = '';
      let completed = false;
      let usage = false;
      for await (const event of this.generate(connectionRequest(this.config.model), controller.signal)) {
        if (event.type === 'delta') text += event.text;
        if (event.type === 'usage') usage = true;
        if (event.type === 'completed') completed = true;
      }
      if (!completed || !text.trim()) {
        throw new ProviderRuntimeError(
          'AI_STREAM_INTERRUPTED_009',
          'The Provider did not complete the streaming probe.',
          true,
        );
      }
      return { text, usage };
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  }
}

class OpenAiCompatibleProvider extends BaseProvider {
  readonly protocol = 'openai_compatible' as const;

  private headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      ...(this.credential ? { authorization: `Bearer ${this.credential}` } : {}),
    };
  }

  private async modelProbe(signal?: AbortSignal): Promise<'verified' | 'unsupported'> {
    const response = await request(
      this.fetchImplementation,
      endpoint(this.config.baseUrl, 'models'),
      { method: 'GET', headers: this.headers() },
      this.config.timeoutMs,
      signal,
    );
    if ([404, 405, 501].includes(response.status)) return 'unsupported';
    const body = object(await requireJson(response));
    const ids = array(body?.data)
      .map((item) => string(object(item)?.id))
      .filter((value): value is string => Boolean(value));
    if (ids.length === 0) return 'unsupported';
    if (!ids.includes(this.config.model)) {
      throw new ProviderRuntimeError('AI_MODEL_UNSUPPORTED_010', 'The configured model was not listed.', false);
    }
    return 'verified';
  }

  private async nonStreamingProbe(structured: boolean, signal?: AbortSignal): Promise<boolean> {
    const requestBody = connectionRequest(this.config.model, structured);
    const response = await request(
      this.fetchImplementation,
      endpoint(this.config.baseUrl, 'chat/completions'),
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model: requestBody.model,
          messages: [
            { role: 'system', content: requestBody.systemPrompt },
            ...requestBody.messages,
          ],
          max_tokens: requestBody.maxOutputTokens,
          temperature: requestBody.temperature,
          stream: false,
          ...(structured && requestBody.structuredOutput
            ? {
                response_format: {
                  type: 'json_schema',
                  json_schema: {
                    name: requestBody.structuredOutput.name,
                    strict: true,
                    schema: requestBody.structuredOutput.schema,
                  },
                },
              }
            : {}),
        }),
      },
      this.config.timeoutMs,
      signal,
    );
    if (structured && [400, 404, 405, 422, 501].includes(response.status)) return false;
    const body = object(await requireJson(response));
    const first = object(array(body?.choices)[0]);
    const content = string(object(first?.message)?.content);
    if (!content?.trim()) {
      throw new ProviderRuntimeError('AI_OUTPUT_INVALID_008', 'The Provider returned no text.', false);
    }
    if (!structured) return true;
    try {
      return object(JSON.parse(content))?.ok === true;
    } catch {
      return false;
    }
  }

  async testConnection(signal?: AbortSignal): Promise<ProviderAdapterProbeResult> {
    const modelList = await this.modelProbe(signal);
    await this.nonStreamingProbe(false, signal);
    const streamed = await this.collectStreaming(signal);
    const structuredOutput = await this.nonStreamingProbe(true, signal);
    return {
      modelList,
      actualModel: this.config.model,
      streaming: true,
      structuredOutput,
      tokenUsageAvailable: streamed.usage,
      warnings: [
        ...(modelList === 'unsupported' ? ['该端点未提供可用的模型列表，已通过实际生成验证模型。'] : []),
        ...(!structuredOutput ? ['该模型未通过JSON Schema结构化输出探测。'] : []),
        ...(!streamed.usage ? ['该流未返回Token统计，后续将使用本地估算。'] : []),
      ],
    };
  }

  async *generate(requestValue: GenerationRequest, signal: AbortSignal): AsyncIterable<ProviderEvent> {
    const generation = GenerationRequestSchema.parse(requestValue);
    const response = await request(
      this.fetchImplementation,
      endpoint(this.config.baseUrl, 'chat/completions'),
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model: generation.model,
          messages: [
            { role: 'system', content: generation.systemPrompt },
            ...generation.messages,
          ],
          max_tokens: generation.maxOutputTokens,
          ...(generation.temperature === undefined ? {} : { temperature: generation.temperature }),
          stream: true,
          stream_options: { include_usage: true },
          ...(generation.structuredOutput
            ? {
                response_format: {
                  type: 'json_schema',
                  json_schema: {
                    name: generation.structuredOutput.name,
                    strict: true,
                    schema: generation.structuredOutput.schema,
                  },
                },
              }
            : {}),
        }),
      },
      this.config.timeoutMs,
      signal,
    );
    yield ProviderEventSchema.parse({ type: 'connected' });
    let completed = false;
    for await (const data of sseData(response, signal)) {
      if (data === '[DONE]') {
        completed = true;
        yield ProviderEventSchema.parse({ type: 'completed' });
        break;
      }
      let payload: JsonRecord | null;
      try {
        payload = object(JSON.parse(data));
      } catch {
        throw new ProviderRuntimeError('AI_OUTPUT_INVALID_008', 'The Provider stream contained invalid JSON.', false);
      }
      const choice = object(array(payload?.choices)[0]);
      const text = string(object(choice?.delta)?.content);
      if (text) yield ProviderEventSchema.parse({ type: 'delta', text });
      const usage = object(payload?.usage);
      const inputTokens = integer(usage?.prompt_tokens);
      const outputTokens = integer(usage?.completion_tokens);
      if (inputTokens !== undefined || outputTokens !== undefined) {
        yield ProviderEventSchema.parse({
          type: 'usage',
          ...(inputTokens === undefined ? {} : { inputTokens }),
          ...(outputTokens === undefined ? {} : { outputTokens }),
        });
      }
      if (choice?.finish_reason) {
        completed = true;
        yield ProviderEventSchema.parse({
          type: 'completed',
          finishReason: String(choice.finish_reason),
        });
      }
    }
    if (!completed) {
      throw new ProviderRuntimeError('AI_STREAM_INTERRUPTED_009', 'The Provider stream ended early.', true);
    }
  }
}

class AnthropicProvider extends BaseProvider {
  readonly protocol = 'anthropic' as const;

  private headers(): Record<string, string> {
    const version = string(this.config.options.anthropicVersion) ?? '2023-06-01';
    return {
      'content-type': 'application/json',
      'anthropic-version': version,
      ...(this.credential ? { 'x-api-key': this.credential } : {}),
    };
  }

  private async modelProbe(signal?: AbortSignal): Promise<'verified' | 'unsupported'> {
    const response = await request(
      this.fetchImplementation,
      endpoint(this.config.baseUrl, 'models'),
      { method: 'GET', headers: this.headers() },
      this.config.timeoutMs,
      signal,
    );
    if ([404, 405, 501].includes(response.status)) return 'unsupported';
    const body = object(await requireJson(response));
    const ids = array(body?.data)
      .map((item) => string(object(item)?.id))
      .filter((value): value is string => Boolean(value));
    if (ids.length === 0) return 'unsupported';
    if (!ids.includes(this.config.model)) {
      throw new ProviderRuntimeError('AI_MODEL_UNSUPPORTED_010', 'The configured model was not listed.', false);
    }
    return 'verified';
  }

  private requestBody(generation: GenerationRequest, stream: boolean, structured: boolean) {
    return {
      model: generation.model,
      system: generation.systemPrompt,
      messages: generation.messages,
      max_tokens: generation.maxOutputTokens,
      ...(generation.temperature === undefined ? {} : { temperature: generation.temperature }),
      stream,
      ...(structured && generation.structuredOutput
        ? {
            output_config: {
              format: {
                type: 'json_schema',
                schema: generation.structuredOutput.schema,
              },
            },
          }
        : {}),
    };
  }

  private async nonStreamingProbe(structured: boolean, signal?: AbortSignal): Promise<boolean> {
    const generation = connectionRequest(this.config.model, structured);
    const response = await request(
      this.fetchImplementation,
      endpoint(this.config.baseUrl, 'messages'),
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(this.requestBody(generation, false, structured)),
      },
      this.config.timeoutMs,
      signal,
    );
    if (structured && [400, 404, 405, 422, 501].includes(response.status)) return false;
    const body = object(await requireJson(response));
    const content = array(body?.content)
      .map((item) => string(object(item)?.text))
      .filter((value): value is string => Boolean(value))
      .join('');
    if (!content.trim()) {
      throw new ProviderRuntimeError('AI_OUTPUT_INVALID_008', 'The Provider returned no text.', false);
    }
    if (!structured) return true;
    try {
      return object(JSON.parse(content))?.ok === true;
    } catch {
      return false;
    }
  }

  async testConnection(signal?: AbortSignal): Promise<ProviderAdapterProbeResult> {
    const modelList = await this.modelProbe(signal);
    await this.nonStreamingProbe(false, signal);
    const streamed = await this.collectStreaming(signal);
    const structuredOutput = await this.nonStreamingProbe(true, signal);
    return {
      modelList,
      actualModel: this.config.model,
      streaming: true,
      structuredOutput,
      tokenUsageAvailable: streamed.usage,
      warnings: [
        ...(modelList === 'unsupported' ? ['该端点未提供可用的模型列表，已通过实际生成验证模型。'] : []),
        ...(!structuredOutput ? ['该模型未通过结构化输出探测。'] : []),
        ...(!streamed.usage ? ['该流未返回Token统计，后续将使用本地估算。'] : []),
      ],
    };
  }

  async *generate(requestValue: GenerationRequest, signal: AbortSignal): AsyncIterable<ProviderEvent> {
    const generation = GenerationRequestSchema.parse(requestValue);
    const response = await request(
      this.fetchImplementation,
      endpoint(this.config.baseUrl, 'messages'),
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(this.requestBody(generation, true, Boolean(generation.structuredOutput))),
      },
      this.config.timeoutMs,
      signal,
    );
    yield ProviderEventSchema.parse({ type: 'connected' });
    let completed = false;
    for await (const data of sseData(response, signal)) {
      let payload: JsonRecord | null;
      try {
        payload = object(JSON.parse(data));
      } catch {
        throw new ProviderRuntimeError('AI_OUTPUT_INVALID_008', 'The Provider stream contained invalid JSON.', false);
      }
      const type = string(payload?.type);
      if (type === 'content_block_delta') {
        const text = string(object(payload?.delta)?.text);
        if (text) yield ProviderEventSchema.parse({ type: 'delta', text });
      }
      if (type === 'message_start' || type === 'message_delta') {
        const usage = object(type === 'message_start' ? object(payload?.message)?.usage : payload?.usage);
        const inputTokens = integer(usage?.input_tokens);
        const outputTokens = integer(usage?.output_tokens);
        if (inputTokens !== undefined || outputTokens !== undefined) {
          yield ProviderEventSchema.parse({
            type: 'usage',
            ...(inputTokens === undefined ? {} : { inputTokens }),
            ...(outputTokens === undefined ? {} : { outputTokens }),
          });
        }
      }
      if (type === 'message_stop') {
        completed = true;
        yield ProviderEventSchema.parse({ type: 'completed' });
      }
      if (type === 'error') throw mapHttpError(500);
    }
    if (!completed) {
      throw new ProviderRuntimeError('AI_STREAM_INTERRUPTED_009', 'The Provider stream ended early.', true);
    }
  }
}

export function createProviderAdapter(
  config: ProviderConfig,
  credential: string | null,
  dependencies: ProviderAdapterDependencies = {},
): AIProvider {
  if (config.protocol === 'openai_compatible') {
    return new OpenAiCompatibleProvider(config, credential, dependencies);
  }
  if (config.protocol === 'anthropic') {
    return new AnthropicProvider(config, credential, dependencies);
  }
  throw new ProviderRuntimeError(
    'AI_MODEL_UNSUPPORTED_010',
    'No approved custom Provider adapter is registered.',
    false,
  );
}
''',
)

write(
    'packages/core-service/src/provider-connection.ts',
    r'''import { performance } from 'node:perf_hooks';

import {
  ProviderConnectionTestResultSchema,
  ProviderSummarySchema,
  type ProviderConfig,
  type ProviderConnectionTestResult,
  type ProviderSummary,
} from '@worldforge/contracts';

import { createProviderAdapter, type ProviderAdapterDependencies } from './provider-adapters.js';
import {
  inspectProviderEndpoint,
  validateProviderEndpoint,
  type ProviderDnsLookup,
} from './provider-endpoint.js';

export interface ProviderConnectionServiceOptions extends ProviderAdapterDependencies {
  readonly lookup?: ProviderDnsLookup;
  readonly clock?: { now(): Date };
}

export function summarizeProviderConfig(config: ProviderConfig): ProviderSummary {
  return ProviderSummarySchema.parse({
    id: config.id,
    name: config.name,
    protocol: config.protocol,
    baseUrl: config.baseUrl,
    model: config.model,
    timeoutMs: config.timeoutMs,
    options: config.options,
    credentialConfigured: config.credentialRef !== null,
    endpoint: validateProviderEndpoint(config.baseUrl),
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  });
}

export class ProviderConnectionService {
  readonly #options: ProviderConnectionServiceOptions;

  constructor(options: ProviderConnectionServiceOptions = {}) {
    this.#options = options;
  }

  async test(
    config: ProviderConfig,
    credential: string | null,
    signal?: AbortSignal,
  ): Promise<ProviderConnectionTestResult> {
    const endpoint = await inspectProviderEndpoint(config.baseUrl, this.#options.lookup);
    const provider = createProviderAdapter(config, credential, { fetch: this.#options.fetch });
    const started = performance.now();
    const probe = await provider.testConnection(signal);
    return ProviderConnectionTestResultSchema.parse({
      providerId: config.id,
      protocol: config.protocol,
      endpoint,
      reachable: true,
      authentication: credential ? 'verified' : 'not-required',
      modelList: probe.modelList,
      actualModel: probe.actualModel,
      streaming: probe.streaming,
      structuredOutput: probe.structuredOutput,
      tokenUsageAvailable: probe.tokenUsageAvailable,
      latencyMs: Math.max(0, Math.round(performance.now() - started)),
      checkedAt: (this.#options.clock?.now() ?? new Date()).toISOString(),
      warnings: [...endpoint.warnings, ...probe.warnings],
    });
  }
}
''',
)

write(
    'packages/core-service/src/utility-provider-router.ts',
    r'''import {
  CoreProviderResultSchema,
  PROVIDER_CORE_OPERATIONS,
  type CoreProviderOperation,
  type CoreProviderResult,
} from '@worldforge/contracts';

import type { AppRuntime } from './app-runtime.js';
import { providerErrorCode } from './provider-errors.js';
import { summarizeProviderConfig } from './provider-connection.js';

export async function executeProviderOperation(
  appRuntime: AppRuntime,
  requestId: string,
  operation: CoreProviderOperation,
): Promise<CoreProviderResult> {
  try {
    switch (operation.operation) {
      case PROVIDER_CORE_OPERATIONS.list:
        return CoreProviderResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: { providers: appRuntime.providerConfigs.list().map(summarizeProviderConfig) },
        });
      case PROVIDER_CORE_OPERATIONS.get:
        return CoreProviderResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: { provider: appRuntime.providerConfigs.get(operation.providerId) },
        });
      case PROVIDER_CORE_OPERATIONS.upsert: {
        validateForPersistence(operation.config.baseUrl);
        const saved = await appRuntime.providerConfigs.upsert(requestId, operation.config);
        return CoreProviderResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: summarizeProviderConfig(saved),
        });
      }
      case PROVIDER_CORE_OPERATIONS.remove:
        return CoreProviderResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: { removed: await appRuntime.providerConfigs.remove(requestId, operation.providerId) },
        });
      case PROVIDER_CORE_OPERATIONS.testConnection:
        return CoreProviderResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await appRuntime.providerConnections.test(operation.config, operation.credential),
        });
    }
  } catch (error) {
    return CoreProviderResultSchema.parse({
      ok: false,
      operation: operation.operation,
      errorCode: providerErrorCode(error),
    });
  }
}

function validateForPersistence(baseUrl: string): void {
  summarizeProviderConfig({
    id: 'validation',
    name: 'validation',
    protocol: 'openai_compatible',
    baseUrl,
    model: 'validation',
    credentialRef: null,
    timeoutMs: 1_000,
    options: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
}
''',
)

replace_once(
    'packages/core-service/src/app-runtime.ts',
    "import { ProviderConfigsRepository } from './provider-configs.js';\n",
    "import { ProviderConfigsRepository } from './provider-configs.js';\nimport { ProviderConnectionService } from './provider-connection.js';\n",
    'app runtime provider connection import',
)
replace_once(
    'packages/core-service/src/app-runtime.ts',
    "  readonly providerConfigs: ProviderConfigsRepository;\n",
    "  readonly providerConfigs: ProviderConfigsRepository;\n  readonly providerConnections: ProviderConnectionService;\n",
    'app runtime provider connection field',
)
replace_once(
    'packages/core-service/src/app-runtime.ts',
    "    providerConfigs: new ProviderConfigsRepository(database, options.clock),\n",
    "    providerConfigs: new ProviderConfigsRepository(database, options.clock),\n    providerConnections: new ProviderConnectionService({ clock: options.clock }),\n",
    'app runtime provider connection init',
)

replace_once(
    'packages/core-service/src/utility-entry.ts',
    "  CoreProjectResultSchema,\n",
    "  CoreProjectResultSchema,\n  CoreProviderResultSchema,\n",
    'utility provider result import',
)
replace_once(
    'packages/core-service/src/utility-entry.ts',
    "import { executeProjectOperation } from './utility-project-router.js';\n",
    "import { executeProjectOperation } from './utility-project-router.js';\nimport { executeProviderOperation } from './utility-provider-router.js';\n",
    'utility provider router import',
)
replace_once(
    'packages/core-service/src/utility-entry.ts',
    "    case 'core.project.command': {\n",
    "    case 'core.provider.command': {\n      const requestId = parsed.data.requestId;\n      const operation = parsed.data.operation;\n      if (!acceptingAppDataOperations) {\n        send({\n          type: 'core.provider.result',\n          protocolVersion: PROTOCOL_VERSION,\n          requestId,\n          result: CoreProviderResultSchema.parse({\n            ok: false,\n            operation: operation.operation,\n            errorCode: 'COMMON_CANCELLED_004',\n          }),\n        });\n        break;\n      }\n      track(\n        executeProviderOperation(appRuntime, requestId, operation).then((result) => {\n          send({\n            type: 'core.provider.result',\n            protocolVersion: PROTOCOL_VERSION,\n            requestId,\n            result,\n          });\n        }),\n      );\n      break;\n    }\n    case 'core.project.command': {\n",
    'utility provider command case',
)

replace_once(
    'packages/core-service/src/index.ts',
    "export * from './provider-configs.js';\n",
    "export * from './provider-configs.js';\nexport * from './provider-errors.js';\nexport * from './provider-endpoint.js';\nexport * from './provider-adapters.js';\nexport * from './provider-connection.js';\n",
    'core provider exports',
)
'''}