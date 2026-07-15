import { mkdtemp, mkdir, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import type { AppearancePreferences, WorldforgeBridge } from '@worldforge/contracts';

const temporaryDirectories: string[] = [];
const root = process.cwd();
const defaultAppearance: AppearancePreferences = {
  workspaceAlignment: 'center',
  uiScalePercent: 100,
  bodyFontSize: 18,
  contentWidth: 'normal',
};

async function temporaryUserData(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-electron-e2e-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function launch(
  userDataPath: string,
  forceDeviceScaleFactor?: number,
): Promise<ElectronApplication> {
  const electronArguments: string[] = [];
  if (process.getuid?.() === 0) electronArguments.push('--no-sandbox');
  if (forceDeviceScaleFactor) {
    electronArguments.push(`--force-device-scale-factor=${forceDeviceScaleFactor}`);
  }
  electronArguments.push(path.join(root, 'apps/desktop/main'));
  return electron.launch({
    args: electronArguments,
    env: {
      ...process.env,
      WORLDFORGE_E2E: '1',
      WORLDFORGE_E2E_USER_DATA: userDataPath,
    },
  });
}

async function closeGracefully(application: ElectronApplication): Promise<void> {
  const closed = application.waitForEvent('close');
  await application.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.close();
  });
  await closed;
}

async function setContentViewport(
  application: ElectronApplication,
  width: number,
  height: number,
): Promise<void> {
  await application.evaluate(
    ({ BrowserWindow }, input) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window) throw new Error('E2E_WINDOW_MISSING');
      if (window.isMaximized()) window.unmaximize();
      window.webContents.setZoomFactor(1);
      window.setPosition(0, 0, false);
      window.setContentSize(input.width, input.height, false);
    },
    { width, height },
  );
}

async function captureMatrixScreenshot(
  page: Page,
  directory: string | null,
  name: string,
  expectedPhysicalWidth: number,
  expectedPhysicalHeight: number,
): Promise<void> {
  if (!directory) return;
  const screenshot = await page.screenshot({
    path: path.join(directory, `${name}.png`),
    animations: 'disabled',
    scale: 'device',
  });
  expect(screenshot.subarray(1, 4).toString('ascii')).toBe('PNG');
  expect(Math.abs(screenshot.readUInt32BE(16) - expectedPhysicalWidth)).toBeLessThanOrEqual(2);
  expect(Math.abs(screenshot.readUInt32BE(20) - expectedPhysicalHeight)).toBeLessThanOrEqual(2);
}

async function setAppearance(page: Page, appearance: AppearancePreferences): Promise<void> {
  await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
  await page.locator('[data-appearance-form]').evaluate((form, value) => {
    const root = form as HTMLFormElement;
    const setSelect = (name: string, selectedValue: string): void => {
      const control = root.elements.namedItem(name);
      if (!(control instanceof HTMLSelectElement)) throw new Error(`E2E_CONTROL_MISSING_${name}`);
      control.value = selectedValue;
    };
    setSelect('uiScalePercent', String(value.uiScalePercent));
    setSelect('bodyFontSize', String(value.bodyFontSize));
    setSelect('contentWidth', value.contentWidth);
    const alignment = root.querySelector<HTMLInputElement>(
      `input[name="workspaceAlignment"][value="${value.workspaceAlignment}"]`,
    );
    if (!alignment) throw new Error('E2E_CONTROL_MISSING_workspaceAlignment');
    alignment.checked = true;
    root.dispatchEvent(new Event('change', { bubbles: true }));
  }, appearance);
  await expect(page.locator('[data-preference-status]')).toHaveText('已由 Core 保存到应用数据库');
  const stored = await page.evaluate(async () => {
    const bridge = (globalThis as unknown as { readonly worldforge: WorldforgeBridge }).worldforge;
    return bridge.app.getWindowPreferences();
  });
  expect(stored).toMatchObject({ ok: true, data: appearance });
}

test.afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

