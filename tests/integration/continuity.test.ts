import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ContinuityService } from '../../packages/core-service/src/continuity.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import { EntityCanonService } from '../../packages/core-service/src/entity-canon.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { VersionService } from '../../packages/core-service/src/version.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-19T12:00:00.000Z') };

interface Harness {
  readonly root: string;
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly drafts: DraftService;
  readonly versions: VersionService;
  readonly canon: EntityCanonService;
  readonly continuity: ContinuityService;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-continuity-'));
  temporaryDirectories.push(root);
  const parent = path.join(root, 'projects');
  await mkdir(parent, { recursive: true });
  const appRuntime = await openAppRuntime({
    databasePath: path.join(root, 'app.sqlite'),
    migrationsDirectory: 'migrations/app',
    recoveryDirectory: path.join(root, 'app-recovery'),
    appVersion: '0.1.0',
    clock,
  });
  const workspace = new ProjectWorkspaceService({
    projectMigrationsDirectory: 'migrations/project',
    projectMigrationRecoveryDirectory: path.join(root, 'migration-recovery'),
    appVersion: '0.1.0',
    recentProjects: appRuntime.recentProjects,
    clock,
  });
  return {
    root,
    parent,
    appRuntime,
    workspace,
    structure: new ProjectStructureService(workspace, { clock }),
    drafts: new DraftService(workspace, { clock }),
    versions: new VersionService(workspace, { clock }),
    canon: new EntityCanonService(workspace, { clock }),
    continuity: new ContinuityService(workspace, { clock }),
  };
}

async function closeHarness(harness: Harness): Promise<void> {
  await harness.workspace.shutdown();
  await harness.appRuntime.close();
}

