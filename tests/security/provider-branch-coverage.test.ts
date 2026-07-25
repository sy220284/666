import {
  APP_COMMANDS,
  IPC_CHANNELS,
  PROVIDER_CORE_OPERATIONS,
  PROTOCOL_VERSION,
  type CoreProviderOperation,
  type CoreProviderResult,
  type ProviderConfig,
  type ProviderConnectionTestResult,
  type ProviderSummary,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import type { CoreSupervisor } from '../../apps/desktop/main/src/core-supervisor.js';
import type { CredentialBroker } from '../../apps/desktop/main/src/credential-broker.js';
import { registerProviderIpcHandlers } from '../../apps/desktop/main/src/provider-ipc-handlers.js';
import type { PrivacyLogger } from '../../apps/desktop/main/src/privacy-logger.js';
import type { AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { executeProviderOperation } from '../../packages/core-service/src/utility-provider-router.js';
import {
  ProviderRuntimeError,
  providerErrorCode,
} from '../../packages/core-service/src/provider-errors.js';

const requestId = '550e8400-e29b-41d4-a716-446655440000';
const credentialRef = 'cred_550e8400-e29b-41d4-a716-446655440000';
const secret = 'provider-secret';
const now = '2026-07-25T01:00:00.000Z';
const base = {
  protocolVersion: PROTOCOL_VERSION,
  requestId,
  sentAt: now,
} as const;
const editable = {
  id: 'local-openai',
  name: '本地模型',
  protocol: 'openai_compatible' as const,
  baseUrl: 'http://127.0.0.1:11434/v1',
  model: 'writer-model',
  timeoutMs: 30_000,
  options: {},
};
const stored: ProviderConfig = {
  ...editable,
  credentialRef,
  createdAt: now,
  updatedAt: now,
};
const summary: ProviderSummary = {
  ...editable,
  credentialConfigured: true,
  endpoint: {
    scope: 'loopback',
    origin: 'http://127.0.0.1:11434',
    secureTransport: false,
    warnings: [
      '请求仅发送到当前设备上的用户配置服务。',
      '当前连接未使用TLS，仅允许本机或受信局域网端点。',
    ],
  },
  createdAt: now,
  updatedAt: now,
};
const connection: ProviderConnectionTestResult = {
  providerId: stored.id,
  protocol: stored.protocol,
  endpoint: summary.endpoint,
  reachable: true,
  authentication: 'verified',
  modelList: 'verified',
  actualModel: stored.model,
  streaming: true,
  structuredOutput: true,
  tokenUsageAvailable: true,
  latencyMs: 12,
  checkedAt: now,
  warnings: summary.endpoint.warnings,
};

const trusted = {
  senderFrame: { url: 'file:///trusted/index.html' },
} as unknown as IpcMainInvokeEvent;
const untrusted = {
  senderFrame: { url: 'https://attacker.invalid' },
} as unknown as IpcMainInvokeEvent;

type Responder = (operation: CoreProviderOperation) => Promise<CoreProviderResult>;

async function defaultResponse(operation: CoreProviderOperation): Promise<CoreProviderResult> {
  switch (operation.operation) {
    case PROVIDER_CORE_OPERATIONS.list:
      return {
        ok: true,
        operation: operation.operation,
        data: { providers: [summary] },
      };
    case PROVIDER_CORE_OPERATIONS.get:
      return {
        ok: true,
        operation: operation.operation,
        data: { provider: stored },
      };
    case PROVIDER_CORE_OPERATIONS.upsert:
      return { ok: true, operation: operation.operation, data: summary };
    case PROVIDER_CORE_OPERATIONS.remove:
      return {
        ok: true,
        operation: operation.operation,
        data: { removed: true },
      };
    case PROVIDER_CORE_OPERATIONS.testConnection:
      return { ok: true, operation: operation.operation, data: connection };
  }
}

function ipcHarness(
  responder: Responder = defaultResponse,
  brokerOverrides: Partial<{
    store: () => Promise<string>;
    remove: () => Promise<boolean>;
    resolve: () => Promise<string | null>;
  }> = {},
) {
  const handlers = new Map<string, (event: IpcMainInvokeEvent, raw: unknown) => unknown>();
  const ipcMain = {
    handle: vi.fn(
      (channel: string, handler: (event: IpcMainInvokeEvent, raw: unknown) => unknown) =>
        handlers.set(channel, handler),
    ),
    removeHandler: vi.fn(),
  } as unknown as IpcMain;
  const invokeProviderOperation = vi.fn(async (_id: string, operation: CoreProviderOperation) =>
    responder(operation),
  );
  const supervisor = { invokeProviderOperation } as unknown as CoreSupervisor;
  const credentialBroker = {
    store: vi.fn(brokerOverrides.store ?? (async () => credentialRef)),
    remove: vi.fn(brokerOverrides.remove ?? (async () => true)),
    resolve: vi.fn(brokerOverrides.resolve ?? (async () => secret)),
  } as unknown as CredentialBroker;
  const log = vi.fn(async () => undefined);
  const dispose = registerProviderIpcHandlers({
    ipcMain,
    supervisor,
    credentialBroker,
    rendererUrl: 'file:///trusted/index.html',
    logger: { log } as unknown as PrivacyLogger,
  });
  return {
    handlers,
    ipcMain,
    invokeProviderOperation,
    credentialBroker,
    log,
    dispose,
  };
}

function saveCommand(action: 'preserve' | 'remove' | 'replace' = 'preserve') {
  return {
    ...base,
    command: APP_COMMANDS.providerSave,
    payload: {
      config: editable,
      credential: action === 'replace' ? { action, credential: secret } : { action },
    },
  };
}

function removeCommand() {
  return {
    ...base,
    command: APP_COMMANDS.providerRemove,
    payload: { providerId: stored.id },
  };
}

function testCommand() {
  return {
    ...base,
    command: APP_COMMANDS.providerTestConnection,
    payload: { providerId: stored.id },
  };
}

describe('M4-03 Provider IPC branch coverage', () => {
  it('covers invalid envelopes, generated request IDs, list success and default failure semantics', async () => {
    const successSubject = ipcHarness();
    const list = successSubject.handlers.get(IPC_CHANNELS.providerList)!;
    await expect(
      list(trusted, {
        ...base,
        command: APP_COMMANDS.providerList,
        payload: {},
      }),
    ).resolves.toMatchObject({ ok: true, data: { providers: [summary] } });
    await expect(
      list(trusted, {
        ...base,
        command: APP_COMMANDS.providerList,
        payload: { extra: true },
      }),
    ).resolves.toMatchObject({
      ok: false,
      requestId,
      error: { code: 'COMMON_INVALID_INPUT_001' },
    });
    await expect(list(untrusted, null)).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INVALID_INPUT_001' },
    });

    const failureSubject = ipcHarness(async (operation) => ({
      ok: false,
      operation: operation.operation,
      errorCode: 'COMMON_TIMEOUT_005',
    }));
    await expect(
      failureSubject.handlers.get(IPC_CHANNELS.providerList)!(trusted, {
        ...base,
        command: APP_COMMANDS.providerList,
        payload: {},
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_TIMEOUT_005', retryable: true },
    });
  });

  it('covers credential removal, preservation, replacement failure and rollback logging', async () => {
    const removeSubject = ipcHarness();
    await expect(
      removeSubject.handlers.get(IPC_CHANNELS.providerSave)!(trusted, saveCommand('remove')),
    ).resolves.toMatchObject({ ok: true });
    expect(removeSubject.credentialBroker.store).not.toHaveBeenCalled();
    expect(removeSubject.credentialBroker.remove).toHaveBeenCalledWith(credentialRef);

    const preserveSubject = ipcHarness();
    await preserveSubject.handlers.get(IPC_CHANNELS.providerSave)!(
      trusted,
      saveCommand('preserve'),
    );
    expect(preserveSubject.credentialBroker.remove).not.toHaveBeenCalled();

    const storeFailure = ipcHarness(defaultResponse, {
      store: async () => {
        throw new Error('secure storage unavailable');
      },
    });
    await expect(
      storeFailure.handlers.get(IPC_CHANNELS.providerSave)!(trusted, saveCommand('replace')),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'AI_CREDENTIAL_MISSING_002' },
    });

    const rollbackFailure = ipcHarness(
      async (operation) => {
        if (operation.operation === PROVIDER_CORE_OPERATIONS.get) {
          return {
            ok: true,
            operation: operation.operation,
            data: { provider: stored },
          };
        }
        return {
          ok: false,
          operation: operation.operation,
          errorCode: 'AI_ENDPOINT_UNSAFE_013',
        };
      },
      {
        remove: async () => {
          throw new Error('rollback failed');
        },
      },
    );
    await expect(
      rollbackFailure.handlers.get(IPC_CHANNELS.providerSave)!(trusted, saveCommand('replace')),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'AI_ENDPOINT_UNSAFE_013' },
    });
    expect(rollbackFailure.log).toHaveBeenCalledWith(
      'warn',
      'credential.rollback.failed',
      expect.objectContaining({ providerId: stored.id }),
    );
  });

  it('covers mismatched Core operations and existing-provider lookup failures', async () => {
    const lookupFailure = ipcHarness(async (operation) => ({
      ok: false,
      operation: operation.operation,
      errorCode: 'AI_PROVIDER_NOT_CONFIGURED_001',
    }));
    await expect(
      lookupFailure.handlers.get(IPC_CHANNELS.providerSave)!(trusted, saveCommand()),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'AI_PROVIDER_NOT_CONFIGURED_001' },
    });

    const mismatched = ipcHarness(async () => ({
      ok: true,
      operation: PROVIDER_CORE_OPERATIONS.list,
      data: { providers: [] },
    }));
    await expect(
      mismatched.handlers.get(IPC_CHANNELS.providerSave)!(trusted, saveCommand()),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INTERNAL_999' },
    });
  });

  it('covers remove failures, mismatched operations and credential cleanup warnings', async () => {
    const cleanupFailure = ipcHarness(defaultResponse, {
      remove: async () => {
        throw new Error('cleanup failed');
      },
    });
    await expect(
      cleanupFailure.handlers.get(IPC_CHANNELS.providerRemove)!(trusted, removeCommand()),
    ).resolves.toMatchObject({ ok: true, data: { removed: true } });
    expect(cleanupFailure.log).toHaveBeenCalledWith(
      'warn',
      'credential.cleanup.failed',
      expect.objectContaining({ providerId: stored.id }),
    );

    const removeFailure = ipcHarness(async (operation) => {
      if (operation.operation === PROVIDER_CORE_OPERATIONS.get) {
        return {
          ok: true,
          operation: operation.operation,
          data: { provider: stored },
        };
      }
      return {
        ok: false,
        operation: operation.operation,
        errorCode: 'AI_CONNECTION_FAILED_003',
      };
    });
    await expect(
      removeFailure.handlers.get(IPC_CHANNELS.providerRemove)!(trusted, removeCommand()),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'AI_CONNECTION_FAILED_003' },
    });

    const mismatch = ipcHarness(async (operation) => {
      if (operation.operation === PROVIDER_CORE_OPERATIONS.get) {
        return {
          ok: true,
          operation: operation.operation,
          data: { provider: stored },
        };
      }
      return {
        ok: true,
        operation: PROVIDER_CORE_OPERATIONS.list,
        data: { providers: [] },
      };
    });
    await expect(
      mismatch.handlers.get(IPC_CHANNELS.providerRemove)!(trusted, removeCommand()),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INTERNAL_999' },
    });
  });

  it('covers missing providers, credential failures, connection failures and operation mismatch', async () => {
    const missing = ipcHarness(async (operation) => {
      if (operation.operation === PROVIDER_CORE_OPERATIONS.get) {
        return {
          ok: true,
          operation: operation.operation,
          data: { provider: null },
        };
      }
      return defaultResponse(operation);
    });
    await expect(
      missing.handlers.get(IPC_CHANNELS.providerTestConnection)!(trusted, testCommand()),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'AI_PROVIDER_NOT_CONFIGURED_001' },
    });

    const resolveFailure = ipcHarness(defaultResponse, {
      resolve: async () => {
        throw new Error('credential file damaged');
      },
    });
    await expect(
      resolveFailure.handlers.get(IPC_CHANNELS.providerTestConnection)!(trusted, testCommand()),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'AI_CREDENTIAL_MISSING_002' },
    });

    const emptyCredential = ipcHarness(defaultResponse, {
      resolve: async () => null,
    });
    await expect(
      emptyCredential.handlers.get(IPC_CHANNELS.providerTestConnection)!(trusted, testCommand()),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'AI_CREDENTIAL_MISSING_002' },
    });

    const connectionFailure = ipcHarness(async (operation) => {
      if (operation.operation === PROVIDER_CORE_OPERATIONS.get) {
        return {
          ok: true,
          operation: operation.operation,
          data: { provider: stored },
        };
      }
      return {
        ok: false,
        operation: operation.operation,
        errorCode: 'AI_RATE_LIMITED_005',
      };
    });
    await expect(
      connectionFailure.handlers.get(IPC_CHANNELS.providerTestConnection)!(trusted, testCommand()),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'AI_RATE_LIMITED_005', retryable: true },
    });

    const mismatch = ipcHarness(async (operation) => {
      if (operation.operation === PROVIDER_CORE_OPERATIONS.get) {
        return {
          ok: true,
          operation: operation.operation,
          data: { provider: stored },
        };
      }
      return {
        ok: true,
        operation: PROVIDER_CORE_OPERATIONS.list,
        data: { providers: [] },
      };
    });
    await expect(
      mismatch.handlers.get(IPC_CHANNELS.providerTestConnection)!(trusted, testCommand()),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INTERNAL_999' },
    });
  });

  it('removes all Provider handlers during disposal', () => {
    const subject = ipcHarness();
    subject.dispose();
    expect(subject.ipcMain.removeHandler).toHaveBeenCalledTimes(4);
    expect(subject.ipcMain.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.providerList);
    expect(subject.ipcMain.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.providerTestConnection);
  });
});