test('runs a sandboxed Renderer against a healthy supervised Core', async () => {
  const application = await launch(await temporaryUserData());
  try {
    const window = await application.firstWindow();
    await expect(window).toHaveTitle('WorldForge');
    await expect(window.locator('[data-editor-paper]')).toBeVisible();

    const runtime = await window.evaluate(async () => {
      const globals = globalThis as unknown as Record<string, unknown>;
      const bridge = (globalThis as unknown as { readonly worldforge: WorldforgeBridge })
        .worldforge;
      const status = await bridge.app.getCoreStatus();
      const activeTasks = await bridge.task.listActive();
      const windowPreferences = await bridge.app.getWindowPreferences();
      const unsubscribe = bridge.task.subscribe(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 50));
      unsubscribe();
      const statusAfterPortTransfer = await bridge.app.getCoreStatus();
      return {
        hasRequire: typeof globals.require !== 'undefined',
        hasProcess: typeof globals.process !== 'undefined',
        hasBridge: Boolean(bridge.app && bridge.ai && bridge.task),
        status: status.ok ? status.data.status : status.error.code,
        activeTaskCount: activeTasks.ok ? activeTasks.data.tasks.length : -1,
        hasWindowPreferences: windowPreferences.ok,
        statusAfterPortTransfer: statusAfterPortTransfer.ok
          ? statusAfterPortTransfer.data.status
          : statusAfterPortTransfer.error.code,
        csp: document
          .querySelector('meta[http-equiv="Content-Security-Policy"]')
          ?.getAttribute('content'),
      };
    });

    expect(runtime).toMatchObject({
      hasRequire: false,
      hasProcess: false,
      hasBridge: true,
      status: 'healthy',
      activeTaskCount: 0,
      hasWindowPreferences: true,
      statusAfterPortTransfer: 'healthy',
    });
    expect(runtime.csp).toContain("default-src 'none'");
    expect(runtime.csp).not.toContain('unsafe-eval');

    const preferences = await application.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const values = window?.webContents.getLastWebPreferences();
      return {
        nodeIntegration: values?.nodeIntegration,
        contextIsolation: values?.contextIsolation,
        sandbox: values?.sandbox,
        webSecurity: values?.webSecurity,
      };
    });
    expect(preferences).toEqual({
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    });
    expect(application.windows()).toHaveLength(1);
  } finally {
    await closeGracefully(application);
  }
});

test('persists DIP bounds and independent appearance preferences only in app.sqlite', async () => {
  test.setTimeout(60_000);
  const userDataPath = await temporaryUserData();
  const expectedAppearance: AppearancePreferences = {
    workspaceAlignment: 'right',
    uiScalePercent: 120,
    bodyFontSize: 22,
    contentWidth: 'wide',
  };
  const first = await launch(userDataPath);
  const firstWindow = await first.firstWindow();
  const expectedBounds = await first.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) throw new Error('E2E_WINDOW_MISSING');
    const workArea = screen.getPrimaryDisplay().workArea;
    const bounds = {
      x: workArea.x + 24,
      y: workArea.y + 24,
      width: Math.min(1_180, workArea.width - 48),
      height: Math.min(760, workArea.height - 48),
    };
    window.setBounds(bounds, false);
    return window.getNormalBounds();
  });
  await setAppearance(firstWindow, expectedAppearance);
  await firstWindow.waitForTimeout(400);
  await closeGracefully(first);

  const databasePath = path.join(userDataPath, 'app.sqlite');
  const database = new DatabaseSync(databasePath, { readOnly: true });
  const stored = database
    .prepare(
      `SELECT display_id, bounds_x_dip, bounds_y_dip, bounds_width_dip, bounds_height_dip,
              scale_factor, maximized, workspace_alignment, ui_scale_percent,
              body_font_size, content_width
         FROM window_preferences WHERE singleton_id = 1`,
    )
    .get();
  expect(stored).toMatchObject({
    bounds_x_dip: expectedBounds.x,
    bounds_y_dip: expectedBounds.y,
    bounds_width_dip: expectedBounds.width,
    bounds_height_dip: expectedBounds.height,
    maximized: 0,
    workspace_alignment: 'right',
    ui_scale_percent: 120,
    body_font_size: 22,
    content_width: 'wide',
  });
  expect(Number(stored?.scale_factor)).toBeGreaterThan(0);
  expect(String(stored?.display_id)).not.toHaveLength(0);
  database.close();
  expect((await readdir(userDataPath)).filter((name) => /window.*\.json$/i.test(name))).toEqual([]);

  const reopened = await launch(userDataPath);
  try {
    const page = await reopened.firstWindow();
    const restored = await page.evaluate(async () => {
      const bridge = (globalThis as unknown as { readonly worldforge: WorldforgeBridge })
        .worldforge;
      return bridge.app.getWindowPreferences();
    });
    expect(restored).toMatchObject({
      ok: true,
      data: {
        boundsDip: expectedBounds,
        maximized: false,
        ...expectedAppearance,
      },
    });
    await expect(page.locator('[data-ui-scale]')).toHaveValue('120');
    await expect(page.locator('[data-body-font-size]')).toHaveValue('22');
    await expect(page.locator('[data-content-width]')).toHaveValue('wide');
  } finally {
    await closeGracefully(reopened);
  }
});

