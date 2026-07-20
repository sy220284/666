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
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test('creates and deletes a SceneBeat with entity selectors while preserving Draft content', async () => {
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'worldforge-scene-beat-e2e-'));
  temporaryDirectories.push(userDataPath);
  const createParent = path.join(userDataPath, 'projects');
  await mkdir(createParent, { recursive: true });
  const application = await launch(userDataPath, createParent);

  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-create-project]').click();
    await page.locator('[data-project-name]').fill('SceneBeat工作台');
    await page.locator('[data-project-channel]').fill('长篇');
    await page.locator('[data-confirm-create-project]').click();
    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open');

    const before = await page.evaluate(async () => {
      const bridge = (globalThis as unknown as { readonly worldforge: WorldforgeBridge })
        .worldforge;
      const active = await bridge.project.getActive();
      if (!active.ok || !active.data) throw new Error('PROJECT_MISSING');
      const structure = await bridge.planning.listStructure(active.data.projectId);
      if (!structure.ok) throw new Error('STRUCTURE_MISSING');
      const chapter = structure.data.volumes[0]?.chapters[0];
      if (!chapter) throw new Error('CHAPTER_MISSING');
      const draft = await bridge.draft.open({
        projectId: active.data.projectId,
        chapterId: chapter.id,
      });
      if (!draft.ok) throw new Error('DRAFT_MISSING');
      const characters = await bridge.canon.create({
        projectId: active.data.projectId,
        authority: 'author',
        entityType: 'character',
        name: '林照夜',
        aliases: [],
        summary: '调查者',
      });
      if (!characters.ok) throw new Error('CHARACTER_CREATE_FAILED');
      const character = characters.data.entities.find((entity) => entity.name === '林照夜');
      if (!character) throw new Error('CHARACTER_MISSING');
      const locations = await bridge.canon.create({
        projectId: active.data.projectId,
        authority: 'author',
        entityType: 'location',
        name: '旧档案馆',
        aliases: [],
        summary: '证据现场',
      });
      if (!locations.ok) throw new Error('LOCATION_CREATE_FAILED');
      const location = locations.data.entities.find((entity) => entity.name === '旧档案馆');
      if (!location) throw new Error('LOCATION_MISSING');
      return {
        projectId: active.data.projectId,
        chapterId: chapter.id,
        draft: draft.data,
        characterId: character.id,
        locationId: location.id,
      };
    });

    await page.locator('[data-open-planning]').click();
    await expect(page.locator('[data-planning-dialog]')).toBeVisible();
    await page.locator('[data-create-scene-beat]').click();
    const dialog = page.locator('[data-scene-beat-dialog]');
    const characterSelector = dialog.locator('select[data-scene-beat-entity-selector="character"]');
    const locationSelector = dialog.locator('select[data-scene-beat-entity-selector="location"]');
    await expect(characterSelector).toContainText('林照夜');
    await expect(locationSelector).toContainText('旧档案馆');
    await expect(dialog.locator('textarea[name="characterIds"]')).toBeHidden();
    await expect(dialog.locator('textarea[name="locationIds"]')).toBeHidden();
    await characterSelector.selectOption(before.characterId);
    await locationSelector.selectOption(before.locationId);
    await dialog.locator('input[name="title"]').fill('发现第一条反证');
    await dialog.locator('select[name="beatType"]').selectOption('turn');
    await dialog.locator('input[name="wordTargetPercent"]').fill('20');
    await dialog.locator('textarea[name="goal"]').fill('推动主角继续调查');
    await dialog.locator('textarea[name="coreConflict"]').fill('证词和物证相反');
    await dialog.locator('textarea[name="expectedResult"]').fill('主角获得新目标');
    await dialog.locator('input[name="required"]').check();
    await page.locator('[data-save-scene-beat]').click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('[data-scene-beat-list]')).toContainText('发现第一条反证');
    await expect(page.locator('[data-planning-status]')).toContainText('SceneBeat已保存');

    const saved = await page.evaluate(async ({ projectId, chapterId }) => {
      const bridge = (globalThis as unknown as { readonly worldforge: WorldforgeBridge })
        .worldforge;
      const beats = await bridge.planning.listSceneBeats({ projectId, chapterId });
      if (!beats.ok) throw new Error('SCENE_BEAT_READ_FAILED');
      return beats.data.beats[0];
    }, before);
    expect(saved).toMatchObject({
      characterIds: [before.characterId],
      locationIds: [before.locationId],
    });

    const outputDirectory = process.env.WORLDFORGE_E2E_OUTPUT_DIR;
    if (outputDirectory) {
      await mkdir(outputDirectory, { recursive: true });
      await page.screenshot({
        path: path.join(outputDirectory, 'm3-02-scene-beat-entity-selector.png'),
        fullPage: true,
      });
    }

    page.once('dialog', (prompt) => prompt.accept());
    await page
      .locator('[data-scene-beat-list] .scene-beat-card')
      .getByRole('button', { name: '删除' })
      .click();
    await expect(page.locator('[data-scene-beat-list]')).toContainText('当前章节尚无SceneBeat');
    await expect(page.locator('[data-deleted-scene-beat-list]')).toContainText('发现第一条反证');

    const after = await page.evaluate(async ({ projectId, chapterId }) => {
      const bridge = (globalThis as unknown as { readonly worldforge: WorldforgeBridge })
        .worldforge;
      const draft = await bridge.draft.open({ projectId, chapterId });
      const beats = await bridge.planning.listSceneBeats({ projectId, chapterId });
      if (!draft.ok || !beats.ok) throw new Error('STATE_READ_FAILED');
      return { draft: draft.data, beats: beats.data };
    }, before);
    expect(after.draft).toEqual(before.draft);
    expect(after.beats.beats).toEqual([]);
    expect(after.beats.deletedBeats).toHaveLength(1);
  } finally {
    await closeGracefully(application);
  }
});
