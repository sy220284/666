import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import type {
  CandidateCreateFixtureInput,
  CandidateDocument,
  CommandResult,
  WorldforgeBridge,
} from '@worldforge/contracts';

import { captureAcceptanceScreenshot } from './acceptance-screenshot.js';

type CandidateE2EBridge = WorldforgeBridge & {
  readonly candidate: {
    readonly createFixture: (
      input: CandidateCreateFixtureInput,
    ) => Promise<CommandResult<CandidateDocument>>;
  };
};

const temporaryDirectories: string[] = [];
const root = process.cwd();

async function temporaryUserData(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-undo-e2e-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function launch(userDataPath: string, createParent: string): Promise<ElectronApplication> {
  const electronArguments: string[] = [];
  if (process.getuid?.() === 0) electronArguments.push('--no-sandbox');
  electronArguments.push(path.join(root, 'apps/desktop/main'));
  return electron.launch({
    args: electronArguments,
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
  await application.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.close();
  });
  await closed;
}

test.afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

test('reopens a persisted ApplyRecord and safely restores its checkpoint', async () => {
  const userDataPath = await temporaryUserData();
  const createParent = path.join(userDataPath, 'projects');
  await mkdir(createParent, { recursive: true });
  const workspacePath = path.join(createParent, '候选持久撤销.worldforge');
  const first = await launch(userDataPath, createParent);
  let fixture: {
    readonly projectId: string;
    readonly chapterId: string;
    readonly draftId: string;
    readonly baseRevision: number;
    readonly originalText: string;
    readonly candidateText: string;
  };

  try {
    const page = await first.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-create-project]').click();
    await page.locator('[data-project-name]').fill('候选持久撤销');
    await page.locator('[data-project-channel]').fill('长篇');
    await page.locator('[data-confirm-create-project]').click();
    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open');

    fixture = await page.evaluate(async () => {
      const bridge = (globalThis as unknown as { readonly worldforge: CandidateE2EBridge })
        .worldforge;
      const active = await bridge.project.getActive();
      if (!active.ok || !active.data) throw new Error('E2E_ACTIVE_PROJECT_MISSING');
      const structure = await bridge.planning.listStructure(active.data.projectId);
      if (!structure.ok) throw new Error('E2E_STRUCTURE_MISSING');
      const chapter = structure.data.volumes[0]?.chapters[0];
      if (!chapter) throw new Error('E2E_CHAPTER_MISSING');
      const opened = await bridge.draft.open({
        projectId: active.data.projectId,
        chapterId: chapter.id,
      });
      if (!opened.ok) throw new Error('E2E_DRAFT_MISSING');
      const initial = opened.data.blocks[0];
      if (!initial?.contentHash) throw new Error('E2E_DRAFT_BLOCK_MISSING');
      const originalText = '作者已保存的原稿。';
      const prepared = await bridge.draft.applyPatch({
        projectId: active.data.projectId,
        chapterId: chapter.id,
        draftId: opened.data.draftId,
        baseRevision: opened.data.revision,
        operations: [
          {
            type: 'update',
            logicalBlockId: initial.logicalBlockId,
            expectedHash: initial.contentHash,
            content: originalText,
          },
        ],
      });
      if (!prepared.ok) throw new Error('E2E_DRAFT_PREPARE_FAILED');
      const source = prepared.data.blocks[0];
      if (!source?.contentHash) throw new Error('E2E_PREPARED_BLOCK_MISSING');
      const candidateText = '候选稿在重启前已采用。';
      const candidate = await bridge.candidate.createFixture({
        projectId: active.data.projectId,
        chapterId: chapter.id,
        draftId: prepared.data.draftId,
        baseDraftRevision: prepared.data.revision,
        candidateType: 'rewrite',
        completeness: 'complete',
        title: 'E2E持久撤销',
        blocks: [
          {
            logicalBlockId: source.logicalBlockId,
            sourceLogicalBlockIds: [source.logicalBlockId],
            blockType: source.blockType,
            text: candidateText,
            attributes: source.attributes,
            sourceBlockHash: source.contentHash,
          },
        ],
      });
      if (!candidate.ok) throw new Error('E2E_CANDIDATE_CREATE_FAILED');
      return {
        projectId: active.data.projectId,
        chapterId: chapter.id,
        draftId: prepared.data.draftId,
        baseRevision: prepared.data.revision,
        originalText,
        candidateText,
      };
    });

    await page.locator('[data-open-chapter]').click();
    await page.locator('[data-open-candidate-preview]').click();
    await expect(page.locator('[data-candidate-apply-status]')).toContainText('已准备采用');
    await page.locator('[data-apply-candidate]').click();
    await expect(page.locator('[data-candidate-apply-status]')).toContainText('采用成功');
    await expect(page.locator('[data-undo-candidate-apply]')).toBeVisible();
  } finally {
    await closeGracefully(first);
  }

  const reopened = await launch(userDataPath, createParent);
  try {
    const page = await reopened.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-open-recent]').click();
    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open');
    await page.locator('[data-open-chapter]').click();
    await page.locator('[data-open-candidate-preview]').click();
    await expect(page.locator('[data-candidate-apply-status]')).toContainText('可整体撤销');
    await expect(page.locator('[data-undo-candidate-apply]')).toBeEnabled();
    await page.locator('[data-undo-candidate-apply]').click();
    await expect(page.locator('[data-candidate-apply-status]')).toContainText('已撤销本次应用');
    await captureAcceptanceScreenshot(page, 'M2-03', 'persisted-undo-success.png');

    const current = await page.evaluate(async (input) => {
      const bridge = (globalThis as unknown as { readonly worldforge: CandidateE2EBridge })
        .worldforge;
      const result = await bridge.draft.open({
        projectId: input.projectId,
        chapterId: input.chapterId,
      });
      if (!result.ok) throw new Error('E2E_DRAFT_REOPEN_FAILED');
      return { revision: result.data.revision, text: result.data.blocks[0]?.text };
    }, fixture);
    expect(current).toEqual({
      revision: fixture.baseRevision + 2,
      text: fixture.originalText,
    });
  } finally {
    await closeGracefully(reopened);
  }

  const database = new DatabaseSync(path.join(workspacePath, 'project.sqlite'), {
    readOnly: true,
    allowExtension: false,
    enableForeignKeyConstraints: true,
    readBigInts: true,
  });
  try {
    expect(database.prepare('SELECT status FROM candidate_apply_records').get()).toEqual({
      status: 'undone',
    });
    expect(database.prepare('SELECT COUNT(*) AS count FROM draft_patch_log').get()).toEqual({
      count: 3n,
    });
    expect(database.prepare('SELECT status FROM candidates').get()).toEqual({ status: 'accepted' });
  } finally {
    database.close();
  }
});
