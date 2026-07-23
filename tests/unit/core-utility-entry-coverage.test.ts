import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  parentListener: undefined as
    | ((event: { data: unknown; ports: readonly FakeTransferredPort[] }) => void)
    | undefined,
  posted: [] as unknown[],
  protocol: undefined as FakeTaskProtocol | undefined,
  invalidControl: false,
  preferencesGetError: undefined as Error | undefined,
  preferencesSaveError: undefined as Error | undefined,
  closeError: undefined as Error | undefined,
  workspaceShutdownError: undefined as Error | undefined,
  executeAppResult: { ok: true, operation: 'app.test', data: {} } as unknown,
  executeProjectResult: { ok: true, operation: 'project.test', data: {} } as unknown,
  openRuntime: vi.fn(),
  executeApp: vi.fn(),
  executeProject: vi.fn(),
  processExit: vi.fn(),
}));

class FakeTransferredPort {
  readonly listeners = new Map<string, (...args: unknown[]) => void>();
  readonly posted: unknown[] = [];
  started = 0;
  closed = 0;

  postMessage(message: unknown): void {
    this.posted.push(message);
  }
  on(name: string, listener: (...args: unknown[]) => void): void {
    this.listeners.set(name, listener);
  }
  off(name: string, listener: (...args: unknown[]) => void): void {
    if (this.listeners.get(name) === listener) this.listeners.delete(name);
  }
  start(): void {
    this.started += 1;
  }
  close(): void {
    this.closed += 1;
  }
}

class FakeTaskProtocol {
  accepting = true;
  activeTaskCount = 0;
  readonly attachPort = vi.fn();
  readonly beginDrain = vi.fn(async () => {
    this.accepting = false;
  });
  readonly close = vi.fn();

  constructor() {
    state.protocol = this;
  }
}

vi.mock('@worldforge/contracts', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    CoreControlMessageSchema: {
      safeParse: (input: unknown) =>
        state.invalidControl
          ? { success: false, error: new Error('invalid') }
          : { success: true, data: input },
    },
    CoreAppDataResultSchema: { parse: (input: unknown) => input },
    CoreProjectResultSchema: { parse: (input: unknown) => input },
  };
});

vi.mock('../../packages/core-service/src/app-runtime.js', () => ({
  openAppRuntime: async (options: unknown) => {
    state.openRuntime(options);
    return {
      recentProjects: {},
      windowPreferences: {
        get() {
          if (state.preferencesGetError) throw state.preferencesGetError;
          return { displayId: 'display' };
        },
        async save(_requestId: string, preferences: unknown) {
          if (state.preferencesSaveError) throw state.preferencesSaveError;
          return preferences;
        },
      },
      async close() {
        if (state.closeError) throw state.closeError;
      },
    };
  },
}));

for (const path of [
  'candidate-apply',
  'candidate',
  'checkpoint-aware-recovery',
  'continuity',
  'coordinated-import-export',
  'draft',
  'entity-canon',
  'project-planning',
  'project-structure',
  'reference-aware-structure-operations',
  'scene-beat',
  'version',
]) {
  vi.mock(`../../packages/core-service/src/${path}.js`, () => {
    const exportName =
      path
        .split('-')
        .map((part) => part[0]?.toUpperCase() + part.slice(1))
        .join('') +
      (path === 'checkpoint-aware-recovery' || path === 'reference-aware-structure-operations'
        ? 'Service'
        : 'Service');
    return { [exportName]: class {} };
  });
}

vi.mock('../../packages/core-service/src/project-workspace.js', () => ({
  ProjectWorkspaceService: class {
    async shutdown() {
      if (state.workspaceShutdownError) throw state.workspaceShutdownError;
    }
  },
}));

vi.mock('../../packages/core-service/src/task-protocol.js', () => ({
  TaskProtocol: FakeTaskProtocol,
  TaskCommandRouter: class {
    execute(envelope: unknown) {
      return { routed: envelope };
    }
  },
}));

vi.mock('../../packages/core-service/src/utility-app-data-router.js', () => ({
  executeAppDataOperation: async (...args: unknown[]) => {
    state.executeApp(...args);
    return state.executeAppResult;
  },
}));
vi.mock('../../packages/core-service/src/utility-project-router.js', () => ({
  executeProjectOperation: async (...args: unknown[]) => {
    state.executeProject(...args);
    return state.executeProjectResult;
  },
}));
vi.mock('../../packages/core-service/src/utility-errors.js', () => ({
  windowPreferencesError: () => 'DB_OPEN_FAILED_001',
}));

