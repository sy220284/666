import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

import {
  loadVisualBaselineManifest,
  verifyVisualSnapshot,
  type VisualBaselineManifest,
} from './visual-regression-baseline.js';

const root = process.cwd();
const temporaryDirectories: string[] = [];

type ThemeId = 'theme-a' | 'theme-b';
type ThemeVariant = 'light' | 'dark';

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

async function setViewport(application: ElectronApplication): Promise<void> {
  await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) throw new Error('VISUAL_REGRESSION_WINDOW_MISSING');
    if (window.isMaximized()) window.unmaximize();
    window.setPosition(0, 0, false);
    window.setContentSize(1280, 800, false);
  });
}

async function applyTheme(page: Page, themeId: ThemeId, variant: ThemeVariant): Promise<void> {
  await page.locator('[data-open-settings]').click();
  await expect(page.locator('[data-settings-dialog]')).toBeVisible();
  await page.locator('[data-settings-navigation="appearance"]').click();
  await page.locator('[data-theme-id]').selectOption(themeId);
  await page.locator('[data-theme-variant]').selectOption(variant);
  await page.locator('[data-save-settings]').click();
  await expect(page.locator('[data-settings-status]')).toHaveText('显示设置已保存到应用数据库。');
  await expect(page.locator('body')).toHaveAttribute('data-theme', themeId);
  await expect(page.locator('body')).toHaveAttribute('data-visual-theme-variant', variant);
  await page.locator('[data-close-settings]').click();
  await expect(page.locator('[data-writing-workbench]')).toBeVisible();
  await expect(page.locator('.structure-chapter-title strong')).toBeVisible();
}

async function expectBaseline(
  page: Page,
  manifest: VisualBaselineManifest,
  snapshotName: string,
): Promise<void> {
  const image = await page.screenshot({
    animations: 'disabled',
    fullPage: false,
    scale: 'device',
  });
  try {
    verifyVisualSnapshot(manifest, snapshotName, image);
  } catch (error) {
    const outputRoot = process.env.WORLDFORGE_E2E_OUTPUT_DIR ?? 'test-results/electron';
    const outputDirectory = path.join(outputRoot, 'visual-regression');
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(path.join(outputDirectory, `${snapshotName}.actual.png`), image);
    throw error;
  }
}

test.afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

if (process.platform === 'linux') {
  test('Phase 3 Linux 1280×800四主题视觉基线', async () => {
    test.setTimeout(180_000);
    const manifest = await loadVisualBaselineManifest(root);
    expect(manifest.baselines).toHaveLength(4);

    const userDataPath = await mkdtemp(path.join(tmpdir(), 'worldforge-visual-regression-'));
    temporaryDirectories.push(userDataPath);
    const createParent = path.join(userDataPath, 'works');
    await mkdir(createParent, { recursive: true });
    const application = await launch(userDataPath, createParent);

    try {
      const page = await application.firstWindow();
      await setViewport(application);
      await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');

      await page.locator('[data-create-project]').click();
      await page.locator('[data-project-name]').fill('M8-07中文体验验收');
      await page.locator('[data-confirm-create-project]').click();
      await expect(page.locator('[data-writing-workbench]')).toBeVisible();
      await expect(page.locator('body')).toHaveAttribute('data-author-mode', 'beginner');

      const editor = page.locator('[data-draft-content]');
      await editor.click();
      await page.keyboard.insertText('清河落雨，檐下灯火映着未写完的故事。');
      await page.locator('[data-draft-more-actions] > summary').click();
      await page.locator('[data-save-draft]').click();
      await expect(page.locator('[data-draft-state]')).toHaveText('已手动保存');
      await expect(page.locator('[data-draft-state]')).not.toContainText('保存序号');
      await expect(page.locator('.structure-chapter-title strong')).toBeVisible();

      await expectBaseline(page, manifest, 'theme-a-light-1280x800.png');
      await applyTheme(page, 'theme-a', 'dark');
      await expectBaseline(page, manifest, 'theme-a-dark-1280x800.png');
      await applyTheme(page, 'theme-b', 'light');
      await expectBaseline(page, manifest, 'theme-b-light-1280x800.png');
      await applyTheme(page, 'theme-b', 'dark');
      await expectBaseline(page, manifest, 'theme-b-dark-1280x800.png');
    } finally {
      await closeGracefully(application);
    }
  });
}
