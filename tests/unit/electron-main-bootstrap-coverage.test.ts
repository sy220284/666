import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  appPackaged: false,
  lockOwned: true,
  appListeners: new Map<string, (...args: unknown[]) => unknown>(),
  screenListeners: new Map<string, (...args: unknown[]) => unknown>(),
  windows: [] as Array<Record<string, unknown>>,
  dialogResults: [] as Array<{ canceled: boolean; filePaths: string[] } | Error>,
  headerHandler: undefined as
    | ((
        details: { url: string; responseHeaders?: Record<string, string[]> },
        callback: (value: unknown) => void,
      ) => void)
    | undefined,
  navigationAdapter: undefined as Record<string, unknown> | undefined,
  navigationRendererUrl: '',
  ipcOptions: undefined as Record<string, unknown> | undefined,
  supervisorStart: { ok: true } as Record<string, unknown>,
  supervisorWindowPreferences: { ok: false, preferences: null } as Record<string, unknown>,
  supervisorSetPreferences: { ok: true } as Record<string, unknown>,
  supervisorShutdown: { ok: true } as Record<string, unknown>,
  supervisorStatus: { status: 'ready' } as Record<string, unknown>,
  executeDraftResult: true as unknown,
  childPid: 123 as number | undefined,
  childListeners: new Map<string, (...args: unknown[]) => unknown>(),
  spawnHandle: undefined as Record<string, unknown> | undefined,
  appSetPath: vi.fn(),
  appQuit: vi.fn(),
  appWhenReady: vi.fn(async () => undefined),
  appGetPath: vi.fn(() => '/tmp/worldforge-user-data'),
  appGetVersion: vi.fn(() => '1.2.3'),
  requestLock: vi.fn(() => true),
  dialogShow: vi.fn(),
  shellOpen: vi.fn(async () => undefined),
  utilityFork: vi.fn(),
  childPostMessage: vi.fn(),
  childOn: vi.fn(),
  childOff: vi.fn(),
  supervisorRestart: vi.fn(async () => ({ ok: true })),
  supervisorInvoke: vi.fn(),
  supervisorSetWindow: vi.fn(),
  supervisorShutdownCall: vi.fn(),
  loggerLog: vi.fn(async () => undefined),
  registerBase: vi.fn(),
  registerContinuity: vi.fn(),
  registerNarrative: vi.fn(),
  registerPreview: vi.fn(),
  unregisterBase: vi.fn(),
  unregisterContinuity: vi.fn(),
  unregisterNarrative: vi.fn(),
  unregisterPreview: vi.fn(),
  buildPreferences: vi.fn(() => ({ sandbox: true })),
  capturePreferences: vi.fn(),
  restorePreferences: vi.fn(),
}));

