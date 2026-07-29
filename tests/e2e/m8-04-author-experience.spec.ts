import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

const temporaryDirectories: string[] = [];
const root = process.cwd();

async function launch(userDataPath: string, createParent: string): Promise<ElectronApplication> {
  const args: string[] = [];
  if (process.getuid?.() === 0) args.push('--no-sandbox');
  args.push(path.join(root, 'apps/desktop/main'));
  return electron.launch({
    args,
    env: {
      ...process.env,
      WORLDFORGE_E2E: '1',
      WORLDFORGE_E2E_USER_DATA: userDataPath,
      WORLDFORGE_E2E_CREATE_PARENT: createParent,
    },
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

test('快速开始只填写作品名称并直接进入正文', async () => {
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'worldforge-m8-04-quick-create-'));
  temporaryDirectories.push(userDataPath);
  const createParent = path.join(userDataPath, 'works');
  await mkdir(createParent, { recursive: true });
  const application = await launch(userDataPath, createParent);

  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');

    await page.locator('[data-create-project]').click();
    const dialog = page.locator('[data-create-project-dialog]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-project-name]')).toBeVisible();
    await expect(dialog.locator('[data-project-channel]')).toHaveCount(0);
    await expect(dialog.locator('[data-project-initial-structure]')).toHaveCount(0);
    await expect(dialog.locator('[data-complete-story-fields]')).toHaveCount(0);
    await expect(dialog.locator('select[name="creativePath"]')).toHaveCount(0);
    await expect(dialog.locator('[data-confirm-create-project]')).toHaveText('选择位置并创建作品');

    await dialog.locator('[data-project-name]').fill('快速开始作品');
    await dialog.locator('[data-confirm-create-project]').click();

    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open');
    await expect(page.locator('[data-writing-workbench]')).toBeVisible();
    await expect(page.locator('[data-draft-workspace]')).toBeVisible();
  } finally {
    await closeGracefully(application);
  }
});
