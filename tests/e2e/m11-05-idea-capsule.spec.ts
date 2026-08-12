import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import type { IdeaCapsuleBridge, WorldforgeBridge } from '@worldforge/contracts';

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

test.afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

test('灵感胶囊可收藏、预览转换并原子跳转到正式大纲目标', async () => {
  test.setTimeout(90_000);
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'worldforge-m11-05-idea-'));
  temporaryDirectories.push(userDataPath);
  const createParent = path.join(userDataPath, 'works');
  await mkdir(createParent, { recursive: true });
  const application = await launch(userDataPath, createParent);

  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-create-project]').click();
    await page.locator('[data-project-name]').fill('灵感胶囊验收');
    await page.locator('[data-confirm-create-project]').click();
    await expect(page.locator('[data-writing-workbench]')).toBeVisible();

    const ideaId = await page.evaluate(async () => {
      const globals = globalThis as unknown as {
        readonly worldforge: WorldforgeBridge;
        readonly worldforgeIdeaCapsule: IdeaCapsuleBridge;
      };
      const active = await globals.worldforge.project.getActive();
      if (!active.ok || !active.data) throw new Error('PROJECT_MISSING');
      const created = await globals.worldforgeIdeaCapsule.operate({
        operation: 'idea.create',
        input: {
          projectId: active.data.projectId,
          ideaKind: 'plot',
          title: '倒着发生的追杀',
          summary: '主角先看到追杀造成的结果，再逐步遭遇原因。',
          content: '每一次反向追索都会让主角提前知道一个代价，却无法知道是谁做出的选择。',
          divergenceLevel: 'different',
          depthLevel: 'expand',
          sourceContext: {
            scopeType: 'project',
            scopeId: active.data.projectId,
            chapterId: null,
          },
        },
      });
      if (!created.ok || !('id' in created.data)) throw new Error('IDEA_CREATE_FAILED');
      return created.data.id;
    });

    await page.locator('[data-open-planning]').click();
    const panel = page.locator('[data-idea-capsule]');
    await expect(panel).toBeVisible();
    const card = page.locator(`[data-idea-card="${ideaId}"]`);
    await expect(card).toContainText('倒着发生的追杀');

    await card.getByRole('button', { name: '收藏' }).click();
    await expect(card.getByRole('button', { name: '取消收藏' })).toBeVisible();
    await card.getByRole('button', { name: '转换' }).click();
    const preview = page.locator('[data-idea-conversion-preview]');
    await expect(preview).toContainText('将创建大纲节点“倒着发生的追杀”');
    await preview.getByRole('button', { name: '确认转换' }).click();

    const target = page.locator('[data-planning-navigation-target]');
    await expect(target).toBeVisible();
    await expect(target).toContainText('倒着发生的追杀');
    await expect(page.locator(`[data-idea-card="${ideaId}"]`)).toContainText('已转换');
  } finally {
    await closeGracefully(application);
  }
});
