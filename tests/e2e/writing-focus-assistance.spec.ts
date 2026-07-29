import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

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
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

test('写作辅助读取真实数据，沉浸写作不重建编辑器或丢失选区', async () => {
  test.setTimeout(90_000);
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'worldforge-focus-e2e-'));
  temporaryDirectories.push(userDataPath);
  const createParent = path.join(userDataPath, 'projects');
  await mkdir(createParent, { recursive: true });
  const application = await launch(userDataPath, createParent);

  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-onboarding-entry="quick"]').click();
    await page.locator('[data-project-name]').fill('沉浸写作验证');
    await page.locator('[data-confirm-create-project]').click();

    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open');
    await expect(page.locator('[data-writing-workbench]')).toBeVisible();
    await expect(page.locator('[data-writing-assistance]')).toBeVisible();
    await expect(page.locator('[data-writing-assistance-status]')).not.toContainText(
      '正在汇总本章规划与前后文',
    );

    const editor = page.locator('.worldforge-editor');
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.insertText('沉浸写作保留选区与未保存输入');
    await expect(editor).toContainText('沉浸写作保留选区与未保存输入');
    await expect(page.locator('[data-draft-state]')).toContainText(/等待自动保存|正在自动保存|已保存/u);

    const selectedText = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('.worldforge-editor');
      if (!root) throw new Error('E2E_EDITOR_MISSING');
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const textNode = walker.nextNode();
      if (!textNode?.textContent) throw new Error('E2E_EDITOR_TEXT_MISSING');
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, Math.min(4, textNode.textContent.length));
      const selection = globalThis.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      root.focus();
      document.dispatchEvent(new Event('selectionchange'));
      (globalThis as typeof globalThis & { __m804Editor?: HTMLElement }).__m804Editor = root;
      return selection?.toString() ?? '';
    });
    expect(selectedText).toBe('沉浸写作');

    await page.locator('[data-toggle-focus-mode]').click();
    await expect(page.locator('[data-writing-workbench]')).toHaveAttribute('data-focus-mode', 'true');
    await expect(page.locator('[data-toggle-focus-mode]')).toHaveText('退出沉浸');
    await expect(page.locator('[data-back-project]')).toBeHidden();
    await expect(page.locator('.draft-toolbar')).toBeHidden();
    await expect(page.locator('.draft-find')).toBeHidden();
    await expect(page.locator('.structure-navigator')).toHaveCount(0);
    await expect(page.locator('[data-writing-assistance]')).toHaveCount(0);
    await expect(page.locator('[data-draft-text-count]')).toBeVisible();
    await expect(page.locator('[data-draft-state]')).toBeVisible();
    await expect(editor).toContainText('沉浸写作保留选区与未保存输入');
    expect(
      await page.evaluate(
        () =>
          (globalThis as typeof globalThis & { __m804Editor?: HTMLElement }).__m804Editor ===
          document.querySelector('.worldforge-editor'),
      ),
    ).toBe(true);
    await expect
      .poll(() => page.evaluate(() => globalThis.getSelection()?.toString() ?? ''))
      .toBe(selectedText);

    await page.locator('[data-toggle-focus-mode]').click();
    await expect(page.locator('[data-writing-workbench]')).toHaveAttribute('data-focus-mode', 'false');
    await expect(page.locator('[data-writing-assistance]')).toBeVisible();
    await expect(page.locator('.structure-navigator')).toBeVisible();
    await expect(editor).toContainText('沉浸写作保留选区与未保存输入');
    expect(
      await page.evaluate(
        () =>
          (globalThis as typeof globalThis & { __m804Editor?: HTMLElement }).__m804Editor ===
          document.querySelector('.worldforge-editor'),
      ),
    ).toBe(true);
    await expect
      .poll(() => page.evaluate(() => globalThis.getSelection()?.toString() ?? ''))
      .toBe(selectedText);
  } finally {
    await closeGracefully(application);
  }
});
