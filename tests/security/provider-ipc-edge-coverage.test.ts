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

const requestId = '550e8400-e29b-41d4-a716-446655440000';
const credentialRef = 'cred_550e8400-e29b-41d4-a716-446655440000';
const now = '2026-08-17T00:00:00.000Z';
const secret = 'provider-secret';
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
    warnings: [],
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
  latencyMs: 10,
  checkedAt: now,
  warnings: [],
};
const trusted = {
  senderFrame: { url: 'file:///trusted/index.html' },
} as unknown as IpcMainInvokeEvent;
const untrusted = { senderFrame: { url: 'https://evil.invalid' } } as unknown as IpcMainInvokeEvent;

type Handler = (event: IpcMainInvokeEvent, raw: unknown) => Promise<unknown> | unknown;
type Responder = (operation: CoreProviderOperation) => Promise<CoreProviderResult>;

async function defaultResponse(operation: CoreProviderOperation): Promise<CoreProviderResult> {
  switch (operation.operation) {
    case PROVIDER_CORE_OPERATIONS.list:
      return { ok: true, operation: operation.operation, data: { providers: [summary] } };
    case PROVIDER_CORE_OPERATIONS.get:
      return { ok: true, operation: operation.operation, data: { provider: stored } };
    case PROVIDER_CORE_OPERATIONS.upsert:
      return { ok: true, operation: operation.operation, data: summary };
    case PROVIDER_CORE_OPERATIONS.remove:
      return { ok: true, operation: operation.operation, data: { removed: true } };
    case PROVIDER_CORE_OPERATIONS.testConnection:
      return { ok: true, operation: operation.operation, data: connection };
  }
}

function saveCommand(action: 'preserve' | 'remove' | 'replace' = 'preserve') {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    sentAt: now,
    command: APP_COMMANDS.providerSave,
    payload: {
      config: editable,
      credential: action === 'replace' ? { action, credential: secret } : { action },
    },
  };
}
function removeCommand() {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    sentAt: now,
    command: APP_COMMANDS.providerRemove,
    payload: { providerId: stored.id },
  };
}
function testCommand() {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    sentAt: now,
    command: APP_COMMANDS.providerTestConnection,
    payload: { providerId: stored.id },
  };
}

function harness(responder: Responder = defaultResponse, broker: Partial<CredentialBroker> = {}) {
  const handlers = new Map<string, Handler>();
  const invokeProviderOperation = vi.fn(async (_id: string, operation: CoreProviderOperation) =>
    responder(operation),
  );
  const log = vi.fn(async () => undefined);
  const credentialBroker = {
    store: vi.fn(async () => credentialRef),
    remove: vi.fn(async () => true),
    resolve: vi.fn(async () => secret),
    ...broker,
  } as unknown as CredentialBroker;
  const dispose = registerProviderIpcHandlers({
    ipcMain: {
      handle: vi.fn((channel: string, handler: Handler) => handlers.set(channel, handler)),
      removeHandler: vi.fn(),
    } as unknown as IpcMain,
    supervisor: { invokeProviderOperation } as unknown as CoreSupervisor,
    credentialBroker,
    rendererUrl: 'file:///trusted/index.html',
    logger: { log } as unknown as PrivacyLogger,
  });
  return { handlers, invokeProviderOperation, credentialBroker, log, dispose };
}

async function call(
  subject: ReturnType<typeof harness>,
  channel: string,
  raw: unknown,
  event = trusted,
) {
  const handler = subject.handlers.get(channel);
  expect(handler).toBeTypeOf('function');
  return await handler?.(event, raw);
}

