import {
  APP_COMMANDS,
  IPC_CHANNELS,
  PROVIDER_CORE_OPERATIONS,
  PROTOCOL_VERSION,
  type CoreProviderOperation,
  type CoreProviderResult,
  type ProviderConfig,
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
const now = '2026-07-25T10:00:00.000Z';
const editable = {
  id: 'transaction-provider',
  name: '事务Provider',
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
const trusted = {
  senderFrame: { url: 'file:///trusted/index.html' },
} as unknown as IpcMainInvokeEvent;

function harness(
  responder: (operation: CoreProviderOperation) => Promise<CoreProviderResult>,
  brokerOverrides: Partial<CredentialBroker> = {},
) {
  const handlers = new Map<string, (event: IpcMainInvokeEvent, raw: unknown) => unknown>();
  const ipcMain = {
    handle: vi.fn(
      (channel: string, handler: (event: IpcMainInvokeEvent, raw: unknown) => unknown) =>
        handlers.set(channel, handler),
    ),
    removeHandler: vi.fn(),
  } as unknown as IpcMain;
  const operations: CoreProviderOperation[] = [];
  const invokeProviderOperation = vi.fn(async (_id: string, operation: CoreProviderOperation) => {
    operations.push(operation);
    return responder(operation);
  });
  const supervisor = { invokeProviderOperation } as unknown as CoreSupervisor;
  const credentialBroker = {
    store: vi.fn(async () => credentialRef),
    has: vi.fn(async () => true),
    remove: vi.fn(async () => true),
    resolve: vi.fn(async () => 'old-secret'),
    hasForProvider: vi.fn(async () => true),
    removeForProvider: vi.fn(async () => true),
    resolveForProvider: vi.fn(async () => 'old-secret'),
    replaceForProvider: vi.fn(async () => undefined),
    ...brokerOverrides,
  } as unknown as CredentialBroker;
  const log = vi.fn(async () => undefined);
  registerProviderIpcHandlers({
    ipcMain,
    supervisor,
    credentialBroker,
    rendererUrl: 'file:///trusted/index.html',
    logger: { log } as unknown as PrivacyLogger,
  });
  return { handlers, operations, credentialBroker, log };
}

function getResponse(operation: CoreProviderOperation): CoreProviderResult {
  if (operation.operation !== PROVIDER_CORE_OPERATIONS.get) {
    throw new Error('EXPECTED_GET_OPERATION');
  }
  return {
    ok: true,
    operation: operation.operation,
    data: { provider: stored },
  };
}

describe('M4 Provider cross-store transaction hardening', () => {
  it('reuses the existing reference and restores the old secret when Core save fails', async () => {
    const subject = harness(async (operation) => {
      if (operation.operation === PROVIDER_CORE_OPERATIONS.get) return getResponse(operation);
      return {
        ok: false,
        operation: operation.operation,
        errorCode: 'AI_ENDPOINT_UNSAFE_013',
      };
    });
    const result = await subject.handlers.get(IPC_CHANNELS.providerSave)!(trusted, {
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      sentAt: now,
      command: APP_COMMANDS.providerSave,
      payload: {
        config: editable,
        credential: { action: 'replace', credential: 'new-secret' },
      },
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'AI_ENDPOINT_UNSAFE_013' },
    });
    expect(subject.credentialBroker.store).not.toHaveBeenCalled();
    expect(subject.credentialBroker.replaceForProvider).toHaveBeenNthCalledWith(
      1,
      stored.id,
      credentialRef,
      'new-secret',
    );
    expect(subject.credentialBroker.replaceForProvider).toHaveBeenNthCalledWith(
      2,
      stored.id,
      credentialRef,
      'old-secret',
    );
  });

  it('restores the Provider config and returns failure when credential cleanup fails', async () => {
    const subject = harness(
      async (operation) => {
        if (operation.operation === PROVIDER_CORE_OPERATIONS.get) return getResponse(operation);
        if (operation.operation === PROVIDER_CORE_OPERATIONS.remove) {
          return {
            ok: true,
            operation: operation.operation,
            data: { removed: true },
          };
        }
        if (operation.operation === PROVIDER_CORE_OPERATIONS.upsert) {
          return { ok: true, operation: operation.operation, data: summary };
        }
        throw new Error('UNEXPECTED_OPERATION');
      },
      {
        removeForProvider: vi.fn(async () => {
          throw new Error('credential-file-write-failed');
        }),
      },
    );
    const result = await subject.handlers.get(IPC_CHANNELS.providerRemove)!(trusted, {
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      sentAt: now,
      command: APP_COMMANDS.providerRemove,
      payload: { providerId: stored.id },
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'AI_CREDENTIAL_MISSING_002' },
    });
    expect(subject.operations.map((operation) => operation.operation)).toEqual([
      PROVIDER_CORE_OPERATIONS.get,
      PROVIDER_CORE_OPERATIONS.remove,
      PROVIDER_CORE_OPERATIONS.upsert,
    ]);
    expect(subject.operations[2]).toMatchObject({
      config: { id: stored.id, credentialRef },
    });
    expect(subject.log).toHaveBeenCalledWith(
      'error',
      'credential.cleanup.failed',
      expect.objectContaining({ providerId: stored.id }),
    );
  });
});