test('keeps the frozen viewport/DPI matrix scroll-free and every overlay visible', async () => {
  test.setTimeout(90_000);
  const application = await launch(await temporaryUserData());
  try {
    const page = await application.firstWindow();
    const screenshotDirectory = process.env.WORLDFORGE_CAPTURE_MATRIX_DIR
      ? path.resolve(process.env.WORLDFORGE_CAPTURE_MATRIX_DIR)
      : null;
    if (screenshotDirectory) await mkdir(screenshotDirectory, { recursive: true });
    const matrix = [
      { name: '1280x800-100', width: 1_280, height: 800, mode: 'standard' },
      { name: '2560x1440-100', width: 2_560, height: 1_440, mode: 'ultrawide' },
      { name: '3440x1440-100', width: 3_440, height: 1_440, mode: 'ultrawide' },
      { name: '3840x1600-100', width: 3_840, height: 1_600, mode: 'ultrawide' },
      { name: 'effective-1024x640', width: 1_024, height: 640, mode: 'narrow' },
    ] as const;
    await setAppearance(page, defaultAppearance);

    for (const scenario of matrix) {
      await setContentViewport(application, scenario.width, scenario.height);
      await page.waitForFunction(
        (expectedMode) => document.body.dataset.layoutMode === expectedMode,
        scenario.mode,
      );
      const layout = await page.evaluate(() => {
        const paper = document.querySelector<HTMLElement>('[data-editor-paper]');
        const frame = document.querySelector<HTMLElement>('[data-workspace-frame]');
        const paperBounds = paper?.getBoundingClientRect();
        const frameBounds = frame?.getBoundingClientRect();
        const leftBounds = document
          .querySelector<HTMLElement>('[data-left-sidebar]')
          ?.getBoundingClientRect();
        const rightBounds = document
          .querySelector<HTMLElement>('[data-right-sidebar]')
          ?.getBoundingClientRect();
        const actionBounds = document
          .querySelector<HTMLElement>('.top-bar__actions')
          ?.getBoundingClientRect();
        return {
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          mode: document.body.dataset.layoutMode,
          leftPanel: document.body.dataset.leftPanel,
          rightPanel: document.body.dataset.rightPanel,
          horizontalOverflow:
            Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) -
            window.innerWidth,
          paperWidth: paperBounds?.width ?? 0,
          frameWidth: frameBounds?.width ?? 0,
          frameLeft: frameBounds?.left ?? -1,
          frameRight: frameBounds?.right ?? Number.POSITIVE_INFINITY,
          leftBounds: leftBounds
            ? { left: leftBounds.left, right: leftBounds.right, width: leftBounds.width }
            : null,
          rightBounds: rightBounds
            ? { left: rightBounds.left, right: rightBounds.right, width: rightBounds.width }
            : null,
          actionRight: actionBounds?.right ?? Number.POSITIVE_INFINITY,
          bodyFontSize: paper ? Number.parseFloat(getComputedStyle(paper).fontSize) : 0,
        };
      });
      expect(layout.mode).toBe(scenario.mode);
      expect(layout.horizontalOverflow).toBeLessThanOrEqual(1);
      expect(layout.paperWidth).toBeGreaterThan(500);
      expect(layout.paperWidth).toBeLessThanOrEqual(861);
      expect(layout.bodyFontSize).toBeCloseTo(18, 0);
      expect(layout.frameLeft).toBeGreaterThanOrEqual(-1);
      expect(layout.frameRight).toBeLessThanOrEqual(layout.innerWidth + 1);
      expect(layout.actionRight).toBeLessThanOrEqual(layout.innerWidth + 1);
      if (layout.leftPanel === 'sidebar') {
        expect(layout.leftBounds?.width ?? 0).toBeGreaterThanOrEqual(220);
        expect(layout.leftBounds?.left ?? -1).toBeGreaterThanOrEqual(-1);
      }
      if (layout.rightPanel === 'sidebar') {
        expect(layout.rightBounds?.width ?? 0).toBeGreaterThanOrEqual(300);
        expect(layout.rightBounds?.right ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
          layout.innerWidth + 1,
        );
      }
      if (scenario.mode === 'ultrawide') expect(layout.frameWidth).toBeLessThanOrEqual(1_762);
      if (scenario.mode === 'narrow') expect(layout.rightPanel).toBe('drawer');
      await captureMatrixScreenshot(
        page,
        screenshotDirectory,
        scenario.name,
        scenario.width,
        scenario.height,
      );
    }

    await setContentViewport(application, 1_280, 800);
    await setAppearance(page, { ...defaultAppearance, uiScalePercent: 150 });
    await page.waitForFunction(() => document.body.dataset.layoutMode === 'compact');
    expect(await page.locator('body').getAttribute('data-left-panel')).toBe('drawer');
    expect(await page.locator('body').getAttribute('data-right-panel')).toBe('drawer');
    await page.locator('[data-toggle-left]').click();
    await expect(page.locator('[data-left-sidebar]')).toHaveClass(/is-open/);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-left-sidebar]')).not.toHaveClass(/is-open/);
    await expect(page.locator('[data-toggle-left]')).toBeFocused();

    await setAppearance(page, defaultAppearance);
    await page.locator('[data-boundary-popover]').click();
    const popoverBounds = await page.locator('[data-popover]').boundingBox();
    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    expect(popoverBounds).not.toBeNull();
    expect(popoverBounds?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect(popoverBounds?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((popoverBounds?.x ?? 0) + (popoverBounds?.width ?? 0)).toBeLessThanOrEqual(
      viewport.width,
    );
    expect((popoverBounds?.y ?? 0) + (popoverBounds?.height ?? 0)).toBeLessThanOrEqual(
      viewport.height,
    );
    await page.locator('[data-close-popover]').click();

    await page.locator('[data-open-dialog]').click();
    await expect(page.locator('[data-boundary-dialog]')).toBeVisible();
    const dialogBounds = await page.locator('[data-boundary-dialog]').boundingBox();
    expect(dialogBounds).not.toBeNull();
    expect(dialogBounds?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect(dialogBounds?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((dialogBounds?.x ?? 0) + (dialogBounds?.width ?? 0)).toBeLessThanOrEqual(viewport.width);
    expect((dialogBounds?.y ?? 0) + (dialogBounds?.height ?? 0)).toBeLessThanOrEqual(
      viewport.height,
    );
    await page.locator('[data-boundary-dialog] button[value="cancel"]').click();

    await setContentViewport(application, 3_440, 1_440);
    for (const workspaceAlignment of ['left', 'center', 'right'] as const) {
      await setAppearance(page, { ...defaultAppearance, workspaceAlignment });
      await page.waitForFunction(
        (alignment) => document.body.dataset.workspaceAlignment === alignment,
        workspaceAlignment,
      );
      const margins = await page.locator('[data-workspace-frame]').evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return { left: bounds.left, right: window.innerWidth - bounds.right };
      });
      if (workspaceAlignment === 'left') expect(margins.left).toBeLessThan(margins.right);
      if (workspaceAlignment === 'center')
        expect(Math.abs(margins.left - margins.right)).toBeLessThan(2);
      if (workspaceAlignment === 'right') expect(margins.right).toBeLessThan(margins.left);
    }
  } finally {
    await closeGracefully(application);
  }
});

