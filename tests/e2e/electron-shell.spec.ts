import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
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

import { captureAcceptanceScreenshot } from './acceptance-screenshot.js';

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
  projectEnvironment: Readonly<Record<string, string>> = {},
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
      ...projectEnvironment,
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

async function openDetails(page: Page, selector: string): Promise<void> {
  const details = page.locator(selector);
  if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
}

async function openCompletePlanning(page: Page): Promise<void> {
  await page.locator('[data-open-planning]').click();
  await expect(page.locator('[data-planning-dialog]')).toBeVisible();
  const beginner = page.locator('[data-planning-disclosure="beginner"]');
  if (await beginner.isVisible()) {
    await page.locator('[data-planning-mode="professional"]').click();
  }
  await expect(page.locator('[data-planning-disclosure="professional"]')).toBeVisible();
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
  await page.locator('[data-open-settings]').click();
  await page.locator('[data-settings-navigation="editor"]').click();
  await page.locator('[data-body-font-size]').fill(String(appearance.bodyFontSize));
  await page.locator('[data-content-width]').selectOption(appearance.contentWidth);
  await page.locator('[data-save-appearance]').click();
  await expect(page.locator('[data-settings-status]')).toHaveText('显示设置已保存到应用数据库。');
  await page.locator('[data-settings-navigation="appearance"]').click();
  await page.locator('[data-ui-scale]').selectOption(String(appearance.uiScalePercent));
  await page
    .locator('select[data-workspace-alignment]')
    .selectOption(appearance.workspaceAlignment);
  await page.locator('[data-save-appearance]').click();
  await expect(page.locator('[data-settings-status]')).toHaveText('显示设置已保存到应用数据库。');
  const stored = await page.evaluate(async () => {
    const bridge = (globalThis as unknown as { readonly worldforge: WorldforgeBridge }).worldforge;
    return bridge.app.getWindowPreferences();
  });
  expect(stored).toMatchObject({ ok: true, data: appearance });
  await page.locator('[data-close-settings]').click();
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
    await expect(window.locator('#react-root')).toHaveCount(1);
    await expect(window.locator('#react-root')).toHaveAttribute('data-react-mounted', 'true');
    await expect(window.locator('[data-react-runtime="running"]')).toBeVisible();
    await expect(window.locator('[data-react-home]')).toBeVisible();
    await expect(window.locator('[data-legacy-root]')).toBeHidden();

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

test('completes atomic onboarding and exports only the confirmed diagnostic allowlist', async () => {
  test.setTimeout(90_000);
  const userDataPath = await temporaryUserData();
  const createParent = path.join(userDataPath, 'onboarding-projects');
  const diagnosticsDirectory = path.join(userDataPath, 'diagnostics');
  await Promise.all([
    mkdir(createParent, { recursive: true }),
    mkdir(diagnosticsDirectory, { recursive: true }),
  ]);
  const application = await launch(userDataPath, undefined, {
    WORLDFORGE_E2E_CREATE_PARENT: createParent,
    WORLDFORGE_E2E_CONFIRM_DIAGNOSTICS: '1',
    WORLDFORGE_E2E_DIAGNOSTICS_DIRECTORY: diagnosticsDirectory,
  });
  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await expect(page.locator('[data-onboarding-entry]')).toHaveCount(4);

    await page.locator('[data-onboarding-entry="quick"]').click();
    await expect(page.locator('[data-create-project-dialog]')).toBeVisible();
    await expect(page.locator('select[name="creativePath"]')).toHaveCount(0);
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.locator('[data-create-project-dialog]')).toHaveCount(0);
    expect(await readdir(createParent)).toEqual([]);

    await page.locator('[data-onboarding-entry="complete"]').click();
    await page.locator('[data-project-name]').fill('原子向导E2E');
    await page.locator('[data-project-channel]').fill('悬疑');
    await page.locator('textarea[name="concept"]').fill('一座城将在七天后消失。');
    await page.locator('textarea[name="protagonistGoal"]').fill('找回失踪的妹妹。');
    await page.locator('textarea[name="readingPromise"]').fill('逐层揭开消失原因。');
    await page.locator('textarea[name="coreConflict"]').fill('真相会摧毁整座城。');
    await page.locator('input[name="protagonistName"]').fill('林灯');
    await page.locator('input[name="protagonistIdentity"]').fill('档案修复师');
    await page.locator('input[name="protagonistBoundary"]').fill('不牺牲无辜者');
    await page.locator('input[name="chapterTitle"]').fill('城门将在午夜关闭');
    await page.locator('input[name="targetWordMin"]').fill('2000');
    await page.locator('input[name="targetWordMax"]').fill('3000');
    await page
      .locator('textarea[name="sceneGoals"]')
      .fill('收到失踪档案\n在城门前做出选择\n发现第一条反常线索');
    await page.locator('select[name="creativePath"]').selectOption('hybrid');
    await page.locator('[data-confirm-create-project]').click();

    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open');
    await expect(page.locator('[data-planning-dialog]')).toBeVisible();
    const settings = await page.evaluate(async () => {
      const bridge = (globalThis as unknown as { readonly worldforge: WorldforgeBridge })
        .worldforge;
      return bridge.settings.get();
    });
    expect(settings).toMatchObject({
      ok: true,
      data: {
        settings: {
          creativePath: 'hybrid',
          onboardingCompleted: true,
          onboardingScaffoldDismissed: false,
        },
      },
    });

    const workspace = path.join(createParent, '原子向导E2E.worldforge');
    const database = new DatabaseSync(path.join(workspace, 'project.sqlite'), { readOnly: true });
    expect(database.prepare('SELECT concept, protagonist_goal FROM project_briefs').get()).toEqual({
      concept: '一座城将在七天后消失。',
      protagonist_goal: '找回失踪的妹妹。',
    });
    expect(database.prepare('SELECT name FROM entities').get()).toEqual({ name: '林灯' });
    expect(database.prepare('SELECT title FROM chapters').get()).toEqual({
      title: '城门将在午夜关闭',
    });
    expect(database.prepare('SELECT count(*) AS count FROM scene_beats').get()).toEqual({
      count: 3,
    });
    database.close();

    await page.locator('[data-open-settings]').click();
    await page.locator('[data-settings-navigation="advanced"]').click();
    await page.getByRole('button', { name: '预览诊断清单' }).click();
    await expect(page.locator('[data-diagnostic-preview]')).toContainText('project-content');
    await page.locator('[data-confirm-diagnostic-export]').check();
    await page.locator('[data-export-diagnostics]').click();
    await expect(page.locator('[data-diagnostic-status]')).toContainText('已导出');

    const diagnosticFiles = await readdir(diagnosticsDirectory);
    expect(diagnosticFiles).toHaveLength(1);
    const diagnostic = await readFile(path.join(diagnosticsDirectory, diagnosticFiles[0]!), 'utf8');
    expect(diagnostic).not.toContain('一座城将在七天后消失');
    expect(diagnostic).not.toContain(workspace);
    expect(diagnostic).not.toContain('credentialRef');
  } finally {
    await closeGracefully(application);
  }
});

