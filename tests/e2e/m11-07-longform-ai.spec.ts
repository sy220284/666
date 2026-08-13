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

test('长篇作者可用命令面板进入生成，并管理记忆、文风和任务分配', async () => {
  test.setTimeout(90_000);
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'worldforge-m11-07-longform-'));
  temporaryDirectories.push(userDataPath);
  const createParent = path.join(userDataPath, 'works');
  await mkdir(createParent, { recursive: true });
  const application = await launch(userDataPath, createParent);

  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-create-project]').click();
    await page.locator('[data-project-name]').fill('长篇智能底座验收');
    await page.locator('[data-confirm-create-project]').click();
    await expect(page.locator('[data-writing-workbench]')).toBeVisible();

    const shortcut = process.platform === 'darwin' ? 'Meta+k' : 'Control+k';
    await page.keyboard.press(shortcut);
    const palette = page.locator('[data-command-palette]');
    await expect(palette).toBeVisible();
    await expect(palette.getByRole('button', { name: /规划这一章/u })).toBeVisible();
    await expect(palette.getByRole('button', { name: /生成这一章/u })).toBeVisible();
    await expect(palette.getByRole('button', { name: /改写选中内容/u })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(palette).toHaveCount(0);
    await expect(page.locator('[data-open-command-palette]')).toBeFocused();

    await page.keyboard.press(shortcut);
    await palette.getByRole('button', { name: /生成这一章/u }).click();
    const studio = page.locator('[data-generation-studio]');
    await expect(studio).toBeVisible();
    await expect(
      studio.locator('[data-generation-primary-actions]').getByRole('button', {
        name: '生成这一章',
        exact: true,
      }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(studio.locator('[data-generation-advanced-settings]')).not.toHaveAttribute(
      'open',
      '',
    );
    await studio.locator('[data-generation-advanced-settings] summary').click();
    await expect(studio.locator('[data-generation-provider]')).toContainText('按任务自动选择');
    await expect(studio.locator('[data-generation-mode]')).toHaveValue('chapter');

    await page.locator('[data-open-settings]').click();
    await page.locator('[data-settings-navigation="longform"]').click();
    const longform = page.locator('[data-settings-section="longform"]');
    await expect(longform).toBeVisible();
    await expect(longform).toContainText('长篇记忆');
    await expect(longform).toContainText('文风档案');
    await expect(longform).toContainText('智能任务分配');
    await expect(longform).not.toContainText('sourceHash');
    await expect(longform).not.toContainText('semanticRevision');

    await longform.getByRole('button', { name: '使用“克制叙事”预设' }).click();
    await longform.locator('[data-save-longform-settings]').click();
    await expect(longform.getByRole('status')).toContainText('已保存');
    await expect(longform.locator('[data-active-style-profile]')).toContainText('克制叙事');
    await expect(longform.getByText('规划这一章', { exact: true })).toBeVisible();
    await expect(longform.getByText('生成这一章', { exact: true })).toBeVisible();
    await expect(longform.getByText('改写选中内容', { exact: true })).toBeVisible();
  } finally {
    await closeGracefully(application);
  }
});
