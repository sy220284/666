import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  APP_COMMANDS,
  IPC_CHANNELS,
  PROTOCOL_VERSION,
  RegisteredCommandSchema,
  type WorldforgeBridge,
} from '@worldforge/contracts';

const state = vi.hoisted(() => ({
  exposed: undefined as unknown,
  channels: [] as FakeMessageChannel[],
  calls: [] as Array<{ channel: string; command: unknown }>,
  ipcInvoke: vi.fn(),
  ipcPostMessage: vi.fn(),
}));

class FakePort {
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  readonly messages: unknown[] = [];
  started = false;
  closed = false;

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  start(): void {
    this.started = true;
  }

  close(): void {
    this.closed = true;
  }
}

class FakeMessageChannel {
  readonly port1 = new FakePort();
  readonly port2 = new FakePort();

  constructor() {
    state.channels.push(this);
  }
}

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, value: unknown) => {
      state.exposed = value;
    },
  },
  ipcRenderer: {
    invoke: state.ipcInvoke,
    postMessage: state.ipcPostMessage,
  },
}));

const projectId = '22222222-2222-4222-8222-222222222222';
const taskId = '33333333-3333-4333-8333-333333333333';
const credentialRef = 'cred_55555555-5555-4555-8555-555555555555';
const originalMessageChannel = globalThis.MessageChannel;

function failure(requestId: string) {
  return {
    ok: false,
    requestId,
    error: {
      code: 'COMMON_INTERNAL_999',
      message: 'expected unit-test failure',
      retryable: false,
    },
  };
}

function taskEvent(sequence: number, eventId: string) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    eventId,
    taskId,
    projectId,
    sequence,
    emittedAt: '2026-07-23T00:00:00.000Z',
    type: 'task.progress',
    payload: { stage: 'running', current: sequence, total: 10 },
  };
}

async function flushMicrotasks(): Promise<void> {
  await vi.waitFor(() => {
    expect(true).toBe(true);
  });
}

