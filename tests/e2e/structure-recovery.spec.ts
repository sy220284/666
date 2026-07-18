import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

const temporaryDirectories: string[] = [];
const root = process.cwd();

async function launch(userDataPath: string, createParent: string): Promise<ElectronApplication> {
  const args = [];
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

test.afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

test('previews split and permanent delete, creates checkpoints, and keeps Draft writes atomic', async () => {
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'worldforge-structure-e2e-'));
  temporaryDirectories.push(userDataPath);
  const createParent = path.join(userDataPath, 'projects');
  await mkdir(createParent, { recursive: true });
  const workspacePath = path.join(createParent, '结构恢复.worldforge');
  const application = await launch(userDataPath, createParent);

  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-create-project]').click();
    await page.locator('[data-project-name]').fill('结构恢复');
    await page.locator('[data-project-channel]').fill('长篇');
    await page.locator('[data-confirm-create-project]').click();
    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open');
    await expect(page.locator('[data-chapter-title="第一章"]')).toBeVisible();

    // Prepare the two-block Draft through the actual editor so Renderer and Core share one state path.
    await page.locator('[data-chapter-title="第一章"] [data-open-chapter]').click();
    await expect(page.locator('[data-draft-workspace]')).toBeVisible();
    await expect(page.locator('[data-draft-state]')).toHaveText('已从 DraftBlock 重建。');
    const editor = page.locator('[data-draft-content]');
    const blocks = editor.locator(':scope > [data-block-type]');
    await expect(blocks).toHaveCount(1);
    await editor.click();
    await page.keyboard.type('保留在第一章。');
    await page.keyboard.press('Enter');
    await page.keyboard.type('拆分后进入新章节。');
    await expect(blocks).toHaveCount(2);
    await page.locator('[data-save-draft]').click();
    await expect(page.locator('[data-draft-state]')).toHaveText(/^已手动保存 · Revision \d+$/u);

    page.on('dialog', async (dialog) => {
      const message = dialog.message();
      if (dialog.type() === 'prompt' && message.includes('新章节标题')) {
        await dialog.accept('拆出章节');
        return;
      }
      if (dialog.type() === 'prompt' && message.includes('第几个正文块')) {
        await dialog.accept('1');
        return;
      }
      if (dialog.type() === 'prompt' && message.includes('请输入完整标题')) {
        await dialog.accept('拆出章节');
        return;
      }
      await dialog.accept();
    });

    await page.locator('.chapter-node').first().locator('[data-split-chapter]').click();
    await expect(page.locator('.chapter-node')).toHaveCount(2);
    await expect(page.locator('.chapter-node')).toContainText(['第一章', '拆出章节']);

    await page.reload();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open');
    await expect(page.locator('.chapter-node')).toHaveCount(2);
    await expect(page.locator('.chapter-node')).toContainText(['第一章', '拆出章节']);

    const splitChapter = page.locator('.chapter-node').filter({ hasText: '拆出章节' });
    await splitChapter.locator('[data-delete-chapter]').click();
    await page.locator('[data-open-trash]').click();
    await expect(page.locator('[data-trash-entry-id]')).toHaveCount(1);
    await page.locator('[data-trash-entry-id]').locator('[data-permanent-delete]').click();
    await expect(page.locator('[data-trash-empty]')).toBeVisible();
    await expect(page.locator('[data-trash-status]')).toContainText('已永久删除 · 恢复点');
    await page.reload();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-open-trash]').click();
    await expect(page.locator('[data-trash-empty]')).toBeVisible();
  } finally {
    await closeGracefully(application);
  }

  const database = new DatabaseSync(path.join(workspacePath, 'project.sqlite'), {
    readOnly: true,
    allowExtension: false,
    enableForeignKeyConstraints: true,
    readBigInts: true,
  });
  try {
    expect(
      database
        .prepare(
          "SELECT operation, COUNT(*) AS count FROM backup_records WHERE operation IN ('split-chapter', 'permanent-delete') GROUP BY operation ORDER BY operation",
        )
        .all(),
    ).toEqual([
      { operation: 'permanent-delete', count: 1n },
      { operation: 'split-chapter', count: 1n },
    ]);
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM chapters WHERE title = '拆出章节'").get(),
    ).toEqual({ count: 0n });
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  } finally {
    database.close();
  }
});
