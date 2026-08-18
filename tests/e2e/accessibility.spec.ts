import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

import { assertAccessibleSurface } from './accessibility-audit.js';

const root = process.cwd();
const temporaryDirectories: string[] = [];

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
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test('Phase 3 accessibility scan covers home, modal focus, writing and Theme B variants', async () => {
  test.setTimeout(240_000);
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'worldforge-accessibility-'));
  temporaryDirectories.push(userDataPath);
  const createParent = path.join(userDataPath, 'works');
  await mkdir(createParent, { recursive: true });
  const application = await launch(userDataPath, createParent);

  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');

    await assertAccessibleSurface(page, 'home');

    const createTrigger = page.locator('[data-create-project]');
    await createTrigger.click();
    const dialog = page.locator('[data-create-project-dialog] [role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAccessibleName(/\S/u);
    await expect(dialog.locator(':focus')).toHaveCount(1);
    await assertAccessibleSurface(page, 'create-project-dialog');

    for (let index = 0; index < 12; index += 1) {
      await page.keyboard.press('Tab');
      expect(
        await dialog.evaluate((element) => element.contains(document.activeElement)),
        `create-project-dialog: Tab step ${index + 1} must stay inside modal`,
      ).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(createTrigger).toBeFocused();

    await createTrigger.click();
    await page.locator('[data-project-name]').fill('Phase 3无障碍验收');
    await page.locator('[data-confirm-create-project]').click();
    const writingWorkbench = page.locator('[data-writing-workbench]');
    await expect(writingWorkbench).toBeVisible();
    await assertAccessibleSurface(page, 'writing-workspace');

    for (const variant of ['eye-care', 'high-contrast'] as const) {
      await page.locator('[data-open-settings]').click();
      await expect(page.locator('[data-settings-dialog]')).toBeVisible();
      await page.locator('[data-settings-navigation="appearance"]').click();
      await page.locator('[data-theme-id]').selectOption('theme-b');
      await page.locator('[data-theme-variant]').selectOption(variant);
      await page.locator('input[data-theme-seal-text="true"]').fill('落笔生花');
      await page.locator('[data-save-appearance]').click();
      await expect(page.locator('body')).toHaveAttribute('data-theme', 'theme-b');
      await expect(page.locator('body')).toHaveAttribute('data-visual-theme-variant', variant);
      await assertAccessibleSurface(page, `theme-b-${variant}-settings`);

      await page.locator('[data-close-settings]').click();
      await expect(writingWorkbench).toBeVisible();
      await assertAccessibleSurface(page, `theme-b-${variant}-writing`);
    }
  } finally {
    await closeGracefully(application);
  }
});
