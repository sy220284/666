import { readFile } from 'node:fs/promises';

import {
  CentralBridgeCommandSchema,
  PROTOCOL_VERSION,
  RegisteredCommandSchema,
} from '@worldforge/contracts';
import { describe, expect, it, vi } from 'vitest';

import { createIpcHandlerContext } from '../../apps/desktop/main/src/handler-guard.js';
import { contractInput, strictTestDouble } from '../testkit/strict-test-doubles.js';

const mainRoot = 'apps/desktop/main/src';
const preloadRoot = 'apps/desktop/preload/src';
const requestId = '00000000-0000-4000-8000-000000000001';

type HandlerOptions = Parameters<typeof createIpcHandlerContext>[0];
type Handler = (event: unknown, raw: unknown) => unknown;

const specialtyMainIpcFiles = [
  'candidate-preview-ipc.ts',
  'generation-ipc.ts',
  'continuity-ipc.ts',
  'narrative-planning-ipc.ts',
] as const;

const specialtyPreloadFiles = [
  'continuity-bridge.ts',
  'narrative-planning-bridge.ts',
  'state-proposal-bridge.ts',
  'validation-bridge.ts',
  'search-tools-bridge.ts',
  'rhythm-bridge.ts',
  'entry.ts',
] as const;

function createUnexpectedHandler(loggerRejects: boolean): Handler {
  const handlers = new Map<string, Handler>();
  const ipcMain = strictTestDouble(
    'IpcMain',
    contractInput<Partial<HandlerOptions['ipcMain']>>({
      handle: vi.fn((channel: string, handler: Handler) => handlers.set(channel, handler)),
      removeHandler: vi.fn(),
    }),
  );
  const context = createIpcHandlerContext({
    ipcMain,
    supervisor: strictTestDouble(
      'CoreSupervisor',
      contractInput<Partial<HandlerOptions['supervisor']>>({}),
    ),
    credentialBroker: strictTestDouble(
      'CredentialBroker',
      contractInput<Partial<HandlerOptions['credentialBroker']>>({}),
    ),
    rendererUrl: 'file:///renderer.html',
    version: '1.0.0',
    platform: 'test',
    logger: strictTestDouble(
      'PrivacyLogger',
      contractInput<Partial<HandlerOptions['logger']>>({
        log: vi.fn(async () => {
          if (loggerRejects) throw new Error('LOGGER_FAILURE');
        }),
      }),
    ),
    getWindowPreferences: () => ({
      workspaceAlignment: 'center',
      uiScalePercent: 100,
      bodyFontSize: 18,
      contentWidth: 'normal',
      displayId: 'primary',
      boundsDip: { x: 0, y: 0, width: 1_280, height: 800 },
      scaleFactor: 1,
      maximized: false,
    }),
    setAppearancePreferences: vi.fn(async (preferences) => ({
      ...preferences,
      displayId: 'primary',
      boundsDip: { x: 0, y: 0, width: 1_280, height: 800 },
      scaleFactor: 1,
      maximized: false,
    })),
    chooseRecentLocation: vi.fn(async () => null),
    chooseProjectCreateParent: vi.fn(async () => null),
    chooseProjectToOpen: vi.fn(async () => null),
    chooseProjectMoveParent: vi.fn(async () => null),
    chooseRecoveryRestoreParent: vi.fn(async () => null),
    chooseRecoveryExportDirectory: vi.fn(async () => null),
    chooseTextImportFile: vi.fn(async () => null),
    chooseTextExportDirectory: vi.fn(async () => null),
  });
  context.register('worldforge:test:unexpected', async () => {
    throw new Error('UNEXPECTED_HANDLER_FAILURE');
  });
  const handler = handlers.get('worldforge:test:unexpected');
  if (!handler) throw new Error('TEST_HANDLER_MISSING');
  return handler;
}

