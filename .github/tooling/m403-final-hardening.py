from pathlib import Path
import subprocess

TARGET_BRANCH = 'work/m4-03-provider-credential-connection'
EXPECTED_HEAD = '506e4a6bfaa13fd7c0ddc3b99b46d774654625e6'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one target, found {count}')
    return text.replace(old, new, 1)


def replace_region(text: str, start_marker: str, end_marker: str, replacement: str, label: str) -> str:
    start = text.find(start_marker)
    if start < 0:
        raise SystemExit(f'{label}: start marker missing')
    end = text.find(end_marker, start)
    if end < 0:
        raise SystemExit(f'{label}: end marker missing')
    return text[:start] + replacement + text[end:]


provider_ipc = r'''import { randomUUID } from 'node:crypto';

import {
  IPC_CHANNELS,
  PROVIDER_CORE_OPERATIONS,
  ProviderListCommandSchema,
  ProviderRemoveCommandSchema,
  ProviderSaveCommandSchema,
  ProviderTestConnectionCommandSchema,
  RequestIdSchema,
  type CommandFailure,
  type CommandResult,
  type ErrorCode,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';

import type { CoreSupervisor } from './core-supervisor.js';
import type { CredentialBroker } from './credential-broker.js';
import type { PrivacyLogger } from './privacy-logger.js';

interface ProviderIpcHandlerOptions {
  readonly ipcMain: IpcMain;
  readonly supervisor: CoreSupervisor;
  readonly credentialBroker: CredentialBroker;
  readonly rendererUrl: string;
  readonly logger: PrivacyLogger;
}

const PROVIDER_CHANNELS = [
  IPC_CHANNELS.providerList,
  IPC_CHANNELS.providerSave,
  IPC_CHANNELS.providerRemove,
  IPC_CHANNELS.providerTestConnection,
] as const;

function success<T>(requestId: string, data: T): CommandResult<T> {
  return { ok: true, requestId, data };
}

function failure(
  requestId: string,
  code: ErrorCode,
  message: string,
  retryable: boolean,
  userAction?: string,
): CommandFailure {
  return {
    ok: false,
    requestId,
    error: {
      code,
      message,
      retryable,
      ...(userAction ? { userAction } : {}),
    },
  };
}

function requestIdFrom(raw: unknown): string {
  if (raw && typeof raw === 'object' && 'requestId' in raw) {
    const parsed = RequestIdSchema.safeParse(raw.requestId);
    if (parsed.success) return parsed.data;
  }
  return randomUUID();
}

function providerFailure(requestId: string, code: ErrorCode): CommandFailure {
  const semantics: Readonly<
    Record<string, { message: string; retryable: boolean; userAction?: string }>
  > = {
    AI_PROVIDER_NOT_CONFIGURED_001: {
      message: '未找到Provider配置。',
      retryable: false,
      userAction: '刷新Provider列表或重新保存配置。',
    },
    AI_CREDENTIAL_MISSING_002: {
      message: 'Provider凭据缺失或安全存储不可用。',
      retryable: false,
      userAction: '重新保存凭据；本地无密钥服务可清除凭据后重试。',
    },
    AI_CONNECTION_FAILED_003: {
      message: '无法连接Provider。',
      retryable: true,
      userAction: '检查服务是否运行、地址、端口和网络连接。',
    },
    AI_AUTH_FAILED_004: {
      message: 'Provider认证失败。',
      retryable: false,
      userAction: '检查API密钥或本地服务认证设置。',
    },
    AI_RATE_LIMITED_005: {
      message: 'Provider当前限流。',
      retryable: true,
      userAction: '稍后重试或检查Provider配额。',
    },
    AI_REQUEST_TIMEOUT_006: {
      message: 'Provider连接测试超时。',
      retryable: true,
      userAction: '检查服务负载或适当增加超时时间。',
    },
    AI_STREAM_INTERRUPTED_009: {
      message: 'Provider流式响应中断。',
      retryable: true,
      userAction: '检查网络稳定性与Provider流式兼容性。',
    },
    AI_MODEL_UNSUPPORTED_010: {
      message: 'Provider未提供配置的模型或适配器。',
      retryable: false,
      userAction: '检查模型ID；Custom协议必须使用仓库已批准适配器。',
    },
    AI_ENDPOINT_UNSAFE_013: {
      message: 'Provider地址未通过安全检查。',
      retryable: false,
      userAction: '使用回环/受信局域网地址，或使用HTTPS外部端点。',
    },
  };
  const resolved = semantics[code] ?? {
    message: 'Provider操作未完成。',
    retryable: code === 'COMMON_INTERNAL_999' || code === 'COMMON_TIMEOUT_005',
  };
  return failure(requestId, code, resolved.message, resolved.retryable, resolved.userAction);
}

export function registerProviderIpcHandlers(options: ProviderIpcHandlerOptions): () => void {
  const rejectUntrusted = (event: IpcMainInvokeEvent, raw: unknown): CommandFailure | null => {
    if (event.senderFrame?.url === options.rendererUrl) return null;
    return failure(
      requestIdFrom(raw),
      'COMMON_INVALID_INPUT_001',
      'The request origin is not trusted.',
      false,
    );
  };
  const invalidRequest = (raw: unknown): CommandFailure =>
    failure(requestIdFrom(raw), 'COMMON_INVALID_INPUT_001', 'The request was invalid.', false);

  options.ipcMain.handle(IPC_CHANNELS.providerList, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProviderListCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    const result = await options.supervisor.invokeProviderOperation(parsed.data.requestId, {
      operation: PROVIDER_CORE_OPERATIONS.list,
    });
    return result.ok
      ? success(parsed.data.requestId, result.data)
      : providerFailure(parsed.data.requestId, result.errorCode);
  });

  options.ipcMain.handle(IPC_CHANNELS.providerSave, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProviderSaveCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    const requestId = parsed.data.requestId;
    const existingResult = await options.supervisor.invokeProviderOperation(requestId, {
      operation: PROVIDER_CORE_OPERATIONS.get,
      providerId: parsed.data.payload.config.id,
    });
    if (!existingResult.ok) return providerFailure(requestId, existingResult.errorCode);
    if (existingResult.operation !== PROVIDER_CORE_OPERATIONS.get) {
      return providerFailure(requestId, 'COMMON_INTERNAL_999');
    }
    const existing = existingResult.data.provider;
    let credentialRef = existing?.credentialRef ?? null;
    let createdCredentialRef: string | null = null;
    try {
      if (parsed.data.payload.credential.action === 'replace') {
        createdCredentialRef = await options.credentialBroker.store(
          parsed.data.payload.config.id,
          parsed.data.payload.credential.credential,
        );
        credentialRef = createdCredentialRef;
      } else if (parsed.data.payload.credential.action === 'remove') {
        credentialRef = null;
      }
    } catch {
      return providerFailure(requestId, 'AI_CREDENTIAL_MISSING_002');
    }

    const saved = await options.supervisor.invokeProviderOperation(requestId, {
      operation: PROVIDER_CORE_OPERATIONS.upsert,
      config: { ...parsed.data.payload.config, credentialRef },
    });
    if (!saved.ok || saved.operation !== PROVIDER_CORE_OPERATIONS.upsert) {
      if (createdCredentialRef) {
        try {
          await options.credentialBroker.remove(createdCredentialRef);
        } catch {
          await options.logger.log('warn', 'credential.rollback.failed', {
            providerId: parsed.data.payload.config.id,
            errorCode: 'AI_CREDENTIAL_MISSING_002',
          });
        }
      }
      return providerFailure(
        requestId,
        saved.ok ? 'COMMON_INTERNAL_999' : saved.errorCode,
      );
    }

    if (existing?.credentialRef && existing.credentialRef !== credentialRef) {
      try {
        await options.credentialBroker.remove(existing.credentialRef);
      } catch {
        await options.logger.log('warn', 'credential.cleanup.failed', {
          providerId: parsed.data.payload.config.id,
          errorCode: 'AI_CREDENTIAL_MISSING_002',
        });
      }
    }
    return success(requestId, saved.data);
  });

  options.ipcMain.handle(IPC_CHANNELS.providerRemove, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProviderRemoveCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    const requestId = parsed.data.requestId;
    const existingResult = await options.supervisor.invokeProviderOperation(requestId, {
      operation: PROVIDER_CORE_OPERATIONS.get,
      providerId: parsed.data.payload.providerId,
    });
    if (!existingResult.ok) return providerFailure(requestId, existingResult.errorCode);
    if (existingResult.operation !== PROVIDER_CORE_OPERATIONS.get) {
      return providerFailure(requestId, 'COMMON_INTERNAL_999');
    }
    const removed = await options.supervisor.invokeProviderOperation(requestId, {
      operation: PROVIDER_CORE_OPERATIONS.remove,
      providerId: parsed.data.payload.providerId,
    });
    if (!removed.ok) return providerFailure(requestId, removed.errorCode);
    if (removed.operation !== PROVIDER_CORE_OPERATIONS.remove) {
      return providerFailure(requestId, 'COMMON_INTERNAL_999');
    }
    if (removed.data.removed && existingResult.data.provider?.credentialRef) {
      try {
        await options.credentialBroker.remove(existingResult.data.provider.credentialRef);
      } catch {
        await options.logger.log('warn', 'credential.cleanup.failed', {
          providerId: parsed.data.payload.providerId,
          errorCode: 'AI_CREDENTIAL_MISSING_002',
        });
      }
    }
    return success(requestId, removed.data);
  });

  options.ipcMain.handle(IPC_CHANNELS.providerTestConnection, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProviderTestConnectionCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    const requestId = parsed.data.requestId;
    const existingResult = await options.supervisor.invokeProviderOperation(requestId, {
      operation: PROVIDER_CORE_OPERATIONS.get,
      providerId: parsed.data.payload.providerId,
    });
    if (!existingResult.ok) return providerFailure(requestId, existingResult.errorCode);
    if (existingResult.operation !== PROVIDER_CORE_OPERATIONS.get) {
      return providerFailure(requestId, 'COMMON_INTERNAL_999');
    }
    const config = existingResult.data.provider;
    if (!config) return providerFailure(requestId, 'AI_PROVIDER_NOT_CONFIGURED_001');
    let credential: string | null = null;
    if (config.credentialRef) {
      try {
        credential = await options.credentialBroker.resolve(config.credentialRef);
      } catch {
        return providerFailure(requestId, 'AI_CREDENTIAL_MISSING_002');
      }
      if (!credential) return providerFailure(requestId, 'AI_CREDENTIAL_MISSING_002');
    }
    const result = await options.supervisor.invokeProviderOperation(requestId, {
      operation: PROVIDER_CORE_OPERATIONS.testConnection,
      config,
      credential,
    });
    if (!result.ok) return providerFailure(requestId, result.errorCode);
    if (result.operation !== PROVIDER_CORE_OPERATIONS.testConnection) {
      return providerFailure(requestId, 'COMMON_INTERNAL_999');
    }
    return success(requestId, result.data);
  });

  return () => {
    for (const channel of PROVIDER_CHANNELS) options.ipcMain.removeHandler(channel);
  };
}
'''
Path('apps/desktop/main/src/provider-ipc-handlers.ts').write_text(provider_ipc)

