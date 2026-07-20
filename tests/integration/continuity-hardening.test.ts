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
const clock = { now: () => new Date('2026-07-20T06:00:00.000Z') };

async function harness() {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-continuity-hardening-'));
  temporaryDirectories.push(root);
  const parent = path.join(root, 'projects');
  await mkdir(parent, { recursive: true });
  const appRuntime: AppRuntime = await openAppRuntime({
    databasePath: path.join(root, 'app.sqlite'),
    migrationsDirectory: 'migrations/app',
    recoveryDirectory: path.join(root, 'app-recovery'),
    appVersion: '0.1.0',
    clock,
  });
  const workspace = new ProjectWorkspaceService({
    projectMigrationsDirectory: 'migrations/project',
    projectMigrationRecoveryDirectory: path.join(root, 'project-migration-recovery'),
    appVersion: '0.1.0',
    recentProjects: appRuntime.recentProjects,
    clock,
  });
  return {
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

async function closeHarness(value: Awaited<ReturnType<typeof harness>>): Promise<void> {
  await value.workspace.shutdown();
  await value.appRuntime.close();
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function seed(value: Awaited<ReturnType<typeof harness>>) {
  const project = await value.workspace.create(
    randomUUID(),
    { name: '连续性强化测试', channel: '长篇' },
    value.parent,
  );
  const initial = value.structure.list(project.projectId);
  const volume = initial.volumes[0]!;
  const chapter1 = volume.chapters[0]!;
  const chapters = [chapter1];
  for (const title of ['第二章', '第三章', '第四章']) {
    const structure = await value.structure.createChapter(randomUUID(), {
      projectId: project.projectId,
      volumeId: volume.id,
      title,
    });
    chapters.push(structure.volumes[0]!.chapters.at(-1)!);
  }
  const [chapter2, chapter3, chapter4] = chapters.slice(1);
  const draft = await value.drafts.open(randomUUID(), {
    projectId: project.projectId,
    chapterId: chapter1.id,
  });
  const version = await value.versions.create(randomUUID(), {
    projectId: project.projectId,
    chapterId: chapter1.id,
    draftId: draft.draftId,
    baseRevision: draft.revision,
    title: '连续性强化来源',
  });
  let catalog = await value.canon.create(randomUUID(), {
    projectId: project.projectId,
    authority: 'author',
    entityType: 'character',
    name: '沈砚',
    aliases: [],
    summary: '',
  });
  const character = catalog.entities[0]!;
  catalog = await value.canon.create(randomUUID(), {
    projectId: project.projectId,
    authority: 'author',
    entityType: 'location',
    name: '南城',
    aliases: [],
    summary: '',
  });
  const south = catalog.entities.find((entity) => entity.name === '南城')!;
  catalog = await value.canon.create(randomUUID(), {
    projectId: project.projectId,
    authority: 'author',
    entityType: 'location',
    name: '北城',
    aliases: [],
    summary: '',
  });
  const north = catalog.entities.find((entity) => entity.name === '北城')!;
  return {
    project,
    chapter1,
    chapter2: chapter2!,
    chapter3: chapter3!,
    chapter4: chapter4!,
    version,
    character,
    south,
    north,
  };
}

function listAt(
  value: Awaited<ReturnType<typeof harness>>,
  projectId: string,
  chapterId: string,
) {
  return value.continuity.list({
    projectId,
    query: '',
    includeHistory: false,
    includeArchivedEvents: false,
    effectiveAtChapterId: chapterId,
  });
}

describe('M3-04 continuity hardening', () => {
  it('preserves explicit gaps and same-start revisions for state and knowledge', async () => {
    const value = await harness();
    try {
      const seeded = await seed(value);
      await value.continuity.setEntityState(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityId: seeded.character.id,
        stateKey: 'health',
        value: 'injured',
        validFromChapterId: seeded.chapter1.id,
        validUntilChapterId: seeded.chapter2.id,
        evidence: [],
        sourceVersionId: seeded.version.versionId,
      });
      await value.continuity.setEntityState(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityId: seeded.character.id,
        stateKey: 'health',
        value: 'recovered',
        validFromChapterId: seeded.chapter3.id,
        validUntilChapterId: null,
        evidence: [],
        sourceVersionId: seeded.version.versionId,
      });
      expect(listAt(value, seeded.project.projectId, seeded.chapter2.id).entityStates).toEqual([]);
      const stateHistory = value.continuity.list({
        projectId: seeded.project.projectId,
        query: 'health',
        includeHistory: true,
        includeArchivedEvents: false,
        effectiveAtChapterId: null,
      }).entityStates;
      expect(
        stateHistory.find((state) => state.value === 'injured')?.validUntilChapterId,
      ).toBe(seeded.chapter2.id);

      await value.continuity.setEntityState(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityId: seeded.character.id,
        stateKey: 'health',
        value: 'stable',
        validFromChapterId: seeded.chapter3.id,
        validUntilChapterId: null,
        evidence: [],
        sourceVersionId: seeded.version.versionId,
      });
      expect(listAt(value, seeded.project.projectId, seeded.chapter3.id).entityStates[0]?.value).toBe(
        'stable',
      );

      await value.continuity.setKnowledgeState(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        informationKey: 'traitor-identity',
        characterId: seeded.character.id,
        knowledgeStatus: 'suspects',
        validFromChapterId: seeded.chapter1.id,
        validUntilChapterId: seeded.chapter2.id,
        sourceVersionId: seeded.version.versionId,
        sourceLogicalBlockId: null,
        notes: '',
      });
      await value.continuity.setKnowledgeState(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        informationKey: 'traitor-identity',
        characterId: seeded.character.id,
        knowledgeStatus: 'knows',
        validFromChapterId: seeded.chapter3.id,
        validUntilChapterId: null,
        sourceVersionId: seeded.version.versionId,
        sourceLogicalBlockId: null,
        notes: '',
      });
      expect(listAt(value, seeded.project.projectId, seeded.chapter2.id).knowledgeStates).toEqual([]);
      const knowledgeHistory = value.continuity.list({
        projectId: seeded.project.projectId,
        query: 'traitor-identity',
        includeHistory: true,
        includeArchivedEvents: false,
        effectiveAtChapterId: null,
      }).knowledgeStates;
      expect(
        knowledgeHistory.find((state) => state.knowledgeStatus === 'suspects')
          ?.validUntilChapterId,
      ).toBe(seeded.chapter2.id);

      await value.continuity.invalidateEntityState(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityId: seeded.character.id,
        stateKey: 'health',
      });
      await value.continuity.invalidateKnowledgeState(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        characterId: seeded.character.id,
        informationKey: 'traitor-identity',
      });
      const current = value.continuity.list({
        projectId: seeded.project.projectId,
        query: '',
        includeHistory: false,
        includeArchivedEvents: false,
        effectiveAtChapterId: null,
      });
      expect(current.entityStates).toEqual([]);
      expect(current.knowledgeStates).toEqual([]);
    } finally {
      await closeHarness(value);
    }
  });

  it('rejects foreign anchors and all AI authority mutations', async () => {
    const value = await harness();
    try {
      const seeded = await seed(value);
      await expect(
        value.continuity.setEntityState(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          entityId: seeded.character.id,
          stateKey: 'health',
          value: 'invalid-source',
          validFromChapterId: seeded.chapter1.id,
          validUntilChapterId: null,
          evidence: [],
          sourceVersionId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'CONTINUITY_NOT_FOUND' });
      await expect(
        value.continuity.setEntityState(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          entityId: seeded.character.id,
          stateKey: 'health',
          value: 'invalid-evidence',
          validFromChapterId: seeded.chapter1.id,
          validUntilChapterId: null,
          evidence: [{ kind: 'entity', targetId: randomUUID(), note: '' }],
          sourceVersionId: seeded.version.versionId,
        }),
      ).rejects.toMatchObject({ code: 'CONTINUITY_NOT_FOUND' });
      await expect(
        value.continuity.setKnowledgeState(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          informationKey: 'foreign-block',
          characterId: seeded.character.id,
          knowledgeStatus: 'unknown',
          validFromChapterId: seeded.chapter1.id,
          validUntilChapterId: null,
          sourceVersionId: null,
          sourceLogicalBlockId: randomUUID(),
          notes: '',
        }),
      ).rejects.toMatchObject({ code: 'CONTINUITY_NOT_FOUND' });

      await value.continuity.setEntityState(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityId: seeded.character.id,
        stateKey: 'health',
        value: 'well',
        validFromChapterId: seeded.chapter1.id,
        validUntilChapterId: null,
        evidence: [],
        sourceVersionId: seeded.version.versionId,
      });
      await expect(
        value.continuity.invalidateEntityState(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'ai',
          entityId: seeded.character.id,
          stateKey: 'health',
        }),
      ).rejects.toMatchObject({ code: 'CONTINUITY_AUTHOR_REQUIRED' });

      await value.continuity.setKnowledgeState(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        informationKey: 'secret',
        characterId: seeded.character.id,
        knowledgeStatus: 'knows',
        validFromChapterId: seeded.chapter1.id,
        validUntilChapterId: null,
        sourceVersionId: seeded.version.versionId,
        sourceLogicalBlockId: null,
        notes: '',
      });
      await expect(
        value.continuity.invalidateKnowledgeState(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'ai',
          characterId: seeded.character.id,
          informationKey: 'secret',
        }),
      ).rejects.toMatchObject({ code: 'CONTINUITY_AUTHOR_REQUIRED' });

      const event = (
        await value.continuity.saveTimelineEvent(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          eventId: null,
          title: '作者事件',
          startValue: '2026-07-20',
          endValue: null,
          precision: 'day',
          chapterId: seeded.chapter1.id,
          locationId: seeded.south.id,
          description: '',
          participantIds: [],
          witnessIds: [],
          subjectIds: [],
          dependencyIds: [],
        })
      ).timelineEvents[0]!;
      await expect(
        value.continuity.archiveTimelineEvent(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'ai',
          eventId: event.id,
        }),
      ).rejects.toMatchObject({ code: 'CONTINUITY_AUTHOR_REQUIRED' });
    } finally {
      await closeHarness(value);
    }
  });

  it('enforces presence, precision, ordering, archive, and all knowledge statuses', async () => {
    const value = await harness();
    try {
      const seeded = await seed(value);
      let catalog = await value.continuity.saveTimelineEvent(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        eventId: null,
        title: '南城目击',
        startValue: '2026-07-20',
        endValue: null,
        precision: 'day',
        chapterId: seeded.chapter1.id,
        locationId: seeded.south.id,
        description: '',
        participantIds: [],
        witnessIds: [seeded.character.id],
        subjectIds: [],
        dependencyIds: [],
      });
      const witnessed = catalog.timelineEvents.find((event) => event.title === '南城目击')!;
      await expect(
        value.continuity.saveTimelineEvent(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          eventId: null,
          title: '北城参与',
          startValue: '2026-07-20',
          endValue: null,
          precision: 'day',
          chapterId: seeded.chapter1.id,
          locationId: seeded.north.id,
          description: '',
          participantIds: [seeded.character.id],
          witnessIds: [],
          subjectIds: [],
          dependencyIds: [],
        }),
      ).rejects.toMatchObject({ code: 'CONTINUITY_CONFLICT' });

      await expect(
        value.continuity.saveTimelineEvent(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          eventId: null,
          title: '北城约见',
          startValue: '盛夏前后',
          endValue: null,
          precision: 'approximate',
          chapterId: seeded.chapter2.id,
          locationId: seeded.north.id,
          description: '',
          participantIds: [seeded.character.id],
          witnessIds: [],
          subjectIds: [],
          dependencyIds: [],
        }),
      ).resolves.toBeDefined();
      await expect(
        value.continuity.saveTimelineEvent(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          eventId: null,
          title: '北城传闻',
          startValue: '未知',
          endValue: null,
          precision: 'unknown',
          chapterId: seeded.chapter2.id,
          locationId: seeded.north.id,
          description: '',
          participantIds: [seeded.character.id],
          witnessIds: [],
          subjectIds: [],
          dependencyIds: [],
        }),
      ).resolves.toBeDefined();
      await expect(
        value.continuity.saveTimelineEvent(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          eventId: null,
          title: '北城被提及',
          startValue: '2026-07-20',
          endValue: null,
          precision: 'day',
          chapterId: seeded.chapter1.id,
          locationId: seeded.north.id,
          description: '',
          participantIds: [],
          witnessIds: [],
          subjectIds: [seeded.character.id],
          dependencyIds: [],
        }),
      ).resolves.toBeDefined();

      catalog = await value.continuity.saveTimelineEvent(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        eventId: null,
        title: '未来事件',
        startValue: '2026-07-22',
        endValue: null,
        precision: 'day',
        chapterId: seeded.chapter3.id,
        locationId: seeded.south.id,
        description: '',
        participantIds: [],
        witnessIds: [],
        subjectIds: [],
        dependencyIds: [],
      });
      const future = catalog.timelineEvents.find((event) => event.title === '未来事件')!;
      await expect(
        value.continuity.saveTimelineEvent(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          eventId: null,
          title: '错误前置',
          startValue: '2026-07-20',
          endValue: null,
          precision: 'day',
          chapterId: seeded.chapter1.id,
          locationId: null,
          description: '',
          participantIds: [],
          witnessIds: [],
          subjectIds: [],
          dependencyIds: [future.id],
        }),
      ).rejects.toMatchObject({ code: 'CONTINUITY_CONFLICT' });

      await value.continuity.archiveTimelineEvent(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        eventId: witnessed.id,
      });
      expect(
        value.continuity
          .list({
            projectId: seeded.project.projectId,
            query: '南城目击',
            includeHistory: true,
            includeArchivedEvents: false,
            effectiveAtChapterId: null,
          })
          .timelineEvents.find((event) => event.id === witnessed.id),
      ).toBeUndefined();
      expect(
        value.continuity
          .list({
            projectId: seeded.project.projectId,
            query: '南城目击',
            includeHistory: true,
            includeArchivedEvents: true,
            effectiveAtChapterId: null,
          })
          .timelineEvents.find((event) => event.id === witnessed.id)?.status,
      ).toBe('archived');

      const statuses = ['knows', 'believes', 'suspects', 'misunderstands', 'unknown'] as const;
      for (const status of statuses) {
        await value.continuity.setKnowledgeState(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          informationKey: `status-${status}`,
          characterId: seeded.character.id,
          knowledgeStatus: status,
          validFromChapterId: seeded.chapter4.id,
          validUntilChapterId: null,
          sourceVersionId: seeded.version.versionId,
          sourceLogicalBlockId: null,
          notes: '',
        });
      }
      expect(
        new Set(
          value.continuity
            .list({
              projectId: seeded.project.projectId,
              query: 'status-',
              includeHistory: false,
              includeArchivedEvents: false,
              effectiveAtChapterId: null,
            })
            .knowledgeStates.map((state) => state.knowledgeStatus),
        ),
      ).toEqual(new Set(statuses));
    } finally {
      await closeHarness(value);
    }
  });
});