test('renders only persisted recent projects and restores general settings after restart', async () => {
  test.setTimeout(60_000);
  const userDataPath = await temporaryUserData();
  const existingProjectPath = path.join(userDataPath, 'existing-project');
  const missingProjectPath = path.join(userDataPath, 'missing-project');
  await mkdir(existingProjectPath, { recursive: true });

  const first = await launch(userDataPath);
  const firstWindow = await first.firstWindow();
  await firstWindow.waitForFunction(() => document.body.dataset.rendererReady === 'true');
  await expect(firstWindow.locator('[data-recent-empty]')).toBeVisible();
  await expect(firstWindow.locator('[data-recent-card]')).toHaveCount(0);
  await firstWindow.locator('[data-open-settings]').click();
  await expect(firstWindow.locator('[data-settings-dialog]')).toBeVisible();
  await firstWindow.locator('[data-default-mode]').selectOption('professional');
  await firstWindow.locator('[data-save-settings]').click();
  await expect(firstWindow.locator('[data-settings-status]')).toHaveText(
    '设置已保存到应用数据库。',
  );
  expect(
    await firstWindow.evaluate(async () => {
      const bridge = (globalThis as unknown as { readonly worldforge: WorldforgeBridge })
        .worldforge;
      return bridge.settings.get();
    }),
  ).toMatchObject({
    ok: true,
    data: { settings: { defaultMode: 'professional' } },
  });
  await firstWindow.locator('[data-settings-navigation="appearance"]').click();
  await firstWindow.locator('[data-theme-id]').selectOption('theme-b');
  await firstWindow.locator('[data-theme-variant]').selectOption('dark');
  await firstWindow.locator('[data-reduce-motion]').check();
  await firstWindow.locator('[data-save-settings]').click();
  await expect(firstWindow.locator('[data-settings-status]')).toHaveText(
    '显示设置已保存到应用数据库。',
  );
  expect(
    await firstWindow.evaluate(async () => {
      const bridge = (globalThis as unknown as { readonly worldforge: WorldforgeBridge })
        .worldforge;
      return bridge.settings.get();
    }),
  ).toMatchObject({
    ok: true,
    data: {
      settings: {
        defaultMode: 'professional',
        themeId: 'theme-b',
        themeVariant: 'dark',
        reduceMotion: true,
      },
    },
  });
  await closeGracefully(first);

  const database = new DatabaseSync(path.join(userDataPath, 'app.sqlite'));
  database
    .prepare(
      `INSERT INTO recent_projects(
         project_id, workspace_path, display_name, last_opened_at, missing_since
       ) VALUES(?, ?, ?, ?, NULL), (?, ?, ?, ?, NULL)`,
    )
    .run(
      'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      existingProjectPath,
      '真实存在的项目',
      '2026-07-16T08:00:00.000Z',
      'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      missingProjectPath,
      '路径已丢失的项目',
      '2026-07-16T07:00:00.000Z',
    );
  database.close();

  const reopened = await launch(userDataPath);
  try {
    const page = await reopened.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await expect(page.locator('[data-recent-card]')).toHaveCount(2);
    await expect(page.locator('[data-project-missing="true"]')).toContainText('路径已丢失');
    await page.locator('[data-open-settings]').click();
    await expect(page.locator('[data-default-mode]')).toHaveValue('professional');
    await page.locator('[data-settings-navigation="appearance"]').click();
    await expect(page.locator('[data-theme-id]')).toHaveValue('theme-b');
    await expect(page.locator('[data-theme-variant]')).toHaveValue('dark');
    await expect(page.locator('[data-reduce-motion]')).toBeChecked();
    await page.locator('[data-close-settings]').click();

    await page.locator('[data-project-missing="true"] [data-remove-recent]').click();
    await expect(page.locator('[data-recent-card]')).toHaveCount(1);
    const storedCount = await page.evaluate(async () => {
      const bridge = (globalThis as unknown as { readonly worldforge: WorldforgeBridge })
        .worldforge;
      const result = await bridge.project.listRecent();
      return result.ok ? result.data.projects.length : -1;
    });
    expect(storedCount).toBe(1);
  } finally {
    await closeGracefully(reopened);
  }
});