# Remove Provider-domain logic from the generic IPC registrar and delegate to the dedicated module.
ipc_path = Path('apps/desktop/main/src/ipc-handlers.ts')
ipc = ipc_path.read_text()
for line in [
    '  PROVIDER_CORE_OPERATIONS,\n',
    '  ProviderListCommandSchema,\n',
    '  ProviderRemoveCommandSchema,\n',
    '  ProviderSaveCommandSchema,\n',
    '  ProviderTestConnectionCommandSchema,\n',
]:
    if ipc.count(line) != 1:
        raise SystemExit(f'generic IPC Provider import target mismatch: {line!r}')
    ipc = ipc.replace(line, '', 1)
for line in [
    '    IPC_CHANNELS.providerList,\n',
    '    IPC_CHANNELS.providerSave,\n',
    '    IPC_CHANNELS.providerRemove,\n',
    '    IPC_CHANNELS.providerTestConnection,\n',
]:
    if ipc.count(line) != 1:
        raise SystemExit(f'generic IPC Provider channel target mismatch: {line!r}')
    ipc = ipc.replace(line, '', 1)
ipc = replace_once(
    ipc,
    "import { createDiagnosticId, type PrivacyLogger } from './privacy-logger.js';\n",
    "import { registerProviderIpcHandlers } from './provider-ipc-handlers.js';\nimport { createDiagnosticId, type PrivacyLogger } from './privacy-logger.js';\n",
    'provider IPC module import',
)
ipc = replace_region(
    ipc,
    '  const providerFailure =',
    '  register(IPC_CHANNELS.projectListRecent',
    '  register(IPC_CHANNELS.projectListRecent',
    'remove generic Provider IPC block',
)
ipc = replace_once(
    ipc,
    "  const invalidRequest = (raw: unknown): CommandFailure =>\n    failure(requestIdFrom(raw), 'COMMON_INVALID_INPUT_001', 'The request was invalid.', false);\n\n",
    "  const invalidRequest = (raw: unknown): CommandFailure =>\n    failure(requestIdFrom(raw), 'COMMON_INVALID_INPUT_001', 'The request was invalid.', false);\n\n  const disposeProviderHandlers = registerProviderIpcHandlers({\n    ipcMain: options.ipcMain,\n    supervisor: options.supervisor,\n    credentialBroker: options.credentialBroker,\n    rendererUrl: options.rendererUrl,\n    logger: options.logger,\n  });\n\n",
    'Provider IPC delegation',
)
ipc = replace_once(
    ipc,
    '  return () => {\n    for (const channel of invokeChannels) options.ipcMain.removeHandler(channel);\n',
    '  return () => {\n    disposeProviderHandlers();\n    for (const channel of invokeChannels) options.ipcMain.removeHandler(channel);\n',
    'Provider IPC cleanup',
)
ipc_path.write_text(ipc)

