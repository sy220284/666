import {
  APP_COMMANDS,
  PROVIDER_CORE_OPERATIONS,
  PROTOCOL_VERSION,
  type CoreProviderOperation,
  type CoreProviderResult,
  type ProviderConfig,
  type ProviderSummary,
  type WindowPreferences,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import type { CoreSupervisor } from '../../apps/desktop/main/src/core-supervisor.js';
import type { CredentialBroker } from '../../apps/desktop/main/src/credential-broker.js';
import { registerIpcHandlers } from '../../apps/desktop/main/src/ipc-handlers.js';
import type { PrivacyLogger } from '../../apps/desktop/main/src/privacy-logger.js';

const requestId = '550e8400-e29b-41d4-a716-446655440000';
const credentialRef = 'cred_550e8400-e29b-41d4-a716-446655440000';
const secret = 'provider-secret-must-not-leak';
const now = '2026-07-25T01:00:00.000Z';
const base = { protocolVersion: PROTOCOL_VERSION, requestId, sentAt: now } as const;
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
    warnings: ['请求仅发送到当前设备上的用户配置服务。'],
  },
  createdAt: now,
  updatedAt: now,
};
const preferences: WindowPreferences = {
  displayId: 'display',
  boundsDip: { x: 0, y: 0, width: 1280, height: 800 },
  scaleFactor: 1,
  maximized: false,
  workspaceAlignment: 'center',
  uiScalePercent: 100,
  bodyFontSize: 18,
  contentWidth: 'normal',
};

function harness() {
  const handlers = new Map<string, (event: IpcMainInvokeEvent, raw: unknown) => unknown>();
  const ipcMain = {
    handle: vi.fn(
      (channel: string, handler: (event: IpcMainInvokeEvent, raw: unknown) => unknown) =>
        handlers.set(channel, handler),
    ),
    removeHandler: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  } as unknown as IpcMain;
  const operations: CoreProviderOperation[] = [];
  const invokeProviderOperation = vi.fn(
    async (_id: string, operation: CoreProviderOperation): Promise<CoreProviderResult> => {
      operations.push(operation);
      switch (operation.operation) {
        case PROVIDER_CORE_OPERATIONS.get:
          return {
            ok: true,
            operation: operation.operation,
            data: { provider: operation.providerId === stored.id ? stored : null },
          };
        case PROVIDER_CORE_OPERATIONS.upsert:
          return { ok: true, operation: operation.operation, data: summary };
        case PROVIDER_CORE_OPERATIONS.list:
          return { ok: true, operation: operation.operation, data: { providers: [summary] } };
        case PROVIDER_CORE_OPERATIONS.remove:
          return { ok: true, operation: operation.operation, data: { removed: true } };
        case PROVIDER_CORE_OPERATIONS.testConnection:
          return {
            ok: true,
            operation: operation.operation,
            data: {
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
            },
          };
      }
    },
  );
  const supervisor = {
    getStatus: vi.fn(),
    restart: vi.fn(),
    invokeTaskCommand: vi.fn(),
    invokeAppDataOperation: vi.fn(),
    invokeProviderOperation,
    invokeProjectOperation: vi.fn(),
    attachTaskPort: vi.fn(() => ({ ok: true })),
  } as unknown as CoreSupervisor;
  const credentialBroker = {
    store: vi.fn(async () => credentialRef),
    remove: vi.fn(async () => true),
    has: vi.fn(async () => true),
    resolve: vi.fn(async () => secret),
  } as unknown as CredentialBroker;
  const log = vi.fn();
  registerIpcHandlers({
    ipcMain,
    supervisor,
    credentialBroker,
    rendererUrl: 'file:///trusted/index.html',
    version: '0.1.0',
    platform: 'test',
    logger: { log } as unknown as PrivacyLogger,
    getWindowPreferences: () => preferences,
    setAppearancePreferences: vi.fn(async () => preferences),
    chooseRecentLocation: vi.fn(async () => null),
    chooseProjectCreateParent: vi.fn(async () => null),
    chooseProjectToOpen: vi.fn(async () => null),
    chooseProjectMoveParent: vi.fn(async () => null),
  });
  return { handlers, operations, invokeProviderOperation, credentialBroker, log };
}

const trusted = {
  senderFrame: { url: 'file:///trusted/index.html' },
} as unknown as IpcMainInvokeEvent;
const untrusted = {
  senderFrame: { url: 'https://attacker.invalid' },
} as unknown as IpcMainInvokeEvent;

describe('M4-03 Provider IPC security boundary', () => {
  it('rejects untrusted senders before touching credentials or Core', async () => {
    const subject = harness();
    const handler = subject.handlers.get('worldforge:provider:save');
    const command = {
      ...base,
      command: APP_COMMANDS.providerSave,
      payload: { config: editable, credential: { action: 'replace', credential: secret } },
    };
    await expect(handler?.(untrusted, command)).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INVALID_INPUT_001' },
    });
    expect(subject.credentialBroker.store).not.toHaveBeenCalled();
    expect(subject.invokeProviderOperation).not.toHaveBeenCalled();
  });

  it('stores the secret only in CredentialBroker and returns no credential reference or secret', async () => {
    const subject = harness();
    const handler = subject.handlers.get('worldforge:provider:save');
    const command = {
      ...base,
      command: APP_COMMANDS.providerSave,
      payload: { config: editable, credential: { action: 'replace', credential: secret } },
    };
    const result = await handler?.(trusted, command);
    expect(subject.credentialBroker.store).toHaveBeenCalledWith(editable.id, secret);
    const upsert = subject.operations.find(
      (operation) => operation.operation === PROVIDER_CORE_OPERATIONS.upsert,
    );
    expect(upsert).toMatchObject({ config: { credentialRef } });
    expect(JSON.stringify(upsert)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain(credentialRef);
    expect(JSON.stringify(subject.log.mock.calls)).not.toContain(secret);
  });

  it('resolves credentials only for the internal connection request and sanitizes the Renderer result', async () => {
    const subject = harness();
    const handler = subject.handlers.get('worldforge:provider:test-connection');
    const result = await handler?.(trusted, {
      ...base,
      command: APP_COMMANDS.providerTestConnection,
      payload: { providerId: stored.id },
    });
    expect(subject.credentialBroker.resolve).toHaveBeenCalledWith(credentialRef);
    const testOperation = subject.operations.find(
      (operation) => operation.operation === PROVIDER_CORE_OPERATIONS.testConnection,
    );
    expect(testOperation).toMatchObject({ credential: secret });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain(credentialRef);
  });
});