test('creates, reopens, moves, and protects a future-schema project through the desktop UI', async () => {
  test.setTimeout(90_000);
  const userDataPath = await temporaryUserData();
  const createParent = path.join(userDataPath, 'project-source');
  const moveParent = path.join(userDataPath, 'project-target');
  await Promise.all([
    mkdir(createParent, { recursive: true }),
    mkdir(moveParent, { recursive: true }),
  ]);
  const environment = {
    WORLDFORGE_E2E_CREATE_PARENT: createParent,
    WORLDFORGE_E2E_MOVE_PARENT: moveParent,
  };
  const sourceWorkspace = path.join(createParent, '夜航.worldforge');
  const movedWorkspace = path.join(moveParent, '夜航.worldforge');

  const application = await launch(userDataPath, undefined, environment);
  let applicationClosed = false;
  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-create-project]').click();
    await expect(page.locator('[data-create-project-dialog]')).toBeVisible();
    await page.locator('[data-project-name]').fill('夜航');
    await page.locator('[data-confirm-create-project]').click();
    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open');
    await expect(page.locator('[data-active-project-name]')).toHaveText('夜航');
    await expect(page.locator('[data-active-project-path]')).toHaveText(
      await realpath(sourceWorkspace),
    );
    expect(await readdir(sourceWorkspace)).toEqual(
      expect.arrayContaining(['manifest.json', 'project.sqlite']),
    );
    await expect(page.locator('[data-volume-id]')).toHaveCount(1);
    await expect(page.locator('[data-volume-title="第一卷"]')).toBeVisible();
    await expect(page.locator('[data-chapter-title="第一章"]')).toBeVisible();

    await openCompletePlanning(page);
    await page.locator('[data-create-volume]').click();
    await expect(page.locator('[data-structure-dialog]')).toBeVisible();
    await page.locator('[data-structure-title]').fill('第二卷');
    await page.locator('[data-save-structure]').click();
    await expect(page.locator('[data-volume-id]')).toHaveCount(2);

    await page.locator('[data-volume-title="第一卷"] [data-add-chapter]').click();
    await page.locator('[data-structure-title]').fill('第二章');
    await page.locator('[data-save-structure]').click();
    await expect(page.locator('[data-chapter-title="第二章"]')).toBeVisible();

    await page.locator('[data-chapter-title="第二章"] [data-edit-chapter]').click();
    await page.locator('[data-structure-status]').selectOption('writing');
    await page.locator('[data-structure-volume]').selectOption({ label: '第二卷' });
    await page.locator('input[name="targetWordMin"]').fill('2000');
    await page.locator('input[name="targetWordMax"]').fill('3000');
    await page.locator('[data-save-structure]').click();
    await expect(
      page.locator('[data-volume-title="第二卷"] [data-chapter-title="第二章"]'),
    ).toContainText('写作中 · 2000—3000 字');

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('[data-chapter-title="第二章"] [data-delete-chapter]').click();
    await expect(page.locator('[data-chapter-title="第二章"]')).toHaveCount(0);
    await page.locator('[data-open-trash]').click();
    await expect(page.locator('[data-trash-entry-id]')).toHaveCount(1);
    await page.locator('[data-restore-original]').click();
    await expect(page.locator('[data-trash-empty]')).toBeVisible();
    await page.locator('[data-close-trash]').click();
    await expect(
      page.locator('[data-volume-title="第二卷"] [data-chapter-title="第二章"]'),
    ).toBeVisible();

    await page.locator('[data-volume-title="第二卷"] [data-move-volume-up]').click();
    await expect(page.locator('[data-volume-id]').first()).toHaveAttribute(
      'data-volume-title',
      '第二卷',
    );
    await page.locator('[data-close-planning]').click();

    await page.locator('[data-close-project]').click();
    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'closed');
    await expect(page.locator('[data-recent-card]')).toHaveCount(1);
    await page.locator('[data-open-recent]').click();
    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open');
    await expect(page.locator('[data-volume-id]').first()).toHaveAttribute(
      'data-volume-title',
      '第二卷',
    );
    await expect(page.locator('[data-chapter-title="第二章"]')).toBeVisible();

    await page.locator('[data-move-project]').click();
    await expect(page.locator('[data-project-operation-status]')).toContainText('校验通过');
    await expect(page.locator('[data-active-project-path]')).toHaveText(
      await realpath(movedWorkspace),
    );
    expect(await readdir(moveParent)).toContain('夜航.worldforge');
    expect(await readdir(createParent)).not.toContain('夜航.worldforge');
    await page.locator('[data-close-project]').click();
    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'closed');
    await closeGracefully(application);
    applicationClosed = true;
  } finally {
    if (!applicationClosed) await closeGracefully(application);
  }

  const projectDatabase = new DatabaseSync(path.join(movedWorkspace, 'project.sqlite'));
  projectDatabase
    .prepare(
      `INSERT INTO schema_migrations(version, name, checksum, applied_at, app_version)
       VALUES(99, 'future', 'future-checksum', ?, '9.0.0')`,
    )
    .run('2026-07-16T09:00:00.000Z');
  projectDatabase.close();

  const reopened = await launch(userDataPath, undefined, environment);
  try {
    const reopenedPage = await reopened.firstWindow();
    await reopenedPage.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await reopenedPage.locator('[data-open-recent]').click();
    await expect(reopenedPage.locator('body')).toHaveAttribute('data-project-state', 'read-only');
    await expect(reopenedPage.locator('[data-active-project-readonly]')).toContainText(
      'future-schema',
    );
    await expect(reopenedPage.locator('[data-move-project]')).toBeDisabled();
    await reopenedPage.locator('[data-close-project]').click();
    await expect(reopenedPage.locator('body')).toHaveAttribute('data-project-state', 'closed');
  } finally {
    await closeGracefully(reopened);
  }
});