describe('M4-03 Provider Utility router branches', () => {
  function runtime(overrides: Record<string, unknown> = {}) {
    return {
      providerConfigs: {
        list: vi.fn(() => [stored]),
        get: vi.fn(() => stored),
        upsert: vi.fn(async () => stored),
        remove: vi.fn(async () => true),
      },
      providerConnections: { test: vi.fn(async () => connection) },
      ...overrides,
    } as unknown as AppRuntime;
  }

  it('executes list, get, upsert, remove and connection test operations', async () => {
    const appRuntime = runtime();
    await expect(
      executeProviderOperation(appRuntime, requestId, {
        operation: PROVIDER_CORE_OPERATIONS.list,
      }),
    ).resolves.toMatchObject({ ok: true, data: { providers: [summary] } });
    await expect(
      executeProviderOperation(appRuntime, requestId, {
        operation: PROVIDER_CORE_OPERATIONS.get,
        providerId: stored.id,
      }),
    ).resolves.toMatchObject({ ok: true, data: { provider: stored } });
    await expect(
      executeProviderOperation(appRuntime, requestId, {
        operation: PROVIDER_CORE_OPERATIONS.upsert,
        config: stored,
      }),
    ).resolves.toMatchObject({ ok: true, data: summary });
    await expect(
      executeProviderOperation(appRuntime, requestId, {
        operation: PROVIDER_CORE_OPERATIONS.remove,
        providerId: stored.id,
      }),
    ).resolves.toMatchObject({ ok: true, data: { removed: true } });
    await expect(
      executeProviderOperation(appRuntime, requestId, {
        operation: PROVIDER_CORE_OPERATIONS.testConnection,
        config: stored,
        credential: secret,
      }),
    ).resolves.toMatchObject({ ok: true, data: connection });
  });

  it('normalizes ProviderRuntimeError and generic failures', async () => {
    expect(providerErrorCode(new ProviderRuntimeError('AI_AUTH_FAILED_004', 'denied'))).toBe(
      'AI_AUTH_FAILED_004',
    );
    expect(providerErrorCode(new Error('network'))).toBe('AI_CONNECTION_FAILED_003');

    const providerFailureRuntime = runtime({
      providerConfigs: {
        list: () => {
          throw new ProviderRuntimeError('AI_ENDPOINT_UNSAFE_013', 'unsafe');
        },
      },
    });
    await expect(
      executeProviderOperation(providerFailureRuntime, requestId, {
        operation: PROVIDER_CORE_OPERATIONS.list,
      }),
    ).resolves.toEqual({
      ok: false,
      operation: PROVIDER_CORE_OPERATIONS.list,
      errorCode: 'AI_ENDPOINT_UNSAFE_013',
    });

    const genericFailureRuntime = runtime({
      providerConfigs: {
        list: () => {
          throw new Error('offline');
        },
      },
    });
    await expect(
      executeProviderOperation(genericFailureRuntime, requestId, {
        operation: PROVIDER_CORE_OPERATIONS.list,
      }),
    ).resolves.toEqual({
      ok: false,
      operation: PROVIDER_CORE_OPERATIONS.list,
      errorCode: 'AI_CONNECTION_FAILED_003',
    });
  });
});
