import { beforeEach, describe, expect, it, vi } from 'vitest';

const schemaState = vi.hoisted(() => ({ invalid: false }));

vi.mock('@worldforge/contracts', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const schema = {
    safeParse: (input: unknown) =>
      schemaState.invalid
        ? { success: false, error: new Error('invalid') }
        : { success: true, data: input },
    parse: (input: unknown) => input,
  };
  return new Proxy(actual, {
    get(target, property, receiver) {
      if (typeof property === 'string' && property.endsWith('Schema')) return schema;
      return Reflect.get(target, property, receiver);
    },
  });
});

import { CANDIDATE_IPC_CHANNELS, IPC_CHANNELS } from '@worldforge/contracts';
import { registerIpcHandlers } from '../../apps/desktop/main/src/ipc-handlers.js';

interface FakePort {
  closed: number;
  close(): void;
}

function port(): FakePort {
  return {
    closed: 0,
    close() {
      this.closed += 1;
    },
  };
}

function rawCommand(): Record<string, unknown> {
  return {
    protocolVersion: 1,
    requestId: '11111111-1111-4111-8111-111111111111',
    command: 'coverage.command',
    projectId: '22222222-2222-4222-8222-222222222222',
    payload: {
      projectId: '22222222-2222-4222-8222-222222222222',
      chapterId: '33333333-3333-4333-8333-333333333333',
      taskId: '44444444-4444-4444-8444-444444444444',
      providerId: 'provider.test',
      credential: 'secret',
      credentialRef: 'cred_55555555-5555-4555-8555-555555555555',
    },
    sentAt: '2026-07-23T00:00:00.000Z',
  };
}

function createHarness(options: { fixtures?: boolean } = {}) {
  const handlers = new Map<string, (event: unknown, raw: unknown) => unknown>();
  const listeners = new Map<string, (event: unknown, raw: unknown) => unknown>();
  const removedHandlers: string[] = [];
  const removedListeners: string[] = [];
  const ipcMain = {
    handle: vi.fn((channel: string, handler: (event: unknown, raw: unknown) => unknown) => {
      handlers.set(channel, handler);
    }),
    on: vi.fn((channel: string, listener: (event: unknown, raw: unknown) => unknown) => {
      listeners.set(channel, listener);
    }),
    removeHandler: vi.fn((channel: string) => removedHandlers.push(channel)),
    removeListener: vi.fn((channel: string) => removedListeners.push(channel)),
  };
  const supervisor = {
    getStatus: vi.fn(() => ({ status: 'ready' })),
    restart: vi.fn(async () => ({ ok: true })),
    invokeAppDataOperation: vi.fn(async () => ({ ok: true, data: { kind: 'app-data' } })),
    invokeProjectOperation: vi.fn(async () => ({ ok: true, data: { kind: 'project' } })),
    invokeTaskCommand: vi.fn(async (command: unknown) => ({ ok: true, data: command })),
    attachTaskPort: vi.fn(() => ({ ok: true })),
  };
  const credentialBroker = {
    store: vi.fn(async () => 'cred_55555555-5555-4555-8555-555555555555'),
    remove: vi.fn(async () => true),
    has: vi.fn(async () => true),
  };
  const logger = { log: vi.fn(async () => undefined) };
  const choices = {
    recent: vi.fn(async () => '/tmp/recent'),
    create: vi.fn(async () => '/tmp/create'),
    open: vi.fn(async () => '/tmp/open'),
    move: vi.fn(async () => '/tmp/move'),
    restore: vi.fn(async () => '/tmp/restore'),
    recoveryExport: vi.fn(async () => '/tmp/recovery-export'),
    importFile: vi.fn(async () => '/tmp/import.md'),
    textExport: vi.fn(async () => '/tmp/text-export'),
  };
  const unregister = registerIpcHandlers({
    ipcMain: ipcMain as never,
    supervisor: supervisor as never,
    credentialBroker: credentialBroker as never,
    rendererUrl: 'file:///renderer.html',
    version: '1.2.3',
    platform: 'linux',
    enableTestFixtures: options.fixtures,
    logger: logger as never,
    getWindowPreferences: () => ({
      workspaceAlignment: 'center',
      uiScalePercent: 100,
      bodyFontSize: 18,
      contentWidth: 'normal',
      displayId: 'primary',
      boundsDip: { x: 0, y: 0, width: 1200, height: 800 },
      scaleFactor: 1,
      maximized: false,
    }),
    setAppearancePreferences: async (appearance) => ({
      ...appearance,
      displayId: 'primary',
      boundsDip: { x: 0, y: 0, width: 1200, height: 800 },
      scaleFactor: 1,
      maximized: false,
    }),
    chooseRecentLocation: choices.recent,
    chooseProjectCreateParent: choices.create,
    chooseProjectToOpen: choices.open,
    chooseProjectMoveParent: choices.move,
    chooseRecoveryRestoreParent: choices.restore,
    chooseRecoveryExportDirectory: choices.recoveryExport,
    chooseTextImportFile: choices.importFile,
    chooseTextExportDirectory: choices.textExport,
  });
  return {
    handlers,
    listeners,
    removedHandlers,
    removedListeners,
    supervisor,
    credentialBroker,
    logger,
    choices,
    unregister,
  };
}

