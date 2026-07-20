import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import type { ContinuityBridge, WorldforgeBridge } from '@worldforge/contracts';

import { captureAcceptanceScreenshot } from './acceptance-screenshot.js';

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

test('previews split and permanent delete, blocks current chapter references, and keeps Draft writes atomic', async () => {
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

    const prepared = await page.evaluate(async () => {
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
      const preview = await bridge.planning.previewSplitChapter({
        projectId: active.data.projectId,
        chapterId: chapter.id,
        draftId: draft.data.draftId,
        baseRevision: draft.data.revision,
        splitAfterLogicalBlockId: draft.data.blocks[0]!.logicalBlockId,
        newChapterTitle: '拆出章节',
      });
      if (!preview.ok) throw new Error(`E2E_SPLIT_PREVIEW_FAILED:${preview.error.code}`);
      return { blockCount: draft.data.blocks.length, preview: preview.data };
    });
    expect(prepared.blockCount).toBe(2);
    expect(prepared.preview).toMatchObject({ canExecute: true, resultingTargetBlockCount: 1 });

    // Exercise the real UI command and verify stale structure reads cannot overwrite its result.
    await page.evaluate(() => {
      const answers = ['拆出章节', '1'];
      window.prompt = () => answers.shift() ?? null;
      window.confirm = () => true;
    });

    await page.locator('.chapter-node').first().locator('[data-split-chapter]').click();
    await expect(page.locator('.chapter-node')).toHaveCount(2);
    await expect(page.locator('.chapter-node')).toContainText(['第一章', '拆出章节']);
    await captureAcceptanceScreenshot(page, 'M2-04', 'split-chapter-result.png');

    await page.reload();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open');
    await expect(page.locator('.chapter-node')).toHaveCount(2);
    await expect(page.locator('.chapter-node')).toContainText(['第一章', '拆出章节']);

    const anchor = await page.evaluate(async () => {
      const rootWindow = globalThis as unknown as {
        readonly worldforge: WorldforgeBridge;
        readonly worldforgeContinuity: ContinuityBridge;
      };
      const active = await rootWindow.worldforge.project.getActive();
      if (!active.ok || !active.data) throw new Error('E2E_PROJECT_MISSING');
      const structure = await rootWindow.worldforge.planning.listStructure(active.data.projectId);
      if (!structure.ok) throw new Error('E2E_STRUCTURE_MISSING');
      const chapter = structure.data.volumes
        .flatMap((volume) => volume.chapters)
        .find((candidate) => candidate.title === '拆出章节');
      if (!chapter) throw new Error('E2E_SPLIT_CHAPTER_MISSING');
      const event = await rootWindow.worldforgeContinuity.saveTimelineEvent({
        projectId: active.data.projectId,
        authority: 'author',
        eventId: null,
        title: '拆出章节锚点',
        startValue: '2026-07-20',
        endValue: null,
        precision: 'day',
        chapterId: chapter.id,
        locationId: null,
        description: '永久删除必须先解除该章节锚点。',
        participantIds: [],
        witnessIds: [],
        subjectIds: [],
        dependencyIds: [],
      });
      if (!event.ok) throw new Error(`E2E_TIMELINE_EVENT_FAILED:${event.error.code}`);
      return {
        projectId: active.data.projectId,
        chapterId: chapter.id,
        eventId: event.data.id,
      };
    });

    // Reinstall deterministic confirmation after reload for delete and permanent-delete UI actions.
    await page.evaluate(() => {
      window.confirm = () => true;
      window.prompt = () => '拆出章节';
    });
    const splitChapter = page.locator('.chapter-node').filter({ hasText: '拆出章节' });
    await splitChapter.locator('[data-delete-chapter]').click();
    await page.locator('[data-open-trash]').click();
    await expect(page.locator('[data-trash-entry-id]')).toHaveCount(1);

    await page.locator('[data-trash-entry-id]').locator('[data-permanent-delete]').click();
    await expect(page.locator('[data-trash-entry-id]')).toHaveCount(1);
    await expect(page.locator('[data-trash-status]')).toContainText('timeline_events.chapter_id');
    await expect(page.locator('[data-trash-status]')).toContainText('SET NULL');
    await captureAcceptanceScreenshot(page, 'M2-04', 'permanent-delete-reference-blocked.png');

    await page.evaluate(async (value) => {
      const continuity = (globalThis as unknown as {
        readonly worldforgeContinuity: ContinuityBridge;
      }).worldforgeContinuity;
      const updated = await continuity.saveTimelineEvent({
        projectId: value.projectId,
        authority: 'author',
        eventId: value.eventId,
        title: '拆出章节锚点',
        startValue: '2026-07-20',
        endValue: null,
        precision: 'day',
        chapterId: null,
        locationId: null,
        description: '永久删除前已由作者明确解除章节锚点。',
        participantIds: [],
        witnessIds: [],
        subjectIds: [],
        dependencyIds: [],
      });
      if (!updated.ok) throw new Error(`E2E_TIMELINE_EVENT_UPDATE_FAILED:${updated.error.code}`);
    }, anchor);

    await page.locator('[data-trash-entry-id]').locator('[data-permanent-delete]').click();
    await expect(page.locator('[data-trash-empty]')).toBeVisible();
    await expect(page.locator('[data-trash-status]')).toContainText('已永久删除 · 恢复点');
    await captureAcceptanceScreenshot(page, 'M2-04', 'permanent-delete-checkpoint.png');
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
    expect(
      database.prepare("SELECT chapter_id FROM timeline_events WHERE title = '拆出章节锚点'").get(),
    ).toEqual({ chapter_id: null });
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  } finally {
    database.close();
  }
});