describe('M10-03 IPC and protocol maintenance', () => {
  it('routes specialty Main IPC registration through the shared unexpected-exception guard', async () => {
    const [root, guard, ...specialtySources] = await Promise.all([
      readFile(`${mainRoot}/ipc-handlers.ts`, 'utf8'),
      readFile(`${mainRoot}/handler-guard.ts`, 'utf8'),
      ...specialtyMainIpcFiles.map((file) => readFile(`${mainRoot}/${file}`, 'utf8')),
    ]);

    expect(root).toContain('installIpcInvokeGuard(options.ipcMain, context.register)');
    expect(root).toContain('guardedProviderIpcMain');
    expect(root).toContain('registerProviderIpcHandlers({');
    expect(root).toContain('ipcMain: guardedProviderIpcMain');
    expect(guard).toContain('registerIpcInvokeHandler');
    expect(guard).toContain("'COMMON_INTERNAL_999'");
    expect(guard).toContain('createDiagnosticId()');

    for (const source of specialtySources) {
      expect(source).toContain('registerIpcInvokeHandler');
      expect(source).not.toContain('options.ipcMain.handle(');
    }
  });

  it.each([false, true])(
    'converts unknown handler failures when logger rejection is %s',
    async (loggerRejects) => {
      const handler = createUnexpectedHandler(loggerRejects);
      await expect(
        handler({ senderFrame: { url: 'file:///renderer.html' } }, { requestId }),
      ).resolves.toMatchObject({
        ok: false,
        requestId,
        error: {
          code: 'COMMON_INTERNAL_999',
          retryable: true,
          diagnosticId: expect.stringMatching(/^diag_/u),
          userAction: '请重试；若问题持续，请导出诊断包。',
        },
      });
    },
  );

  it('keeps protocol envelope creation, invoke and result parsing in bridge-runtime', async () => {
    const runtime = await readFile(`${preloadRoot}/bridge-runtime.ts`, 'utf8');
    const specialtySources = await Promise.all(
      specialtyPreloadFiles.map((file) => readFile(`${preloadRoot}/${file}`, 'utf8')),
    );

    expect(runtime).toContain('export async function invokeCommand');
    expect(runtime).toContain('protocolVersion: PROTOCOL_VERSION');
    expect(runtime).toContain('requestId');
    expect(runtime).toContain('sentAt: new Date().toISOString()');
    expect(runtime).toContain('ipcRenderer.invoke');

    for (const source of specialtySources) {
      expect(source).toContain("from './bridge-runtime.js'");
      expect(source).toContain('invokeCommand');
      expect(source).not.toContain('ipcRenderer');
      expect(source).not.toContain('PROTOCOL_VERSION');
      expect(source).not.toContain('sentAt: new Date().toISOString()');
    }
  });

  it('uses an accurately named central bridge registry and retains one V1 alias', async () => {
    const registrySource = await readFile('packages/contracts/src/protocol-registry.ts', 'utf8');
    expect(registrySource).toContain('export const CentralBridgeCommandSchema');
    expect(registrySource).toContain('RegisteredCommandSchema = CentralBridgeCommandSchema');
    expect(RegisteredCommandSchema).toBe(CentralBridgeCommandSchema);
    expect(
      CentralBridgeCommandSchema.safeParse({
        protocolVersion: PROTOCOL_VERSION,
        requestId,
        command: 'continuity.list',
        payload: {},
        sentAt: '2026-08-04T03:02:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('keeps frozen decisions and stable execution-entry rules synchronized', async () => {
    const [decisions, executionEntry] = await Promise.all([
      readFile('docs/decisions/IMPLEMENTATION_DECISIONS.md', 'utf8'),
      readFile('docs/PROJECT_EXECUTION_ENTRY.md', 'utf8'),
    ]);

    expect(decisions).toContain("type: 'set-lock'");
    expect(decisions).toContain('locked: boolean');
    expect(decisions).toContain('校验`expectedHash`');
    expect(executionEntry).toContain('M10-02全量审计矩阵');
    expect(executionEntry).toContain('ca83d48c7493bba21252a37f9aec024d6aa0ca79');
    expect(executionEntry).toContain('本文件不固化活动PR、瞬时任务状态或“最新提交SHA”');
    expect(executionEntry).toContain('task-verification/<TASK-ID>=success');
    expect(executionEntry).toContain('work受控同步后与main完全一致');
  });
});