# Harden endpoint classification and DNS trust-boundary validation.
endpoint_path = Path('packages/core-service/src/provider-endpoint.ts')
endpoint = endpoint_path.read_text()
endpoint_scope = r'''function ipv4Parts(host: string): readonly [number, number, number, number] | null {
  const parts = host.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return null;
  }
  return parts as [number, number, number, number];
}

function ipv4Scope(host: string): ProviderEndpointScope | 'unsafe' {
  const parts = ipv4Parts(host);
  if (!parts) return 'unsafe';
  const [a, b, c] = parts;
  if (a === 127) return 'loopback';
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
    return 'lan';
  }
  if (
    a === 0 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  ) {
    return 'unsafe';
  }
  return 'external';
}

function parseIpv6Words(host: string): readonly number[] | null {
  const pieces = host.split('::');
  if (pieces.length > 2) return null;
  const parseSide = (side: string): number[] | null => {
    if (!side) return [];
    const words: number[] = [];
    for (const token of side.split(':')) {
      if (token.includes('.')) {
        const ipv4 = ipv4Parts(token);
        if (!ipv4) return null;
        words.push((ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3]);
      } else {
        if (!/^[0-9a-f]{1,4}$/iu.test(token)) return null;
        words.push(Number.parseInt(token, 16));
      }
    }
    return words;
  };
  const left = parseSide(pieces[0] ?? '');
  const right = parseSide(pieces[1] ?? '');
  if (!left || !right) return null;
  if (pieces.length === 1) return left.length === 8 ? left : null;
  const missing = 8 - left.length - right.length;
  if (missing < 1) return null;
  return [...left, ...Array.from({ length: missing }, () => 0), ...right];
}

function ipv6Scope(host: string): ProviderEndpointScope | 'unsafe' {
  const words = parseIpv6Words(host);
  if (!words || words.length !== 8) return 'unsafe';
  if (words.every((word) => word === 0)) return 'unsafe';
  if (words.slice(0, 7).every((word) => word === 0) && words[7] === 1) return 'loopback';
  const mapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  const compatible = words.slice(0, 6).every((word) => word === 0);
  if (mapped || compatible) {
    const ipv4 = `${(words[6]! >> 8) & 0xff}.${words[6]! & 0xff}.${
      (words[7]! >> 8) & 0xff
    }.${words[7]! & 0xff}`;
    return ipv4Scope(ipv4);
  }
  const first = words[0]!;
  if ((first & 0xfe00) === 0xfc00) return 'lan';
  if ((first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00) return 'unsafe';
  if (first === 0x2001 && words[1] === 0x0db8) return 'unsafe';
  return 'external';
}

function literalScope(hostname: string): ProviderEndpointScope | 'unsafe' | null {
  const host = normalizedHost(hostname);
  const version = isIP(host);
  if (version === 4) return ipv4Scope(host);
  if (version === 6) return ipv6Scope(host);
  return null;
}

'''
endpoint = replace_region(endpoint, 'function ipv4Scope(', 'function hostnameScope(', endpoint_scope, 'endpoint IP classification')
endpoint = replace_once(
    endpoint,
    "  const url = new URL(parsedValue.data);\n  if (url.port === '0') unsafe('The Provider endpoint cannot use port 0.');\n",
    "  const url = new URL(parsedValue.data);\n  if (url.search || url.hash) {\n    unsafe('Provider Base URLs cannot contain query parameters or fragments.');\n  }\n  if (url.port === '0') unsafe('The Provider endpoint cannot use port 0.');\n",
    'endpoint query and fragment guard',
)
endpoint = replace_once(
    endpoint,
    "  if (scopes.size !== 1)\n    unsafe('The Provider hostname resolved across mixed network trust boundaries.');\n  const [resolvedScope] = scopes;\n  if (!resolvedScope) unsafe('The Provider endpoint scope could not be determined.');\n",
    "  if (scopes.size !== 1)\n    unsafe('The Provider hostname resolved across mixed network trust boundaries.');\n  const [resolvedScope] = scopes;\n  if (!resolvedScope) unsafe('The Provider endpoint scope could not be determined.');\n  if (resolvedScope !== initial.scope) {\n    unsafe('The Provider hostname resolved outside its declared network trust boundary.');\n  }\n",
    'DNS trust-boundary guard',
)
endpoint_path.write_text(endpoint)

