import { createHash } from 'node:crypto';
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
  readPngDimensions,
  verifyVisualSnapshot,
  type VisualBaselineManifest,
} from './visual-regression-baseline.js';

const root = process.cwd();
const visualWorkspaceRoot = path.join(root, 'test-results', 'visual-regression-fixture');
const temporaryDirectories: string[] = [];

type ThemeId = 'theme-a' | 'theme-b';
type ThemeVariant = 'light' | 'dark';

interface VisualMismatch {
  readonly snapshotName: string;
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
  readonly error: string;
}

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

async function stabilizeSnapshot(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelectorAll<HTMLElement>('*').forEach((element) => {
      if (element.scrollTop !== 0) element.scrollTop = 0;
      if (element.scrollLeft !== 0) element.scrollLeft = 0;
    });
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await page.waitForTimeout(200);
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
  await expect(page.locator('[data-settings-dialog]')).toBeHidden();
  await expect(page.locator('[data-open-settings]')).toBeFocused();
  await page.mouse.move(1, 1);
  await expect(page.locator('[data-writing-workbench]')).toBeVisible();
  await expect(page.locator('.structure-chapter-title strong')).toBeVisible();
}

async function expectBaseline(
  page: Page,
  manifest: VisualBaselineManifest,
  snapshotName: string,
): Promise<VisualMismatch | null> {
  await stabilizeSnapshot(page);
  const image = await page.screenshot({
    animations: 'disabled',
    fullPage: false,
    scale: 'device',
  });
  try {
    verifyVisualSnapshot(manifest, snapshotName, image);
    return null;
  } catch (error) {
    const outputRoot = process.env.WORLDFORGE_E2E_OUTPUT_DIR ?? 'test-results/electron';
    const outputDirectory = path.join(outputRoot, 'visual-regression');
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(path.join(outputDirectory, `${snapshotName}.actual.png`), image);
    const dimensions = readPngDimensions(image);
    return {
      snapshotName,
      sha256: createHash('sha256').update(image).digest('hex'),
      width: dimensions.width,
      height: dimensions.height,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function assertNoVisualMismatches(mismatches: readonly VisualMismatch[]): Promise<void> {
  if (mismatches.length === 0) return;
  const outputRoot = process.env.WORLDFORGE_E2E_OUTPUT_DIR ?? 'test-results/electron';
  const outputDirectory = path.join(outputRoot, 'visual-regression');
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    path.join(outputDirectory, 'actual-manifest.json'),
    `${JSON.stringify({ schemaVersion: 1, mismatches }, null, 2)}\n`,
    'utf8',
  );
  throw new Error(
    `Visual baseline mismatch (${mismatches.length}): ${mismatches.map((item) => item.snapshotName).join(', ')}`,
  );
}

test.afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
  await rm(visualWorkspaceRoot, { recursive: true, force: true });
});

if (process.platform === 'linux') {
  test('Phase 3 Linux 1280×800四主题视觉基线', async () => {
    test.setTimeout(180_000);
    const manifest = await loadVisualBaselineManifest(root);
    expect(manifest.baselines).toHaveLength(4);

    const userDataPath = await mkdtemp(path.join(tmpdir(), 'worldforge-visual-regression-'));
    temporaryDirectories.push(userDataPath);
    await rm(visualWorkspaceRoot, { recursive: true, force: true });
    const createParent = path.join(visualWorkspaceRoot, 'works');
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
      const moreActions = page.locator('[data-draft-more-actions]');
      await moreActions.locator('summary').click();
      await page.locator('[data-save-draft]').click();
      await expect(page.locator('[data-draft-state]')).toHaveText('已手动保存');
      await expect(page.locator('[data-draft-state]')).not.toContainText('保存序号');
      await moreActions.locator('summary').click();
      await expect(moreActions).not.toHaveAttribute('open', '');
      await expect(page.locator('.structure-chapter-title strong')).toBeVisible();

      const mismatches: VisualMismatch[] = [];
      const collect = async (snapshotName: string): Promise<void> => {
        const mismatch = await expectBaseline(page, manifest, snapshotName);
        if (mismatch) mismatches.push(mismatch);
      };

      await collect('theme-a-light-1280x800.png');
      await applyTheme(page, 'theme-a', 'dark');
      await collect('theme-a-dark-1280x800.png');
      await applyTheme(page, 'theme-b', 'light');
      await collect('theme-b-light-1280x800.png');
      await applyTheme(page, 'theme-b', 'dark');
      await collect('theme-b-dark-1280x800.png');
      await assertNoVisualMismatches(mismatches);
    } finally {
      await closeGracefully(application);
    }
  });
}
