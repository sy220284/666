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

test('preserves a finite EntityState interval across the real Electron boundary', async () => {
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'worldforge-state-interval-e2e-'));
  temporaryDirectories.push(userDataPath);
  const createParent = path.join(userDataPath, 'projects');
  await mkdir(createParent, { recursive: true });
  const application = await launch(userDataPath, createParent);

  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-create-project]').click();
    await page.locator('[data-project-name]').fill('有限期状态提案工程');
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
      const volume = structure.data.volumes[0];
      const chapter1 = volume?.chapters[0];
      if (!volume || !chapter1) throw new Error('CHAPTER_MISSING');
      const createdChapter = await bridge.planning.createChapter({
        projectId,
        volumeId: volume.id,
        title: '第二章',
      });
      if (!createdChapter.ok) throw new Error(`CHAPTER_CREATE_FAILED:${createdChapter.error.code}`);
      const chapter2 = createdChapter.data.volumes[0]?.chapters.at(-1);
      if (!chapter2) throw new Error('SECOND_CHAPTER_MISSING');

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
        chapterId: chapter1.id,
      });
      if (!opened.ok) throw new Error(`DRAFT_OPEN_FAILED:${opened.error.code}`);
      const initialBlock = opened.data.blocks[0];
      if (!initialBlock?.contentHash) throw new Error('INITIAL_BLOCK_MISSING');
      const saved = await bridge.draft.applyPatch({
        projectId,
        chapterId: chapter1.id,
        draftId: opened.data.draftId,
        baseRevision: opened.data.revision,
        operations: [
          {
            type: 'update',
            logicalBlockId: initialBlock.logicalBlockId,
            expectedHash: initialBlock.contentHash,
            content: '沈砚只在第一章停留南城。',
          },
        ],
      });
      if (!saved.ok) throw new Error(`DRAFT_SAVE_FAILED:${saved.error.code}`);
      const version = await bridge.version.create({
        projectId,
        chapterId: chapter1.id,
        draftId: saved.data.draftId,
        baseRevision: saved.data.revision,
        versionType: 'manual',
        title: '第一章定稿',
        description: '有限期状态提案E2E',
        label: null,
      });
      if (!version.ok) throw new Error(`VERSION_CREATE_FAILED:${version.error.code}`);
      const finalized = await bridge.version.setFinal({
        projectId,
        chapterId: chapter1.id,
        versionId: version.data.versionId,
      });
      if (!finalized.ok) throw new Error(`VERSION_FINALIZE_FAILED:${finalized.error.code}`);
      const evidenceBlock = version.data.blocks[0];
      if (!evidenceBlock) throw new Error('VERSION_BLOCK_MISSING');

      const generated = await stateProposal.generate({
        projectId,
        chapterId: chapter1.id,
        sourceVersionId: version.data.versionId,
        source: 'provider_stub',
        proposals: [
          {
            proposalType: 'entity_state',
            entityId: character.id,
            stateKey: 'location',
            proposedValue: { locationId: location.id },
            validUntilChapterId: chapter2.id,
            evidence: [
              {
                kind: 'logicalBlock',
                targetId: evidenceBlock.logicalBlockId,
                note: '第一章停留南城',
              },
            ],
            confidence: 0.93,
          },
        ],
      });
      if (!generated.ok) throw new Error(`PROPOSAL_GENERATE_FAILED:${generated.error.code}`);
      const proposal = generated.data.proposals.find((item) => item.status === 'pending');
      if (!proposal) throw new Error('PROPOSAL_MISSING');
      if (proposal.validUntilChapterId !== chapter2.id) throw new Error('INTERVAL_END_DROPPED');
      return {
        projectId,
        chapter1Id: chapter1.id,
        chapter2Id: chapter2.id,
        proposalId: proposal.id,
        locationId: location.id,
      };
    });

    await page.locator('[data-open-state-proposals]').click();
    await expect(page.locator('[data-state-proposal-dialog]')).toBeVisible();
    await page.locator('[data-state-proposal-chapter]').fill(seeded.chapter1Id);
    await page.locator('[data-refresh-state-proposals]').click();
    const proposal = page.locator(`[data-state-proposal="${seeded.proposalId}"]`);
    await expect(proposal).toContainText('pending');
    await proposal.locator(`[data-accept-state-proposal="${seeded.proposalId}"]`).click();
    await expect(proposal).toContainText('accepted');

    const result = await page.evaluate(async ({ projectId, chapter1Id, chapter2Id }) => {
      const bridge = (
        globalThis as unknown as {
          readonly worldforgeStateProposal: StateProposalBridge;
        }
      ).worldforgeStateProposal;
      const chapter1 = await bridge.readSnapshot({
        projectId,
        chapterId: chapter1Id,
      });
      if (!chapter1.ok) throw new Error(`CHAPTER1_SNAPSHOT_FAILED:${chapter1.error.code}`);
      const chapter2 = await bridge.readSnapshot({
        projectId,
        chapterId: chapter2Id,
      });
      if (!chapter2.ok) throw new Error(`CHAPTER2_SNAPSHOT_FAILED:${chapter2.error.code}`);
      const catalog = await bridge.list({
        projectId,
        chapterId: chapter1Id,
        includeResolved: true,
      });
      if (!catalog.ok) throw new Error(`PROPOSAL_LIST_FAILED:${catalog.error.code}`);
      return {
        chapter1Source: chapter1.data.snapshotSource,
        chapter1EntityStates: chapter1.data.content.entityStates,
        chapter2Source: chapter2.data.snapshotSource,
        chapter2EntityStates: chapter2.data.content.entityStates,
        validUntilChapterId: catalog.data.proposals[0]?.validUntilChapterId ?? null,
      };
    }, seeded);

    expect(result).toMatchObject({
      chapter1Source: 'snapshot',
      chapter1EntityStates: [
        {
          stateKey: 'location',
          value: { locationId: seeded.locationId },
        },
      ],
      chapter2Source: 'fallback_live_query',
      chapter2EntityStates: [],
      validUntilChapterId: seeded.chapter2Id,
    });
  } finally {
    await closeGracefully(application);
  }
});