# Keep cancellation and timeout active for the full response-body lifetime.
adapters_path = Path('packages/core-service/src/provider-adapters.ts')
adapters = adapters_path.read_text()
lease_helpers = r'''function endpoint(baseUrl: string, relative: string): URL {
  const normalized = new URL(baseUrl);
  normalized.search = '';
  normalized.hash = '';
  if (!normalized.pathname.endsWith('/')) normalized.pathname += '/';
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
    return new ProviderRuntimeError(
      'AI_CONNECTION_FAILED_003',
      'The Provider is temporarily unavailable.',
      true,
    );
  }
  return new ProviderRuntimeError(
    'AI_CONNECTION_FAILED_003',
    'The Provider rejected the request.',
    false,
  );
}

interface ProviderResponseLease {
  readonly response: Response;
  readonly signal: AbortSignal;
  readonly cancelled: () => boolean;
  readonly timedOut: () => boolean;
  readonly release: () => void;
}

function cancelledError(): ProviderRuntimeError {
  return new ProviderRuntimeError(
    'COMMON_CANCELLED_004',
    'The Provider request was cancelled.',
    false,
  );
}

function timeoutError(): ProviderRuntimeError {
  return new ProviderRuntimeError('AI_REQUEST_TIMEOUT_006', 'The Provider request timed out.', true);
}

function deadlineError(lease: ProviderResponseLease): ProviderRuntimeError | null {
  if (lease.cancelled()) return cancelledError();
  if (lease.timedOut()) return timeoutError();
  return null;
}

async function request(
  fetchImplementation: typeof fetch,
  url: URL,
  init: RequestInit,
  timeoutMs: number,
  userSignal?: AbortSignal,
): Promise<ProviderResponseLease> {
  if (userSignal?.aborted) throw cancelledError();
  const controller = new AbortController();
  let cancelled = false;
  let timedOut = false;
  let released = false;
  const onAbort = (): void => {
    cancelled = true;
    controller.abort();
  };
  userSignal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const release = (): void => {
    if (released) return;
    released = true;
    clearTimeout(timer);
    userSignal?.removeEventListener('abort', onAbort);
  };
  try {
    const response = await fetchImplementation(url, {
      ...init,
      redirect: 'manual',
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      try {
        await response.body?.cancel();
      } finally {
        release();
      }
      throw new ProviderRuntimeError(
        'AI_ENDPOINT_UNSAFE_013',
        'Provider redirects are blocked unless an adapter explicitly approves them.',
        false,
      );
    }
    return {
      response,
      signal: controller.signal,
      cancelled: () => cancelled,
      timedOut: () => timedOut,
      release,
    };
  } catch (error) {
    release();
    if (error instanceof ProviderRuntimeError) throw error;
    if (cancelled) throw cancelledError();
    if (timedOut) throw timeoutError();
    throw new ProviderRuntimeError(
      'AI_CONNECTION_FAILED_003',
      'The Provider could not be reached.',
      true,
    );
  }
}

async function discard(lease: ProviderResponseLease): Promise<void> {
  try {
    await lease.response.body?.cancel();
  } catch {
    // The body may already be closed by the runtime.
  } finally {
    lease.release();
  }
}

async function requireJson(lease: ProviderResponseLease): Promise<unknown> {
  if (!lease.response.ok) {
    const error = mapHttpError(lease.response.status);
    await discard(lease);
    throw error;
  }
  try {
    const value = await lease.response.text();
    return JSON.parse(value) as unknown;
  } catch (error) {
    const deadline = deadlineError(lease);
    if (deadline) throw deadline;
    if (error instanceof ProviderRuntimeError) throw error;
    throw new ProviderRuntimeError(
      'AI_OUTPUT_INVALID_008',
      'The Provider returned invalid JSON.',
      false,
    );
  } finally {
    lease.release();
  }
}

async function* sseData(lease: ProviderResponseLease): AsyncGenerator<string> {
  if (!lease.response.ok) {
    const error = mapHttpError(lease.response.status);
    await discard(lease);
    throw error;
  }
  if (!lease.response.body) {
    lease.release();
    throw new ProviderRuntimeError(
      'AI_STREAM_INTERRUPTED_009',
      'The Provider stream was empty.',
      true,
    );
  }
  const reader = lease.response.body.getReader();
  const onAbort = (): void => {
    void reader.cancel().catch(() => undefined);
  };
  lease.signal.addEventListener('abort', onAbort, { once: true });
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      if (lease.signal.aborted) throw deadlineError(lease) ?? cancelledError();
      const chunk = await reader.read();
      if (chunk.done) {
        const deadline = deadlineError(lease);
        if (deadline) throw deadline;
        break;
      }
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
    const deadline = deadlineError(lease);
    if (deadline) throw deadline;
    if (error instanceof ProviderRuntimeError) throw error;
    throw new ProviderRuntimeError(
      'AI_STREAM_INTERRUPTED_009',
      'The Provider stream was interrupted.',
      true,
    );
  } finally {
    lease.signal.removeEventListener('abort', onAbort);
    reader.releaseLock();
    lease.release();
  }
}

'''
adapters = replace_region(adapters, 'function endpoint(', 'function connectionRequest(', lease_helpers, 'Provider response lease helpers')
tail_start = adapters.index('function connectionRequest(')
prefix = adapters[:tail_start]
tail = adapters[tail_start:]
if tail.count('response.status') != 4:
    raise SystemExit(f'Provider status access count: {tail.count("response.status")}')
