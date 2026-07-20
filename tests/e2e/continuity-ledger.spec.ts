import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import type {
  CommandResult,
  ContinuityCatalog,
  ContinuityListInput,
  EntityStateSetInput,
  KnowledgeStateSetInput,
  TimelineEventSaveInput,
  WorldforgeBridge,
} from '@worldforge/contracts';

const root = process.cwd();
const temporaryDirectories: string[] = [];

type ContinuityBridge = {
  list(input: ContinuityListInput): Promise<CommandResult<ContinuityCatalog>>;
  setEntityState(input: EntityStateSetInput): Promise<CommandResult<ContinuityCatalog>>;
  saveTimelineEvent(input: TimelineEventSaveInput): Promise<CommandResult<ContinuityCatalog>>;
  setKnowledgeState(input: KnowledgeStateSetInput): Promise<CommandResult<ContinuityCatalog>>;
};

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

test('writes and displays continuity data through the real Electron process boundary', async () => {
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'worldforge-continuity-e2e-'));
  temporaryDirectories.push(userDataPath);
  const createParent = path.join(userDataPath, 'projects');
  await mkdir(createParent, { recursive: true });
  const application = await launch(userDataPath, createParent);
  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-create-project]').click();
    await page.locator('[data-project-name]').fill('连续性工程');
    await page.locator('[data-project-channel]').fill('悬疑');
    await page.locator('[data-confirm-create-project]').click();
    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open');

    const bridgeResult = await page.evaluate(async () => {
      const rootWindow = globalThis as unknown as {
        readonly worldforge: WorldforgeBridge;
        readonly worldforgeContinuity: ContinuityBridge;
      };
      const bridge = rootWindow.worldforge;
      const continuity = rootWindow.worldforgeContinuity;
      const active = await bridge.project.getActive();
      if (!active.ok || !active.data) throw new Error('PROJECT_MISSING');
      const projectId = active.data.projectId;
      const structure = await bridge.planning.listStructure(projectId);
      if (!structure.ok) throw new Error('STRUCTURE_MISSING');
      const chapter = structure.data.volumes[0]?.chapters[0];
      if (!chapter) throw new Error('CHAPTER_MISSING');
      const draft = await bridge.draft.open({ projectId, chapterId: chapter.id });
      if (!draft.ok) throw new Error('DRAFT_MISSING');
      const version = await bridge.version.create({
        projectId,
        chapterId: chapter.id,
        draftId: draft.data.draftId,
        baseRevision: draft.data.revision,
        versionType: 'manual',
        title: '连续性来源',
      });
      if (!version.ok) throw new Error('VERSION_CREATE_FAILED');
      const characterCatalog = await bridge.canon.create({
        projectId,
        authority: 'author',
        entityType: 'character',
        name: '沈砚',
        aliases: [],
        summary: '',
      });
      if (!characterCatalog.ok) throw new Error('CHARACTER_CREATE_FAILED');
      const character = characterCatalog.data.entities.find((entity) => entity.name === '沈砚');
      if (!character) throw new Error('CHARACTER_MISSING');
      const locationCatalog = await bridge.canon.create({
        projectId,
        authority: 'author',
        entityType: 'location',
        name: '南城',
        aliases: [],
        summary: '',
      });
      if (!locationCatalog.ok) throw new Error('LOCATION_CREATE_FAILED');
      const location = locationCatalog.data.entities.find((entity) => entity.name === '南城');
      if (!location) throw new Error('LOCATION_MISSING');

      const state = await continuity.setEntityState({
        projectId,
        authority: 'author',
        entityId: character.id,
        stateKey: 'health',
        value: 'injured',
        validFromChapterId: chapter.id,
        validUntilChapterId: null,
        evidence: [{ kind: 'version', targetId: version.data.versionId, note: '' }],
        sourceVersionId: version.data.versionId,
      });
      if (!state.ok) throw new Error(`STATE_WRITE_FAILED:${state.error.code}`);
      const event = await continuity.saveTimelineEvent({
        projectId,
        authority: 'author',
        eventId: null,
        title: '南城目击',
        startValue: '2026-07-20',
        endValue: null,
        precision: 'day',
        chapterId: chapter.id,
        locationId: location.id,
        description: '沈砚在南城目击关键人物。',
        participantIds: [],
        witnessIds: [character.id],
        subjectIds: [],
        dependencyIds: [],
      });
      if (!event.ok) throw new Error(`EVENT_WRITE_FAILED:${event.error.code}`);
      const knowledge = await continuity.setKnowledgeState({
        projectId,
        authority: 'author',
        informationKey: 'traitor-identity',
        characterId: character.id,
        knowledgeStatus: 'suspects',
        validFromChapterId: chapter.id,
        validUntilChapterId: null,
        sourceVersionId: version.data.versionId,
        sourceLogicalBlockId: null,
        notes: '已有怀疑',
      });
      if (!knowledge.ok) throw new Error(`KNOWLEDGE_WRITE_FAILED:${knowledge.error.code}`);
      const catalog = await continuity.list({
        projectId,
        query: '',
        includeHistory: true,
        includeArchivedEvents: false,
        effectiveAtChapterId: null,
      });
      if (!catalog.ok) throw new Error(`CONTINUITY_READ_FAILED:${catalog.error.code}`);
      return {
        projectId,
        counts: [
          catalog.data.entityStates.length,
          catalog.data.timelineEvents.length,
          catalog.data.knowledgeStates.length,
        ],
      };
    });
    expect(bridgeResult).toMatchObject({ counts: [1, 1, 1] });

    await page.locator('[data-open-continuity]').click();
    await expect(page.locator('[data-continuity-dialog]')).toBeVisible();
    await expect(page.locator('[data-continuity-status]')).toHaveText('项目：连续性工程');
    await expect(page.locator('[data-continuity-results] h3')).toHaveText([
      '动态状态（1）',
      '时间线事件（1）',
      '知情状态（1）',
    ]);
    await expect(page.locator('[data-continuity-results]')).toContainText('health');
    await expect(page.locator('[data-continuity-results]')).toContainText('南城目击');
    await expect(page.locator('[data-continuity-results]')).toContainText('traitor-identity');
  } finally {
    await closeGracefully(application);
  }
});
