import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

const temporaryDirectories: string[] = [];
const root = process.cwd();

async function temporaryUserData(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-continuation-e2e-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function launch(
  userDataPath: string,
  projectEnvironment: Readonly<Record<string, string>>,
): Promise<ElectronApplication> {
  const electronArguments: string[] = [];
  if (process.getuid?.() === 0) electronArguments.push('--no-sandbox');
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

function continuationPanel(databasePath: string): string | null {
  try {
    const database = new DatabaseSync(databasePath, { readOnly: true });
    const row = database
      .prepare(
        `SELECT value_json AS valueJson
           FROM project_settings
          WHERE setting_key = 'writing.continuation'`,
      )
      .get() as { readonly valueJson: string } | undefined;
    database.close();
    if (!row) return null;
    const parsed = JSON.parse(row.valueJson) as { readonly panel?: unknown };
    return typeof parsed.panel === 'string' ? parsed.panel : null;
  } catch {
    return null;
  }
}

test.afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

test('persists the final editor panel after a rapid versions round trip and restart', async () => {
  test.setTimeout(90_000);
  const userDataPath = await temporaryUserData();
  const createParent = path.join(userDataPath, 'continuation-projects');
  await mkdir(createParent, { recursive: true });
  const workspace = path.join(createParent, '续写竞态.worldforge');
  const environment = { WORLDFORGE_E2E_CREATE_PARENT: createParent };

  const first = await launch(userDataPath, environment);
  let firstClosed = false;
  try {
    const page = await first.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-create-project]').click();
    await page.locator('[data-project-name]').fill('续写竞态');
    await page.locator('[data-confirm-create-project]').click();
    await page.locator('[data-chapter-title="第一章"] [data-open-chapter]').click();
    await expect(page.locator('[data-draft-workspace]')).toBeVisible();

    const editor = page.locator('[data-draft-content]');
    await editor.click();
    await page.keyboard.type('面板回切验证。');
    await expect(page.locator('[data-draft-state]')).toHaveText(/^自动保存完成$/u, {
      timeout: 5_000,
    });
    await expect
      .poll(() => continuationPanel(path.join(workspace, 'project.sqlite')), { timeout: 5_000 })
      .toBe('editor');

    await page.locator('.writing-more-menu > summary').click();
    await page.locator('[data-open-versions]').click();
    await page.getByRole('button', { name: '返回正文', exact: true }).click();

    await expect
      .poll(() => continuationPanel(path.join(workspace, 'project.sqlite')), { timeout: 5_000 })
      .toBe('editor');
    await expect(page.locator('[data-draft-workspace]')).toBeVisible();

    await closeGracefully(first);
    firstClosed = true;
  } finally {
    if (!firstClosed) await closeGracefully(first);
  }

  expect(continuationPanel(path.join(workspace, 'project.sqlite'))).toBe('editor');

  const reopened = await launch(userDataPath, environment);
  try {
    const page = await reopened.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-open-recent]').click();
    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open', {
      timeout: 20_000,
    });
    await expect(page.locator('[data-draft-workspace]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('[data-writing-save-state]')).toBeVisible();
    await expect(page.locator('[data-draft-editor-controls]')).toBeVisible();
  } finally {
    await closeGracefully(reopened);
  }
});
