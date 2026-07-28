import { readFile, rm, writeFile } from 'node:fs/promises';

async function read(path) {
  return readFile(path, 'utf8');
}

async function write(path, content) {
  await writeFile(path, content, 'utf8');
}

function replaceExact(content, before, after, label) {
  const count = content.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, received ${count}`);
  return content.replace(before, after);
}

let handlers = await read('apps/desktop/main/src/ipc-handlers.ts');
handlers = replaceExact(
  handlers,
  `  type AppearancePreferences,
  type WindowPreferences,`,
  `  type AppearancePreferences,
  type DiagnosticPreview,
  type WindowPreferences,`,
  'diagnostic preview type import',
);
handlers = replaceExact(
  handlers,
  `  readonly chooseTextExportDirectory: () => Promise<string | null>;
  readonly chooseDiagnosticsDirectory?: () => Promise<string | null>;`,
  `  readonly chooseTextExportDirectory: () => Promise<string | null>;
  readonly confirmDiagnosticsExport?: (preview: DiagnosticPreview) => Promise<boolean>;
  readonly chooseDiagnosticsDirectory?: () => Promise<string | null>;`,
  'diagnostic confirmation option',
);
handlers = replaceExact(
  handlers,
  `    const targetDirectory = (await options.chooseDiagnosticsDirectory?.()) ?? null;
    if (!targetDirectory) {
      return failure(
        parsed.data.requestId,
        'COMMON_CANCELLED_004',
        'The diagnostic export was cancelled.',
        true,
      );
    }
    try {
      return success(
        parsed.data.requestId,
        await exportDiagnosticPreview(targetDirectory, diagnostics()),
      );`,
  `    const preview = diagnostics();
    const confirmed = (await options.confirmDiagnosticsExport?.(preview)) ?? false;
    if (!confirmed) {
      return failure(
        parsed.data.requestId,
        'COMMON_CANCELLED_004',
        'The diagnostic export was not confirmed in the trusted application shell.',
        true,
      );
    }
    const targetDirectory = (await options.chooseDiagnosticsDirectory?.()) ?? null;
    if (!targetDirectory) {
      return failure(
        parsed.data.requestId,
        'COMMON_CANCELLED_004',
        'The diagnostic export was cancelled.',
        true,
      );
    }
    try {
      return success(
        parsed.data.requestId,
        await exportDiagnosticPreview(targetDirectory, preview),
      );`,
  'trusted diagnostic confirmation',
);
await write('apps/desktop/main/src/ipc-handlers.ts', handlers);

let electronMain = await read('apps/desktop/main/src/electron-main.ts');
electronMain = replaceExact(
  electronMain,
  `import type { AppearancePreferences, WindowPreferences } from '@worldforge/contracts';`,
  `import type {
  AppearancePreferences,
  DiagnosticPreview,
  WindowPreferences,
} from '@worldforge/contracts';`,
  'electron main diagnostic type',
);
electronMain = replaceExact(
  electronMain,
  `  const unregisterBaseIpc = registerIpcHandlers({`,
  `  const confirmDiagnosticsExport = async (preview: DiagnosticPreview): Promise<boolean> => {
    if (process.env.WORLDFORGE_E2E === '1') {
      return process.env.WORLDFORGE_E2E_CONFIRM_DIAGNOSTICS === '1';
    }
    const window = mainWindow;
    if (!window || window.isDestroyed()) return false;
    const result = await dialog.showMessageBox(window, {
      type: 'warning',
      title: '确认导出安全诊断包',
      message: '诊断包只包含下列本机运行元数据，不会自动上传。',
      detail: [
        \`包含：\${preview.manifest.included.join('、')}\`,
        \`明确排除：\${preview.manifest.excluded.join('、')}\`,
      ].join('\\n'),
      buttons: ['取消', '确认导出'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    return result.response === 1;
  };
  const unregisterBaseIpc = registerIpcHandlers({`,
  'native diagnostic confirmation',
);
electronMain = replaceExact(
  electronMain,
  `    chooseDiagnosticsDirectory: () =>
      chooseDirectory('选择诊断包导出位置', '导出诊断包', 'WORLDFORGE_E2E_DIAGNOSTICS_DIRECTORY'),`,
  `    confirmDiagnosticsExport,
    chooseDiagnosticsDirectory: () =>
      chooseDirectory('选择诊断包导出位置', '导出诊断包', 'WORLDFORGE_E2E_DIAGNOSTICS_DIRECTORY'),`,
  'wire diagnostic confirmation',
);
await write('apps/desktop/main/src/electron-main.ts', electronMain);

let electronE2e = await read('tests/e2e/electron-shell.spec.ts');
electronE2e = replaceExact(
  electronE2e,
  `    WORLDFORGE_E2E_CREATE_PARENT: createParent,
    WORLDFORGE_E2E_DIAGNOSTICS_DIRECTORY: diagnosticsDirectory,`,
  `    WORLDFORGE_E2E_CREATE_PARENT: createParent,
    WORLDFORGE_E2E_CONFIRM_DIAGNOSTICS: '1',
    WORLDFORGE_E2E_DIAGNOSTICS_DIRECTORY: diagnosticsDirectory,`,
  'E2E trusted diagnostic confirmation',
);
await write('tests/e2e/electron-shell.spec.ts', electronE2e);

await write(
  'tests/security/diagnostic-ipc-confirmation.test.ts',
  `import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  APP_COMMANDS,
  IPC_CHANNELS,
  PROTOCOL_VERSION,
  type DiagnosticPreview,
  type WindowPreferences,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CoreSupervisor } from '../../apps/desktop/main/src/core-supervisor.js';
import type { CredentialBroker } from '../../apps/desktop/main/src/credential-broker.js';
import { registerIpcHandlers } from '../../apps/desktop/main/src/ipc-handlers.js';
import type { PrivacyLogger } from '../../apps/desktop/main/src/privacy-logger.js';

const directories: string[] = [];
const rendererUrl = 'worldforge-app://renderer/index.html';
const preferences: WindowPreferences = {
  displayId: 'display-1',
  boundsDip: { x: 0, y: 0, width: 1280, height: 800 },
  scaleFactor: 1,
  maximized: false,
  workspaceAlignment: 'center',
  uiScalePercent: 100,
  bodyFontSize: 18,
  contentWidth: 'normal',
};
const command = {
  protocolVersion: PROTOCOL_VERSION,
  requestId: '550e8400-e29b-41d4-a716-446655440000',
  sentAt: '2026-07-28T07:00:00.000Z',
  command: APP_COMMANDS.exportDiagnostics,
  payload: { confirmation: true },
} as const;

function setup(
  confirmDiagnosticsExport: (preview: DiagnosticPreview) => Promise<boolean>,
  chooseDiagnosticsDirectory: () => Promise<string | null>,
) {
  const handlers = new Map<string, (event: IpcMainInvokeEvent, raw: unknown) => unknown>();
  const ipcMain = {
    handle: vi.fn(
      (channel: string, handler: (event: IpcMainInvokeEvent, raw: unknown) => unknown) => {
        handlers.set(channel, handler);
      },
    ),
    removeHandler: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  } as unknown as IpcMain;
  const supervisor = {
    getStatus: vi.fn(() => ({
      status: 'healthy',
      pid: 123,
      restartCount: 0,
      lastErrorCode: null,
      diagnosticId: null,
    })),
    restart: vi.fn(),
    invokeTaskCommand: vi.fn(),
    invokeAppDataOperation: vi.fn(),
    invokeProjectOperation: vi.fn(),
    attachTaskPort: vi.fn(() => ({ ok: true })),
  } as unknown as CoreSupervisor;
  const credentialBroker = {
    store: vi.fn(),
    remove: vi.fn(),
    has: vi.fn(),
  } as unknown as CredentialBroker;

  registerIpcHandlers({
    ipcMain,
    supervisor,
    credentialBroker,
    rendererUrl,
    version: '1.0.0',
    platform: 'test',
    logger: { log: vi.fn() } as unknown as PrivacyLogger,
    getWindowPreferences: () => preferences,
    setAppearancePreferences: vi.fn(async () => preferences),
    confirmDiagnosticsExport,
    chooseDiagnosticsDirectory,
    chooseRecentLocation: vi.fn(async () => null),
    chooseProjectCreateParent: vi.fn(async () => null),
    chooseProjectToOpen: vi.fn(async () => null),
    chooseProjectMoveParent: vi.fn(async () => null),
    chooseRecoveryRestoreParent: vi.fn(async () => null),
    chooseRecoveryExportDirectory: vi.fn(async () => null),
    chooseTextImportFile: vi.fn(async () => null),
    chooseTextExportDirectory: vi.fn(async () => null),
  });

  const handler = handlers.get(IPC_CHANNELS.appExportDiagnostics);
  if (!handler) throw new Error('Diagnostic export handler was not registered');
  return handler;
}

const trustedEvent = {
  senderFrame: { url: rendererUrl },
} as unknown as IpcMainInvokeEvent;

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('trusted diagnostic IPC confirmation', () => {
  it('stops before directory selection when Main confirmation is denied', async () => {
    const confirm = vi.fn(async () => false);
    const chooseDirectory = vi.fn(async () => '/should/not/be/used');
    const handler = setup(confirm, chooseDirectory);

    await expect(handler(trustedEvent, command)).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_CANCELLED_004' },
    });
    expect(confirm).toHaveBeenCalledOnce();
    expect(chooseDirectory).not.toHaveBeenCalled();
  });

  it('exports the exact confirmed allowlist preview after Main approval', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'worldforge-diagnostic-ipc-'));
    directories.push(directory);
    let confirmedPreview: DiagnosticPreview | null = null;
    const handler = setup(
      vi.fn(async (preview) => {
        confirmedPreview = preview;
        return true;
      }),
      vi.fn(async () => directory),
    );

    await expect(handler(trustedEvent, command)).resolves.toMatchObject({ ok: true });
    expect(confirmedPreview?.manifest.contentIncluded).toBe(false);
    expect(confirmedPreview?.manifest.credentialIncluded).toBe(false);
    const files = await readdir(directory);
    expect(files).toHaveLength(1);
    const content = await readFile(join(directory, files[0]!), 'utf8');
    expect(content).toContain('project-content');
    expect(content).not.toContain('workspacePath');
    expect(content).not.toContain('credentialRef');
  });
});
`,
);

await rm('scripts/m8-02-diagnostic-confirmation-codemod.mjs');
await rm('.github/workflows/m8-02-diagnostic-confirmation-codemod.yml');