describe('Provider IPC defensive edge coverage', () => {
  it('covers save/remove/test untrusted and invalid envelopes plus fallback credential lookup', async () => {
    const subject = harness();
    for (const [channel, command] of [
      [IPC_CHANNELS.providerSave, saveCommand()],
      [IPC_CHANNELS.providerRemove, removeCommand()],
      [IPC_CHANNELS.providerTestConnection, testCommand()],
    ] as const) {
      await expect(call(subject, channel, command, untrusted)).resolves.toMatchObject({
        ok: false,
        error: { code: 'COMMON_INVALID_INPUT_001' },
      });
      await expect(call(subject, channel, { requestId })).resolves.toMatchObject({
        ok: false,
        error: { code: 'COMMON_INVALID_INPUT_001' },
      });
    }

    const noHas = harness(defaultResponse, {
      has: undefined,
    });
    await expect(
      call(noHas, IPC_CHANNELS.providerSave, saveCommand('preserve')),
    ).resolves.toMatchObject({
      ok: true,
    });
  });

  it('covers preserve credential missing/throw and atomic replacement edge failures', async () => {
    const missing = harness(defaultResponse, { has: vi.fn(async () => false) });
    await expect(
      call(missing, IPC_CHANNELS.providerSave, saveCommand('preserve')),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'AI_CREDENTIAL_MISSING_002' },
    });

    const throwing = harness(defaultResponse, {
      has: vi.fn(async () => {
        throw new Error('store corrupt');
      }),
    });
    await expect(
      call(throwing, IPC_CHANNELS.providerSave, saveCommand('preserve')),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'AI_CREDENTIAL_MISSING_002' },
    });

    const atomicMissing = harness(defaultResponse, {
      hasForProvider: vi.fn(async () => true),
      removeForProvider: vi.fn(async () => true),
      resolveForProvider: vi.fn(async () => null),
      replaceForProvider: vi.fn(async () => undefined),
    });
    await expect(
      call(atomicMissing, IPC_CHANNELS.providerSave, saveCommand('replace')),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'AI_CREDENTIAL_MISSING_002' },
    });
  });

  it('covers atomic replacement rollback failure and credential cleanup recovery outcomes', async () => {
    let replaceCalls = 0;
    const rollbackFailure = harness(
      async (operation) => {
        if (operation.operation === PROVIDER_CORE_OPERATIONS.get) {
          return { ok: true, operation: operation.operation, data: { provider: stored } };
        }
        if (operation.operation === PROVIDER_CORE_OPERATIONS.upsert) {
          return { ok: false, operation: operation.operation, errorCode: 'AI_ENDPOINT_UNSAFE_013' };
        }
        return defaultResponse(operation);
      },
      {
        hasForProvider: vi.fn(async () => true),
        removeForProvider: vi.fn(async () => true),
        resolveForProvider: vi.fn(async () => secret),
        replaceForProvider: vi.fn(async () => {
          replaceCalls += 1;
          if (replaceCalls > 1) throw new Error('rollback replacement failed');
        }),
      },
    );
    await expect(
      call(rollbackFailure, IPC_CHANNELS.providerSave, saveCommand('replace')),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'AI_ENDPOINT_UNSAFE_013' },
    });
    expect(rollbackFailure.log).toHaveBeenCalledWith(
      'error',
      'credential.rollback.failed',
      expect.objectContaining({ providerId: stored.id }),
    );

    const legacyCleanup = harness(defaultResponse, { remove: vi.fn(async () => false) });
    await expect(
      call(legacyCleanup, IPC_CHANNELS.providerSave, saveCommand('remove')),
    ).resolves.toMatchObject({ ok: true });
    expect(legacyCleanup.log).toHaveBeenCalledWith(
      'warn',
      'credential.cleanup.failed',
      expect.objectContaining({ providerId: stored.id }),
    );

    let upserts = 0;
    const restoreFailure = harness(
      async (operation) => {
        if (operation.operation === PROVIDER_CORE_OPERATIONS.get) {
          return { ok: true, operation: operation.operation, data: { provider: stored } };
        }
        if (operation.operation === PROVIDER_CORE_OPERATIONS.upsert) {
          upserts += 1;
          return upserts === 1
            ? { ok: true, operation: operation.operation, data: summary }
            : { ok: false, operation: operation.operation, errorCode: 'DB_WRITE_FAILED_004' };
        }
        return defaultResponse(operation);
      },
      {
        hasForProvider: vi.fn(async () => true),
        removeForProvider: vi.fn(async () => false),
        resolveForProvider: vi.fn(async () => secret),
      },
    );
    await expect(
      call(restoreFailure, IPC_CHANNELS.providerSave, saveCommand('remove')),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INTERNAL_999' },
    });
    expect(restoreFailure.log).toHaveBeenCalledWith(
      'error',
      'provider.config.rollback.failed',
      expect.objectContaining({ providerId: stored.id }),
    );
  });

  it('covers Provider remove lookup, ownership and cleanup edge branches', async () => {
    const lookupFailure = harness(async (operation) => ({
      ok: false,
      operation: operation.operation,
      errorCode: 'AI_PROVIDER_NOT_CONFIGURED_001',
    }));
    await expect(
      call(lookupFailure, IPC_CHANNELS.providerRemove, removeCommand()),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'AI_PROVIDER_NOT_CONFIGURED_001' },
    });

    const mismatch = harness(async () => ({
      ok: true,
      operation: PROVIDER_CORE_OPERATIONS.list,
      data: { providers: [] },
    }));
    await expect(
      call(mismatch, IPC_CHANNELS.providerRemove, removeCommand()),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INTERNAL_999' },
    });

    for (const hasForProvider of [
      vi.fn(async () => false),
      vi.fn(async () => {
        throw new Error('owner lookup failed');
      }),
    ]) {
      const subject = harness(defaultResponse, {
        hasForProvider,
        removeForProvider: vi.fn(async () => true),
        resolveForProvider: vi.fn(async () => secret),
      });
      await expect(
        call(subject, IPC_CHANNELS.providerRemove, removeCommand()),
      ).resolves.toMatchObject({
        ok: false,
        error: { code: 'AI_CREDENTIAL_MISSING_002' },
      });
    }

    const legacyCleanup = harness(defaultResponse, { remove: vi.fn(async () => false) });
    await expect(
      call(legacyCleanup, IPC_CHANNELS.providerRemove, removeCommand()),
    ).resolves.toMatchObject({
      ok: true,
      data: { removed: true },
    });

    const noCredential = harness(async (operation) => {
      if (operation.operation === PROVIDER_CORE_OPERATIONS.get) {
        return {
          ok: true,
          operation: operation.operation,
          data: { provider: { ...stored, credentialRef: null } },
        };
      }
      return defaultResponse(operation);
    });
    await expect(
      call(noCredential, IPC_CHANNELS.providerRemove, removeCommand()),
    ).resolves.toMatchObject({ ok: true });
  });

  it('covers connection-test lookup failures and Core operation mismatch guards', async () => {
    const lookupFailure = harness(async (operation) => ({
      ok: false,
      operation: operation.operation,
      errorCode: 'AI_PROVIDER_NOT_CONFIGURED_001',
    }));
    await expect(
      call(lookupFailure, IPC_CHANNELS.providerTestConnection, testCommand()),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'AI_PROVIDER_NOT_CONFIGURED_001' },
    });

    const mismatch = harness(async () => ({
      ok: true,
      operation: PROVIDER_CORE_OPERATIONS.list,
      data: { providers: [] },
    }));
    await expect(
      call(mismatch, IPC_CHANNELS.providerTestConnection, testCommand()),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INTERNAL_999' },
    });
  });

  it('covers remaining provider helper and cleanup branches', async () => {
    const subject = harness();
    await expect(
      call(subject, IPC_CHANNELS.providerSave, { requestId: 'not-a-uuid' }, untrusted),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INVALID_INPUT_001' },
    });

    const newProvider = harness(async (operation) => {
      if (operation.operation === PROVIDER_CORE_OPERATIONS.get) {
        return { ok: true, operation: operation.operation, data: { provider: null } };
      }
      return defaultResponse(operation);
    });
    await expect(
      call(newProvider, IPC_CHANNELS.providerSave, saveCommand('replace')),
    ).resolves.toMatchObject({ ok: true });
    expect(newProvider.credentialBroker.store).toHaveBeenCalledWith(stored.id, secret);

    const saveMismatch = harness(async (operation) => {
      if (operation.operation === PROVIDER_CORE_OPERATIONS.get) {
        return { ok: true, operation: operation.operation, data: { provider: stored } };
      }
      if (operation.operation === PROVIDER_CORE_OPERATIONS.upsert) {
        return {
          ok: true,
          operation: PROVIDER_CORE_OPERATIONS.list,
          data: { providers: [summary] },
        } as unknown as CoreProviderResult;
      }
      return defaultResponse(operation);
    });
    await expect(
      call(saveMismatch, IPC_CHANNELS.providerSave, saveCommand('preserve')),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INTERNAL_999' },
    });

    const saveRestoreSuccess = harness(defaultResponse, {
      hasForProvider: vi.fn(async () => true),
      removeForProvider: vi.fn(async () => false),
      resolveForProvider: vi.fn(async () => secret),
    });
    await expect(
      call(saveRestoreSuccess, IPC_CHANNELS.providerSave, saveCommand('remove')),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'AI_CREDENTIAL_MISSING_002' },
    });

    let restoreMismatchUpserts = 0;
    const saveRestoreMismatch = harness(
      async (operation) => {
        if (operation.operation === PROVIDER_CORE_OPERATIONS.get) {
          return { ok: true, operation: operation.operation, data: { provider: stored } };
        }
        if (operation.operation === PROVIDER_CORE_OPERATIONS.upsert) {
          restoreMismatchUpserts += 1;
          if (restoreMismatchUpserts === 1) {
            return { ok: true, operation: operation.operation, data: summary };
          }
          return {
            ok: true,
            operation: PROVIDER_CORE_OPERATIONS.list,
            data: { providers: [summary] },
          } as unknown as CoreProviderResult;
        }
        return defaultResponse(operation);
      },
      {
        hasForProvider: vi.fn(async () => true),
        removeForProvider: vi.fn(async () => false),
        resolveForProvider: vi.fn(async () => secret),
      },
    );
    await expect(
      call(saveRestoreMismatch, IPC_CHANNELS.providerSave, saveCommand('remove')),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INTERNAL_999' },
    });
    expect(saveRestoreMismatch.log).toHaveBeenCalledWith(
      'error',
      'provider.config.rollback.failed',
      expect.objectContaining({ providerId: stored.id, errorCode: 'COMMON_INTERNAL_999' }),
    );

    const removeOwnedSuccess = harness(defaultResponse, {
      hasForProvider: vi.fn(async () => true),
      removeForProvider: vi.fn(async () => true),
      resolveForProvider: vi.fn(async () => secret),
    });
    await expect(
      call(removeOwnedSuccess, IPC_CHANNELS.providerRemove, removeCommand()),
    ).resolves.toMatchObject({ ok: true, data: { removed: true } });

    const removeOwnedRestore = harness(defaultResponse, {
      hasForProvider: vi.fn(async () => true),
      removeForProvider: vi.fn(async () => false),
      resolveForProvider: vi.fn(async () => secret),
    });
    await expect(
      call(removeOwnedRestore, IPC_CHANNELS.providerRemove, removeCommand()),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'AI_CREDENTIAL_MISSING_002' },
    });

    const removeOwnedRestoreFailure = harness(
      async (operation) => {
        if (operation.operation === PROVIDER_CORE_OPERATIONS.upsert) {
          return { ok: false, operation: operation.operation, errorCode: 'DB_WRITE_FAILED_004' };
        }
        return defaultResponse(operation);
      },
      {
        hasForProvider: vi.fn(async () => true),
        removeForProvider: vi.fn(async () => false),
        resolveForProvider: vi.fn(async () => secret),
      },
    );
    await expect(
      call(removeOwnedRestoreFailure, IPC_CHANNELS.providerRemove, removeCommand()),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INTERNAL_999' },
    });

    const withoutCredential = harness(async (operation) => {
      if (operation.operation === PROVIDER_CORE_OPERATIONS.get) {
        return {
          ok: true,
          operation: operation.operation,
          data: { provider: { ...stored, credentialRef: null } },
        };
      }
      return defaultResponse(operation);
    });
    await expect(
      call(withoutCredential, IPC_CHANNELS.providerTestConnection, testCommand()),
    ).resolves.toMatchObject({ ok: true });
    expect(withoutCredential.invokeProviderOperation).toHaveBeenLastCalledWith(
      requestId,
      expect.objectContaining({
        operation: PROVIDER_CORE_OPERATIONS.testConnection,
        credential: null,
      }),
    );
  });
});