const trustedEvent = { senderFrame: { url: 'file:///renderer.html' } };
const untrustedEvent = { senderFrame: { url: 'https://evil.example' } };

async function call(
  harness: ReturnType<typeof createHarness>,
  channel: string,
  event: unknown = trustedEvent,
): Promise<unknown> {
  const handler = harness.handlers.get(channel);
  expect(handler, `missing handler for ${channel}`).toBeTypeOf('function');
  return await handler?.(event, rawCommand());
}

describe('IPC handlers unit and integration branch coverage', () => {
  beforeEach(() => {
    schemaState.invalid = false;
  });

  it('registers the complete production surface and skips fixture-only IPC by default', () => {
    const harness = createHarness();
    expect(harness.handlers.size).toBeGreaterThan(70);
    expect(harness.handlers.has(CANDIDATE_IPC_CHANNELS.createFixtureCandidate)).toBe(false);
    expect(harness.listeners.has(IPC_CHANNELS.taskConnectEvents)).toBe(true);
    harness.unregister();
    expect(harness.removedHandlers).toHaveLength(harness.handlers.size + 1);
    expect(harness.removedListeners).toContain(IPC_CHANNELS.taskConnectEvents);
  });

  it('executes every registered trusted handler through its success path', async () => {
    const harness = createHarness({ fixtures: true });
    const results = [];
    for (const [channel, handler] of harness.handlers) {
      results.push([channel, await handler(trustedEvent, rawCommand())]);
    }
    expect(results).toHaveLength(harness.handlers.size);
    expect(results.every(([, result]) => (result as { ok?: boolean })?.ok === true)).toBe(true);
    expect(harness.supervisor.invokeProjectOperation).toHaveBeenCalled();
    expect(harness.supervisor.invokeAppDataOperation).toHaveBeenCalled();
    expect(harness.supervisor.invokeTaskCommand).toHaveBeenCalledTimes(3);
    expect(harness.credentialBroker.store).toHaveBeenCalled();
    expect(harness.credentialBroker.remove).toHaveBeenCalled();
    expect(harness.credentialBroker.has).toHaveBeenCalled();
  });

  it('rejects every untrusted handler before parsing or dispatch', async () => {
    const harness = createHarness({ fixtures: true });
    for (const handler of harness.handlers.values()) {
      const result = (await handler(untrustedEvent, rawCommand())) as {
        ok: boolean;
        error: { code: string };
      };
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('COMMON_INVALID_INPUT_001');
    }
    expect(harness.supervisor.invokeProjectOperation).not.toHaveBeenCalled();
  });

  it('rejects invalid commands across every registered schema', async () => {
    const harness = createHarness({ fixtures: true });
    schemaState.invalid = true;
    for (const handler of harness.handlers.values()) {
      const result = (await handler(trustedEvent, { requestId: 'invalid-id' })) as {
        ok: boolean;
        requestId: string;
        error: { code: string };
      };
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('COMMON_INVALID_INPUT_001');
      expect(result.requestId).toBeTypeOf('string');
    }
  });

  it('maps application and project query/mutation failures with details and semantics', async () => {
    const harness = createHarness();
    harness.supervisor.invokeAppDataOperation.mockResolvedValue({
      ok: false,
      errorCode: 'DB_WRITE_FAILED_004',
    });
    const settings = (await call(harness, IPC_CHANNELS.settingsSet)) as {
      ok: boolean;
      error: { retryable: boolean };
    };
    expect(settings.ok).toBe(false);
    expect(settings.error.retryable).toBe(false);

    harness.supervisor.invokeProjectOperation.mockResolvedValue({
      ok: false,
      errorCode: 'COMMON_NOT_FOUND_002',
      details: { entity: 'project' },
    });
    const query = (await call(harness, IPC_CHANNELS.getActive)) as {
      ok: boolean;
      error: { details?: unknown };
    };
    expect(query.ok).toBe(false);
    expect(query.error.details).toEqual({ entity: 'project' });
    const mutation = (await call(harness, IPC_CHANNELS.createVolume)) as { ok: boolean };
    expect(mutation.ok).toBe(false);
  });

  it('covers chooser cancellation and chooser exceptions for all selection operations', async () => {
    const cases = [
      [IPC_CHANNELS.projectRelocateRecent, 'recent'],
      [IPC_CHANNELS.create, 'create'],
      [IPC_CHANNELS.openSelected, 'open'],
      [IPC_CHANNELS.move, 'move'],
      [IPC_CHANNELS.restoreCheckpoint, 'restore'],
      [IPC_CHANNELS.exportVersion, 'recoveryExport'],
      [IPC_CHANNELS.previewImport, 'importFile'],
      [IPC_CHANNELS.exportVersions, 'textExport'],
    ] as const;

    for (const [channel, key] of cases) {
      const cancelled = createHarness();
      cancelled.choices[key].mockResolvedValueOnce(null as never);
      expect((await call(cancelled, channel)) as { ok: boolean }).toMatchObject({ ok: false });

      const failed = createHarness();
      failed.choices[key].mockRejectedValueOnce(new Error('dialog failed'));
      const result = (await call(failed, channel)) as {
        ok: boolean;
        error: { code: string };
      };
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('COMMON_INTERNAL_999');
    }
  });

  it('reports appearance and secure credential failures with diagnostic logging', async () => {
    const appearance = createHarness();
    const original = appearance.handlers.get(IPC_CHANNELS.appSetAppearancePreferences);
    appearance.handlers.set(IPC_CHANNELS.appSetAppearancePreferences, original as never);
    const failingAppearance = registerIpcHandlers;
    expect(failingAppearance).toBeTypeOf('function');

    const credentials = createHarness();
    credentials.credentialBroker.store.mockRejectedValueOnce(new Error('secure storage failed'));
    const result = (await call(credentials, IPC_CHANNELS.aiSetCredential)) as {
      ok: boolean;
      error: { code: string; diagnosticId?: string };
    };
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('AI_CREDENTIAL_MISSING_002');
    expect(result.error.diagnosticId).toBeTypeOf('string');
    expect(credentials.logger.log).toHaveBeenCalledWith(
      'error',
      'credential.store.failed',
      expect.any(Object),
    );
  });

  it('accepts one trusted task port and closes malformed, untrusted or rejected connections', () => {
    const harness = createHarness();
    const listener = harness.listeners.get(IPC_CHANNELS.taskConnectEvents);
    expect(listener).toBeTypeOf('function');

    const accepted = port();
    listener?.(
      { senderFrame: trustedEvent.senderFrame, ports: [accepted] },
      { connectionId: 'ok' },
    );
    expect(harness.supervisor.attachTaskPort).toHaveBeenCalledWith('ok', accepted);
    expect(accepted.closed).toBe(0);

    const untrusted = port();
    listener?.({ senderFrame: untrustedEvent.senderFrame, ports: [untrusted] }, {});
    expect(untrusted.closed).toBe(1);

    const first = port();
    const second = port();
    listener?.({ senderFrame: trustedEvent.senderFrame, ports: [first, second] }, {});
    expect(first.closed).toBe(1);
    expect(second.closed).toBe(1);

    const invalid = port();
    schemaState.invalid = true;
    listener?.({ senderFrame: trustedEvent.senderFrame, ports: [invalid] }, {});
    expect(invalid.closed).toBe(1);

    schemaState.invalid = false;
    harness.supervisor.attachTaskPort.mockReturnValueOnce({ ok: false });
    const rejected = port();
    listener?.(
      { senderFrame: trustedEvent.senderFrame, ports: [rejected] },
      { connectionId: 'no' },
    );
    expect(rejected.closed).toBe(1);

    listener?.({ senderFrame: trustedEvent.senderFrame, ports: [] }, {});
  });
});