tail = tail.replace('response.status', 'response.response.status')
if tail.count('sseData(response, signal)') != 2:
    raise SystemExit(f'Provider SSE call count: {tail.count("sseData(response, signal)")}')
tail = tail.replace('sseData(response, signal)', 'sseData(response)')
unsupported = "if ([404, 405, 501].includes(response.response.status)) return 'unsupported';"
if tail.count(unsupported) != 2:
    raise SystemExit(f'Provider model unsupported count: {tail.count(unsupported)}')
tail = tail.replace(
    unsupported,
    """if ([404, 405, 501].includes(response.response.status)) {
      await discard(response);
      return 'unsupported';
    }""",
)
structured = "if (structured && [400, 404, 405, 422, 501].includes(response.response.status)) return false;"
if tail.count(structured) != 2:
    raise SystemExit(f'Provider structured unsupported count: {tail.count(structured)}')
tail = tail.replace(
    structured,
    """if (structured && [400, 404, 405, 422, 501].includes(response.response.status)) {
      await discard(response);
      return false;
    }""",
)
adapters = prefix + tail
openai_class = adapters.index('class OpenAiCompatibleProvider')
openai_generate = adapters.index('  async *generate(', openai_class)
openai_loop_start = adapters.index("    yield ProviderEventSchema.parse({ type: 'connected' });", openai_generate)
openai_loop_end = adapters.index('    if (!completed) {', openai_loop_start)
new_openai_loop = r'''    yield ProviderEventSchema.parse({ type: 'connected' });
    let completed = false;
    let finishReason: string | undefined;
    for await (const data of sseData(response)) {
      if (data === '[DONE]') {
        completed = true;
        yield ProviderEventSchema.parse({
          type: 'completed',
          ...(finishReason ? { finishReason } : {}),
        });
        break;
      }
      let payload: JsonRecord | null;
      try {
        payload = object(JSON.parse(data));
      } catch {
        throw new ProviderRuntimeError(
          'AI_OUTPUT_INVALID_008',
          'The Provider stream contained invalid JSON.',
          false,
        );
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
      if (choice?.finish_reason) finishReason = String(choice.finish_reason);
    }
    if (!completed && finishReason) {
      completed = true;
      yield ProviderEventSchema.parse({ type: 'completed', finishReason });
    }
'''
adapters = adapters[:openai_loop_start] + new_openai_loop + adapters[openai_loop_end:]
adapters_path.write_text(adapters)