test('creates an explicit professional blank project and exposes the first structure action', async () => {
  test.setTimeout(60_000);
  const userDataPath = await temporaryUserData();
  const createParent = path.join(userDataPath, 'blank-projects');
  await mkdir(createParent, { recursive: true });
  const application = await launch(userDataPath, undefined, {
    WORLDFORGE_E2E_CREATE_PARENT: createParent,
  });
  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-create-project]').click();
    await page.locator('[data-onboarding-dialog-entry="blank"]').click();
    await page.locator('[data-project-name]').fill('空白长篇');
    await page.locator('[data-project-channel]').fill('历史');
    await page.locator('[data-confirm-create-project]').click();
    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open');
    await expect(page.locator('[data-structure-empty]')).toContainText('专业空白项目');
    await expect(page.locator('[data-volume-id]')).toHaveCount(0);

    await openCompletePlanning(page);
    await page.locator('[data-create-volume]').click();
    await page.locator('[data-structure-title]').fill('正文卷');
    await page.locator('[data-save-structure]').click();
    await expect(page.locator('[data-volume-title="正文卷"]')).toBeVisible();
  } finally {
    await closeGracefully(application);
  }
});

test('edits, sanitizes, saves, and rebuilds a four-block Draft through the desktop UI', async () => {
  test.setTimeout(90_000);
  const userDataPath = await temporaryUserData();
  const createParent = path.join(userDataPath, 'draft-projects');
  await mkdir(createParent, { recursive: true });
  const application = await launch(userDataPath, undefined, {
    WORLDFORGE_E2E_CREATE_PARENT: createParent,
  });
  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-create-project]').click();
    await page.locator('[data-project-name]').fill('雨夜正文');
    await page.locator('[data-confirm-create-project]').click();
    await expect(page.locator('[data-chapter-title="第一章"]')).toBeVisible();

    await page.locator('[data-chapter-title="第一章"] [data-open-chapter]').click();
    await expect(page.locator('[data-draft-workspace]')).toBeVisible();
    await expect(page.locator('[data-draft-state]')).toHaveText('已从正文段落重建。');
    const editor = page.locator('[data-draft-content]');
    const blocks = editor.locator(':scope > [data-block-type]');
    await expect(editor).toHaveAttribute('contenteditable', 'true');
    await expect(blocks).toHaveCount(1);
    const originalLogicalId = await blocks.first().getAttribute('data-logical-block-id');
    expect(originalLogicalId).toMatch(/^[0-9a-f-]{36}$/u);

    await editor.click();
    await page.keyboard.type('雨落在旧站台。');
    await page.keyboard.press('Enter');
    await expect(blocks).toHaveCount(2);
    await expect(blocks.first()).toHaveAttribute('data-logical-block-id', originalLogicalId!);
    expect(await blocks.nth(1).getAttribute('data-logical-block-id')).toBeNull();
    expect(await blocks.nth(1).getAttribute('data-client-block-id')).toMatch(/^temporary-/u);
    await page.keyboard.type('风起。');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowLeft' : 'Home');
    await page.keyboard.press('Backspace');
    await expect(blocks).toHaveCount(1);
    await expect(blocks.first()).toHaveAttribute('data-logical-block-id', originalLogicalId!);
    await expect(blocks.first()).toHaveText('雨落在旧站台。风起。');
    await expect(page.locator('[data-draft-character-count]')).toHaveText('10');
    await expect(page.locator('[data-draft-text-count]')).toHaveText('8');
    await expect(page.locator('[data-draft-paragraph-count]')).toHaveText('1');
    await expect(page.locator('[data-draft-state]')).toContainText('等待自动保存');
    await expect(page.locator('[data-draft-state]')).toHaveText(/^自动保存完成$/u, {
      timeout: 3_000,
    });

    await page.locator('[data-toggle-draft-find]').click();
    await page.locator('[data-draft-find]').fill('风起');
    await page.locator('[data-draft-find-next]').click();
    await expect(page.locator('[data-draft-find-status]')).toHaveText('1/1');
    await page.locator('[data-draft-replace]').fill('风又起');
    await page.locator('[data-draft-replace-current]').click();
    await expect(blocks.first()).toHaveText('雨落在旧站台。风又起。');

    await openDetails(page, '[data-draft-tools-menu]');
    await page.waitForTimeout(600);
    await blocks.first().evaluate((element) => {
      const textNode = element.firstChild;
      const text = textNode?.textContent ?? '';
      const offset = text.indexOf('风又起。');
      if (!textNode || offset < 0) throw new Error('E2E_FIND_REPLACEMENT_TEXT_MISSING');
      (element as HTMLElement).focus();
      const range = document.createRange();
      range.setStart(textNode, offset);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await page.waitForTimeout(50);
    await page.keyboard.type('终');
    await expect(blocks.first()).toContainText('终');
    await page.locator('[data-undo-draft]').click();
    await expect(blocks.first()).not.toContainText('终');
    await page.locator('[data-redo-draft]').click();
    await expect(blocks.first()).toContainText('终');
    await page.locator('[data-set-block-type="heading"]').click();
    await expect(blocks.first()).toHaveAttribute('data-block-type', 'heading');
    await expect(blocks.first()).toHaveAttribute('data-logical-block-id', originalLogicalId!);
    await page.locator('[data-set-block-type="paragraph"]').click();
    await expect(blocks.first()).toHaveAttribute('data-block-type', 'paragraph');
    await expect(blocks.first()).toHaveAttribute('data-logical-block-id', originalLogicalId!);

    await editor.evaluate((element) => {
      (element as HTMLElement).focus();
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await expect(blocks).toHaveCount(2);
    await expect(blocks.first()).toHaveText('雨落在旧站台。终风又起。');
    await expect(blocks.nth(1)).toHaveText('');
    await page.keyboard.type('“谁在那里？”');
    await page.locator('[data-set-block-type="dialogue"]').click();
    await expect(editor.locator('[data-block-type="dialogue"]')).toHaveText('“谁在那里？”');
    await page.keyboard.press('End');
    await page.locator('[data-insert-separator]').click();
    await expect(editor.locator('[data-block-type="separator"]')).toHaveCount(1);
    await page.keyboard.type('第二节');
    await page.locator('[data-set-block-type="heading"]').click();
    await expect(editor.locator('[data-block-type="heading"]')).toContainText('第二节');

    await editor.evaluate((element) => {
      const clipboard = new DataTransfer();
      clipboard.setData(
        'text/html',
        '<h3 style="color:red" onclick="alert(1)">网页标题</h3><script>恶意脚本</script><p hidden>隐藏正文</p><blockquote class="remote">“安全网页正文”</blockquote><svg><text>恶意图形</text></svg>',
      );
      clipboard.setData('text/plain', '网页标题\n“安全网页正文”');
      element.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }),
      );
    });
    await expect(editor).toContainText('网页标题');
    await expect(editor).toContainText('“安全网页正文”');
    await expect(editor).not.toContainText('恶意脚本');
    await expect(editor).not.toContainText('恶意图形');
    await expect(editor).not.toContainText('隐藏正文');
    await expect(editor.locator('script, style, svg, [style], [onclick]')).toHaveCount(0);
    await editor.evaluate((element) => {
      const clipboard = new DataTransfer();
      clipboard.setData('text/plain', '纯文本甲\r\n纯文本乙');
      element.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }),
      );
    });
    await expect(editor).toContainText('纯文本甲');
    await expect(editor).toContainText('纯文本乙');

    await openDetails(page, '[data-draft-more-actions]');
    for (const composition of [
      { keystrokes: 'yu', committed: '雨' },
      { keystrokes: 'tggg', committed: '一' },
    ]) {
      await editor.dispatchEvent('compositionstart', { data: composition.keystrokes });
      await expect(page.locator('[data-save-draft]')).toBeDisabled();
      await expect(page.locator('[data-draft-state]')).toContainText('输入法组合中');
      const composingBlockCount = await blocks.count();
      await page.locator('[data-insert-separator]').dispatchEvent('click');
      await expect(blocks).toHaveCount(composingBlockCount);
      await editor.dispatchEvent('compositionend', { data: composition.committed });
      await expect(page.locator('[data-save-draft]')).toBeEnabled();
    }

    await page.locator('[data-save-draft]').click();
    await expect(page.locator('[data-draft-state]')).toHaveText(/^已手动保存$/u);
    const persisted = await page.evaluate(async () => {
      const bridge = (globalThis as unknown as { readonly worldforge: WorldforgeBridge })
        .worldforge;
      const active = await bridge.project.getActive();
      if (!active.ok || !active.data) return null;
      const structure = await bridge.planning.listStructure(active.data.projectId);
      const chapter = structure.ok ? structure.data.volumes[0]?.chapters[0] : undefined;
      if (!chapter) return null;
      const draft = await bridge.draft.open({
        projectId: active.data.projectId,
        chapterId: chapter.id,
      });
      return draft.ok ? draft.data : null;
    });
    expect(persisted).not.toBeNull();
    expect(persisted?.blocks.map((block) => block.blockType)).toEqual(
      expect.arrayContaining(['paragraph', 'dialogue', 'heading', 'separator']),
    );
    expect(new Set(persisted?.blocks.map((block) => block.logicalBlockId)).size).toBe(
      persisted?.blocks.length,
    );

    await blocks.first().click();
    const lockButton = page.locator('[data-toggle-block-lock]');
    await expect(lockButton).toBeEnabled();
    await lockButton.click();
    await expect(lockButton).toHaveAttribute('aria-pressed', 'true');
    await expect(lockButton).toHaveText('解锁当前段落');
    await expect(blocks.first()).toHaveAttribute('data-locked', 'true');
    expect(
      await blocks.first().evaluate((element) => getComputedStyle(element).borderInlineStartWidth),
    ).not.toBe('0px');
    const lockedText = await blocks.first().textContent();
    await page.keyboard.type('越权修改');
    await expect(blocks.first()).toHaveText(lockedText ?? '');
    await expect(page.locator('[data-draft-state]')).toHaveText(/^自动保存完成$/u, {
      timeout: 3_000,
    });

    await page.locator('[data-toggle-writing-outline]').click();
    await expect(page.locator('[data-structure-panel]')).toHaveCount(0);
    await page.locator('[data-toggle-writing-outline]').click();
    await expect(page.locator('[data-structure-panel]')).toBeVisible();
    await page.locator('[data-toggle-focus-mode]').click();
    await expect(page.locator('[data-structure-panel]')).toHaveCount(0);
    await expect(page.locator('.writing-context')).toHaveCount(0);
    await page.locator('[data-toggle-focus-mode]').click();
    await expect(page.locator('[data-structure-panel]')).toBeVisible();
    await expect(page.locator('.writing-context')).toBeVisible();

    await editor.click();
    await page.keyboard.press('Home');
    const selectionBeforeBack = await page.evaluate(() => document.getSelection()?.anchorOffset);
    await page.locator('[data-back-project]').click();
    const savedContinuation = await page.evaluate(async () => {
      const bridge = (globalThis as unknown as { readonly worldforge: WorldforgeBridge })
        .worldforge;
      const active = await bridge.project.getActive();
      if (!active.ok || !active.data) return null;
      const result = await bridge.project.getContinuation(active.data.projectId);
      return result.ok ? result.data : null;
    });
    expect(savedContinuation).toMatchObject({
      status: 'ready',
      chapterTitle: '第一章',
      panel: 'editor',
    });
    await page.locator('[data-chapter-title="第一章"] [data-open-chapter]').click();
    await expect(page.locator('[data-draft-workspace]')).toBeVisible();
    expect(await page.evaluate(() => document.getSelection()?.anchorOffset)).toBe(
      selectionBeforeBack,
    );

    await page.locator('[data-back-project]').click();
    await page.locator('[data-close-project]').click();
    await page.locator('[data-open-recent]').click();
    await expect(page.locator('[data-draft-workspace]')).toBeVisible();
    await expect(page.locator('[data-draft-state]')).toHaveText('已从正文段落重建。');
    await expect(page.locator('[data-draft-content]')).toContainText('雨落在旧站台。终风又起。');
    await expect(page.locator('[data-draft-content] > [data-locked="true"]')).toHaveCount(1);
    const reopenedIds = await page
      .locator('[data-draft-content] > [data-logical-block-id]')
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-logical-block-id')),
      );
    expect(reopenedIds).toEqual(persisted?.blocks.map((block) => block.logicalBlockId));
    await captureAcceptanceScreenshot(page, 'M2-01', 'lockguard-reopen.png');
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
    await page.locator('[data-open-settings]').click();
    await page.locator('[data-settings-navigation="editor"]').click();
    await expect(page.locator('[data-body-font-size]')).toHaveValue('22');
    await expect(page.locator('[data-content-width]')).toHaveValue('wide');
    await page.locator('[data-settings-navigation="appearance"]').click();
    await expect(page.locator('[data-ui-scale]')).toHaveValue('120');
  } finally {
    await closeGracefully(reopened);
  }
});