test('uses real Chromium device scaling for the 2560×1440 DPI matrix', async () => {
  test.setTimeout(90_000);
  const screenshotDirectory = process.env.WORLDFORGE_CAPTURE_MATRIX_DIR
    ? path.resolve(process.env.WORLDFORGE_CAPTURE_MATRIX_DIR)
    : null;
  if (screenshotDirectory) await mkdir(screenshotDirectory, { recursive: true });

  for (const scenario of [
    { name: '2560x1440-125', scaleFactor: 1.25, mode: 'wide' },
    { name: '2560x1440-150', scaleFactor: 1.5, mode: 'two-k' },
  ] as const) {
    const application = await launch(await temporaryUserData(), scenario.scaleFactor);
    try {
      const page = await application.firstWindow();
      const effectiveWidth = Math.round(2_560 / scenario.scaleFactor);
      const effectiveHeight = Math.round(1_440 / scenario.scaleFactor);
      await setContentViewport(application, effectiveWidth, effectiveHeight);
      await setAppearance(page, defaultAppearance);
      await page.waitForFunction(
        (expectedMode) => document.body.dataset.layoutMode === expectedMode,
        scenario.mode,
      );
      const rendererMetrics = await page.evaluate(() => {
        const frame = document.querySelector<HTMLElement>('[data-workspace-frame]');
        const right = document.querySelector<HTMLElement>('[data-right-sidebar]');
        return {
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
          horizontalOverflow:
            Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) -
            window.innerWidth,
          frameRight: frame?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
          rightPanelMode: document.body.dataset.rightPanel,
          rightPanelRight: right?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
          paperWidth:
            document.querySelector<HTMLElement>('[data-editor-paper]')?.getBoundingClientRect()
              .width ?? 0,
        };
      });
      const displayScaleFactor = await application.evaluate(
        ({ screen }) => screen.getPrimaryDisplay().scaleFactor,
      );
      expect(Math.abs(rendererMetrics.innerWidth - effectiveWidth)).toBeLessThanOrEqual(1);
      expect(Math.abs(rendererMetrics.innerHeight - effectiveHeight)).toBeLessThanOrEqual(1);
      expect(rendererMetrics.devicePixelRatio).toBeCloseTo(scenario.scaleFactor, 2);
      expect(displayScaleFactor).toBeCloseTo(scenario.scaleFactor, 2);
      expect(rendererMetrics.horizontalOverflow).toBeLessThanOrEqual(1);
      expect(rendererMetrics.frameRight).toBeLessThanOrEqual(rendererMetrics.innerWidth + 1);
      expect(rendererMetrics.rightPanelMode).toBe('sidebar');
      expect(rendererMetrics.rightPanelRight).toBeLessThanOrEqual(rendererMetrics.innerWidth + 1);
      expect(rendererMetrics.paperWidth).toBeLessThanOrEqual(861);
      await captureMatrixScreenshot(page, screenshotDirectory, scenario.name, 2_560, 1_440);
    } finally {
      await closeGracefully(application);
    }
  }
});
