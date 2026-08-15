import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

import { captureAcceptanceScreenshot } from './acceptance-screenshot.js';

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

async function setViewport(
  application: ElectronApplication,
  width: number,
  height: number,
): Promise<void> {
  await application.evaluate(
    ({ BrowserWindow }, size) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window) throw new Error('M8_07_WINDOW_MISSING');
      if (window.isMaximized()) window.unmaximize();
      window.setPosition(0, 0, false);
      window.setContentSize(size.width, size.height, false);
    },
    { width, height },
  );
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
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(
    variant,
  );
  await page.locator('[data-close-settings]').click();
  await expect(page.locator('[data-writing-workbench]')).toBeVisible();
  await expect(page.locator('.structure-chapter-title strong')).toBeVisible();
}

function relativeLuminance(red: number, green: number, blue: number): number {
  const channels = [red, green, blue].map((value) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function parseRgb(value: string): readonly [number, number, number] {
  const channels =
    value
      .match(/[\d.]+/gu)
      ?.slice(0, 3)
      .map(Number) ?? [];
  if (channels.length !== 3 || channels.some((channel) => !Number.isFinite(channel))) {
    throw new Error(`M8_07_COLOR_PARSE_FAILED:${value}`);
  }
  return [channels[0]!, channels[1]!, channels[2]!];
}

function contrastRatio(foreground: string, background: string): number {
  const [foregroundRed, foregroundGreen, foregroundBlue] = parseRgb(foreground);
  const [backgroundRed, backgroundGreen, backgroundBlue] = parseRgb(background);
  const foregroundLuminance = relativeLuminance(foregroundRed, foregroundGreen, foregroundBlue);
  const backgroundLuminance = relativeLuminance(backgroundRed, backgroundGreen, backgroundBlue);
  const light = Math.max(foregroundLuminance, backgroundLuminance);
  const dark = Math.min(foregroundLuminance, backgroundLuminance);
  return (light + 0.05) / (dark + 0.05);
}

async function expectReadableTheme(page: Page): Promise<void> {
  const samples = await page.evaluate(() => {
    const read = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) throw new Error(`M8_07_THEME_SAMPLE_MISSING:${selector}`);
      const style = getComputedStyle(element);
      return {
        selector,
        color: style.color,
        background: style.backgroundColor,
      };
    };
    return [read('body'), read('.worldforge-editor')];
  });

  for (const sample of samples) {
    expect(sample.background, `${sample.selector}背景不得透明`).not.toBe('rgba(0, 0, 0, 0)');
    expect(
      contrastRatio(sample.color, sample.background),
      `${sample.selector}文字与背景对比度`,
    ).toBeGreaterThanOrEqual(4.5);
  }
}

async function expectResponsiveWritingLayout(page: Page): Promise<void> {
  const layout = await page.evaluate(() => {
    const documentElement = document.documentElement;
    const body = document.body;
    const main = document.querySelector<HTMLElement>('.react-main');
    const chapterTitle = document.querySelector<HTMLElement>('.structure-chapter-title');
    const chapterTitleText = chapterTitle?.querySelector<HTMLElement>('strong');
    if (!main || !chapterTitle || !chapterTitleText) {
      throw new Error('M8_07_LAYOUT_TARGET_MISSING');
    }
    const mainRect = main.getBoundingClientRect();
    const titleRect = chapterTitle.getBoundingClientRect();
    const titleTextRect = chapterTitleText.getBoundingClientRect();
    const titleTextStyle = getComputedStyle(chapterTitleText);
    const parsedLineHeight = Number.parseFloat(titleTextStyle.lineHeight);
    const fontSize = Number.parseFloat(titleTextStyle.fontSize);
    return {
      documentOverflow: Math.max(documentElement.scrollWidth, body.scrollWidth) - window.innerWidth,
      mainLeft: mainRect.left,
      mainRight: mainRect.right,
      viewportWidth: window.innerWidth,
      titleWidth: titleRect.width,
      titleTextHeight: titleTextRect.height,
      titleTextLineHeight: Number.isFinite(parsedLineHeight) ? parsedLineHeight : fontSize * 1.2,
    };
  });

  expect(layout.documentOverflow).toBeLessThanOrEqual(1);
  expect(layout.mainLeft).toBeGreaterThanOrEqual(0);
  expect(layout.mainRight).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.titleWidth).toBeGreaterThan(72);
  expect(layout.titleTextHeight).toBeLessThanOrEqual(layout.titleTextLineHeight * 1.2);
}

test.afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test('M8-07中文作者体验视觉与QHD布局矩阵', async () => {
  test.setTimeout(180_000);
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'worldforge-m8-07-experience-'));
  temporaryDirectories.push(userDataPath);
  const createParent = path.join(userDataPath, 'works');
  await mkdir(createParent, { recursive: true });
  const application = await launch(userDataPath, createParent);

  try {
    const page = await application.firstWindow();
    await setViewport(application, 2560, 1440);
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');

    await page.locator('[data-create-project]').click();
    await page.locator('[data-project-name]').fill('M8-07中文体验验收');
    await page.locator('[data-confirm-create-project]').click();
    await expect(page.locator('[data-writing-workbench]')).toBeVisible();
    await expect(page.locator('body')).toHaveAttribute('data-author-mode', 'beginner');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(
      'light',
    );

    const editor = page.locator('[data-draft-content]');
    await editor.click();
    await page.keyboard.insertText('清河落雨，檐下灯火映着未写完的故事。');
    await page.locator('[data-draft-more-actions] > summary').click();
    await page.locator('[data-save-draft]').click();
    await expect(page.locator('[data-draft-state]')).toHaveText('已手动保存');
    await expect(page.locator('[data-draft-state]')).not.toContainText('保存序号');
    await page.locator('[data-draft-more-actions] > summary').click();

    await expectResponsiveWritingLayout(page);
    await expectReadableTheme(page);
    await captureAcceptanceScreenshot(page, 'M8-07', 'theme-a-light-2560x1440.png');

    await applyTheme(page, 'theme-a', 'dark');
    await expectResponsiveWritingLayout(page);
    await expectReadableTheme(page);
    await captureAcceptanceScreenshot(page, 'M8-07', 'theme-a-dark-2560x1440.png');

    await applyTheme(page, 'theme-b', 'light');
    await expectResponsiveWritingLayout(page);
    await expectReadableTheme(page);
    await captureAcceptanceScreenshot(page, 'M8-07', 'theme-b-light-2560x1440.png');

    await applyTheme(page, 'theme-b', 'dark');
    await expectResponsiveWritingLayout(page);
    await expectReadableTheme(page);
    await captureAcceptanceScreenshot(page, 'M8-07', 'theme-b-dark-2560x1440.png');
  } finally {
    await closeGracefully(application);
  }
});