vi.mock('electron', () => {
  class FakeBrowserWindow {
    readonly options: Record<string, unknown>;
    readonly listeners = new Map<string, (...args: unknown[]) => unknown>();
    readonly onceListeners = new Map<string, (...args: unknown[]) => unknown>();
    readonly show = vi.fn();
    readonly maximize = vi.fn();
    readonly restore = vi.fn();
    readonly focus = vi.fn();
    readonly destroy = vi.fn(() => {
      this.destroyed = true;
    });
    readonly setBounds = vi.fn();
    readonly loadFile = vi.fn(async () => undefined);
    readonly getNormalBounds = vi.fn(() => ({ x: 10, y: 20, width: 1000, height: 700 }));
    readonly isMaximized = vi.fn(() => false);
    readonly isMinimized = vi.fn(() => false);
    readonly isDestroyed = vi.fn(() => this.destroyed);
    destroyed = false;
    readonly webContents = {
      on: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      executeJavaScript: vi.fn(async () => state.executeDraftResult),
      session: {
        on: vi.fn(),
        webRequest: {
          onHeadersReceived: vi.fn(
            (
              _filter: unknown,
              handler: (
                details: { url: string; responseHeaders?: Record<string, string[]> },
                callback: (value: unknown) => void,
              ) => void,
            ) => {
              state.headerHandler = handler;
            },
          ),
        },
      },
    };

    constructor(options: Record<string, unknown>) {
      this.options = options;
      state.windows.push(this as unknown as Record<string, unknown>);
    }

    on(name: string, listener: (...args: unknown[]) => unknown): void {
      this.listeners.set(name, listener);
    }

    once(name: string, listener: (...args: unknown[]) => unknown): void {
      this.onceListeners.set(name, listener);
    }
  }

  const child = () => ({
    pid: state.childPid,
    postMessage: state.childPostMessage,
    on: (name: string, listener: (...args: unknown[]) => unknown) => {
      state.childListeners.set(name, listener);
      state.childOn(name, listener);
    },
    off: (name: string, listener: (...args: unknown[]) => unknown) => {
      state.childOff(name, listener);
    },
  });

  return {
    app: {
      get isPackaged() {
        return state.appPackaged;
      },
      setPath: state.appSetPath,
      getPath: state.appGetPath,
      getVersion: state.appGetVersion,
      whenReady: state.appWhenReady,
      requestSingleInstanceLock: () => state.lockOwned,
      on: (name: string, listener: (...args: unknown[]) => unknown) => {
        state.appListeners.set(name, listener);
      },
      quit: state.appQuit,
    },
    BrowserWindow: FakeBrowserWindow,
    dialog: {
      showOpenDialog: state.dialogShow,
    },
    ipcMain: {},
    safeStorage: {},
    screen: {
      getPrimaryDisplay: () => ({ id: 1 }),
      getAllDisplays: () => [
        {
          id: 1,
          scaleFactor: 1,
          workArea: { x: 0, y: 0, width: 1920, height: 1080 },
        },
        {
          id: 2,
          scaleFactor: 2,
          workArea: { x: 1920, y: 0, width: 1920, height: 1080 },
        },
      ],
      on: (name: string, listener: (...args: unknown[]) => unknown) => {
        state.screenListeners.set(name, listener);
      },
      off: vi.fn((name: string) => state.screenListeners.delete(name)),
    },
    shell: { openExternal: state.shellOpen },
    utilityProcess: {
      fork: (...args: unknown[]) => {
        state.utilityFork(...args);
        return child();
      },
    },
  };
});

vi.mock('../../apps/desktop/main/src/core-supervisor.js', () => ({
  CoreSupervisor: class {
    constructor(options: { spawn: () => Record<string, unknown> }) {
      state.spawnHandle = options.spawn();
    }
    async start() {
      return state.supervisorStart;
    }
    async getWindowPreferences() {
      return state.supervisorWindowPreferences;
    }
    async setWindowPreferences(preferences: unknown) {
      state.supervisorSetWindow(preferences);
      return {
        ...state.supervisorSetPreferences,
        ...(state.supervisorSetPreferences.ok === true ? { preferences } : {}),
      };
    }
    getStatus() {
      return state.supervisorStatus;
    }
    restart() {
      return state.supervisorRestart();
    }
    invokeProjectOperation(...args: unknown[]) {
      return state.supervisorInvoke(...args);
    }
    async shutdown() {
      state.supervisorShutdownCall();
      return state.supervisorShutdown;
    }
  },
}));