test('keeps the React shell viewport matrix scroll-free and overlays visible', async () => {
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
        const homeBounds = document
          .querySelector<HTMLElement>('[data-react-home]')
          ?.getBoundingClientRect();
        const mainBounds = document
          .querySelector<HTMLElement>('.react-main')
          ?.getBoundingClientRect();
        const navBounds = document
          .querySelector<HTMLElement>('.react-primary-nav')
          ?.getBoundingClientRect();
        const topBounds = document
          .querySelector<HTMLElement>('.react-top-bar')
          ?.getBoundingClientRect();
        return {
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          mode: document.body.dataset.layoutMode,
          horizontalOverflow:
            Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) -
            window.innerWidth,
          homeWidth: homeBounds?.width ?? 0,
          homeLeft: homeBounds?.left ?? -1,
          homeRight: homeBounds?.right ?? Number.POSITIVE_INFINITY,
          mainLeft: mainBounds?.left ?? -1,
          mainRight: mainBounds?.right ?? Number.POSITIVE_INFINITY,
          navWidth: navBounds?.width ?? 0,
          navLeft: navBounds?.left ?? -1,
          topRight: topBounds?.right ?? Number.POSITIVE_INFINITY,
        };
      });
      expect(layout.mode).toBe(scenario.mode);
      expect(layout.horizontalOverflow).toBeLessThanOrEqual(1);
      expect(layout.homeWidth).toBeGreaterThan(500);
      expect(layout.homeWidth).toBeLessThanOrEqual(1_181);
      expect(layout.homeLeft).toBeGreaterThanOrEqual(layout.mainLeft - 1);
      expect(layout.homeRight).toBeLessThanOrEqual(layout.mainRight + 1);
      expect(layout.topRight).toBeLessThanOrEqual(layout.innerWidth + 1);
      if (scenario.width > 900) {
        expect(layout.navWidth).toBeGreaterThanOrEqual(220);
        expect(layout.navLeft).toBeGreaterThanOrEqual(-1);
      }
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
    const navToggle = page.getByRole('button', { name: '打开一级导航' });
    await navToggle.click();
    await expect(page.locator('.react-primary-nav')).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(navToggle).toBeFocused();

    await setAppearance(page, defaultAppearance);
    await page.locator('[data-create-project]').click();
    const dialogBounds = await page.locator('[data-create-project-dialog]').boundingBox();
    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    expect(dialogBounds).not.toBeNull();
    expect(dialogBounds?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect(dialogBounds?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((dialogBounds?.x ?? 0) + (dialogBounds?.width ?? 0)).toBeLessThanOrEqual(viewport.width);
    expect((dialogBounds?.y ?? 0) + (dialogBounds?.height ?? 0)).toBeLessThanOrEqual(
      viewport.height,
    );
    await page.getByRole('button', { name: '取消' }).click();

    await setContentViewport(application, 3_440, 1_440);
    for (const workspaceAlignment of ['left', 'center', 'right'] as const) {
      await setAppearance(page, { ...defaultAppearance, workspaceAlignment });
      await page.waitForFunction(
        (alignment) => document.body.dataset.workspaceAlignment === alignment,
        workspaceAlignment,
      );
      const margins = await page.locator('[data-react-home]').evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const main = document.querySelector<HTMLElement>('.react-main')?.getBoundingClientRect();
        return {
          left: bounds.left - (main?.left ?? 0),
          right: (main?.right ?? window.innerWidth) - bounds.right,
        };
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
        const home = document.querySelector<HTMLElement>('[data-react-home]');
        const nav = document.querySelector<HTMLElement>('.react-primary-nav');
        return {
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
          horizontalOverflow:
            Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) -
            window.innerWidth,
          homeRight: home?.getBoundingClientRect().right ?? Number.POSITIVE_INFINITY,
          homeWidth: home?.getBoundingClientRect().width ?? 0,
          navWidth: nav?.getBoundingClientRect().width ?? 0,
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
      expect(rendererMetrics.homeRight).toBeLessThanOrEqual(rendererMetrics.innerWidth + 1);
      expect(rendererMetrics.homeWidth).toBeLessThanOrEqual(1_181);
      expect(rendererMetrics.navWidth).toBeGreaterThanOrEqual(220);
      await captureMatrixScreenshot(page, screenshotDirectory, scenario.name, 2_560, 1_440);
    } finally {
      await closeGracefully(application);
    }
  }
});

