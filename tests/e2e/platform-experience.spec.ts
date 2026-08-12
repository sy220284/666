import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

const root = process.cwd();
const temporaryDirectories: string[] = [];

function platformId(): 'linux' | 'windows' | 'macos' {
  if (process.platform === 'linux') return 'linux';
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'macos';
  throw new Error(`PLATFORM_EXPERIENCE_UNSUPPORTED:${process.platform}`);
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

async function setViewport(application: ElectronApplication): Promise<void> {
  await application.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) throw new Error('PLATFORM_EXPERIENCE_WINDOW_MISSING');
    if (window.isMaximized()) window.unmaximize();
    window.setPosition(0, 0, false);
    window.setContentSize(1280, 800, false);
  });
}

async function closeGracefully(application: ElectronApplication): Promise<void> {
  const closed = application.waitForEvent('close');
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  await closed;
}

async function writeEvidence(assertions: readonly string[]): Promise<void> {
  const platform = platformId();
  const directory =
    process.env.WORLDFORGE_PLATFORM_EXPERIENCE_EVIDENCE_DIR ??
    path.join(root, 'test-results', 'platform-experience');
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, `${platform}.json`),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        platform,
        arch: process.arch,
        viewport: { width: 1280, height: 800 },
        assertions,
        passed: true,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

test.afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test('Phase 3 三平台作者主路径体验矩阵', async () => {
  test.setTimeout(120_000);
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'worldforge-platform-experience-'));
  temporaryDirectories.push(userDataPath);
  const createParent = path.join(userDataPath, 'works');
  await mkdir(createParent, { recursive: true });
  const application = await launch(userDataPath, createParent);
  const assertions: string[] = [];
  let closed = false;

  try {
    const page = await application.firstWindow();
    await setViewport(application);
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    assertions.push('renderer-ready');

    await page.locator('[data-create-project]').click();
    const dialog = page.locator('[data-create-project-dialog]');
    await expect(dialog).toBeVisible();
    await dialog.locator('[data-project-name]').fill('三平台体验·雪夜');
    await dialog.locator('[data-confirm-create-project]').click();
    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open');
    await expect(page.locator('[data-writing-workbench]')).toBeVisible();
    assertions.push('quick-create');

    const editor = page.locator('[data-draft-content]');
    await editor.click();
    await page.keyboard.insertText('清河落雨，灯下写到第二章。Emoji：🌙；标点：——“继续”。');
    await page.locator('[data-save-draft]').click();
    await expect(page.locator('[data-draft-state]')).toHaveText('已手动保存');
    assertions.push('unicode-draft-save');

    const layout = await page.evaluate(() => ({
      overflow:
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
        window.innerWidth,
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    expect(layout.width).toBe(1280);
    expect(layout.height).toBe(800);
    expect(layout.overflow).toBeLessThanOrEqual(1);
    assertions.push('layout-no-horizontal-overflow');

    await page.locator('[data-open-settings]').click();
    await expect(page.locator('[data-settings-dialog]')).toBeVisible();
    await page.locator('[data-settings-navigation="appearance"]').click();
    await page.locator('[data-theme-id]').selectOption('theme-b');
    await page.locator('[data-theme-variant]').selectOption('dark');
    await page.locator('[data-save-settings]').click();
    await expect(page.locator('body')).toHaveAttribute('data-theme', 'theme-b');
    await expect(page.locator('body')).toHaveAttribute('data-visual-theme-variant', 'dark');
    await page.locator('[data-close-settings]').click();
    await expect(page.locator('[data-writing-workbench]')).toBeVisible();
    assertions.push('theme-roundtrip');

    await closeGracefully(application);
    closed = true;
    assertions.push('graceful-close');
    await writeEvidence(assertions);
  } finally {
    if (!closed) await closeGracefully(application);
  }
});
