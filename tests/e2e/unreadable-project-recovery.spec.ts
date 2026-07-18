import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

import { corruptSqliteHeader } from '../../packages/testkit/src/index.js';
import { captureAcceptanceScreenshot } from './acceptance-screenshot.js';

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

test.afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

test('restores an external checkpoint when project.sqlite is physically unreadable', async () => {
  test.setTimeout(120_000);
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'worldforge-unreadable-recovery-'));
  temporaryDirectories.push(userDataPath);
  const createParent = path.join(userDataPath, 'projects');
  const restoreParent = path.join(userDataPath, 'restored');
  await Promise.all([
    mkdir(createParent, { recursive: true }),
    mkdir(restoreParent, { recursive: true }),
  ]);
  const workspacePath = path.join(createParent, '完全损坏恢复.worldforge');

  const first = await launch(userDataPath, {
    WORLDFORGE_E2E_CREATE_PARENT: createParent,
    WORLDFORGE_E2E_RESTORE_PARENT: restoreParent,
  });
  try {
    const page = await first.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-create-project]').click();
    await page.locator('[data-project-name]').fill('完全损坏恢复');
    await page.locator('[data-project-channel]').fill('长篇');
    await page.locator('[data-confirm-create-project]').click();
    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open');
    await page.locator('[data-open-recovery]').click();
    await page.locator('[data-create-checkpoint]').click();
    await expect(page.locator('[data-recovery-checkpoints] .recovery-row')).toHaveCount(1, {
      timeout: 10_000,
    });
    await page.locator('[data-close-recovery]').click();
    await page.locator('[data-close-project]').click();
    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'closed');
  } finally {
    await closeGracefully(first);
  }

  const databasePath = path.join(workspacePath, 'project.sqlite');
  await corruptSqliteHeader(databasePath);
  const damagedSource = await readFile(databasePath);

  const second = await launch(userDataPath, {
    WORLDFORGE_E2E_OPEN_WORKSPACE: workspacePath,
    WORLDFORGE_E2E_RESTORE_PARENT: restoreParent,
  });
  try {
    const page = await second.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-recover-unreadable-project]').click();
    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'read-only');
    await expect(page.locator('[data-active-project-readonly]')).toContainText('integrity-failed');
    await expect(page.locator('[data-recovery-dialog]')).toBeVisible();
    await expect(page.locator('[data-recovery-checkpoints] .recovery-row')).toHaveCount(1);
    await expect(page.locator('[data-recovery-versions]')).toContainText(
      '当前数据库没有可读取的Version',
    );
    await captureAcceptanceScreenshot(page, 'M1-08', 'unreadable-project-recovery-entry.png');

    await page.locator('[data-restore-checkpoint]').click();
    await expect(page.locator('[data-recovery-status]')).toContainText('已注册到最近项目');
    await captureAcceptanceScreenshot(page, 'M1-08', 'unreadable-project-restored-copy.png');
    expect(await readFile(databasePath)).toEqual(damagedSource);

    await page.locator('[data-close-recovery]').click();
    await page.locator('[data-close-project]').click();
    const recoveredCard = page.locator('[data-recent-card]').filter({ hasText: '恢复副本' });
    await expect(recoveredCard).toHaveCount(1);
    await recoveredCard.locator('[data-open-recent]').click();
    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open');
    await expect(page.locator('[data-active-project-mode]')).toContainText('可写');
  } finally {
    await closeGracefully(second);
  }
});
