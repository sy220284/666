import path from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';
import type { WorldforgeBridge } from '@worldforge/contracts';

test('runs a sandboxed renderer against a healthy supervised Core', async () => {
  const root = process.cwd();
  const electronArguments = [path.join(root, 'apps/desktop/main')];
  if (process.getuid?.() === 0) electronArguments.unshift('--no-sandbox');

  const electronApplication = await electron.launch({
    args: electronArguments,
    env: { ...process.env, WORLDFORGE_E2E: '1' },
  });

  try {
    const window = await electronApplication.firstWindow();
    await expect(window).toHaveTitle('WorldForge');

    const runtime = await window.evaluate(async () => {
      const globals = globalThis as unknown as Record<string, unknown>;
      const bridge = (globalThis as unknown as { readonly worldforge: WorldforgeBridge })
        .worldforge;
      const status = await bridge.app.getCoreStatus();
      return {
        hasRequire: typeof globals.require !== 'undefined',
        hasProcess: typeof globals.process !== 'undefined',
        hasBridge: Boolean(bridge.app && bridge.ai),
        status: status.ok ? status.data.status : status.error.code,
        csp: document
          .querySelector('meta[http-equiv="Content-Security-Policy"]')
          ?.getAttribute('content'),
      };
    });

    expect(runtime).toMatchObject({
      hasRequire: false,
      hasProcess: false,
      hasBridge: true,
      status: 'healthy',
    });
    expect(runtime.csp).toContain("default-src 'none'");
    expect(runtime.csp).not.toContain('unsafe-eval');

    const preferences = await electronApplication.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const values = window?.webContents.getLastWebPreferences();
      return {
        nodeIntegration: values?.nodeIntegration,
        contextIsolation: values?.contextIsolation,
        sandbox: values?.sandbox,
        webSecurity: values?.webSecurity,
      };
    });
    expect(preferences).toEqual({
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    });

    const windowCount = electronApplication.windows().length;
    expect(windowCount).toBe(1);
  } finally {
    await electronApplication.close();
  }
});