test('creates immutable Versions, finalizes one, and restores it as a new Draft', async () => {
  test.setTimeout(90_000);
  const userDataPath = await temporaryUserData();
  const createParent = path.join(userDataPath, 'version-projects');
  await mkdir(createParent, { recursive: true });
  const application = await launch(userDataPath, undefined, {
    WORLDFORGE_E2E_CREATE_PARENT: createParent,
  });
  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-create-project]').click();
    await page.locator('[data-project-name]').fill('版本项目');
    await page.locator('[data-confirm-create-project]').click();
    await page.locator('[data-chapter-title="第一章"] [data-open-chapter]').click();
    const editor = page.locator('[data-draft-content]');
    await editor.click();
    await page.keyboard.type('首稿正文');
    await expect(page.locator('[data-draft-state]')).toHaveText(/^自动保存完成$/u, {
      timeout: 3_000,
    });
    const originalDraftId = await page.evaluate(async () => {
      const bridge = (globalThis as unknown as { readonly worldforge: WorldforgeBridge })
        .worldforge;
      const active = await bridge.project.getActive();
      if (!active.ok || !active.data) return null;
      const structure = await bridge.planning.listStructure(active.data.projectId);
      const chapter = structure.ok ? structure.data.volumes[0]?.chapters[0] : undefined;
      if (!chapter) return null;
      const draft = await bridge.draft.open({
        projectId: active.data.projectId,
        chapterId: chapter.id,
      });
      return draft.ok ? draft.data.draftId : null;
    });

    await openDetails(page, 'details.writing-more-menu');
    await page.locator('[data-create-version]').click();
    await page.locator('[data-version-title]').fill('首稿');
    await page.locator('[data-version-label]').fill('第一阶段');
    await page.locator('[data-version-description]').fill('阶段留档');
    await page.locator('[data-confirm-version]').click();
    await expect(page.locator('[data-version-status]')).toContainText('内容不可修改');
    await expect(page.locator('[data-version-row]')).toHaveCount(1);
    await expect(page.locator('[data-version-row]')).toContainText('第一阶段');
    await page.locator('[data-version-action="final"]').click();
    await expect(page.locator('[data-version-row]')).toContainText('定稿');
    await captureAcceptanceScreenshot(page, 'M2-02', 'immutable-version-finalized.png');
    await page.locator('[data-close-versions]').click();

    await editor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('后续修改');
    await expect(page.locator('[data-draft-state]')).toHaveText(/^自动保存完成$/u, {
      timeout: 3_000,
    });
    await openDetails(page, 'details.writing-more-menu');
    await page.locator('[data-open-versions]').click();
    await page.locator('[data-version-action="restore"]').click();
    await expect(page.locator('[data-draft-state]')).toHaveText('已从只读历史版本恢复为新当前稿。');
    await expect(editor).toHaveText('首稿正文');
    const restoredDraftId = await page.evaluate(async () => {
      const bridge = (globalThis as unknown as { readonly worldforge: WorldforgeBridge })
        .worldforge;
      const active = await bridge.project.getActive();
      if (!active.ok || !active.data) return null;
      const structure = await bridge.planning.listStructure(active.data.projectId);
      const chapter = structure.ok ? structure.data.volumes[0]?.chapters[0] : undefined;
      if (!chapter) return null;
      const draft = await bridge.draft.open({
        projectId: active.data.projectId,
        chapterId: chapter.id,
      });
      return draft.ok ? draft.data.draftId : null;
    });
    expect(restoredDraftId).not.toBe(originalDraftId);
  } finally {
    await closeGracefully(application);
  }
});