const absoluteArguments = [
  '--app-database=/tmp/app.sqlite',
  '--app-migrations=/tmp/app-migrations',
  '--app-recovery=/tmp/app-recovery',
  '--app-version=1.2.3',
  '--project-migrations=/tmp/project-migrations',
  '--project-migration-recovery=/tmp/project-migration-recovery',
  '--project-operation-recovery=/tmp/project-operation-recovery',
];

function control(type: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type,
    protocolVersion: 1,
    requestId: `${type}-request`,
    ...extra,
  };
}

async function importEntry(argumentsList = absoluteArguments): Promise<void> {
  process.argv = ['node', 'utility-entry', ...argumentsList];
  Object.defineProperty(process, 'parentPort', {
    configurable: true,
    value: {
      on(_name: string, listener: typeof state.parentListener) {
        state.parentListener = listener;
      },
      postMessage(message: unknown) {
        state.posted.push(message);
      },
    },
  });
  vi.resetModules();
  await import('../../packages/core-service/src/utility-entry.js');
}

async function flush(): Promise<void> {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}

describe('Core utility entry unit and integration coverage', () => {
  beforeEach(() => {
    state.parentListener = undefined;
    state.posted.length = 0;
    state.protocol = undefined;
    state.invalidControl = false;
    state.preferencesGetError = undefined;
    state.preferencesSaveError = undefined;
    state.closeError = undefined;
    state.workspaceShutdownError = undefined;
    state.executeAppResult = { ok: true, operation: 'app.test', data: {} };
    state.executeProjectResult = { ok: true, operation: 'project.test', data: {} };
    state.openRuntime.mockClear();
    state.executeApp.mockClear();
    state.executeProject.mockClear();
    state.processExit.mockClear();
    vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null) => {
      state.processExit(code);
      return undefined as never;
    }) as typeof process.exit);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (process as NodeJS.Process & { parentPort?: unknown }).parentPort;
  });

  it('requires a parent port and all absolute startup arguments', async () => {
    delete (process as NodeJS.Process & { parentPort?: unknown }).parentPort;
    process.argv = ['node', 'utility-entry', ...absoluteArguments];
    vi.resetModules();
    await expect(import('../../packages/core-service/src/utility-entry.js')).rejects.toThrow(
      'CORE_PARENT_PORT_UNAVAILABLE',
    );

    await expect(importEntry(absoluteArguments.filter((value) => !value.startsWith('--app-version=')))).rejects.toThrow(
      'CORE_ARGUMENT_MISSING_APP_VERSION',
    );
    await expect(
      importEntry(
        absoluteArguments.map((value) =>
          value.startsWith('--app-database=') ? '--app-database=relative.sqlite' : value,
        ),
      ),
    ).rejects.toThrow('CORE_ARGUMENT_PATH_INVALID_APP-DATABASE');
  });

  it('initializes services, sends ready, and handles ping and task commands', async () => {
    await importEntry();
    expect(state.openRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        databasePath: '/tmp/app.sqlite',
        migrationsDirectory: '/tmp/app-migrations',
        recoveryDirectory: '/tmp/app-recovery',
        appVersion: '1.2.3',
      }),
    );
    expect(state.posted[0]).toMatchObject({ type: 'core.ready', protocolVersion: 1 });

    state.invalidControl = true;
    state.parentListener?.({ data: { invalid: true }, ports: [] });
    expect(state.posted).toHaveLength(1);
    state.invalidControl = false;

    state.parentListener?.({ data: control('core.ping'), ports: [] });
    state.parentListener?.({
      data: control('core.command', { envelope: { command: 'task.list' } }),
      ports: [],
    });
    expect(state.posted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'core.health', status: 'healthy' }),
        expect.objectContaining({ type: 'core.command-result' }),
      ]),
    );
  });

  it('adapts exactly one transferred task port and ignores malformed transfers', async () => {
    await importEntry();
    const none: FakeTransferredPort[] = [];
    state.parentListener?.({
      data: control('core.attach-task-port', { connection: { projectId: 'project' } }),
      ports: none,
    });
    const first = new FakeTransferredPort();
    const second = new FakeTransferredPort();
    state.parentListener?.({
      data: control('core.attach-task-port', { connection: { projectId: 'project' } }),
      ports: [first, second],
    });
    expect(state.protocol?.attachPort).not.toHaveBeenCalled();

    const port = new FakeTransferredPort();
    state.parentListener?.({
      data: control('core.attach-task-port', { connection: { projectId: 'project' } }),
      ports: [port],
    });
    expect(port.started).toBe(1);
    expect(state.protocol?.attachPort).toHaveBeenCalledTimes(1);
    const adapted = state.protocol?.attachPort.mock.calls[0]?.[0] as {
      postMessage(message: unknown): void;
      onMessage(listener: (message: unknown) => void): () => void;
      onClose(listener: () => void): () => void;
      close(): void;
    };
    adapted.postMessage({ hello: true });
    const messageListener = vi.fn();
    const closeListener = vi.fn();
    const stopMessage = adapted.onMessage(messageListener);
    const stopClose = adapted.onClose(closeListener);
    port.listeners.get('message')?.({ data: { event: true } });
    port.listeners.get('close')?.();
    expect(messageListener).toHaveBeenCalledWith({ event: true });
    expect(closeListener).toHaveBeenCalled();
    stopMessage();
    stopClose();
    adapted.close();
    expect(port.closed).toBe(1);
  });

  it('handles window preference read/write success and failure', async () => {
    await importEntry();
    state.parentListener?.({ data: control('core.window-preferences.get'), ports: [] });
    state.preferencesGetError = new Error('read failed');
    state.parentListener?.({ data: control('core.window-preferences.get'), ports: [] });

    state.parentListener?.({
      data: control('core.window-preferences.set', { preferences: { displayId: 'one' } }),
      ports: [],
    });
    await flush();
    state.preferencesSaveError = new Error('write failed');
    state.parentListener?.({
      data: control('core.window-preferences.set', { preferences: { displayId: 'two' } }),
      ports: [],
    });
    await flush();
    expect(state.posted.filter((message) => (message as { type?: string }).type === 'core.window-preferences-result')).toHaveLength(4);
    expect(state.posted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ result: expect.objectContaining({ ok: true }) }),
        expect.objectContaining({ result: { ok: false, errorCode: 'DB_OPEN_FAILED_001' } }),
      ]),
    );
  });

  it('tracks app/project operations, drains, rejects new work, and shuts down', async () => {
    await importEntry();
    state.parentListener?.({
      data: control('core.app-data.command', { operation: { operation: 'app.test' } }),
      ports: [],
    });
    state.parentListener?.({
      data: control('core.project.command', { operation: { operation: 'project.test' } }),
      ports: [],
    });
    await flush();
    expect(state.executeApp).toHaveBeenCalled();
    expect(state.executeProject).toHaveBeenCalled();

    state.parentListener?.({ data: control('core.shutdown'), ports: [] });
    expect(state.processExit).not.toHaveBeenCalled();
    state.parentListener?.({ data: control('core.drain'), ports: [] });
    await flush();
    expect(state.posted).toContainEqual(expect.objectContaining({ type: 'core.drained' }));

    state.parentListener?.({
      data: control('core.app-data.command', { operation: { operation: 'app.cancelled' } }),
      ports: [],
    });
    state.parentListener?.({
      data: control('core.project.command', { operation: { operation: 'project.cancelled' } }),
      ports: [],
    });
    expect(state.posted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'core.app-data.result',
          result: expect.objectContaining({ ok: false, errorCode: 'COMMON_CANCELLED_004' }),
        }),
        expect.objectContaining({
          type: 'core.project.result',
          result: expect.objectContaining({ ok: false, errorCode: 'COMMON_CANCELLED_004' }),
        }),
      ]),
    );

    state.parentListener?.({ data: control('core.shutdown'), ports: [] });
    await flush();
    await vi.runAllTimersAsync();
    expect(state.protocol?.close).toHaveBeenCalled();
    expect(state.posted).toContainEqual(expect.objectContaining({ type: 'core.shutdown-complete' }));
    expect(state.processExit).toHaveBeenCalledWith(0);
    state.parentListener?.({ data: control('core.shutdown'), ports: [] });
  });

  it('exits with failure when shutdown cleanup rejects', async () => {
    state.workspaceShutdownError = new Error('shutdown failed');
    await importEntry();
    state.parentListener?.({ data: control('core.drain'), ports: [] });
    await flush();
    state.parentListener?.({ data: control('core.shutdown'), ports: [] });
    await flush();
    expect(state.processExit).toHaveBeenCalledWith(1);
  });
});
