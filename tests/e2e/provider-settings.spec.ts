import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

const temporaryDirectories: string[] = [];

async function launch(): Promise<ElectronApplication> {
  const userData = await mkdtemp(path.join(tmpdir(), 'worldforge-provider-e2e-'));
  temporaryDirectories.push(userData);
  const args = [];
  if (process.getuid?.() === 0) args.push('--no-sandbox');
  args.push(path.join(process.cwd(), 'apps/desktop/main'));
  return electron.launch({
    args,
    env: { ...process.env, WORLDFORGE_E2E: '1', WORLDFORGE_E2E_USER_DATA: userData },
  });
}

async function closeGracefully(application: ElectronApplication): Promise<void> {
  const closed = application.waitForEvent('close');
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  await closed;
}

test.afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

test('configures a local keyless Provider and keeps offline writing healthy after a safe connection failure', async () => {
  const application = await launch();
  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-open-settings]').click();
    await page.locator('[data-settings-navigation="providers"]').click();
    await expect(page.locator('[data-provider-settings]')).toBeVisible();
    await page.locator('details.provider-advanced-settings > summary').click();
    await page.locator('[data-provider-id]').fill('local-e2e');
    await page.locator('[data-provider-name]').fill('本地E2E模型');
    await page.locator('[data-provider-model]').fill('writer-model');
    await page.locator('[data-provider-base-url]').fill('http://127.0.0.1:65530/v1');
    await page.locator('[data-provider-save]').click();
    await expect(page.locator('[data-provider-card="local-e2e"]')).toBeVisible();
    await expect(page.locator('[data-provider-status]')).toContainText('已保存');
    await page.locator('[data-provider-test="local-e2e"]').click();
    await expect(page.locator('[data-provider-status]')).toContainText('无法连接智能服务');
    const core = await page.evaluate(async () => globalThis.worldforge.app.getCoreStatus());
    expect(core).toMatchObject({ ok: true, data: { status: 'healthy' } });
    await expect(page.locator('[data-provider-card="local-e2e"]')).toBeVisible();
  } finally {
    await closeGracefully(application);
  }
});