endpoint_test = r'''import { describe, expect, it } from 'vitest';

import {
  inspectProviderEndpoint,
  validateProviderEndpoint,
} from '../../packages/core-service/src/provider-endpoint.js';

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return (error as { readonly code?: string }).code;
  }
  return undefined;
}

describe('M4-03 Provider endpoint boundary', () => {
  it('classifies loopback, LAN, mapped IPv6, and encrypted external endpoints', () => {
    expect(validateProviderEndpoint('http://127.0.0.1:11434/v1')).toMatchObject({
      scope: 'loopback',
      secureTransport: false,
    });
    expect(validateProviderEndpoint('http://192.168.1.20:8080/v1')).toMatchObject({
      scope: 'lan',
      secureTransport: false,
    });
    expect(validateProviderEndpoint('http://[::ffff:192.168.1.20]:8080/v1')).toMatchObject({
      scope: 'lan',
    });
    expect(validateProviderEndpoint('http://[::ffff:127.0.0.1]:8080/v1')).toMatchObject({
      scope: 'loopback',
    });
    expect(validateProviderEndpoint('https://api.example.com/v1')).toMatchObject({
      scope: 'external',
      secureTransport: true,
    });
  });

  it('blocks sensitive URL components and reserved or metadata address space', () => {
    const blocked = [
      'http://api.example.com/v1',
      'http://169.254.169.254/latest',
      'https://user:secret@example.com/v1',
      'https://api.example.com/v1?api_key=secret',
      'https://api.example.com/v1#secret',
      'https://192.0.2.1/v1',
      'https://198.18.0.1/v1',
      'https://[2001:db8::1]/v1',
    ];
    for (const value of blocked) {
      expect(codeOf(() => validateProviderEndpoint(value)), value).toBe('AI_ENDPOINT_UNSAFE_013');
    }
  });

  it('blocks DNS answers that cross or change network trust boundaries', async () => {
    await expect(
      inspectProviderEndpoint(
        'https://api.example.com/v1',
        (async () => [
          { address: '93.184.216.34', family: 4 },
          { address: '10.0.0.5', family: 4 },
        ]) as never,
      ),
    ).rejects.toMatchObject({ code: 'AI_ENDPOINT_UNSAFE_013' });
    await expect(
      inspectProviderEndpoint(
        'https://api.example.com/v1',
        (async () => [{ address: '::ffff:127.0.0.1', family: 6 }]) as never,
      ),
    ).rejects.toMatchObject({ code: 'AI_ENDPOINT_UNSAFE_013' });
    await expect(
      inspectProviderEndpoint(
        'https://api.example.com/v1',
        (async () => [{ address: '169.254.169.254', family: 4 }]) as never,
      ),
    ).rejects.toMatchObject({ code: 'AI_ENDPOINT_UNSAFE_013' });
  });
});
'''
Path('tests/security/provider-endpoint.test.ts').write_text(endpoint_test)

