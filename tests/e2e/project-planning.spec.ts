import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

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

test('skips and completes ProjectBrief, drags PlotNodes, and leaves Draft unchanged', async () => {
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'worldforge-planning-e2e-'));
  temporaryDirectories.push(userDataPath);
  const createParent = path.join(userDataPath, 'projects');
  await mkdir(createParent, { recursive: true });
  const application = await launch(userDataPath, createParent);

  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-create-project]').click();
    await page.locator('[data-project-name]').fill('规划工作台');
    await page.locator('[data-project-channel]').fill('长篇');
    await page.locator('[data-confirm-create-project]').click();
    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open');

    const before = await page.evaluate(async () => {
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
      return { projectId: active.data.projectId, draft: draft.data };
    });

    await page.locator('[data-open-planning]').click();
    await expect(page.locator('[data-planning-dialog]')).toBeVisible();
    await expect(page.locator('[data-planning-disclosure="beginner"]')).toBeVisible();
    await expect(page.locator('[data-brief-form] textarea')).toHaveCount(4);

    await page.locator('[data-skip-brief]').click();
    await expect(page.locator('[data-brief-skipped]')).toBeVisible();
    await page.locator('[data-restore-brief]').click();
    await page.locator('[data-planning-mode="professional"]').click();
    await expect(page.locator('[data-planning-disclosure="professional"]')).toBeVisible();
    await expect(page.locator('[data-outline-empty]')).toBeVisible();
    const briefForm = page.locator('[data-brief-form]');
    await briefForm.locator('textarea[name="concept"]').fill('失去名字的人追查被改写的历史。');
    await briefForm.locator('textarea[name="readingPromise"]').fill('谜团升级与线索回收。');
    await briefForm.locator('textarea[name="protagonistGoal"]').fill('找回名字。');
    await briefForm.locator('textarea[name="coreConflict"]').fill('记忆和档案互相否定。');
    await briefForm.locator('textarea[name="endingIntent"]').fill('公开真相并保留缺口。');
    await briefForm.locator('textarea[name="required"]').fill('每卷回收线索\n主角保有选择权');
    await briefForm.locator('textarea[name="forbidden"]').fill('无代价复活');
    await page.locator('[data-save-brief]').click();
    await expect(page.locator('[data-planning-status]')).toContainText('任务书已保存');

    const createNode = async (title: string, type: 'volume' | 'arc' | 'chapter') => {
      await page.locator('[data-create-root-plot-node]').click();
      const dialog = page.locator('[data-plot-node-dialog]');
      await dialog.locator('select[name="nodeType"]').selectOption(type);
      await dialog.locator('input[name="title"]').fill(title);
      await dialog.locator('textarea[name="goal"]').fill(`${title}目标`);
      await dialog.locator('[data-save-plot-node]').click();
      await expect(dialog).not.toBeVisible();
    };

    await createNode('第一卷', 'volume');
    await createNode('第二卷', 'volume');
    await expect(page.locator('[data-plot-node-id]')).toHaveCount(2);

    const first = page.locator('[data-plot-node-id]').filter({ hasText: '第一卷' }).first();
    const second = page.locator('[data-plot-node-id]').filter({ hasText: '第二卷' }).first();
    await second.dragTo(first.locator('[data-outline-drop-child]').first());
    await expect(first.locator('.plot-node__children [data-plot-node-id]')).toContainText('第二卷');
    await expect(page.locator('[data-planning-status]')).toContainText('大纲节点已移动');

    await page.locator('[data-close-planning]').click();
    await page.reload();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-open-planning]').click();
    await page.locator('[data-planning-mode="professional"]').click();
    await expect(page.locator('textarea[name="concept"]')).toHaveValue(
      '失去名字的人追查被改写的历史。',
    );
    const reloadedFirst = page.locator('[data-plot-node-id]').filter({ hasText: '第一卷' }).first();
    await expect(reloadedFirst.locator('.plot-node__children [data-plot-node-id]')).toContainText(
      '第二卷',
    );

    const after = await page.evaluate(async ({ projectId }) => {
      const bridge = (globalThis as unknown as { readonly worldforge: WorldforgeBridge })
        .worldforge;
      const structure = await bridge.planning.listStructure(projectId);
      if (!structure.ok) throw new Error('E2E_STRUCTURE_RELOAD_FAILED');
      const chapter = structure.data.volumes[0]?.chapters[0];
      if (!chapter) throw new Error('E2E_CHAPTER_RELOAD_FAILED');
      const draft = await bridge.draft.open({ projectId, chapterId: chapter.id });
      if (!draft.ok) throw new Error('E2E_DRAFT_RELOAD_FAILED');
      const brief = await bridge.planning.getBrief(projectId);
      const outline = await bridge.planning.listPlotNodes(projectId);
      if (!brief.ok || !outline.ok) throw new Error('E2E_PLANNING_RELOAD_FAILED');
      return { draft: draft.data, brief: brief.data, outline: outline.data };
    }, before);
    expect(after.draft).toEqual(before.draft);
    expect(after.brief.required).toEqual(['每卷回收线索', '主角保有选择权']);
    expect(after.outline.nodes).toHaveLength(2);
  } finally {
    await closeGracefully(application);
  }
});
