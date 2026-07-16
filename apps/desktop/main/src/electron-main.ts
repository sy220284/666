import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  screen,
  shell,
  utilityProcess,
  type MessagePortMain,
} from 'electron';
import type { AppearancePreferences, WindowPreferences } from '@worldforge/contracts';

import { CoreSupervisor, type UtilityProcessHandle } from './core-supervisor.js';
import { CredentialBroker } from './credential-broker.js';
import { registerIpcHandlers } from './ipc-handlers.js';
import { installNavigationPolicy, type NavigationWebContents } from './navigation-policy.js';
import { createDiagnosticId, PrivacyLogger } from './privacy-logger.js';
import { buildSecureWebPreferences, CONTENT_SECURITY_POLICY } from './security-policy.js';
import {
  captureWindowPreferences,
  restoreWindowPreferences,
  type DisplaySnapshot,
} from './window-state.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const preloadPath = path.resolve(currentDirectory, '../../preload/dist/index.cjs');
const rendererPath = path.resolve(currentDirectory, '../../renderer/dist/index.html');
const rendererUrl = pathToFileURL(rendererPath).toString();
const coreEntryPath = path.resolve(
  currentDirectory,
  '../../../../packages/core-service/dist/utility-entry.js',
);
const developmentAppMigrationsPath = path.resolve(currentDirectory, '../../../../migrations/app');
const developmentProjectMigrationsPath = path.resolve(
  currentDirectory,
  '../../../../migrations/project',
);

if (process.env.WORLDFORGE_E2E === '1' && process.env.WORLDFORGE_E2E_USER_DATA) {
  if (!path.isAbsolute(process.env.WORLDFORGE_E2E_USER_DATA)) {
    throw new Error('WORLDFORGE_E2E_USER_DATA_MUST_BE_ABSOLUTE');
  }
  app.setPath('userData', process.env.WORLDFORGE_E2E_USER_DATA);
}

let mainWindow: BrowserWindow | null = null;
let allowQuit = false;
let shutdownInFlight: Promise<void> | null = null;
let unregisterIpc: (() => void) | null = null;
let startupLogger: PrivacyLogger | null = null;
let startupStage = 'module';

function spawnCore(): UtilityProcessHandle {
  const userDataPath = app.getPath('userData');
  const appMigrationsPath = app.isPackaged
    ? path.join(process.resourcesPath, 'migrations', 'app')
    : developmentAppMigrationsPath;
  const projectMigrationsPath = app.isPackaged
    ? path.join(process.resourcesPath, 'migrations', 'project')
    : developmentProjectMigrationsPath;
  const child = utilityProcess.fork(
    coreEntryPath,
    [
      `--app-database=${path.join(userDataPath, 'app.sqlite')}`,
      `--app-migrations=${appMigrationsPath}`,
      `--project-migrations=${projectMigrationsPath}`,
      `--app-recovery=${path.join(userDataPath, 'recovery', 'app')}`,
      `--app-version=${app.getVersion()}`,
    ],
    {
      serviceName: 'WorldForge Core Service',
    },
  );
  return {
    ...(child.pid ? { pid: child.pid } : {}),
    postMessage: (message, transfer) =>
      child.postMessage(message, transfer ? ([...transfer] as MessagePortMain[]) : undefined),
    onMessage: (listener) => {
      child.on('message', listener);
      return () => child.off('message', listener);
    },
    onExit: (listener) => {
      child.on('exit', listener);
      return () => child.off('exit', listener);
    },
  };
}

function displaySnapshots(): readonly DisplaySnapshot[] {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((display) => ({
    id: String(display.id),
    scaleFactor: display.scaleFactor,
    workArea: {
      x: display.workArea.x,
      y: display.workArea.y,
      width: display.workArea.width,
      height: display.workArea.height,
    },
    primary: display.id === primaryId,
  }));
}

function appearanceOf(preferences: WindowPreferences): AppearancePreferences {
  return {
    workspaceAlignment: preferences.workspaceAlignment,
    uiScalePercent: preferences.uiScalePercent,
    bodyFontSize: preferences.bodyFontSize,
    contentWidth: preferences.contentWidth,
  };
}

function navigationAdapter(window: BrowserWindow): NavigationWebContents {
  return {
    on: (_event, listener) => {
      window.webContents.on('will-navigate', listener);
    },
    setWindowOpenHandler: (handler) => {
      window.webContents.setWindowOpenHandler(handler);
    },
    session: {
      on: (_event, listener) => {
        window.webContents.session.on('will-download', listener);
      },
    },
  };
}