integration_path = Path('tests/integration/provider-connection.test.ts')
integration = integration_path.read_text()
finish_marker = 'finish_reason: null'
if integration.count(finish_marker) != 1:
    raise SystemExit(f'OpenAI fixture finish marker count: {integration.count(finish_marker)}')
integration = integration.replace(finish_marker, "finish_reason: 'stop'", 1)
insert_marker = "  it('reports missing usage without failing a valid stream', async () => {"
new_tests = r'''  it('emits exactly one completion event when finish_reason and DONE are both present', async () => {
    const root = await startProviderServer();
    const adapter = createProviderAdapter(config(`${root}/openai/v1`), null);
    const events = [];
    for await (const event of adapter.generate(
      {
        runId: '550e8400-e29b-41d4-a716-446655440000',
        model: 'writer-model',
        systemPrompt: 'test',
        messages: [{ role: 'user', content: 'test' }],
        maxOutputTokens: 8,
        metadata: {
          taskType: 'validate',
          promptId: 'test',
          promptVersion: 1,
          constraintHash: '0'.repeat(64),
        },
      },
      new AbortController().signal,
    )) {
      events.push(event);
    }
    expect(events.filter((event) => event.type === 'completed')).toEqual([
      { type: 'completed', finishReason: 'stop' },
    ]);
  });

  it('keeps cancellation and timeout active after streaming response headers arrive', async () => {
    const stalledFetch = async (): Promise<Response> =>
      new Response(
        new ReadableStream<Uint8Array>({
          start() {
            // The reader remains pending until the adapter deadline cancels it.
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );
    const request = {
      runId: '550e8400-e29b-41d4-a716-446655440000',
      model: 'writer-model',
      systemPrompt: 'test',
      messages: [{ role: 'user' as const, content: 'test' }],
      maxOutputTokens: 8,
      metadata: {
        taskType: 'validate' as const,
        promptId: 'test',
        promptVersion: 1,
        constraintHash: '0'.repeat(64),
      },
    };

    const cancelledController = new AbortController();
    const cancelledIterator = createProviderAdapter(config('https://provider.example/v1'), null, {
      fetch: stalledFetch as typeof fetch,
    })
      .generate(request, cancelledController.signal)
      [Symbol.asyncIterator]();
    await expect(cancelledIterator.next()).resolves.toMatchObject({ value: { type: 'connected' } });
    const cancelledRead = cancelledIterator.next();
    cancelledController.abort();
    await expect(cancelledRead).rejects.toMatchObject({ code: 'COMMON_CANCELLED_004' });

    const timeoutIterator = createProviderAdapter(
      { ...config('https://provider.example/v1'), timeoutMs: 1_000 },
      null,
      { fetch: stalledFetch as typeof fetch },
    )
      .generate(request, new AbortController().signal)
      [Symbol.asyncIterator]();
    await expect(timeoutIterator.next()).resolves.toMatchObject({ value: { type: 'connected' } });
    await expect(timeoutIterator.next()).rejects.toMatchObject({ code: 'AI_REQUEST_TIMEOUT_006' });
  });

'''
integration = replace_once(integration, insert_marker, new_tests + insert_marker, 'Provider integration hardening tests')
integration_path.write_text(integration)

