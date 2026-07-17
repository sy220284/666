import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

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
    if (!window) throw new Error('M1_09_WINDOW_MISSING');
    if (window.isMaximized()) window.unmaximize();
    window.setPosition(0, 0, false);
    window.setContentSize(1440, 900, false);
  });
}

async function capture(page: Page): Promise<void> {
  const directory = process.env.WORLDFORGE_M1_09_SCREENSHOT_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  const image = await page.screenshot({
    path: path.join(directory, 'm1-09-import-export.png'),
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

test('previews, restructures, imports and atomically exports selected Versions', async () => {
  test.skip(!process.env.WORLDFORGE_RUN_M1_09_ACCEPTANCE, 'Dedicated M1-09 acceptance only.');
  test.setTimeout(180_000);

  const userDataPath = await mkdtemp(path.join(tmpdir(), 'worldforge-m1-09-e2e-'));
  temporaryDirectories.push(userDataPath);
  const createParent = path.join(userDataPath, 'projects');
  const importDirectory = path.join(userDataPath, 'imports');
  const exportDirectory = path.join(userDataPath, 'exports');
  await Promise.all([
    mkdir(createParent, { recursive: true }),
    mkdir(importDirectory, { recursive: true }),
    mkdir(exportDirectory, { recursive: true }),
  ]);
  const importPath = path.join(importDirectory, '旧稿.md');
  await writeFile(
    importPath,
    '# 第一章\n\n雨落旧站。\n\n## 夜谈\n\n“谁在那里？”\n\n---\n\n# 第二章\n\n天将破晓。\n',
    'utf8',
  );

  const application = await launch(userDataPath, {
    WORLDFORGE_E2E_CREATE_PARENT: createParent,
    WORLDFORGE_E2E_IMPORT_FILE: importPath,
    WORLDFORGE_E2E_TEXT_EXPORT_DIRECTORY: exportDirectory,
  });
  try {
    const page = await application.firstWindow();
    await setViewport(application);
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');

    await page.locator('[data-create-project]').click();
    await page.locator('[data-project-name]').fill('M1-09验收项目');
    await page.locator('[data-project-channel]').fill('长篇');
    await page.locator('[data-project-initial-structure]').selectOption('blank');
    await page.locator('[data-confirm-create-project]').click();
    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open');

    await page.locator('[data-open-text-io]').click();
    await expect(page.locator('[data-text-io-dialog]')).toBeVisible();
    await page.locator('[data-preview-import]').click();
    await expect(page.locator('[data-import-plan-chapter]')).toHaveCount(2);
    await expect(page.locator('[data-text-io-status]')).toContainText('UTF-8');

    const previewCounts = await page.evaluate(async () => {
      const bridge = (globalThis as unknown as { readonly worldforge: WorldforgeBridge }).worldforge;
      const active = await bridge.project.getActive();
      if (!active.ok || !active.data) return null;
      const structure = await bridge.planning.listStructure(active.data.projectId);
      const recovery = await bridge.recovery.getOverview(active.data.projectId);
      return {
        volumes: structure.ok ? structure.data.volumes.length : -1,
        checkpoints: recovery.ok ? recovery.data.checkpoints.length : -1,
      };
    });
    expect(previewCounts).toEqual({ volumes: 0, checkpoints: 0 });

    await page.locator('[data-import-plan-action="split"]').first().click();
    await expect(page.locator('[data-import-plan-chapter]')).toHaveCount(3);
    await page.locator('[data-import-plan-action="merge"]').first().click();
    await expect(page.locator('[data-import-plan-chapter]')).toHaveCount(2);
    await page.locator('[data-import-chapter-title]').first().fill('第一章·旧站夜雨');
    await page.locator('[data-import-volume-title]').fill('旧稿整理卷');
    await page.locator('[data-commit-import]').click();
    await expect(page.locator('[data-text-io-status]')).toContainText('已导入 2 章', {
      timeout: 20_000,
    });

    const choices = page.locator('[data-export-version-choice]');
    await expect(choices).toHaveCount(2);
    for (let index = 0; index < 2; index += 1) await choices.nth(index).check();
    await page.locator('[data-export-format]').selectOption('markdown');
    await page.locator('[data-export-file-name]').fill('M1稳定稿');
    await page.locator('[data-export-versions]').click();
    await expect(page.locator('[data-text-io-status]')).toContainText('已原子导出 M1稳定稿.md');
    await capture(page);

    const exportedText = await readFile(path.join(exportDirectory, 'M1稳定稿.md'), 'utf8');
    expect(exportedText).toContain('# 第一章·旧站夜雨');
    expect(exportedText).toContain('## 夜谈');
    expect(exportedText).toContain('# 第二章');

    await page.locator('[data-export-versions]').click();
    await expect(page.locator('[data-text-io-status]')).toContainText(
      '导出失败 · EXPORT_TARGET_EXISTS_002',
    );

    const committed = await page.evaluate(async () => {
      const bridge = (globalThis as unknown as { readonly worldforge: WorldforgeBridge }).worldforge;
      const active = await bridge.project.getActive();
      if (!active.ok || !active.data) return null;
      const structure = await bridge.planning.listStructure(active.data.projectId);
      const recovery = await bridge.recovery.getOverview(active.data.projectId);
      const versions = await bridge.textIo.listExportVersions(active.data.projectId);
      return {
        volumes: structure.ok ? structure.data.volumes.length : -1,
        chapters: structure.ok
          ? structure.data.volumes.reduce((total, volume) => total + volume.chapters.length, 0)
          : -1,
        checkpoints: recovery.ok ? recovery.data.checkpoints.length : -1,
        versions: versions.ok ? versions.data.versions.length : -1,
      };
    });
    expect(committed).toEqual({ volumes: 1, chapters: 2, checkpoints: 1, versions: 2 });
  } finally {
    await closeGracefully(application);
  }
});