describe('Preload bridge unit and regression coverage', () => {
  beforeEach(async () => {
    state.exposed = undefined;
    state.channels.length = 0;
    state.calls.length = 0;
    state.ipcInvoke.mockReset();
    state.ipcPostMessage.mockReset();
    state.ipcInvoke.mockImplementation(async (channel: string, command: unknown) => {
      state.calls.push({ channel, command });
      const parsed = RegisteredCommandSchema.parse(command);
      if (channel === IPC_CHANNELS.taskGetSnapshot) {
        return {
          ok: true,
          requestId: parsed.requestId,
          data: {
            taskId,
            taskType: 'chapter.generate',
            projectId,
            status: 'running',
            stage: 'running',
            lastSequence: 3,
            startedAt: '2026-07-23T00:00:00.000Z',
            elapsedMs: 100,
          },
        };
      }
      return failure(parsed.requestId);
    });
    Object.defineProperty(globalThis, 'MessageChannel', {
      configurable: true,
      value: FakeMessageChannel,
    });
    vi.resetModules();
    await import('../../apps/desktop/preload/src/index.js');
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'MessageChannel', {
      configurable: true,
      value: originalMessageChannel,
    });
    vi.restoreAllMocks();
  });

  it('uses real command schemas and exact channels for representative bridge capabilities', async () => {
    const bridge = state.exposed as WorldforgeBridge;

    await bridge.app.getInfo();
    await bridge.app.setAppearancePreferences({
      workspaceAlignment: 'left',
      uiScalePercent: 110,
      bodyFontSize: 20,
      contentWidth: 'wide',
    });
    await bridge.settings.set({ themeId: 'theme-b', themeVariant: 'dark' });
    await bridge.project.openRecent(projectId);
    await bridge.planning.getBrief(projectId);
    await bridge.recovery.getOverview(projectId);
    await bridge.textIo.listExportVersions(projectId);
    await bridge.ai.hasCredential(credentialRef);
    await bridge.task.listActive(projectId);

    expect(
      state.calls.map(({ channel, command }) => ({
        channel,
        command: (command as { command: string }).command,
      })),
    ).toEqual([
      { channel: IPC_CHANNELS.appGetInfo, command: APP_COMMANDS.getInfo },
      {
        channel: IPC_CHANNELS.appSetAppearancePreferences,
        command: APP_COMMANDS.setAppearancePreferences,
      },
      { channel: IPC_CHANNELS.settingsSet, command: APP_COMMANDS.settingsSet },
      { channel: IPC_CHANNELS.openRecent, command: APP_COMMANDS.openRecent },
      { channel: IPC_CHANNELS.getBrief, command: APP_COMMANDS.getBrief },
      { channel: IPC_CHANNELS.getOverview, command: APP_COMMANDS.getOverview },
      {
        channel: IPC_CHANNELS.listExportVersions,
        command: APP_COMMANDS.listExportVersions,
      },
      { channel: IPC_CHANNELS.aiHasCredential, command: APP_COMMANDS.hasCredential },
      { channel: IPC_CHANNELS.taskListActive, command: APP_COMMANDS.taskListActive },
    ]);
    for (const { command } of state.calls) expect(() => RegisteredCommandSchema.parse(command)).not.toThrow();
  });

  it('rejects invalid input through the authoritative preload schema before IPC dispatch', async () => {
    const bridge = state.exposed as WorldforgeBridge;
    await expect(
      bridge.app.setAppearancePreferences({
        workspaceAlignment: 'center',
        uiScalePercent: 95,
        bodyFontSize: 18,
        contentWidth: 'normal',
      } as never),
    ).rejects.toThrow();
    await expect(bridge.project.openRecent('not-a-uuid')).rejects.toThrow();
    await expect(bridge.ai.hasCredential('invalid-ref')).rejects.toThrow();
    expect(state.ipcInvoke).not.toHaveBeenCalled();
  });

  it('handles accepted, duplicate, malformed and sequence-gap events with real schemas', async () => {
    const bridge = state.exposed as WorldforgeBridge;
    const listener = vi.fn();
    const unsubscribe = bridge.task.subscribe(listener, projectId);
    const channel = state.channels.at(-1);
    expect(channel?.port1.started).toBe(true);
    expect(state.ipcPostMessage).toHaveBeenCalledWith(
      IPC_CHANNELS.taskConnectEvents,
      expect.objectContaining({ protocolVersion: PROTOCOL_VERSION, projectId }),
      [channel?.port2],
    );

    channel?.port1.onmessage?.({ data: { invalid: true } });
    expect(listener).not.toHaveBeenCalled();

    const firstEventId = '44444444-4444-4444-8444-444444444444';
    channel?.port1.onmessage?.({ data: taskEvent(1, firstEventId) });
    expect(listener).toHaveBeenCalledWith({ kind: 'event', event: taskEvent(1, firstEventId) });

    channel?.port1.onmessage?.({ data: taskEvent(1, firstEventId) });
    const gapEventId = '66666666-6666-4666-8666-666666666666';
    channel?.port1.onmessage?.({ data: taskEvent(3, gapEventId) });
    channel?.port1.onmessage?.({
      data: taskEvent(4, '77777777-7777-4777-8777-777777777777'),
    });
    await flushMicrotasks();
    await vi.waitFor(() => {
      expect(listener).toHaveBeenCalledWith({
        kind: 'snapshot',
        snapshot: expect.objectContaining({ taskId, lastSequence: 3 }),
        reason: 'sequence-gap',
      });
    });
    expect(channel?.port1.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ protocolVersion: PROTOCOL_VERSION, type: 'task.ack' }),
      ]),
    );

    unsubscribe();
    unsubscribe();
    expect(channel?.port1.closed).toBe(true);
    const callsBeforeLateEvent = listener.mock.calls.length;
    channel?.port1.onmessage?.({
      data: taskEvent(5, '88888888-8888-4888-8888-888888888888'),
    });
    expect(listener).toHaveBeenCalledTimes(callsBeforeLateEvent);
  });

  it('does not publish failed or late snapshot recovery', async () => {
    const bridge = state.exposed as WorldforgeBridge;
    const listener = vi.fn();
    state.ipcInvoke.mockImplementationOnce(async (_channel: string, command: unknown) => {
      const parsed = RegisteredCommandSchema.parse(command);
      return failure(parsed.requestId);
    });
    const unsubscribe = bridge.task.subscribe(listener, projectId);
    const channel = state.channels.at(-1);
    channel?.port1.onmessage?.({
      data: taskEvent(2, '99999999-9999-4999-8999-999999999999'),
    });
    await flushMicrotasks();
    expect(listener).not.toHaveBeenCalled();

    let resolveSnapshot: ((value: unknown) => void) | undefined;
    state.ipcInvoke.mockImplementationOnce(
      async (_channel: string, command: unknown) =>
        await new Promise((resolve) => {
          const parsed = RegisteredCommandSchema.parse(command);
          resolveSnapshot = (value) => resolve({ ...value as object, requestId: parsed.requestId });
        }),
    );
    channel?.port1.onmessage?.({
      data: taskEvent(3, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    });
    unsubscribe();
    resolveSnapshot?.({
      ok: true,
      data: {
        taskId,
        taskType: 'chapter.generate',
        projectId,
        status: 'running',
        stage: 'running',
        lastSequence: 3,
        startedAt: '2026-07-23T00:00:00.000Z',
        elapsedMs: 100,
      },
    });
    await flushMicrotasks();
    expect(listener).not.toHaveBeenCalled();
  });
});
