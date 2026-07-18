import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import type { WorldforgeBridge } from '@worldforge/contracts';

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

    await page.evaluate(async () => {
      const bridge = (globalThis as unknown as { readonly worldforge: WorldforgeBridge })
        .worldforge;
      const active = await bridge.project.getActive();
      if (!active.ok || !active.data) throw new Error('E2E_PROJECT_MISSING');
      const structure = await bridge.planning.listStructure(active.data.projectId);
      if (!structure.ok) throw new Error('E2E_STRUCTURE_MISSING');
      const chapter = structure.data.volumes[0]?.chapters[0];
      if (!chapter) throw new Error('E2E_CHAPTER_MISSING');
      const draft = await bridge.draft.open({
        projectId: active.data.projectId,
        chapterId: chapter.id,
      });
      if (!draft.ok) throw new Error('E2E_DRAFT_MISSING');
      const inserted = await bridge.draft.applyPatch({
        projectId: active.data.projectId,
        chapterId: chapter.id,
        draftId: draft.data.draftId,
        baseRevision: draft.data.revision,
        operations: [
          {
            type: 'insert',
            afterLogicalBlockId: draft.data.blocks[0]!.logicalBlockId,
            block: { blockType: 'paragraph', content: '拆分后进入新章节。', attributes: {} },
          },
        ],
      });
      if (!inserted.ok) throw new Error('E2E_DRAFT_PREPARE_FAILED');
      const splitInput = {
        projectId: active.data.projectId,
        chapterId: chapter.id,
        draftId: inserted.data.draftId,
        baseRevision: inserted.data.revision,
        splitAfterLogicalBlockId: inserted.data.blocks[0]!.logicalBlockId,
        newChapterTitle: '拆出章节',
      };
      const preview = await bridge.planning.previewSplitChapter(splitInput);
      if (!preview.ok || !preview.data.canExecute) throw new Error('E2E_SPLIT_PREVIEW_FAILED');
      const split = await bridge.planning.splitChapter({
        ...splitInput,
        planHash: preview.data.planHash,
      });
      if (!split.ok) throw new Error(`E2E_SPLIT_FAILED:${split.error.code}`);
    });

    page.on('dialog', async (dialog) => {
      if (dialog.type() === 'prompt' && dialog.message().includes('完整标题')) {
        await dialog.accept('拆出章节');
      } else {
        await dialog.accept();
      }
    });

    await page.reload();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open');
    await expect(page.locator('.chapter-node')).toHaveCount(2);
    await expect(page.locator('.chapter-node')).toContainText(['第一章', '拆出章节']);

    const splitChapter = page.locator('.chapter-node').filter({ hasText: '拆出章节' });
    await splitChapter.locator('[data-delete-chapter]').click();
    await page.locator('[data-open-trash]').click();
    await expect(page.locator('[data-trash-entry-id]')).toHaveCount(1);
    await page.locator('[data-permanent-delete]').click();
    await expect(page.locator('[data-trash-status]')).toContainText('已永久删除 · 恢复点');
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
