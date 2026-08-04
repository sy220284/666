import { readFile } from 'node:fs/promises';

import {
  CentralBridgeCommandSchema,
  PROTOCOL_VERSION,
  RegisteredCommandSchema,
} from '@worldforge/contracts';
import { describe, expect, it } from 'vitest';

const mainRoot = 'apps/desktop/main/src';
const preloadRoot = 'apps/desktop/preload/src';

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

  it('provides a scope-accurate central bridge schema name while preserving compatibility', () => {
    expect(CentralBridgeCommandSchema).toBe(RegisteredCommandSchema);
    expect(
      CentralBridgeCommandSchema.safeParse({
        protocolVersion: PROTOCOL_VERSION,
        requestId: '00000000-0000-4000-8000-000000000001',
        command: 'continuity.list',
        payload: {},
        sentAt: '2026-08-04T03:02:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('keeps frozen decisions and the execution entry synchronized with the real baseline', async () => {
    const [decisions, executionEntry] = await Promise.all([
      readFile('docs/decisions/IMPLEMENTATION_DECISIONS.md', 'utf8'),
      readFile('docs/PROJECT_EXECUTION_ENTRY.md', 'utf8'),
    ]);

    expect(decisions).toContain("type: 'set-lock'");
    expect(decisions).toContain('locked: boolean');
    expect(decisions).toContain('校验`expectedHash`');
    expect(executionEntry).toContain('M10-02全量代码审计与完整矩阵基线');
    expect(executionEntry).toContain('bb415f3da773160928efda20b877083b321601a0');
    expect(executionEntry).toContain('M10-03 IPC与协议维护治理');
  });
});
