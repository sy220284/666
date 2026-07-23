import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  exposed: undefined as unknown,
  channels: [] as FakeMessageChannel[],
  disposition: { kind: 'accepted' } as { kind: string },
  restored: [] as unknown[],
  ipcInvoke: vi.fn(async () => ({ ok: true, data: {} })),
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

vi.mock('@worldforge/contracts', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const schema = {
    parse: (input: unknown) => input,
    safeParse: (input: unknown) =>
      (input as { valid?: boolean } | null)?.valid === false
        ? { success: false, error: new Error('invalid') }
        : { success: true, data: input },
  };
  class FakeTaskEventCursor {
    accept(): { kind: string } {
      return state.disposition;
    }
    restore(snapshot: unknown): void {
      state.restored.push(snapshot);
    }
  }
  return new Proxy(actual, {
    get(target, property, receiver) {
      if (property === 'TaskEventCursor') return FakeTaskEventCursor;
      if (typeof property === 'string' && property.endsWith('Schema')) return schema;
      return Reflect.get(target, property, receiver);
    },
  });
});

function universalArgument(): unknown {
  const callable = vi.fn();
  return new Proxy(callable, {
    get(_target, property) {
      if (property === 'then') return undefined;
      if (property === Symbol.iterator) return function* iterator() {};
      if (property === Symbol.toPrimitive) return () => 'coverage-id';
      return callable;
    },
  });
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('Preload bridge unit and regression coverage', () => {
  beforeEach(async () => {
    state.exposed = undefined;
    state.channels.length = 0;
    state.disposition = { kind: 'accepted' };
    state.restored.length = 0;
    state.ipcInvoke.mockReset();
    state.ipcInvoke.mockResolvedValue({ ok: true, data: {} });
    state.ipcPostMessage.mockReset();
    Object.defineProperty(globalThis, 'MessageChannel', {
      configurable: true,
      value: FakeMessageChannel,
    });
    vi.resetModules();
    await import('../../apps/desktop/preload/src/index.js');
  });

  it('exposes one bridge and forwards every non-streaming capability through validated invoke', async () => {
    expect(state.exposed).toBeTypeOf('object');
    const bridge = state.exposed as Record<string, Record<string, (...args: unknown[]) => unknown>>;
    const argument = universalArgument();
    const invoked: string[] = [];

    for (const [groupName, group] of Object.entries(bridge)) {
      if (!group || typeof group !== 'object') continue;
      for (const [methodName, method] of Object.entries(group)) {
        if (typeof method !== 'function' || `${groupName}.${methodName}` === 'task.subscribe')
          continue;
        const result = method(argument, argument, argument);
        await Promise.resolve(result);
        invoked.push(`${groupName}.${methodName}`);
      }
    }

    expect(invoked).toContain('app.getInfo');
    expect(invoked).toContain('project.create');
    expect(invoked).toContain('draft.applyPatch');
    expect(invoked).toContain('candidate.discard');
    expect(invoked).toContain('version.restore');
    expect(invoked).toContain('ai.hasCredential');
    expect(invoked).toContain('task.getSnapshot');
    expect(state.ipcInvoke).toHaveBeenCalledTimes(invoked.length);
    for (const [, command] of state.ipcInvoke.mock.calls) {
      expect(command).toMatchObject({
        protocolVersion: expect.any(Number),
        requestId: expect.any(String),
        sentAt: expect.any(String),
      });
    }
  });

  it('handles accepted, duplicate, malformed and sequence-gap task events and closes idempotently', async () => {
    const bridge = state.exposed as {
      task: {
        subscribe(listener: (event: unknown) => void, projectId?: string): () => void;
      };
    };
    const listener = vi.fn();
    const unsubscribe = bridge.task.subscribe(listener, 'project-id');
    const channel = state.channels.at(-1);
    expect(channel?.port1.started).toBe(true);
    expect(state.ipcPostMessage).toHaveBeenCalledTimes(1);

    channel?.port1.onmessage?.({ data: { valid: false } });
    expect(listener).not.toHaveBeenCalled();

    state.disposition = { kind: 'accepted' };
    channel?.port1.onmessage?.({ data: { eventId: 'event-1', taskId: 'task-1' } });
    expect(listener).toHaveBeenCalledWith({
      kind: 'event',
      event: { eventId: 'event-1', taskId: 'task-1' },
    });

    state.disposition = { kind: 'duplicate' };
    channel?.port1.onmessage?.({ data: { eventId: 'event-2', taskId: 'task-1' } });

    let resolveSnapshot: ((value: unknown) => void) | undefined;
    state.ipcInvoke.mockImplementationOnce(
      async () =>
        await new Promise((resolve) => {
          resolveSnapshot = resolve;
        }),
    );
    state.disposition = { kind: 'gap' };
    const gap = { eventId: 'event-3', taskId: 'task-gap', projectId: 'project-id' };
    channel?.port1.onmessage?.({ data: gap });
    channel?.port1.onmessage?.({ data: { ...gap, eventId: 'event-4' } });
    resolveSnapshot?.({ ok: true, data: { taskId: 'task-gap', sequence: 4 } });
    await flushMicrotasks();
    expect(state.restored).toContainEqual({ taskId: 'task-gap', sequence: 4 });
    expect(listener).toHaveBeenCalledWith({
      kind: 'snapshot',
      snapshot: { taskId: 'task-gap', sequence: 4 },
      reason: 'sequence-gap',
    });

    unsubscribe();
    unsubscribe();
    expect(channel?.port1.closed).toBe(true);
    const callsBeforeClosedEvent = listener.mock.calls.length;
    channel?.port1.onmessage?.({ data: { eventId: 'late', taskId: 'task-1' } });
    expect(listener).toHaveBeenCalledTimes(callsBeforeClosedEvent);
    expect(channel?.port1.messages.length).toBeGreaterThanOrEqual(4);
  });

  it('does not publish a failed or late snapshot recovery', async () => {
    const bridge = state.exposed as {
      task: { subscribe(listener: (event: unknown) => void): () => void };
    };
    const listener = vi.fn();
    state.disposition = { kind: 'gap' };
    state.ipcInvoke.mockResolvedValueOnce({ ok: false, error: { code: 'FAILED' } });
    const unsubscribe = bridge.task.subscribe(listener);
    const channel = state.channels.at(-1);
    channel?.port1.onmessage?.({
      data: { eventId: 'event-failed', taskId: 'task-failed', projectId: 'project-id' },
    });
    await flushMicrotasks();
    expect(listener).not.toHaveBeenCalled();

    let resolveSnapshot: ((value: unknown) => void) | undefined;
    state.ipcInvoke.mockImplementationOnce(
      async () =>
        await new Promise((resolve) => {
          resolveSnapshot = resolve;
        }),
    );
    channel?.port1.onmessage?.({
      data: { eventId: 'event-late', taskId: 'task-late', projectId: 'project-id' },
    });
    unsubscribe();
    resolveSnapshot?.({ ok: true, data: { taskId: 'task-late' } });
    await flushMicrotasks();
    expect(listener).not.toHaveBeenCalled();
  });
});
