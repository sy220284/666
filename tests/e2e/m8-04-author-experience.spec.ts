import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import type { WorldforgeBridge } from '@worldforge/contracts';

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

test('快速开始只填写作品名称并直接进入正文', async () => {
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'worldforge-m8-04-quick-create-'));
  temporaryDirectories.push(userDataPath);
  const createParent = path.join(userDataPath, 'works');
  await mkdir(createParent, { recursive: true });
  const application = await launch(userDataPath, createParent);

  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');

    await page.locator('[data-create-project]').click();
    const dialog = page.locator('[data-create-project-dialog]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-project-name]')).toBeVisible();
    await expect(dialog.locator('[data-project-channel]')).toHaveCount(0);
    await expect(dialog.locator('[data-project-initial-structure]')).toHaveCount(0);
    await expect(dialog.locator('[data-complete-story-fields]')).toHaveCount(0);
    await expect(dialog.locator('select[name="creativePath"]')).toHaveCount(0);
    await expect(dialog.locator('[data-confirm-create-project]')).toHaveText('选择位置并创建作品');

    await dialog.locator('[data-project-name]').fill('快速开始作品');
    await dialog.locator('[data-confirm-create-project]').click();

    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open');
    await expect(page.locator('[data-writing-workbench]')).toBeVisible();
    await expect(page.locator('[data-draft-workspace]')).toBeVisible();
  } finally {
    await closeGracefully(application);
  }
});

test('写作辅助精准跳转场景节拍并恢复来源位置与焦点', async () => {
  test.setTimeout(90_000);
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'worldforge-m8-04-navigation-'));
  temporaryDirectories.push(userDataPath);
  const createParent = path.join(userDataPath, 'works');
  await mkdir(createParent, { recursive: true });
  const application = await launch(userDataPath, createParent);

  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-create-project]').click();
    await page.locator('[data-project-name]').fill('精准返回验证');
    await page.locator('[data-confirm-create-project]').click();
    await expect(page.locator('[data-writing-workbench]')).toBeVisible();

    const beatId = await page.evaluate(async () => {
      const bridge = (globalThis as unknown as { readonly worldforge: WorldforgeBridge })
        .worldforge;
      const active = await bridge.project.getActive();
      if (!active.ok || !active.data) throw new Error('PROJECT_MISSING');
      const structure = await bridge.planning.listStructure(active.data.projectId);
      if (!structure.ok) throw new Error('STRUCTURE_MISSING');
      const chapter = structure.data.volumes[0]?.chapters[0];
      if (!chapter) throw new Error('CHAPTER_MISSING');
      const created = await bridge.planning.createSceneBeat({
        projectId: active.data.projectId,
        chapterId: chapter.id,
        plotNodeId: null,
        title: '雨夜发现反证',
        goal: '让主角发现证词矛盾',
        coreConflict: '证词与现场不符',
        expectedResult: '主角决定继续追查',
        beatType: 'turn',
        wordTargetPercent: 30,
        required: true,
        characterIds: [],
        locationIds: [],
      });
      if (!created.ok) throw new Error('SCENE_BEAT_CREATE_FAILED');
      const beat = created.data.beats.find((item) => item.title === '雨夜发现反证');
      if (!beat) throw new Error('SCENE_BEAT_MISSING');
      return beat.id;
    });

    await page.locator('[data-writing-assistance] button', { hasText: '刷新' }).click();
    const sourceButton = page.locator(
      `[data-author-return-key="writing-assistance:scene-beat:${beatId}"]`,
    );
    await expect(sourceButton).toBeVisible();
    const sourceScrollTop = await page.locator('.react-main').evaluate((element) => {
      element.scrollTop = 320;
      return element.scrollTop;
    });
    await sourceButton.click();

    await expect(page.locator(`[data-scene-beat-navigation="${beatId}"]`)).toContainText(
      '雨夜发现反证',
    );
    await page.locator('[data-navigation-return] button').click();
    await expect(page.locator('[data-writing-workbench]')).toBeVisible();
    await expect(sourceButton).toBeFocused();
    await expect
      .poll(() => page.locator('.react-main').evaluate((element) => element.scrollTop))
      .toBe(sourceScrollTop);
  } finally {
    await closeGracefully(application);
  }
});
