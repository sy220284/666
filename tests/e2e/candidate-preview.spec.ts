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
  const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-preview-e2e-'));
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

test.afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

test('previews a Fixture Candidate through the real desktop chain without writing Draft state', async () => {
  const userDataPath = await temporaryUserData();
  const createParent = path.join(userDataPath, 'projects');
  await mkdir(createParent, { recursive: true });
  const workspacePath = path.join(createParent, '候选预览.worldforge');
  const application = await launch(userDataPath, {
    WORLDFORGE_E2E_CREATE_PARENT: createParent,
  });

  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-create-project]').click();
    await page.locator('[data-project-name]').fill('候选预览');
    await page.locator('[data-project-channel]').fill('长篇');
    await page.locator('[data-confirm-create-project]').click();
    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open');

    const fixture = await page.evaluate(async () => {
      const bridge = (globalThis as unknown as { readonly worldforge: CandidateE2EBridge })
        .worldforge;
      const active = await bridge.project.getActive();
      if (!active.ok || !active.data) throw new Error('E2E_ACTIVE_PROJECT_MISSING');
      const structure = await bridge.planning.listStructure(active.data.projectId);
      if (!structure.ok) throw new Error('E2E_STRUCTURE_MISSING');
      const chapter = structure.data.volumes[0]?.chapters[0];
      if (!chapter) throw new Error('E2E_CHAPTER_MISSING');
      const draft = await bridge.draft.open({
        projectId: active.data.projectId,
        chapterId: chapter.id,
      });
      if (!draft.ok) throw new Error('E2E_DRAFT_MISSING');
      const source = draft.data.blocks[0];
      if (!source) throw new Error('E2E_DRAFT_BLOCK_MISSING');
      const candidateText = '候选预览通过真实桌面链路展示，但不写入当前正文。';
      const candidate = await bridge.candidate.createFixture({
        projectId: active.data.projectId,
        chapterId: chapter.id,
        draftId: draft.data.draftId,
        baseDraftRevision: draft.data.revision,
        candidateType: 'rewrite',
        completeness: 'partial',
        title: 'E2E只读候选',
        blocks: [
          {
            logicalBlockId: source.logicalBlockId,
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
        revision: draft.data.revision,
        currentText: source.text,
        candidateText,
      };
    });

    await page.locator('[data-open-chapter]').click();
    await expect(page.locator('[data-draft-workspace]')).toBeVisible();
    await expect(page.locator('[data-open-candidate-preview]')).toBeVisible();
    await page.locator('[data-open-candidate-preview]').click();
    await expect(page.locator('[data-candidate-preview-dialog]')).toBeVisible();
    await expect(page.locator('[data-candidate-preview-select]')).toHaveCount(1);
    await expect(page.locator('[data-candidate-preview-status]')).toContainText(
      `基础 Revision ${fixture.revision}`,
    );
    await expect(page.locator('[data-candidate-preview-warning]')).toContainText('不完整建议稿');
    await expect(page.locator('[data-candidate-preview-current]')).toContainText(
      fixture.currentText,
    );
    await expect(page.locator('[data-candidate-preview-candidate]')).toContainText(
      fixture.candidateText,
    );

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('[data-discard-candidate]').click();
    await expect(page.locator('[data-candidate-preview-status]')).toContainText(
      '候选已丢弃，Draft 未改变',
    );
    await expect(page.locator('[data-discard-candidate]')).toBeDisabled();

    const after = await page.evaluate(async (input) => {
      const bridge = (globalThis as unknown as { readonly worldforge: CandidateE2EBridge })
        .worldforge;
      const draft = await bridge.draft.open({
        projectId: input.projectId,
        chapterId: input.chapterId,
      });
      if (!draft.ok) throw new Error('E2E_DRAFT_REOPEN_FAILED');
      return { revision: draft.data.revision, text: draft.data.blocks[0]?.text };
    }, fixture);
    expect(after).toEqual({ revision: fixture.revision, text: fixture.currentText });
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
    expect(database.prepare('SELECT COUNT(*) AS count FROM candidate_apply_records').get()).toEqual(
      {
        count: 0n,
      },
    );
    expect(
      database.prepare('SELECT COUNT(*) AS count FROM candidate_apply_checkpoints').get(),
    ).toEqual({ count: 0n });
    expect(database.prepare('SELECT status FROM candidates').get()).toEqual({
      status: 'discarded',
    });
  } finally {
    database.close();
  }
});

test('cancels an oversized Candidate Diff through the desktop boundary', async () => {
  const userDataPath = await temporaryUserData();
  const createParent = path.join(userDataPath, 'projects');
  await mkdir(createParent, { recursive: true });
  const workspacePath = path.join(createParent, '候选预览取消.worldforge');
  const application = await launch(userDataPath, {
    WORLDFORGE_E2E_CREATE_PARENT: createParent,
  });

  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-create-project]').click();
    await page.locator('[data-project-name]').fill('候选预览取消');
    await page.locator('[data-project-channel]').fill('长篇');
    await page.locator('[data-confirm-create-project]').click();
    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open');

    await page.evaluate(async () => {
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
      const currentText = '甲'.repeat(2_000_000);
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
            content: currentText,
          },
        ],
      });
      if (!prepared.ok) throw new Error('E2E_DRAFT_PREPARE_FAILED');
      const source = prepared.data.blocks[0];
      if (!source?.contentHash) throw new Error('E2E_PREPARED_BLOCK_MISSING');
      const candidate = await bridge.candidate.createFixture({
        projectId: active.data.projectId,
        chapterId: chapter.id,
        draftId: prepared.data.draftId,
        baseDraftRevision: prepared.data.revision,
        candidateType: 'rewrite',
        completeness: 'complete',
        title: 'E2E超长取消候选',
        blocks: [
          {
            logicalBlockId: source.logicalBlockId,
            sourceLogicalBlockIds: [source.logicalBlockId],
            blockType: source.blockType,
            text: `${'甲'.repeat(1_999_999)}乙`,
            attributes: source.attributes,
            sourceBlockHash: source.contentHash,
          },
        ],
      });
      if (!candidate.ok) throw new Error('E2E_CANDIDATE_CREATE_FAILED');
    });

    await page.locator('[data-open-chapter]').click();
    await page.locator('[data-open-candidate-preview]').click();
    const cancel = page.locator('[data-cancel-candidate-preview]');
    await expect(cancel).toBeVisible();
    await expect(cancel).toBeEnabled();
    // The Worker may finish between Playwright's layout-stability frames; dispatch while enabled.
    await cancel.dispatchEvent('click');
    await expect(page.locator('[data-candidate-preview-status]')).toContainText('差异计算已取消');
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
    expect(database.prepare('SELECT COUNT(*) AS count FROM candidate_apply_records').get()).toEqual(
      { count: 0n },
    );
    expect(
      database.prepare('SELECT COUNT(*) AS count FROM candidate_apply_checkpoints').get(),
    ).toEqual({ count: 0n });
    expect(database.prepare('SELECT status FROM candidates').get()).toEqual({ status: 'pending' });
  } finally {
    database.close();
  }
});