test('creates a verified recovery point, restores a new project and exports a Version', async () => {
  test.setTimeout(120_000);
  const userDataPath = await temporaryUserData();
  const createParent = path.join(userDataPath, 'recovery-projects');
  const restoreParent = path.join(userDataPath, 'recovered-projects');
  const exportDirectory = path.join(userDataPath, 'recovery-exports');
  await Promise.all([
    mkdir(createParent, { recursive: true }),
    mkdir(restoreParent, { recursive: true }),
    mkdir(exportDirectory, { recursive: true }),
  ]);
  const application = await launch(userDataPath, undefined, {
    WORLDFORGE_E2E_CREATE_PARENT: createParent,
    WORLDFORGE_E2E_RESTORE_PARENT: restoreParent,
    WORLDFORGE_E2E_RECOVERY_EXPORT_DIRECTORY: exportDirectory,
  });
  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-create-project]').click();
    await page.locator('[data-project-name]').fill('恢复E2E');
    await page.locator('[data-confirm-create-project]').click();
    await page.locator('[data-chapter-title="第一章"] [data-open-chapter]').click();
    const editor = page.locator('[data-draft-content]');
    await editor.click();
    await page.keyboard.type('恢复前正文');
    await expect(page.locator('[data-draft-state]')).toHaveText(/^自动保存完成$/u, {
      timeout: 3_000,
    });
    await openDetails(page, 'details.writing-more-menu');
    await page.locator('[data-create-version]').click();
    await page.locator('[data-version-title]').fill('恢复导出版本');
    await page.locator('[data-confirm-version]').click();
    await expect(page.locator('[data-version-row]')).toHaveCount(1);
    await page.locator('[data-close-versions]').click();

    await page.locator('[data-back-project]').click();
    await page.locator('[data-open-recovery]').click();
    await page.locator('[data-create-checkpoint]').click();
    await expect(page.locator('[data-recovery-checkpoints] .recovery-row')).toHaveCount(1, {
      timeout: 10_000,
    });
    await page.locator('[data-export-recovery-version]').click();
    await expect(page.locator('[data-recovery-status]')).toContainText('已导出');
    expect(await readdir(exportDirectory)).toEqual(['第一章-恢复导出版本.txt']);
    expect(await readFile(path.join(exportDirectory, '第一章-恢复导出版本.txt'), 'utf8')).toContain(
      '恢复前正文',
    );

    await page.locator('[data-restore-checkpoint]').click();
    await expect(page.locator('[data-recovery-status]')).toContainText('已注册到最近作品', {
      timeout: 15_000,
    });
    expect(
      (await readdir(restoreParent)).filter((name) => name.endsWith('.worldforge')),
    ).toHaveLength(1);
  } finally {
    await closeGracefully(application);
  }
});