async function bootstrap(): Promise<void> {
  startupStage = 'app-ready';
  await app.whenReady();

  const logger = new PrivacyLogger(path.join(app.getPath('userData'), 'logs'), 'main');
  startupLogger = logger;
  const supervisor = new CoreSupervisor({ spawn: spawnCore, logger });
  const credentialBroker = new CredentialBroker(
    safeStorage,
    path.join(app.getPath('userData'), 'credentials.v1.json'),
  );

  startupStage = 'core-start';
  const coreStart = await supervisor.start();
  if (!coreStart.ok) throw new Error(coreStart.errorCode ?? 'CORE_START_FAILED');

  const loadedPreferences = await supervisor.getWindowPreferences();
  let activeWindowPreferences = restoreWindowPreferences(
    loadedPreferences.ok ? loadedPreferences.preferences : null,
    displaySnapshots(),
  );

  startupStage = 'window-create';
  mainWindow = new BrowserWindow({
    ...activeWindowPreferences.boundsDip,
    minWidth: 720,
    minHeight: 520,
    show: false,
    backgroundColor: '#F5F4F1',
    autoHideMenuBar: true,
    webPreferences: buildSecureWebPreferences(preloadPath, app.isPackaged),
  });
  if (activeWindowPreferences.maximized) mainWindow.maximize();

  let saveTimer: NodeJS.Timeout | undefined;
  let saveChain = Promise.resolve();
  const currentPreferences = (
    appearance: AppearancePreferences = appearanceOf(activeWindowPreferences),
  ): WindowPreferences => {
    const window = mainWindow;
    if (!window) return activeWindowPreferences;
    return captureWindowPreferences(
      window.getNormalBounds(),
      window.isMaximized(),
      displaySnapshots(),
      appearance,
    );
  };
  const persist = (preferences: WindowPreferences): Promise<boolean> => {
    activeWindowPreferences = preferences;
    const operation = saveChain.then(async () => {
      const result = await supervisor.setWindowPreferences(preferences);
      if (result.ok && result.preferences) {
        activeWindowPreferences = result.preferences;
        return true;
      }
      await logger.log('error', 'window.preferences.persist.failed', {
        errorCode: result.ok ? 'COMMON_INTERNAL_999' : result.errorCode,
        processStatus: supervisor.getStatus().status,
      });
      return false;
    });
    saveChain = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  };
  const schedulePersist = (): void => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      void persist(currentPreferences());
    }, 250);
  };
  const flushWindowPreferences = async (): Promise<void> => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = undefined;
    await persist(currentPreferences());
  };
  const updateAppearancePreferences = async (
    appearance: AppearancePreferences,
  ): Promise<WindowPreferences> => {
    const preferences = currentPreferences(appearance);
    if (!(await persist(preferences))) throw new Error('WINDOW_PREFERENCES_SAVE_FAILED');
    return activeWindowPreferences;
  };
  mainWindow.on('move', schedulePersist);
  mainWindow.on('resize', schedulePersist);
  mainWindow.on('maximize', schedulePersist);
  mainWindow.on('unmaximize', schedulePersist);
  const restoreForCurrentDisplays = (): void => {
    const window = mainWindow;
    if (!window) return;
    activeWindowPreferences = restoreWindowPreferences(
      {
        ...activeWindowPreferences,
        boundsDip: window.getNormalBounds(),
        maximized: window.isMaximized(),
      },
      displaySnapshots(),
    );
    window.setBounds(activeWindowPreferences.boundsDip);
    if (activeWindowPreferences.maximized && !window.isMaximized()) window.maximize();
    schedulePersist();
  };
  screen.on('display-added', restoreForCurrentDisplays);
  screen.on('display-removed', restoreForCurrentDisplays);
  screen.on('display-metrics-changed', restoreForCurrentDisplays);

  mainWindow.webContents.session.webRequest.onHeadersReceived(
    { urls: ['file://*/*'] },
    (details, callback) => {
      if (details.url !== rendererUrl) {
        callback(details.responseHeaders ? { responseHeaders: details.responseHeaders } : {});
        return;
      }
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [CONTENT_SECURITY_POLICY],
        },
      });
    },
  );

  startupStage = 'navigation-policy';
  installNavigationPolicy(navigationAdapter(mainWindow), rendererUrl, (url) =>
    shell.openExternal(url),
  );

  startupStage = 'ipc-register';
  const e2eSelection = (name: string): string | null => {
    if (process.env.WORLDFORGE_E2E !== '1') return null;
    const value = process.env[name];
    if (!value) return null;
    if (!path.isAbsolute(value)) throw new Error(`${name}_MUST_BE_ABSOLUTE`);
    return value;
  };
  const chooseDirectory = async (
    title: string,
    buttonLabel: string,
    e2eVariable: string,
  ): Promise<string | null> => {
    const injected = e2eSelection(e2eVariable);
    if (injected) return injected;
    const window = mainWindow;
    if (!window) return null;
    const selection = await dialog.showOpenDialog(window, {
      title,
      buttonLabel,
      properties: ['openDirectory'],
    });
    return selection.canceled ? null : (selection.filePaths[0] ?? null);
  };
  unregisterIpc = registerIpcHandlers({
    ipcMain,
    supervisor,
    credentialBroker,
    rendererUrl,
    version: app.getVersion(),
    platform: process.platform,
    logger,
    getWindowPreferences: () => activeWindowPreferences,
    setAppearancePreferences: updateAppearancePreferences,
    chooseProjectCreateParent: () =>
      chooseDirectory('选择项目保存位置', '在此创建', 'WORLDFORGE_E2E_CREATE_PARENT'),
    chooseProjectToOpen: () =>
      chooseDirectory('打开 WorldForge 项目', '打开项目', 'WORLDFORGE_E2E_OPEN_WORKSPACE'),
    chooseProjectMoveParent: () =>
      chooseDirectory('选择项目的新位置', '移动到这里', 'WORLDFORGE_E2E_MOVE_PARENT'),
    chooseRecentLocation: async () => {
      const window = mainWindow;
      if (!window) return null;
      const selection = await dialog.showOpenDialog(window, {
        title: '重新定位项目文件夹',
        buttonLabel: '选择此文件夹',
        properties: ['openDirectory'],
      });
      return selection.canceled ? null : (selection.filePaths[0] ?? null);
    },
  });

  const gracefulShutdown = (): Promise<void> => {
    if (shutdownInFlight) return shutdownInFlight;
    shutdownInFlight = (async () => {
      await flushWindowPreferences();
      const result = await supervisor.shutdown();
      if (!result.ok) {
        await logger.log('error', 'app.shutdown.blocked', {
          errorCode: result.errorCode ?? 'CORE_SHUTDOWN_FAILED',
          diagnosticId: result.diagnosticId ?? null,
          processStatus: supervisor.getStatus().status,
        });
        mainWindow?.show();
        shutdownInFlight = null;
        return;
      }
      allowQuit = true;
      screen.off('display-added', restoreForCurrentDisplays);
      screen.off('display-removed', restoreForCurrentDisplays);
      screen.off('display-metrics-changed', restoreForCurrentDisplays);
      unregisterIpc?.();
      unregisterIpc = null;
      mainWindow?.destroy();
      mainWindow = null;
      app.quit();
    })();
    return shutdownInFlight;
  };

  mainWindow.on('close', (event) => {
    if (allowQuit) return;
    event.preventDefault();
    void gracefulShutdown();
  });

  app.on('before-quit', (event) => {
    if (allowQuit) return;
    event.preventDefault();
    void gracefulShutdown();
  });

  mainWindow.once('ready-to-show', () => {
    if (process.env.WORLDFORGE_E2E !== '1') mainWindow?.show();
  });

  startupStage = 'renderer-load';
  await mainWindow.loadFile(rendererPath);
  if (!loadedPreferences.ok || loadedPreferences.preferences === null) {
    await persist(currentPreferences());
  }
  startupStage = 'ready';
}

const bypassSingleInstanceLockForTest = !app.isPackaged && process.env.WORLDFORGE_E2E === '1';
const ownsSingleInstanceLock = bypassSingleInstanceLockForTest || app.requestSingleInstanceLock();

if (!ownsSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  void bootstrap().catch(async () => {
    const diagnosticId = createDiagnosticId();
    await startupLogger?.log('error', 'app.startup.failed', {
      operation: startupStage,
      errorCode: 'APP_STARTUP_FAILED',
      diagnosticId,
    });
    process.stderr.write(
      `${JSON.stringify({ event: 'app.startup.failed', operation: startupStage, diagnosticId })}\n`,
    );
    app.quit();
  });
}