vi.mock('../../apps/desktop/main/src/credential-broker.js', () => ({
  CredentialBroker: class {},
}));
vi.mock('../../apps/desktop/main/src/ipc-handlers.js', () => ({
  registerIpcHandlers: (options: Record<string, unknown>) => {
    state.ipcOptions = options;
    state.registerBase(options);
    return state.unregisterBase;
  },
}));
vi.mock('../../apps/desktop/main/src/continuity-ipc.js', () => ({
  registerContinuityIpc: (options: unknown) => {
    state.registerContinuity(options);
    return state.unregisterContinuity;
  },
}));
vi.mock('../../apps/desktop/main/src/narrative-planning-ipc.js', () => ({
  registerNarrativePlanningIpc: (options: unknown) => {
    state.registerNarrative(options);
    return state.unregisterNarrative;
  },
}));
vi.mock('../../apps/desktop/main/src/candidate-preview-ipc.js', () => ({
  registerCandidatePreviewIpc: (options: unknown) => {
    state.registerPreview(options);
    return state.unregisterPreview;
  },
}));
vi.mock('../../apps/desktop/main/src/navigation-policy.js', () => ({
  installNavigationPolicy: (adapter: Record<string, unknown>, rendererUrl: string) => {
    state.navigationAdapter = adapter;
    state.navigationRendererUrl = rendererUrl;
  },
}));
vi.mock('../../apps/desktop/main/src/privacy-logger.js', () => ({
  createDiagnosticId: () => 'diagnostic-id',
  PrivacyLogger: class {
    log(...args: unknown[]) {
      return state.loggerLog(...args);
    }
  },
}));
vi.mock('../../apps/desktop/main/src/security-policy.js', () => ({
  CONTENT_SECURITY_POLICY: "default-src 'self'",
  buildSecureWebPreferences: (...args: unknown[]) => state.buildPreferences(...args),
}));
vi.mock('../../apps/desktop/main/src/window-state.js', () => ({
  restoreWindowPreferences: (...args: unknown[]) => {
    state.restorePreferences(...args);
    return {
      workspaceAlignment: 'center',
      uiScalePercent: 100,
      bodyFontSize: 18,
      contentWidth: 'normal',
      displayId: '1',
      boundsDip: { x: 0, y: 0, width: 1200, height: 800 },
      scaleFactor: 1,
      maximized: false,
    };
  },
  captureWindowPreferences: (
    boundsDip: unknown,
    maximized: boolean,
    _displays: unknown,
    appearance: Record<string, unknown>,
  ) => {
    state.capturePreferences(boundsDip, maximized, appearance);
    return {
      ...appearance,
      displayId: '1',
      boundsDip,
      scaleFactor: 1,
      maximized,
    };
  },
}));

function resetState(): void {
  state.appPackaged = false;
  state.lockOwned = true;
  state.appListeners.clear();
  state.screenListeners.clear();
  state.windows.length = 0;
  state.dialogResults.length = 0;
  state.headerHandler = undefined;
  state.navigationAdapter = undefined;
  state.navigationRendererUrl = '';
  state.ipcOptions = undefined;
  state.supervisorStart = { ok: true };
  state.supervisorWindowPreferences = { ok: false, preferences: null };
  state.supervisorSetPreferences = { ok: true };
  state.supervisorShutdown = { ok: true };
  state.supervisorStatus = { status: 'ready' };
  state.executeDraftResult = true;
  state.childPid = 123;
  state.childListeners.clear();
  state.spawnHandle = undefined;
  for (const value of Object.values(state)) {
    if (typeof value === 'function' && 'mockClear' in value) {
      (value as ReturnType<typeof vi.fn>).mockClear();
    }
  }
  state.dialogShow.mockImplementation(async () => {
    const result = state.dialogResults.shift() ?? { canceled: false, filePaths: ['/tmp/selected'] };
    if (result instanceof Error) throw result;
    return result;
  });
  Object.defineProperty(process, 'resourcesPath', { configurable: true, value: '/resources' });
  delete process.env.WORLDFORGE_E2E;
  delete process.env.WORLDFORGE_E2E_USER_DATA;
  delete process.env.WORLDFORGE_E2E_CREATE_PARENT;
  delete process.env.WORLDFORGE_E2E_OPEN_WORKSPACE;
  delete process.env.WORLDFORGE_E2E_MOVE_PARENT;
  delete process.env.WORLDFORGE_E2E_RESTORE_PARENT;
  delete process.env.WORLDFORGE_E2E_RECOVERY_EXPORT_DIRECTORY;
  delete process.env.WORLDFORGE_E2E_IMPORT_FILE;
  delete process.env.WORLDFORGE_E2E_TEXT_EXPORT_DIRECTORY;
}