test('records Renderer animation-frame budget during sustained writing scroll', async () => {
  test.setTimeout(120_000);
  const userDataPath = await temporaryUserData();
  const createParent = path.join(userDataPath, 'renderer-performance-projects');
  await mkdir(createParent, { recursive: true });
  const application = await launch(userDataPath, undefined, {
    WORLDFORGE_E2E_CREATE_PARENT: createParent,
  });
  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-create-project]').click();
    await page.locator('[data-project-name]').fill('Renderer帧率');
    await page.locator('[data-confirm-create-project]').click();
    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open', {
      timeout: 20_000,
    });
    const seeded = await page.evaluate(async () => {
      const bridge = (globalThis as unknown as { readonly worldforge: WorldforgeBridge })
        .worldforge;
      const active = await bridge.project.getActive();
      if (!active.ok || !active.data) throw new Error('RENDERER_PERF_ACTIVE_PROJECT_MISSING');
      const structure = await bridge.planning.listStructure(active.data.projectId);
      if (!structure.ok) throw new Error(structure.error.code);
      const chapter = structure.data.volumes[0]?.chapters[0];
      if (!chapter) throw new Error('RENDERER_PERF_CHAPTER_MISSING');
      const opened = await bridge.draft.open({
        projectId: active.data.projectId,
        chapterId: chapter.id,
      });
      if (!opened.ok) throw new Error(opened.error.code);
      const initial = opened.data.blocks[0];
      if (!initial?.contentHash) throw new Error('RENDERER_PERF_INITIAL_BLOCK_MISSING');
      const paragraphs = Array.from(
        { length: 96 },
        (_value, index) =>
          `第${String(index + 1).padStart(3, '0')}段：长篇写作滚动性能基线。${'灯火与长街。'.repeat(8)}`,
      );
      const operations: Parameters<WorldforgeBridge['draft']['applyPatch']>[0]['operations'] = [
        {
          type: 'update',
          logicalBlockId: initial.logicalBlockId,
          expectedHash: initial.contentHash,
          content: paragraphs[0]!,
        },
        ...paragraphs.slice(1).map((content) => ({
          type: 'insert' as const,
          afterLogicalBlockId: initial.logicalBlockId,
          block: { blockType: 'paragraph' as const, content, attributes: {} },
        })),
      ];
      const saved = await bridge.draft.applyPatch({
        projectId: active.data.projectId,
        chapterId: chapter.id,
        draftId: opened.data.draftId,
        baseRevision: opened.data.revision,
        operations,
      });
      if (!saved.ok) throw new Error(saved.error.code);
      return { blockCount: saved.data.blocks.length };
    });
    expect(seeded).toEqual({ blockCount: 96 });
    await page.locator('[data-back-project]').click();
    await page.locator('[data-chapter-title="第一章"] [data-open-chapter]').click();
    const editor = page.locator('[data-draft-content]');
    await expect(editor.locator(':scope > [data-block-type]')).toHaveCount(96, {
      timeout: 20_000,
    });
    await application.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window) throw new Error('RENDERER_PERF_WINDOW_MISSING');
      window.webContents.setBackgroundThrottling(false);
      window.show();
      window.focus();
    });
    await page.bringToFront();
    const metrics = await page.evaluate(async () => {
      const candidates = [
        document.scrollingElement,
        ...Array.from(document.querySelectorAll<HTMLElement>('*')),
      ].filter((element): element is HTMLElement =>
        Boolean(element && element.scrollHeight - element.clientHeight > 200),
      );
      const scroller = candidates.sort(
        (left, right) =>
          right.scrollHeight - right.clientHeight - (left.scrollHeight - left.clientHeight),
      )[0];
      if (!scroller) throw new Error('RENDERER_SCROLL_CONTAINER_MISSING');
      const startedAt = performance.now();
      let frames = 0;
      return await new Promise<{ fps: number; durationMs: number; frames: number }>((resolve) => {
        const step = (timestamp: number): void => {
          frames += 1;
          const elapsed = timestamp - startedAt;
          const maximum = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
          const progress = Math.min(1, elapsed / 3_000);
          scroller.scrollTop =
            progress < 0.5 ? maximum * progress * 2 : maximum * (2 - progress * 2);
          if (elapsed < 3_000) {
            requestAnimationFrame(step);
            return;
          }
          resolve({ fps: (frames * 1_000) / elapsed, durationMs: elapsed, frames });
        };
        requestAnimationFrame(step);
      });
    });
    expect(metrics.fps).toBeGreaterThanOrEqual(50);
    const output = path.join(process.cwd(), 'test-results/electron/m8-renderer-performance.json');
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(
      output,
      `${JSON.stringify({ schemaVersion: 1, taskId: 'M8-02', ...metrics }, null, 2)}\n`,
      'utf8',
    );
  } finally {
    await application.close();
  }
});
