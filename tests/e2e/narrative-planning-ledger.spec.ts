import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import type {
  ArcMilestoneSaveInput,
  ArcMilestoneTransitionInput,
  CharacterArcSaveInput,
  CommandResult,
  ContinuityCatalog,
  ForeshadowingSaveInput,
  ForeshadowingTransitionInput,
  NarrativePlanningCatalog,
  NarrativePlanningListInput,
  TimelineEventSaveInput,
  WorldforgeBridge,
} from '@worldforge/contracts';

const root = process.cwd();
const temporaryDirectories: string[] = [];

type ContinuityBridge = {
  saveTimelineEvent(input: TimelineEventSaveInput): Promise<CommandResult<ContinuityCatalog>>;
};

type NarrativePlanningBridge = {
  list(input: NarrativePlanningListInput): Promise<CommandResult<NarrativePlanningCatalog>>;
  saveForeshadowing(
    input: ForeshadowingSaveInput,
  ): Promise<CommandResult<NarrativePlanningCatalog>>;
  transitionForeshadowing(
    input: ForeshadowingTransitionInput,
  ): Promise<CommandResult<NarrativePlanningCatalog>>;
  saveCharacterArc(input: CharacterArcSaveInput): Promise<CommandResult<NarrativePlanningCatalog>>;
  saveArcMilestone(input: ArcMilestoneSaveInput): Promise<CommandResult<NarrativePlanningCatalog>>;
  transitionArcMilestone(
    input: ArcMilestoneTransitionInput,
  ): Promise<CommandResult<NarrativePlanningCatalog>>;
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

test('writes and displays foreshadowing and character arcs across the real Electron boundary', async () => {
  const userDataPath = await mkdtemp(path.join(tmpdir(), 'worldforge-narrative-e2e-'));
  temporaryDirectories.push(userDataPath);
  const createParent = path.join(userDataPath, 'projects');
  await mkdir(createParent, { recursive: true });
  const application = await launch(userDataPath, createParent);
  try {
    const page = await application.firstWindow();
    await page.waitForFunction(() => document.body.dataset.rendererReady === 'true');
    await page.locator('[data-create-project]').click();
    await page.locator('[data-project-name]').fill('伏笔弧光工程');
    await page.locator('[data-project-channel]').fill('悬疑');
    await page.locator('[data-confirm-create-project]').click();
    await expect(page.locator('body')).toHaveAttribute('data-project-state', 'open');

    const bridgeResult = await page.evaluate(async () => {
      const rootWindow = globalThis as unknown as {
        readonly worldforge: WorldforgeBridge;
        readonly worldforgeContinuity: ContinuityBridge;
        readonly worldforgeNarrativePlanning: NarrativePlanningBridge;
      };
      const bridge = rootWindow.worldforge;
      const continuity = rootWindow.worldforgeContinuity;
      const narrative = rootWindow.worldforgeNarrativePlanning;
      const active = await bridge.project.getActive();
      if (!active.ok || !active.data) throw new Error('PROJECT_MISSING');
      const projectId = active.data.projectId;
      const structure = await bridge.planning.listStructure(projectId);
      if (!structure.ok) throw new Error('STRUCTURE_MISSING');
      const volume = structure.data.volumes[0];
      const chapter1 = volume?.chapters[0];
      if (!volume || !chapter1) throw new Error('CHAPTER_MISSING');
      const chapter2Result = await bridge.planning.createChapter({
        projectId,
        volumeId: volume.id,
        title: '第二章',
      });
      if (!chapter2Result.ok) throw new Error('CHAPTER_CREATE_FAILED');
      const chapter2 = chapter2Result.data.volumes[0]?.chapters.at(-1);
      if (!chapter2) throw new Error('SECOND_CHAPTER_MISSING');
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
      const event = await continuity.saveTimelineEvent({
        projectId,
        authority: 'author',
        eventId: null,
        title: '雨夜目击',
        startValue: '2026-07-20',
        endValue: null,
        precision: 'day',
        chapterId: chapter1.id,
        locationId: null,
        description: '',
        participantIds: [],
        witnessIds: [character.id],
        subjectIds: [],
        dependencyIds: [],
      });
      if (!event.ok) throw new Error(`EVENT_WRITE_FAILED:${event.error.code}`);
      const eventId = event.data.timelineEvents[0]?.id;
      if (!eventId) throw new Error('EVENT_MISSING');

      let catalog = await narrative.saveForeshadowing({
        projectId,
        authority: 'author',
        foreshadowingId: null,
        title: '染血钥匙',
        description: '第二章前必须回收',
        revealFromChapterId: chapter1.id,
        revealByChapterId: chapter2.id,
        chapterLinks: [{ chapterId: chapter1.id, role: 'plant' }],
        relations: [],
      });
      if (!catalog.ok) throw new Error(`FORESHADOWING_WRITE_FAILED:${catalog.error.code}`);
      const foreshadowing = catalog.data.foreshadowings.find((item) => item.title === '染血钥匙');
      if (!foreshadowing) throw new Error('FORESHADOWING_MISSING');
      catalog = await narrative.transitionForeshadowing({
        projectId,
        authority: 'author',
        foreshadowingId: foreshadowing.id,
        status: 'planted',
      });
      if (!catalog.ok) throw new Error(`FORESHADOWING_TRANSITION_FAILED:${catalog.error.code}`);

      catalog = await narrative.saveCharacterArc({
        projectId,
        authority: 'author',
        arcId: null,
        characterId: character.id,
        title: '从旁观到承担',
        arcType: 'growth',
        customType: null,
        status: 'active',
        authorIntent: '让目击者主动承担后果',
      });
      if (!catalog.ok) throw new Error(`ARC_WRITE_FAILED:${catalog.error.code}`);
      const arc = catalog.data.characterArcs.find((item) => item.title === '从旁观到承担');
      if (!arc) throw new Error('ARC_MISSING');
      catalog = await narrative.saveArcMilestone({
        projectId,
        authority: 'author',
        milestoneId: null,
        arcId: arc.id,
        title: '主动作证',
        description: '',
        sortIndex: 10,
        plannedChapterId: chapter2.id,
        dependencyMilestoneIds: [],
        dependencyTimelineEventIds: [eventId],
      });
      if (!catalog.ok) throw new Error(`MILESTONE_WRITE_FAILED:${catalog.error.code}`);
      const milestone = catalog.data.characterArcs[0]?.milestones.find(
        (item) => item.title === '主动作证',
      );
      if (!milestone) throw new Error('MILESTONE_MISSING');
      catalog = await narrative.transitionArcMilestone({
        projectId,
        authority: 'author',
        milestoneId: milestone.id,
        status: 'hit',
        actualChapterId: chapter2.id,
      });
      if (!catalog.ok) throw new Error(`MILESTONE_TRANSITION_FAILED:${catalog.error.code}`);
      const listed = await narrative.list({
        projectId,
        query: '',
        includeResolved: true,
        referenceChapterId: chapter2.id,
      });
      if (!listed.ok) throw new Error(`NARRATIVE_READ_FAILED:${listed.error.code}`);
      return {
        counts: [listed.data.foreshadowings.length, listed.data.characterArcs.length],
        milestoneStatus: listed.data.characterArcs[0]?.milestones[0]?.status,
        confirmationSource: listed.data.characterArcs[0]?.milestones[0]?.confirmationSource,
      };
    });
    expect(bridgeResult).toEqual({
      counts: [1, 1],
      milestoneStatus: 'hit',
      confirmationSource: 'author',
    });

    await page.locator('[data-open-narrative-planning]').click();
    await expect(page.locator('[data-narrative-planning-dialog]')).toBeVisible();
    await expect(page.locator('[data-narrative-planning-status]')).toHaveText('项目：伏笔弧光工程');
    await expect(page.locator('[data-narrative-planning-results] h3')).toHaveText([
      '伏笔（1）',
      '人物弧光（1）',
    ]);
    await expect(page.locator('[data-narrative-planning-results]')).toContainText('染血钥匙');
    await expect(page.locator('[data-narrative-planning-results]')).toContainText('planted');
    await expect(page.locator('[data-narrative-planning-results]')).toContainText('从旁观到承担');
    await expect(page.locator('[data-narrative-planning-results]')).toContainText('主动作证');
    await expect(page.locator('[data-narrative-planning-results]')).toContainText('author');
  } finally {
    await closeGracefully(application);
  }
});
