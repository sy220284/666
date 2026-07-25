import { randomUUID } from 'node:crypto';

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
      return providerFailure(requestId, saved.ok ? 'COMMON_INTERNAL_999' : saved.errorCode);
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
