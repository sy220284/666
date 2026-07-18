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
      if (!source?.contentHash) throw new Error('E2E_DRAFT_BLOCK_MISSING');
      const candidate = await bridge.candidate.createFixture({
        projectId: active.data.projectId,
        chapterId: chapter.id,
        draftId: draft.data.draftId,
        baseDraftRevision: draft.data.revision,
        candidateType: 'rewrite',
        completeness: 'complete',
        title: 'E2E保护候选',
        blocks: [
          {
            logicalBlockId: source.logicalBlockId,
            sourceLogicalBlockIds: [source.logicalBlockId],
            blockType: source.blockType,
            text: '候选旧基线正文',
            attributes: source.attributes,
            sourceBlockHash: source.contentHash,
          },
        ],
      });
      if (!candidate.ok) throw new Error('E2E_CANDIDATE_CREATE_FAILED');
      return {
        projectId: active.data.projectId,
        chapterId: chapter.id,
        draftId: draft.data.draftId,
        revision: draft.data.revision,
        logicalBlockId: source.logicalBlockId,
        contentHash: source.contentHash,
      };
    });

    await page.locator('[data-open-chapter]').click();
    await page.locator('[data-open-candidate-preview]').click();
    await expect(page.locator('[data-candidate-apply-status]')).toContainText('已准备采用');

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
    await expect(page.locator('[data-candidate-apply-status]')).toContainText('Draft未改变');
    await expect(page.locator('[data-candidate-conflict-list]')).toContainText('revision');

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
    expect(database.prepare('SELECT COUNT(*) AS count FROM candidate_apply_records').get()).toEqual({
      count: 0n,
    });
    expect(
      database.prepare('SELECT COUNT(*) AS count FROM candidate_apply_checkpoints').get(),
    ).toEqual({ count: 0n });
    expect(database.prepare('SELECT COUNT(*) AS count FROM candidate_conflict_sets').get()).toEqual({
      count: 1n,
    });
    expect(database.prepare('SELECT status FROM candidates').get()).toEqual({ status: 'pending' });
  } finally {
    database.close();
  }
});
