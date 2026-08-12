import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

const temporaryDirectories: string[] = [];
const root = process.cwd();

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

async function addChapter(page: Awaited<ReturnType<ElectronApplication['firstWindow']>>, title: string) {
  await page.locator('[data-add-chapter]').first().click();
  const dialog = page.locator('[data-structure-dialog]');
  await expect(dialog).toBeVisible();
  await dialog.locator('[data-structure-title]').fill(title);
  await dialog.locator('[data-save-structure]').click();
  await expect(page.locator(`[data-chapter-title="${title}"]`)).toBeVisible();
}

test.afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

test('作者连续点击多个章节时最终停在最后点击的章节', async () => {
  test.setTimeout(90_000);
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'worldforge-rapid-chapter-'));
  temporaryDirectories.push(userDataPath);
  const createParent = path.join(userDataPath, 'works');
  await mkdir(createParent, { recursive: true });
  const application = await launch(userDataPath, createParent);

  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-create-project]').click();
    await page.locator('[data-project-name]').fill('快速切章验收');
    await page.locator('[data-confirm-create-project]').click();
    await expect(page.locator('[data-writing-workbench]')).toBeVisible();

    await addChapter(page, '第二章');
    await addChapter(page, '第三章');
    await expect(page.locator('[data-open-chapter]')).toHaveCount(3);

    await page.evaluate(() => {
      const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-open-chapter]')];
      buttons[1]?.click();
      buttons[2]?.click();
    });

    await expect(page.locator('[data-chapter-title="第三章"]')).toHaveClass(/is-selected/);
  } finally {
    await closeGracefully(application);
  }
});
