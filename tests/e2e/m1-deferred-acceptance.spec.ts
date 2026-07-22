import { mkdir, mkdtemp, rm } from 'node:fs/promises';
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
import type { WorldforgeBridge } from '@worldforge/contracts';

const root = process.cwd();
const temporaryDirectories: string[] = [];

async function launch(
  userDataPath: string,
  environment: Readonly<Record<string, string>>,
): Promise<ElectronApplication> {
  const args: string[] = [];
  if (process.getuid?.() === 0) args.push('--no-sandbox');
  args.push(path.join(root, 'apps/desktop/main'));
  return electron.launch({
    args,
    env: {
      ...process.env,
      WORLDFORGE_E2E: '1',
      WORLDFORGE_E2E_USER_DATA: userDataPath,
      ...environment,
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
    if (!window) throw new Error('M1_ACCEPTANCE_WINDOW_MISSING');
    if (window.isMaximized()) window.unmaximize();
    window.setPosition(0, 0, false);
    window.setContentSize(1440, 900, false);
  });
}

async function capture(page: Page, name: string): Promise<void> {
  const directory =
    process.env.WORLDFORGE_M1_ACCEPTANCE_SCREENSHOTS ??
    path.join(process.env.WORLDFORGE_E2E_OUTPUT_DIR ?? 'test-results/m1-acceptance', 'screenshots');
  await mkdir(directory, { recursive: true });
  const image = await page.screenshot({
    path: path.join(directory, name),
    animations: 'disabled',
    fullPage: false,
    scale: 'device',
  });
  expect(image.subarray(1, 4).toString('ascii')).toBe('PNG');
  expect(image.byteLength).toBeGreaterThan(10_000);
}

test.afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test('completes the M1-01 through M1-08 evidence-backed UI acceptance chain', async () => {
  test.setTimeout(180_000);
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'worldforge-m1-acceptance-'));
  temporaryDirectories.push(userDataPath);
  const createParent = path.join(userDataPath, 'projects');
  const restoreParent = path.join(userDataPath, 'restored');
  const exportDirectory = path.join(userDataPath, 'exports');
  await Promise.all([
    mkdir(createParent, { recursive: true }),
    mkdir(restoreParent, { recursive: true }),
    mkdir(exportDirectory, { recursive: true }),
  ]);
  const environment = {
    WORLDFORGE_E2E_CREATE_PARENT: createParent,
    WORLDFORGE_E2E_RESTORE_PARENT: restoreParent,
    WORLDFORGE_E2E_RECOVERY_EXPORT_DIRECTORY: exportDirectory,
  };
  const workspacePath = path.join(createParent, 'M1验收项目.worldforge');

  const application = await launch(userDataPath, environment);
  let closed = false;
  try {
    const page = await application.firstWindow();
    await setViewport(application);
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');

    await page.locator('[data-create-project]').click();
    await page.locator('[data-project-name]').fill('M1验收项目');
    await page.locator('[data-project-channel]').fill('长篇');
    await page.locator('[data-confirm-create-project]').click();
    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open');
    await page.locator('[data-close-project]').click();
    await expect(page.locator('[data-recent-card]')).toHaveCount(1);
    await page.locator('[data-open-settings]').click();
    await page.locator('[data-default-mode]').selectOption('professional');
    await page.locator('[data-save-settings]').click();
    await page.locator('[data-settings-navigation="appearance"]').click();
    await page.locator('[data-theme-id]').selectOption('theme-b');
    await page.locator('[data-theme-variant]').selectOption('dark');
    await page.locator('[data-save-settings]').click();
    await expect(page.locator('[data-settings-status]')).toHaveText('显示设置已保存到应用数据库。');
    await capture(page, 'm1-01-settings-recent.png');
    await page.locator('[data-close-settings]').click();

    await page.locator('[data-open-recent]').click();
    await expect(page.locator('[data-active-project-path]')).toHaveText(workspacePath);
    await capture(page, 'm1-02-project-workspace.png');

    await page.locator('[data-create-volume]').click();
    await page.locator('[data-structure-title]').fill('第二卷');
    await page.locator('[data-save-structure]').click();
    await page.locator('[data-volume-title="第一卷"] [data-add-chapter]').click();
    await page.locator('[data-structure-title]').fill('第二章');
    await page.locator('[data-save-structure]').click();
    await page.locator('[data-chapter-title="第二章"] [data-edit-chapter]').click();
    await page.locator('[data-structure-status]').selectOption('writing');
    await page.locator('[data-structure-volume]').selectOption({ label: '第二卷' });
    await page.locator('input[name="targetWordMin"]').fill('2000');
    await page.locator('input[name="targetWordMax"]').fill('3000');
    await page.locator('[data-save-structure]').click();
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('[data-chapter-title="第二章"] [data-delete-chapter]').click();
    await page.locator('[data-open-trash]').click();
    await expect(page.locator('[data-trash-entry-id]')).toHaveCount(1);
    await page.locator('[data-restore-original]').click();
    await page.locator('[data-close-trash]').click();
    await expect(
      page.locator('[data-volume-title="第二卷"] [data-chapter-title="第二章"]'),
    ).toContainText('写作中 · 2000—3000 字');
    await capture(page, 'm1-03-volume-chapter-trash.png');

    await page.locator('[data-chapter-title="第一章"] [data-open-chapter]').click();
    const editor = page.locator('[data-draft-content]');
    const blocks = editor.locator(':scope > [data-block-type]');
    await editor.click();
    await page.keyboard.type('雨落在旧站台。');
    await page.keyboard.press('Enter');
    await page.keyboard.type('“谁在那里？”');
    await page.locator('[data-set-block-type="dialogue"]').click();
    const dialogueBlock = editor.locator('[data-block-type="dialogue"]');
    await expect(dialogueBlock).toContainText('谁在那里');
    await dialogueBlock.click();
    await page.keyboard.press('End');
    await page.locator('[data-insert-separator]').click();
    await expect(editor.locator('[data-block-type="separator"]')).toHaveCount(1);
    const trailingParagraph = editor.locator('[data-block-type="paragraph"]').last();
    await trailingParagraph.click();
    await page.keyboard.type('第二节');
    await page.locator('[data-set-block-type="heading"]').click();
    await expect(blocks).toHaveCount(4);
    await expect(
      editor.locator('[data-block-type="paragraph"]').filter({ hasText: '雨落在旧站台。' }),
    ).toHaveCount(1);
    await expect(editor.locator('[data-block-type="dialogue"]')).toContainText('谁在那里');
    await expect(editor.locator('[data-block-type="separator"]')).toHaveCount(1);
    await expect(editor.locator('[data-block-type="heading"]')).toContainText('第二节');
    await capture(page, 'm1-04-chinese-block-editor.png');

    await page.locator('[data-save-draft]').click();
    await expect(page.locator('[data-draft-state]')).toHaveText(/^已手动保存 · Revision \d+$/u);
    const revision = await page.evaluate(async () => {
      const bridge = (globalThis as unknown as { readonly worldforge: WorldforgeBridge })
        .worldforge;
      const active = await bridge.project.getActive();
      if (!active.ok || !active.data) return -1;
      const structure = await bridge.planning.listStructure(active.data.projectId);
      const chapter = structure.ok ? structure.data.volumes[0]?.chapters[0] : undefined;
      if (!chapter) return -1;
      const draft = await bridge.draft.open({
        projectId: active.data.projectId,
        chapterId: chapter.id,
      });
      return draft.ok ? draft.data.revision : -1;
    });
    expect(revision).toBeGreaterThan(0);
    await capture(page, 'm1-05-patch-revision.png');

    await page.locator('[data-draft-find]').fill('雨');
    await page.locator('[data-draft-find-next]').click();
    await expect(page.locator('[data-draft-find-status]')).toContainText('1');
    await expect(page.locator('[data-draft-character-count]')).not.toHaveText('0');
    await expect(page.locator('[data-draft-text-count]')).not.toHaveText('0');
    await capture(page, 'm1-06-autosave-stats-find.png');

    await page.locator('[data-create-version]').click();
    await page.locator('[data-version-title]').fill('M1验收版本');
    await page.locator('[data-version-label]').fill('阶段定稿');
    await page.locator('[data-version-description]').fill('延期验收固定版本');
    await page.locator('[data-confirm-version]').click();
    await expect(page.locator('[data-version-row]')).toHaveCount(1);
    await page.locator('[data-version-action="final"]').click();
    await expect(page.locator('[data-version-row]')).toContainText('定稿');
    await capture(page, 'm1-07-version-history.png');
    await page.locator('[data-close-versions]').click();

    await page.locator('[data-back-project]').click();
    await page.locator('[data-open-recovery]').click();
    await page.locator('[data-create-checkpoint]').click();
    await expect(page.locator('[data-recovery-checkpoints] .recovery-row')).toHaveCount(1, {
      timeout: 10_000,
    });
    await page.locator('[data-export-recovery-version]').click();
    await expect(page.locator('[data-recovery-status]')).toContainText('已导出');
    await capture(page, 'm1-08-recovery-center.png');
    await page.locator('[data-close-recovery]').click();
    await page.locator('[data-close-project]').click();
    await closeGracefully(application);
    closed = true;
  } finally {
    if (!closed) await closeGracefully(application);
  }

  const projectDatabase = new DatabaseSync(path.join(workspacePath, 'project.sqlite'));
  projectDatabase
    .prepare(
      `INSERT INTO schema_migrations(version, name, checksum, applied_at, app_version)
       VALUES(99, 'm1-acceptance-future', 'm1-acceptance-future-checksum', ?, '9.0.0')`,
    )
    .run('2026-07-17T02:30:00.000Z');
  projectDatabase.close();

  const readOnlyApplication = await launch(userDataPath, environment);
  try {
    const page = await readOnlyApplication.firstWindow();
    await setViewport(readOnlyApplication);
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-open-recent]').click();
    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'read-only');
    await expect(page.locator('[data-active-project-readonly]')).toContainText('future-schema');
    await expect(page.locator('[data-move-project]')).toBeDisabled();
    await capture(page, 'm1-02-read-only.png');
    await page.locator('[data-open-recovery]').click();
    await expect(page.locator('[data-recovery-checkpoints] .recovery-row')).toHaveCount(1);
    await expect(page.locator('[data-create-checkpoint]')).toBeDisabled();
    await capture(page, 'm1-08-readonly-recovery.png');
  } finally {
    await closeGracefully(readOnlyApplication);
  }
});