async function createVersion(
  harness: Harness,
  projectId: string,
  chapterId: string,
  title: string,
): Promise<string> {
  const draft = await harness.drafts.open(randomUUID(), { projectId, chapterId });
  const version = await harness.versions.create(randomUUID(), {
    projectId,
    chapterId,
    draftId: draft.draftId,
    baseRevision: draft.revision,
    title,
  });
  return version.versionId;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M3-04 dynamic state, Timeline and knowledge', () => {
  it('preserves EntityState history and resolves chapter-effective current values', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '状态历史', channel: '长篇' },
        harness.parent,
      );
      const structure = harness.structure.list(project.projectId);
      const volumeId = structure.volumes[0]!.id;
      const chapter1 = structure.volumes[0]!.chapters[0]!;
      const afterChapter1 = await harness.structure.createChapter(randomUUID(), {
        projectId: project.projectId,
        volumeId,
        title: '第二章',
        placement: { kind: 'end' },
      });
      const chapter2 = afterChapter1.volumes[0]!.chapters[1]!;
      const afterChapter2 = await harness.structure.createChapter(randomUUID(), {
        projectId: project.projectId,
        volumeId,
        title: '第三章',
        placement: { kind: 'end' },
      });
      const chapter3 = afterChapter2.volumes[0]!.chapters[2]!;
      const version1 = await createVersion(harness, project.projectId, chapter1.id, '第一章定稿');
      const version2 = await createVersion(harness, project.projectId, chapter2.id, '第二章定稿');
      const entity = (
        await harness.canon.create(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          entityType: 'character',
          name: '林照夜',
          aliases: [],
          summary: '',
        })
      ).entities[0]!;

      let catalog = await harness.continuity.setEntityState(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        entityId: entity.id,
        stateKey: ' Current Location ',
        value: { place: '城门' },
        validFromChapterId: chapter1.id,
        validUntilChapterId: null,
        evidence: [{ kind: 'version', targetId: version1, note: '第一章定稿' }],
        sourceVersionId: version1,
      });
      expect(catalog.entityStates).toHaveLength(1);
      expect(catalog.entityStates[0]).toMatchObject({
        stateKey: 'current-location',
        value: { place: '城门' },
        recordStatus: 'current',
      });

      catalog = await harness.continuity.setEntityState(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        entityId: entity.id,
        stateKey: 'current location',
        value: { place: '内城' },
        validFromChapterId: chapter2.id,
        validUntilChapterId: null,
        evidence: [{ kind: 'chapter', targetId: chapter2.id, note: '转场' }],
        sourceVersionId: version2,
      });
      expect(catalog.entityStates.filter((state) => state.recordStatus === 'current')).toHaveLength(1);
      expect(catalog.entityStates.find((state) => state.recordStatus === 'historical')).toMatchObject({
        value: { place: '城门' },
        validUntilChapterId: chapter2.id,
      });

      const atFirst = harness.continuity.list({
        projectId: project.projectId,
        query: '',
        includeHistory: true,
        effectiveAtChapterId: chapter1.id,
      });
      expect(atFirst.entityStates).toHaveLength(1);
      expect(atFirst.entityStates[0]!.value).toEqual({ place: '城门' });

      const atThird = harness.continuity.list({
        projectId: project.projectId,
        query: '',
        includeHistory: true,
        effectiveAtChapterId: chapter3.id,
      });
      expect(atThird.entityStates).toHaveLength(1);
      expect(atThird.entityStates[0]!.value).toEqual({ place: '内城' });
      expect(
        harness.workspace.readProject(project.projectId, (connection) =>
          connection
            .prepare(
              `SELECT COUNT(*) AS total FROM entity_states
                WHERE entity_id = ? AND state_key = ? AND record_status = 'current'`,
            )
            .get(entity.id, 'current-location')?.total,
        ),
      ).toBe(1n);
    } finally {
      await closeHarness(harness);
    }
  });

  it('rejects Timeline location conflicts, dependency cycles and reversed order', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '时间线规则', channel: '长篇' },
        harness.parent,
      );
      const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      const character = (
        await harness.canon.create(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          entityType: 'character',
          name: '周沉舟',
          aliases: [],
          summary: '',
        })
      ).entities[0]!;
      const locationA = (
        await harness.canon.create(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          entityType: 'location',
          name: '东门',
          aliases: [],
          summary: '',
        })
      ).entities.find((entity) => entity.name === '东门')!;
      const locationB = (
        await harness.canon.create(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          entityType: 'location',
          name: '西门',
          aliases: [],
          summary: '',
        })
      ).entities.find((entity) => entity.name === '西门')!;

      let catalog = await harness.continuity.saveTimelineEvent(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        eventId: null,
        title: '抵达东门',
        startValue: '2026-01-01T08:00:00Z',
        endValue: null,
        precision: 'exact',
        chapterId: chapter.id,
        locationId: locationA.id,
        description: '',
        participantIds: [character.id],
        dependencyIds: [],
      });
      const first = catalog.timelineEvents[0]!;

      await expect(
        harness.continuity.saveTimelineEvent(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          eventId: null,
          title: '同时出现在西门',
          startValue: '2026-01-01T08:00:00Z',
          endValue: null,
          precision: 'exact',
          chapterId: chapter.id,
          locationId: locationB.id,
          description: '',
          participantIds: [character.id],
          dependencyIds: [],
        }),
      ).rejects.toMatchObject({ code: 'CONTINUITY_TIME_CONFLICT' });

      catalog = await harness.continuity.saveTimelineEvent(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        eventId: null,
        title: '模糊传闻',
        startValue: '同一时期',
        endValue: null,
        precision: 'approximate',
        chapterId: chapter.id,
        locationId: locationB.id,
        description: '',
        participantIds: [character.id],
        dependencyIds: [],
      });
      expect(catalog.timelineEvents).toHaveLength(2);

      catalog = await harness.continuity.saveTimelineEvent(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        eventId: null,
        title: '后续调查',
        startValue: '2026-01-02',
        endValue: null,
        precision: 'day',
        chapterId: chapter.id,
        locationId: null,
        description: '',
        participantIds: [],
        dependencyIds: [first.id],
      });
      const second = catalog.timelineEvents.find((event) => event.title === '后续调查')!;

      await expect(
        harness.continuity.saveTimelineEvent(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          eventId: first.id,
          title: first.title,
          startValue: first.startValue,
          endValue: first.endValue,
          precision: first.precision,
          chapterId: first.chapterId,
          locationId: first.locationId,
          description: first.description,
          participantIds: first.participantIds,
          dependencyIds: [second.id],
        }),
      ).rejects.toMatchObject({ code: 'CONTINUITY_CYCLE' });

      await expect(
        harness.continuity.saveTimelineEvent(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          eventId: second.id,
          title: second.title,
          startValue: '2025-12-31',
          endValue: null,
          precision: 'day',
          chapterId: second.chapterId,
          locationId: null,
          description: second.description,
          participantIds: [],
          dependencyIds: [first.id],
        }),
      ).rejects.toMatchObject({ code: 'CONTINUITY_TIME_CONFLICT' });
    } finally {
      await closeHarness(harness);
    }
  });

  it('preserves KnowledgeState history and rejects unanchored or AI-authored knowledge', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '知情边界', channel: '长篇' },
        harness.parent,
      );
      const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      const draft = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      const versionId = await createVersion(harness, project.projectId, chapter.id, '知情来源');
      const character = (
        await harness.canon.create(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          entityType: 'character',
          name: '沈问',
          aliases: [],
          summary: '',
        })
      ).entities[0]!;

      await expect(
        harness.continuity.setKnowledgeState(randomUUID(), {
          projectId: project.projectId,
          authority: 'ai',
          informationKey: '密钥位置',
          characterId: character.id,
          knowledgeStatus: 'knows',
          acquiredChapterId: chapter.id,
          sourceBlockId: draft.blocks[0]!.blockId,
          sourceVersionId: null,
          notes: '',
        }),
      ).rejects.toMatchObject({ code: 'CONTINUITY_AUTHOR_REQUIRED' });

      await expect(
        harness.continuity.setKnowledgeState(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          informationKey: '密钥位置',
          characterId: character.id,
          knowledgeStatus: 'knows',
          acquiredChapterId: chapter.id,
          sourceBlockId: null,
          sourceVersionId: null,
          notes: '',
        }),
      ).rejects.toMatchObject({ code: 'CONTINUITY_INVALID' });

      let catalog = await harness.continuity.setKnowledgeState(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        informationKey: '密钥位置',
        characterId: character.id,
        knowledgeStatus: 'suspects',
        acquiredChapterId: chapter.id,
        sourceBlockId: draft.blocks[0]!.blockId,
        sourceVersionId: null,
        notes: '只看到残缺线索',
      });
      catalog = await harness.continuity.setKnowledgeState(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        informationKey: '密钥位置',
        characterId: character.id,
        knowledgeStatus: 'knows',
        acquiredChapterId: chapter.id,
        sourceBlockId: null,
        sourceVersionId: versionId,
        notes: '定稿明确揭示',
      });

      expect(catalog.knowledgeStates).toHaveLength(2);
      expect(catalog.knowledgeStates.filter((state) => state.recordStatus === 'current')).toHaveLength(
        1,
      );
      expect(catalog.knowledgeStates.find((state) => state.recordStatus === 'current')).toMatchObject({
        informationKey: '密钥位置',
        knowledgeStatus: 'knows',
      });
      expect(
        catalog.knowledgeStates.find((state) => state.recordStatus === 'historical')?.supersededAt,
      ).not.toBeNull();

      const currentOnly = harness.continuity.list({
        projectId: project.projectId,
        query: '密钥',
        includeHistory: false,
        effectiveAtChapterId: null,
      });
      expect(currentOnly.knowledgeStates).toHaveLength(1);
      expect(currentOnly.knowledgeStates[0]!.knowledgeStatus).toBe('knows');
    } finally {
      await closeHarness(harness);
    }
  });
});
