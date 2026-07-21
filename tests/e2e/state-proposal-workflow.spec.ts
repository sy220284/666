import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import type { StateProposalBridge, WorldforgeBridge } from '@worldforge/contracts';

const root = process.cwd();
const temporaryDirectories: string[] = [];

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

test('keeps a proposal pending until the author accepts it and then exposes the ending snapshot', async () => {
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'worldforge-state-proposal-e2e-'));
  temporaryDirectories.push(userDataPath);
  const createParent = path.join(userDataPath, 'projects');
  await mkdir(createParent, { recursive: true });
  const application = await launch(userDataPath, createParent);

  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-create-project]').click();
    await page.locator('[data-project-name]').fill('状态提案工程');
    await page.locator('[data-project-channel]').fill('悬疑');
    await page.locator('[data-confirm-create-project]').click();
    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open');

    const seeded = await page.evaluate(async () => {
      const rootWindow = globalThis as unknown as {
        readonly worldforge: WorldforgeBridge;
        readonly worldforgeStateProposal: StateProposalBridge;
      };
      const bridge = rootWindow.worldforge;
      const stateProposal = rootWindow.worldforgeStateProposal;
      const active = await bridge.project.getActive();
      if (!active.ok || !active.data) throw new Error('PROJECT_MISSING');
      const projectId = active.data.projectId;
      const structure = await bridge.planning.listStructure(projectId);
      if (!structure.ok) throw new Error('STRUCTURE_MISSING');
      const chapter = structure.data.volumes[0]?.chapters[0];
      if (!chapter) throw new Error('CHAPTER_MISSING');

      let catalog = await bridge.canon.create({
        projectId,
        authority: 'author',
        entityType: 'character',
        name: '沈砚',
        aliases: [],
        summary: '',
      });
      if (!catalog.ok) throw new Error(`CHARACTER_CREATE_FAILED:${catalog.error.code}`);
      const character = catalog.data.entities.find((entity) => entity.name === '沈砚');
      if (!character) throw new Error('CHARACTER_MISSING');

      catalog = await bridge.canon.create({
        projectId,
        authority: 'author',
        entityType: 'location',
        name: '南城',
        aliases: [],
        summary: '',
      });
      if (!catalog.ok) throw new Error(`LOCATION_CREATE_FAILED:${catalog.error.code}`);
      const location = catalog.data.entities.find((entity) => entity.name === '南城');
      if (!location) throw new Error('LOCATION_MISSING');

      const opened = await bridge.draft.open({
        projectId,
        chapterId: chapter.id,
      });
      if (!opened.ok) throw new Error(`DRAFT_OPEN_FAILED:${opened.error.code}`);
      const initialBlock = opened.data.blocks[0];
      if (!initialBlock?.contentHash) throw new Error('INITIAL_BLOCK_MISSING');
      const saved = await bridge.draft.applyPatch({
        projectId,
        chapterId: chapter.id,
        draftId: opened.data.draftId,
        baseRevision: opened.data.revision,
        operations: [
          {
            type: 'update',
            logicalBlockId: initialBlock.logicalBlockId,
            expectedHash: initialBlock.contentHash,
            content: '沈砚在雨夜走入南城。',
          },
        ],
      });
      if (!saved.ok) throw new Error(`DRAFT_SAVE_FAILED:${saved.error.code}`);
      const version = await bridge.version.create({
        projectId,
        chapterId: chapter.id,
        draftId: saved.data.draftId,
        baseRevision: saved.data.revision,
        versionType: 'manual',
        title: '第一章定稿',
        description: '状态提案E2E',
        label: null,
      });
      if (!version.ok) throw new Error(`VERSION_CREATE_FAILED:${version.error.code}`);
      const finalized = await bridge.version.setFinal({
        projectId,
        chapterId: chapter.id,
        versionId: version.data.versionId,
      });
      if (!finalized.ok) throw new Error(`VERSION_FINALIZE_FAILED:${finalized.error.code}`);
      const evidenceBlock = version.data.blocks[0];
      if (!evidenceBlock) throw new Error('VERSION_BLOCK_MISSING');

      const generated = await stateProposal.generate({
        projectId,
        chapterId: chapter.id,
        sourceVersionId: version.data.versionId,
        source: 'provider_stub',
        proposals: [
          {
            proposalType: 'entity_state',
            entityId: character.id,
            stateKey: 'location',
            proposedValue: { locationId: location.id },
            validUntilChapterId: null,
            evidence: [
              {
                kind: 'logicalBlock',
                targetId: evidenceBlock.logicalBlockId,
                note: '沈砚走入南城',
              },
            ],
            confidence: 0.93,
          },
        ],
      });
      if (!generated.ok) throw new Error(`PROPOSAL_GENERATE_FAILED:${generated.error.code}`);
      const proposal = generated.data.proposals.find((item) => item.status === 'pending');
      if (!proposal) throw new Error('PROPOSAL_MISSING');
      const before = await stateProposal.readSnapshot({
        projectId,
        chapterId: chapter.id,
      });
      if (!before.ok) throw new Error(`SNAPSHOT_READ_FAILED:${before.error.code}`);
      return {
        projectId,
        chapterId: chapter.id,
        proposalId: proposal.id,
        locationId: location.id,
        beforeSource: before.data.snapshotSource,
        beforeEntityStateCount: before.data.content.entityStates.length,
      };
    });

    expect(seeded.beforeSource).toBe('fallback_live_query');
    expect(seeded.beforeEntityStateCount).toBe(0);

    await page.locator('[data-open-state-proposals]').click();
    await expect(page.locator('[data-state-proposal-dialog]')).toBeVisible();
    await page.locator('[data-state-proposal-chapter]').fill(seeded.chapterId);
    await page.locator('[data-refresh-state-proposals]').click();
    const proposal = page.locator(`[data-state-proposal="${seeded.proposalId}"]`);
    await expect(proposal).toContainText('pending');
    await expect(proposal).toContainText('沈砚走入南城');
    await proposal.locator(`[data-accept-state-proposal="${seeded.proposalId}"]`).click();
    await expect(proposal).toContainText('accepted');
    await expect(page.locator('[data-ending-snapshot="snapshot"]')).toBeVisible();
    await expect(page.locator('[data-state-proposal-snapshot]')).toContainText('实体状态 1');

    const accepted = await page.evaluate(async ({ projectId, chapterId, locationId }) => {
      const bridge = (
        globalThis as unknown as {
          readonly worldforgeStateProposal: StateProposalBridge;
        }
      ).worldforgeStateProposal;
      const snapshot = await bridge.readSnapshot({ projectId, chapterId });
      if (!snapshot.ok) throw new Error(`SNAPSHOT_READ_FAILED:${snapshot.error.code}`);
      return {
        source: snapshot.data.snapshotSource,
        status: snapshot.data.snapshot?.status ?? null,
        entityState: snapshot.data.content.entityStates[0] ?? null,
        locationId,
      };
    }, seeded);
    expect(accepted).toMatchObject({
      source: 'snapshot',
      status: 'valid',
      entityState: {
        stateKey: 'location',
        value: { locationId: seeded.locationId },
      },
    });
  } finally {
    await closeGracefully(application);
  }
});