summary_path = Path('docs/test-evidence/M4-03/summary.md')
summary_path.parent.mkdir(parents=True, exist_ok=True)
summary_path.write_text('''# M4-03 实施证据摘要

## 实现范围

- 复用`provider_configs`、Electron `safeStorage` Credential Broker、Core Utility Process和受信IPC，不建立第二套配置或凭据真源。
- 实现OpenAI兼容与Anthropic适配器、模型列表/最短生成/流式/结构化输出连接探测、稳定错误语义和本机/局域网/外部端点提示。
- Provider IPC拆分为独立领域注册模块；Renderer不接触凭据明文或网络客户端。
- Base URL禁止凭据、query和fragment；外部端点强制HTTPS；DNS解析不得跨越或改变网络信任边界。
- 取消和超时覆盖响应头及正文/SSE完整生命周期；OpenAI完成事件保持单次确定性输出。
- 设置页支持配置保存、凭据替换/移除、连接测试和删除，并提供真实操作反馈。

## 回归覆盖

- Contracts、端点安全、协议适配、认证/限流/超时/中断/取消、无Token统计、凭据IPC与泄漏边界。
- 全仓Typecheck、Lint、Build和真实Electron Provider设置页回归。
- Provider不可用不改变基础离线写作、搜索、恢复和导出路径。
''')
Path('docs/test-evidence/M4-03/known-risks.md').write_text('''# M4-03 已知风险

- V1仅内置OpenAI兼容与Anthropic协议；Custom必须由仓库显式注册批准适配器。
- Provider模型能力来自连接探测，具体模型窗口、价格与Tokenizer映射留待M4-04/M4-05。
- 局域网HTTP仅允许用户明确配置的LAN或回环端点，界面持续显示非TLS风险提示。
''')
Path('docs/test-evidence/M4-03/commands.txt').write_text('''pnpm exec vitest run tests/unit/provider-contracts.test.ts tests/security/provider-endpoint.test.ts tests/security/provider-ipc.test.ts tests/integration/provider-connection.test.ts
pnpm typecheck
pnpm lint
pnpm build
xvfb-run -a pnpm exec playwright test provider-settings.spec.ts --config tests/e2e/playwright.config.ts
node scripts/taskctl.mjs validate
''')

files = [
  'apps/desktop/main/src/ipc-handlers.ts',
  'apps/desktop/main/src/provider-ipc-handlers.ts',
  'packages/core-service/src/provider-endpoint.ts',
  'packages/core-service/src/provider-adapters.ts',
  'tests/security/provider-endpoint.test.ts',
  'tests/integration/provider-connection.test.ts',
  'docs/test-evidence/M4-03/summary.md',
  'docs/test-evidence/M4-03/known-risks.md',
]
subprocess.run(['pnpm', 'exec', 'prettier', '--write', *files], check=True)
subprocess.run(['pnpm', 'test:prepare'], check=True)
subprocess.run([
  'pnpm', 'exec', 'vitest', 'run',
  'tests/unit/provider-contracts.test.ts',
  'tests/security/provider-endpoint.test.ts',
  'tests/security/provider-ipc.test.ts',
  'tests/integration/provider-connection.test.ts',
], check=True)
subprocess.run(['pnpm', 'typecheck'], check=True)
subprocess.run(['pnpm', 'lint'], check=True)
subprocess.run(['pnpm', 'build'], check=True)
subprocess.run([
  'xvfb-run', '-a', 'pnpm', 'exec', 'playwright', 'test', 'provider-settings.spec.ts',
  '--config', 'tests/e2e/playwright.config.ts',
], check=True)
subprocess.run(['node', 'scripts/taskctl.mjs', 'validate'], check=True)
subprocess.run(['git', 'diff', '--check'], check=True)
subprocess.run(['git', 'add', '--all'], check=True)
subprocess.run(['git', 'commit', '-m', '修复：加固M4-03端点流式边界并拆分IPC'], check=True)
subprocess.run(['git', 'push', 'origin', f'HEAD:{TARGET_BRANCH}'], check=True)