async function importMain(): Promise<void> {
  vi.resetModules();
  await import('../../apps/desktop/main/src/electron-main.js');
  await vi.waitFor(() => {
    expect(state.windows.length).toBe(1);
  });
}

function windowInstance(): Record<string, unknown> {
  const window = state.windows[0];
  if (!window) throw new Error('window not created');
  return window;
}

async function flush(): Promise<void> {
  for (let index = 0; index < 25; index += 1) await Promise.resolve();
}

describe('Electron main bootstrap and lifecycle coverage', () => {
  beforeEach(() => {
    resetState();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('boots, wires policies, persists window state and shuts down cleanly', async () => {
    await importMain();
    const window = windowInstance() as {
      listeners: Map<string, (...args: unknown[]) => unknown>;
      onceListeners: Map<string, (...args: unknown[]) => unknown>;
      webContents: {
        on: ReturnType<typeof vi.fn>;
        setWindowOpenHandler: ReturnType<typeof vi.fn>;
        session: { on: ReturnType<typeof vi.fn> };
      };
      show: ReturnType<typeof vi.fn>;
      restore: ReturnType<typeof vi.fn>;
      focus: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
      isMinimized: ReturnType<typeof vi.fn>;
      setBounds: ReturnType<typeof vi.fn>;
    };

    expect(state.buildPreferences).toHaveBeenCalled();
    expect(state.registerBase).toHaveBeenCalled();
    expect(state.registerContinuity).toHaveBeenCalled();
    expect(state.registerNarrative).toHaveBeenCalled();
    expect(state.registerPreview).toHaveBeenCalled();
    expect(state.navigationAdapter).toBeDefined();

    const adapter = state.navigationAdapter as {
      on(name: string, listener: (...args: unknown[]) => unknown): void;
      setWindowOpenHandler(handler: unknown): void;
      session: { on(name: string, listener: (...args: unknown[]) => unknown): void };
    };
    adapter.on('will-navigate', vi.fn());
    adapter.setWindowOpenHandler(vi.fn());
    adapter.session.on('will-download', vi.fn());
    expect(window.webContents.on).toHaveBeenCalled();
    expect(window.webContents.setWindowOpenHandler).toHaveBeenCalled();
    expect(window.webContents.session.on).toHaveBeenCalled();

    const nonRendererCallback = vi.fn();
    state.headerHandler?.(
      { url: 'file:///other.html', responseHeaders: { Existing: ['yes'] } },
      nonRendererCallback,
    );
    expect(nonRendererCallback).toHaveBeenCalledWith({ responseHeaders: { Existing: ['yes'] } });
    const rendererCallback = vi.fn();
    state.headerHandler?.(
      { url: state.navigationRendererUrl, responseHeaders: { Existing: ['yes'] } },
      rendererCallback,
    );
    expect(rendererCallback).toHaveBeenCalledWith({
      responseHeaders: expect.objectContaining({
        'Content-Security-Policy': ["default-src 'self'"],
      }),
    });

    window.listeners.get('move')?.();
    window.listeners.get('resize')?.();
    await vi.advanceTimersByTimeAsync(250);
    expect(state.supervisorSetWindow).toHaveBeenCalled();

    state.screenListeners.get('display-added')?.();
    expect(window.setBounds).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250);

    window.onceListeners.get('ready-to-show')?.();
    expect(window.show).toHaveBeenCalled();

    window.isMinimized.mockReturnValueOnce(true);
    state.appListeners.get('second-instance')?.();
    expect(window.restore).toHaveBeenCalled();
    expect(window.focus).toHaveBeenCalled();

    const prevented = vi.fn();
    window.listeners.get('close')?.({ preventDefault: prevented });
    await flush();
    expect(prevented).toHaveBeenCalled();
    expect(state.supervisorShutdownCall).toHaveBeenCalled();
    expect(state.unregisterBase).toHaveBeenCalled();
    expect(state.unregisterContinuity).toHaveBeenCalled();
    expect(state.unregisterNarrative).toHaveBeenCalled();
    expect(state.unregisterPreview).toHaveBeenCalled();
    expect(window.destroy).toHaveBeenCalled();
    expect(state.appQuit).toHaveBeenCalled();

    const beforeQuitPrevented = vi.fn();
    state.appListeners.get('before-quit')?.({ preventDefault: beforeQuitPrevented });
    expect(beforeQuitPrevented).not.toHaveBeenCalled();
  });

  it('exercises Core process adapter, packaged paths and E2E injected selections', async () => {
    state.appPackaged = true;
    process.env.WORLDFORGE_E2E = '1';
    process.env.WORLDFORGE_E2E_USER_DATA = '/tmp/e2e-user-data';
    process.env.WORLDFORGE_E2E_CREATE_PARENT = '/tmp/create-parent';
    process.env.WORLDFORGE_E2E_OPEN_WORKSPACE = '/tmp/open-workspace';
    process.env.WORLDFORGE_E2E_MOVE_PARENT = '/tmp/move-parent';
    process.env.WORLDFORGE_E2E_RESTORE_PARENT = '/tmp/restore-parent';
    process.env.WORLDFORGE_E2E_RECOVERY_EXPORT_DIRECTORY = '/tmp/recovery-export';
    process.env.WORLDFORGE_E2E_IMPORT_FILE = '/tmp/import.md';
    process.env.WORLDFORGE_E2E_TEXT_EXPORT_DIRECTORY = '/tmp/text-export';
    await importMain();

    expect(state.appSetPath).toHaveBeenCalledWith('userData', '/tmp/e2e-user-data');
    expect(state.utilityFork).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([
        '--app-migrations=/resources/migrations/app',
        '--project-migrations=/resources/migrations/project',
      ]),
      { serviceName: 'WorldForge Core Service' },
    );
    expect(state.spawnHandle).toMatchObject({ pid: 123 });
    const handle = state.spawnHandle as {
      postMessage(message: unknown, transfer?: readonly unknown[]): void;
      onMessage(listener: (...args: unknown[]) => unknown): () => void;
      onExit(listener: (...args: unknown[]) => unknown): () => void;
    };
    handle.postMessage({ one: true });
    handle.postMessage({ two: true }, [{}]);
    const stopMessage = handle.onMessage(vi.fn());
    const stopExit = handle.onExit(vi.fn());
    stopMessage();
    stopExit();
    expect(state.childPostMessage).toHaveBeenCalledTimes(2);
    expect(state.childOn).toHaveBeenCalledTimes(2);
    expect(state.childOff).toHaveBeenCalledTimes(2);

    const options = state.ipcOptions as Record<string, (...args: unknown[]) => Promise<unknown>>;
    await expect(options.chooseProjectCreateParent()).resolves.toBe('/tmp/create-parent');
    await expect(options.chooseProjectToOpen()).resolves.toBe('/tmp/open-workspace');
    await expect(options.chooseProjectMoveParent()).resolves.toBe('/tmp/move-parent');
    await expect(options.chooseRecoveryRestoreParent()).resolves.toBe('/tmp/restore-parent');
    await expect(options.chooseRecoveryExportDirectory()).resolves.toBe('/tmp/recovery-export');
    await expect(options.chooseTextImportFile()).resolves.toBe('/tmp/import.md');
    await expect(options.chooseTextExportDirectory()).resolves.toBe('/tmp/text-export');
    expect(state.dialogShow).not.toHaveBeenCalled();
    const window = windowInstance() as {
      onceListeners: Map<string, (...args: unknown[]) => unknown>;
      show: ReturnType<typeof vi.fn>;
    };
    window.onceListeners.get('ready-to-show')?.();
    expect(window.show).not.toHaveBeenCalled();
  });

  it('covers dialog cancel/success/error and preference persistence failure', async () => {
    state.supervisorSetPreferences = { ok: false, errorCode: 'DB_WRITE_FAILED_004' };
    await importMain();
    const options = state.ipcOptions as Record<string, (...args: unknown[]) => Promise<unknown>>;

    state.dialogResults.push({ canceled: true, filePaths: [] });
    await expect(options.chooseTextImportFile()).resolves.toBeNull();
    state.dialogResults.push({ canceled: false, filePaths: [] });
    await expect(options.chooseTextImportFile()).resolves.toBeNull();
    state.dialogResults.push({ canceled: false, filePaths: ['/tmp/file.md'] });
    await expect(options.chooseTextImportFile()).resolves.toBe('/tmp/file.md');
    state.dialogResults.push({ canceled: true, filePaths: [] });
    await expect(options.chooseProjectCreateParent()).resolves.toBeNull();
    state.dialogResults.push({ canceled: false, filePaths: ['/tmp/directory'] });
    await expect(options.chooseProjectCreateParent()).resolves.toBe('/tmp/directory');
    state.dialogResults.push(new Error('dialog failed'));
    await expect(options.chooseProjectToOpen()).rejects.toThrow('dialog failed');

    await expect(
      options.setAppearancePreferences({
        workspaceAlignment: 'left',
        uiScalePercent: 110,
        bodyFontSize: 20,
        contentWidth: 'wide',
      }),
    ).rejects.toThrow('WINDOW_PREFERENCES_SAVE_FAILED');
    expect(state.loggerLog).toHaveBeenCalledWith(
      'error',
      'window.preferences.persist.failed',
      expect.any(Object),
    );
  });

  it('blocks shutdown when draft flush or Core shutdown fails, then allows retry', async () => {
    await importMain();
    const window = windowInstance() as {
      listeners: Map<string, (...args: unknown[]) => unknown>;
      show: ReturnType<typeof vi.fn>;
      webContents: { executeJavaScript: ReturnType<typeof vi.fn> };
    };
    state.executeDraftResult = false;
    window.listeners.get('close')?.({ preventDefault: vi.fn() });
    await flush();
    expect(state.supervisorShutdownCall).not.toHaveBeenCalled();
    expect(window.show).toHaveBeenCalled();
    expect(state.loggerLog).toHaveBeenCalledWith(
      'error',
      'draft.autosave.flush.failed',
      expect.any(Object),
    );

    state.executeDraftResult = true;
    state.supervisorShutdown = {
      ok: false,
      errorCode: 'CORE_SHUTDOWN_FAILED',
      diagnosticId: 'shutdown-diagnostic',
    };
    window.listeners.get('close')?.({ preventDefault: vi.fn() });
    await flush();
    expect(state.loggerLog).toHaveBeenCalledWith(
      'error',
      'app.shutdown.blocked',
      expect.any(Object),
    );

    window.webContents.executeJavaScript.mockRejectedValueOnce(new Error('renderer gone'));
    window.listeners.get('close')?.({ preventDefault: vi.fn() });
    await flush();
    expect(state.loggerLog).toHaveBeenCalledWith(
      'error',
      'draft.autosave.flush.failed',
      expect.any(Object),
    );
  });

  it('quits immediately without the single-instance lock and reports bootstrap failure', async () => {
    state.lockOwned = false;
    vi.resetModules();
    await import('../../apps/desktop/main/src/electron-main.js');
    expect(state.appQuit).toHaveBeenCalled();
    expect(state.windows).toHaveLength(0);

    resetState();
    state.supervisorStart = { ok: false, errorCode: 'CORE_START_FAILED' };
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.resetModules();
    await import('../../apps/desktop/main/src/electron-main.js');
    await vi.waitFor(() => expect(state.appQuit).toHaveBeenCalled());
    expect(state.loggerLog).toHaveBeenCalledWith('error', 'app.startup.failed', expect.any(Object));
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('app.startup.failed'));
  });

  it('rejects relative E2E paths before bootstrap', async () => {
    process.env.WORLDFORGE_E2E = '1';
    process.env.WORLDFORGE_E2E_USER_DATA = 'relative/path';
    vi.resetModules();
    await expect(import('../../apps/desktop/main/src/electron-main.js')).rejects.toThrow(
      'WORLDFORGE_E2E_USER_DATA_MUST_BE_ABSOLUTE',
    );
  });
});
