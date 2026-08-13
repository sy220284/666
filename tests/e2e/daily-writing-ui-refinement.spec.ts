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

test('日常写作默认保持安静并按需展开中文工具', async () => {
  test.setTimeout(90_000);
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'worldforge-daily-writing-ui-'));
  temporaryDirectories.push(userDataPath);
  const createParent = path.join(userDataPath, 'works');
  await mkdir(createParent, { recursive: true });
  const application = await launch(userDataPath, createParent);

  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-create-project]').click();
    await page.locator('[data-project-name]').fill('日常写作界面');
    await page.locator('[data-confirm-create-project]').click();

    await expect(page.locator('[data-writing-workbench]')).toBeVisible();
    await expect(page.locator('[data-draft-workspace]')).toBeVisible();
    await expect(page.locator('[data-writing-save-state]')).toBeVisible();
    await expect(page.getByRole('button', { name: '智能助手', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '沉浸写作', exact: true })).toBeVisible();
    await expect(page.locator('[data-draft-editor-controls]')).toBeVisible();
    await expect(page.locator('[data-draft-text-count]')).toBeVisible();
    await expect(page.locator('[data-draft-state]')).toBeVisible();

    const tools = page.locator('[data-draft-tools-menu]');
    await expect(tools).not.toHaveAttribute('open', '');
    await expect(page.locator('[data-set-block-type="paragraph"]')).toBeHidden();
    await tools.locator('summary').click();
    await expect(page.locator('[data-set-block-type="paragraph"]')).toBeVisible();
    await expect(page.locator('[data-toggle-block-lock]')).toBeVisible();
    await tools.locator('summary').click();

    await expect(page.locator('[data-draft-find]')).toHaveCount(0);
    await page.locator('[data-toggle-draft-find]').click();
    await expect(page.locator('[data-draft-find]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-draft-find]')).toHaveCount(0);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+f' : 'Control+f');
    await expect(page.locator('[data-draft-find]')).toBeVisible();
    await page.keyboard.press('Escape');

    const moreActions = page.locator('[data-draft-more-actions]');
    await expect(page.locator('[data-save-draft]')).toBeHidden();
    await moreActions.locator('summary').click();
    await expect(page.getByRole('button', { name: '立即保存', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '复制正文', exact: true })).toBeVisible();
    await moreActions.locator('summary').click();

    const directoryToggle = page.locator('[data-toggle-writing-outline]');
    if ((await directoryToggle.getAttribute('aria-pressed')) !== 'true') {
      await directoryToggle.click();
    }
    await expect(page.locator('.structure-navigator.is-compact')).toBeVisible();
    await expect(page.locator('[data-edit-chapter]')).toHaveCount(0);
    await expect(page.locator('[data-split-chapter]')).toHaveCount(0);
    await expect(page.locator('[data-merge-chapter]')).toHaveCount(0);
    await expect(page.locator('[data-move-blocks]')).toHaveCount(0);
    await expect(page.locator('[data-delete-chapter]')).toHaveCount(0);
    await expect(page.locator('[data-add-chapter]')).toBeVisible();

    const contextToggle = page.locator('[data-toggle-writing-context]');
    if ((await contextToggle.getAttribute('aria-pressed')) !== 'true') {
      await contextToggle.click();
    }
    await expect(page.locator('[data-writing-assistance]')).toBeVisible();
    await expect(
      page.locator('[data-writing-assistance] h3', { hasText: '本章目标' }),
    ).toBeVisible();
    await expect(
      page.locator('[data-writing-assistance] h3', { hasText: '当前场景' }),
    ).toBeVisible();
    await expect(page.getByText(/人物状态（\d+）/u)).toBeVisible();
    await expect(page.getByText(/伏笔与修改任务（\d+）/u)).toBeVisible();

    await page.getByRole('button', { name: '智能助手', exact: true }).first().click();
    await expect(page.locator('[data-candidate-preview-dialog]')).toBeVisible();
    await expect(page.getByRole('heading', { name: '智能创作与建议稿工作台' })).toBeVisible();
    await expect(page.getByText('AI创作与建议稿工作台')).toHaveCount(0);
    await page.getByRole('button', { name: '返回正文', exact: true }).click();

    await page.locator('[data-toggle-focus-mode]').click();
    await expect(page.locator('[data-writing-workbench]')).toHaveAttribute(
      'data-focus-mode',
      'true',
    );
    await expect(page.locator('[data-draft-editor-controls]')).toBeHidden();
    await expect(page.locator('.structure-navigator')).toHaveCount(0);
    await expect(page.locator('[data-writing-assistance]')).toHaveCount(0);
    await expect(page.locator('[data-draft-text-count]')).toBeVisible();
    await expect(page.locator('[data-draft-state]')).toBeVisible();
    await expect(page.getByRole('button', { name: '退出沉浸', exact: true })).toBeVisible();
  } finally {
    await closeGracefully(application);
  }
});
