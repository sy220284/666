import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { _electron as electron, expect, test } from '@playwright/test';

const root = process.cwd();

test('mounts the React root without regressing the legacy Electron surface', async () => {
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'worldforge-react-foundation-'));
  const args = [path.join(root, 'apps/desktop/main')];
  if (process.getuid?.() === 0) args.unshift('--no-sandbox');
  const application = await electron.launch({
    args,
    env: {
      ...process.env,
      WORLDFORGE_E2E: '1',
      WORLDFORGE_E2E_USER_DATA: userDataPath,
    },
  });
  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    const foundation = page.locator('[data-react-foundation]');
    await expect(foundation).toHaveCount(1);
    await expect(foundation).toHaveAttribute('data-primary-route', 'home');
    await expect(page.locator('[data-core-status]')).not.toHaveText('正在启动');
    await expect(page.locator('.app-shell')).toBeVisible();
  } finally {
    await application.close();
    await rm(userDataPath, { recursive: true, force: true });
  }
});
