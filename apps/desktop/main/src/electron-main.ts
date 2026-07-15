import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { app, BrowserWindow, ipcMain, safeStorage, shell, utilityProcess } from 'electron';

import { CoreSupervisor, type UtilityProcessHandle } from './core-supervisor.js';
import { CredentialBroker } from './credential-broker.js';
import { registerIpcHandlers } from './ipc-handlers.js';
import { installNavigationPolicy, type NavigationWebContents } from './navigation-policy.js';
import { createDiagnosticId, PrivacyLogger } from './privacy-logger.js';
import { buildSecureWebPreferences, CONTENT_SECURITY_POLICY } from './security-policy.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const preloadPath = path.resolve(currentDirectory, '../../preload/dist/index.cjs');
const rendererPath = path.resolve(currentDirectory, '../../renderer/dist/index.html');
const rendererUrl = pathToFileURL(rendererPath).toString();
const coreEntryPath = path.resolve(
  currentDirectory,
  '../../../../packages/core-service/dist/utility-entry.js',
);

let mainWindow: BrowserWindow | null = null;
let allowQuit = false;
let shutdownInFlight: Promise<void> | null = null;
let unregisterIpc: (() => void) | null = null;
let startupLogger: PrivacyLogger | null = null;
let startupStage = 'module';

function spawnCore(): UtilityProcessHandle {
  const child = utilityProcess.fork(coreEntryPath, [], {
    serviceName: 'WorldForge Core Service',
  });
  return {
    ...(child.pid ? { pid: child.pid } : {}),
    postMessage: (message) => child.postMessage(message),
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
  await supervisor.start();

  startupStage = 'window-create';
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 720,
    minHeight: 520,
    show: false,
    backgroundColor: '#111318',
    autoHideMenuBar: true,
    webPreferences: buildSecureWebPreferences(preloadPath, app.isPackaged),
  });

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
  unregisterIpc = registerIpcHandlers({
    ipcMain,
    supervisor,
    credentialBroker,
    rendererUrl,
    version: app.getVersion(),
    platform: process.platform,
    logger,
  });

  const gracefulShutdown = (): Promise<void> => {
    if (shutdownInFlight) return shutdownInFlight;
    shutdownInFlight = (async () => {
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
