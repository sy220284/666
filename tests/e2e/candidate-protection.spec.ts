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
  const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-protection-e2e-'));
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

async function setViewport(
  application: ElectronApplication,
  viewport: { readonly width: number; readonly height: number },
): Promise<void> {
  await application.evaluate(({ BrowserWindow }, targetViewport) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) throw new Error('CANDIDATE_PROTECTION_WINDOW_MISSING');
    if (window.isMaximized()) window.unmaximize();
    window.setContentSize(targetViewport.width, targetViewport.height, false);
  }, viewport);
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

test('preserves the newer Draft when Candidate base state is stale', async () => {
  const userDataPath = await temporaryUserData();
  const createParent = path.join(userDataPath, 'projects');
  await mkdir(createParent, { recursive: true });
  const workspacePath = path.join(createParent, '候选保护.worldforge');
  const application = await launch(userDataPath, createParent);

  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-create-project]').click();
    await page.locator('[data-project-name]').fill('候选保护');
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
      if (!source?.contentHash) throw new Error('E2E_DRAFT_BLOCK_MISSING');
      const baseline = await bridge.draft.applyPatch({
        projectId: active.data.projectId,
        chapterId: chapter.id,
        draftId: draft.data.draftId,
        baseRevision: draft.data.revision,
        operations: [
          {
            type: 'update',
            logicalBlockId: source.logicalBlockId,
            expectedHash: source.contentHash,
            content: '候选三栏基础正文',
          },
        ],
      });
      if (!baseline.ok) throw new Error('E2E_BASELINE_DRAFT_FAILED');
      const baselineSource = baseline.data.blocks[0];
      if (!baselineSource?.contentHash) throw new Error('E2E_BASELINE_BLOCK_MISSING');
      const version = await bridge.version.create({
        projectId: active.data.projectId,
        chapterId: chapter.id,
        draftId: baseline.data.draftId,
        baseRevision: baseline.data.revision,
        versionType: 'manual',
        title: '候选三栏基础版本',
      });
      if (!version.ok) throw new Error('E2E_VERSION_CREATE_FAILED');
      const candidate = await bridge.candidate.createFixture({
        projectId: active.data.projectId,
        chapterId: chapter.id,
        draftId: baseline.data.draftId,
        baseDraftRevision: baseline.data.revision,
        candidateType: 'rewrite',
        completeness: 'complete',
        title: 'E2E保护候选',
        sourceVersionId: version.data.versionId,
        blocks: [
          {
            logicalBlockId: baselineSource.logicalBlockId,
            sourceLogicalBlockIds: [baselineSource.logicalBlockId],
            blockType: baselineSource.blockType,
            text: '候选建议正文',
            attributes: baselineSource.attributes,
            sourceBlockHash: baselineSource.contentHash,
          },
        ],
      });
      if (!candidate.ok) throw new Error('E2E_CANDIDATE_CREATE_FAILED');
      return {
        projectId: active.data.projectId,
        chapterId: chapter.id,
        draftId: baseline.data.draftId,
        revision: baseline.data.revision,
        logicalBlockId: baselineSource.logicalBlockId,
        contentHash: baselineSource.contentHash,
      };
    });

    await page.locator('[data-open-chapter]').click();
    await page.locator('[data-open-candidate-preview]').click();
    await expect(page.locator('[data-candidate-apply-status]')).toContainText('已准备采用');

    const threeWay = page.locator('[data-review-three-way]');
    await setViewport(application, { width: 1400, height: 900 });
    await page.waitForFunction(() => window.innerWidth === 1400);
    await expect(threeWay).toBeVisible();
    await expect(threeWay.locator('.review-diff__three-pane:visible')).toHaveCount(3);

    await setViewport(application, { width: 1000, height: 900 });
    await page.waitForFunction(() => window.innerWidth === 1000);
    await expect(threeWay.locator('.review-diff__three-pane:visible')).toHaveCount(2);
    await expect(threeWay.locator('[data-side="base"]')).toBeHidden();

    await setViewport(application, { width: 720, height: 900 });
    await page.waitForFunction(() => window.innerWidth === 720);
    await expect(threeWay.locator('.review-diff__three-pane:visible')).toHaveCount(1);
    await expect(threeWay.locator('[data-side="current"]')).toBeHidden();
    await expect(threeWay.locator('[data-side="comparison"]')).toBeVisible();

    await setViewport(application, { width: 1400, height: 900 });
    await page.waitForFunction(() => window.innerWidth === 1400);

    const changed = await page.evaluate(async (input) => {
      const bridge = (globalThis as unknown as { readonly worldforge: CandidateE2EBridge })
        .worldforge;
      const result = await bridge.draft.applyPatch({
        projectId: input.projectId,
        chapterId: input.chapterId,
        draftId: input.draftId,
        baseRevision: input.revision,
        operations: [
          {
            type: 'update',
            logicalBlockId: input.logicalBlockId,
            expectedHash: input.contentHash,
            content: '人工更新后的正文',
          },
        ],
      });
      if (!result.ok) throw new Error('E2E_DRAFT_CHANGE_FAILED');
      return { revision: result.data.revision, text: result.data.blocks[0]?.text };
    }, fixture);
    expect(changed).toEqual({ revision: fixture.revision + 1, text: '人工更新后的正文' });

    await page.locator('[data-apply-candidate]').click();
    await expect(page.locator('[data-candidate-apply-status]')).toContainText('当前稿未改变');
    await expect(page.locator('[data-candidate-conflict-list]')).toContainText(
      '建议稿生成后当前稿已经变化',
    );

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
    expect(current).toEqual(changed);
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
    expect(database.prepare('SELECT COUNT(*) AS count FROM candidate_conflict_sets').get()).toEqual(
      {
        count: 1n,
      },
    );
    expect(database.prepare('SELECT status FROM candidates').get()).toEqual({ status: 'pending' });
  } finally {
    database.close();
  }
});
