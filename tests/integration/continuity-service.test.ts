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
const clock = { now: () => new Date('2026-07-20T03:00:00.000Z') };

async function harness() {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-continuity-'));
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
    { name: '连续性测试', channel: '长篇' },
    value.parent,
  );
  const initial = value.structure.list(project.projectId);
  const volume = initial.volumes[0]!;
  const chapter1 = volume.chapters[0]!;
  const chapter2 = (
    await value.structure.createChapter(randomUUID(), {
      projectId: project.projectId,
      volumeId: volume.id,
      title: '第二章',
      status: 'writing',
      targetWordMin: null,
      targetWordMax: null,
    })
  ).volumes[0]!.chapters[1]!;
  const chapter3 = (
    await value.structure.createChapter(randomUUID(), {
      projectId: project.projectId,
      volumeId: volume.id,
      title: '第三章',
      status: 'writing',
      targetWordMin: null,
      targetWordMax: null,
    })
  ).volumes[0]!.chapters[2]!;
  const draft = await value.drafts.open(randomUUID(), {
    projectId: project.projectId,
    chapterId: chapter1.id,
  });
  const version = await value.versions.create(randomUUID(), {
    projectId: project.projectId,
    chapterId: chapter1.id,
    draftId: draft.draftId,
    baseRevision: draft.revision,
    title: '连续性来源',
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
  const location1 = catalog.entities.find((entity) => entity.name === '南城')!;
  catalog = await value.canon.create(randomUUID(), {
    projectId: project.projectId,
    authority: 'author',
    entityType: 'location',
    name: '北城',
    aliases: [],
    summary: '',
  });
  const location2 = catalog.entities.find((entity) => entity.name === '北城')!;
  return { project, chapter1, chapter2, chapter3, draft, version, character, location1, location2 };
}

describe('M3-04 continuity authority', () => {
  it('preserves chapter-effective state and knowledge history', async () => {
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
        validUntilChapterId: null,
        evidence: [{ kind: 'version', targetId: seeded.version.versionId, note: '' }],
        sourceVersionId: seeded.version.versionId,
      });
      await value.continuity.setEntityState(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityId: seeded.character.id,
        stateKey: 'health',
        value: 'recovered',
        validFromChapterId: seeded.chapter2.id,
        validUntilChapterId: null,
        evidence: [{ kind: 'chapter', targetId: seeded.chapter2.id, note: '' }],
        sourceVersionId: seeded.version.versionId,
      });
      await value.continuity.setKnowledgeState(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        informationKey: 'traitor-identity',
        characterId: seeded.character.id,
        knowledgeStatus: 'suspects',
        validFromChapterId: seeded.chapter1.id,
        validUntilChapterId: null,
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
        notes: '亲眼确认',
      });

      const atChapter1 = value.continuity.list({
        projectId: seeded.project.projectId,
        query: '',
        includeHistory: false,
        includeArchivedEvents: false,
        effectiveAtChapterId: seeded.chapter1.id,
      });
      expect(atChapter1.entityStates[0]?.value).toBe('injured');
      expect(atChapter1.knowledgeStates[0]?.knowledgeStatus).toBe('suspects');

      const atChapter3 = value.continuity.list({
        projectId: seeded.project.projectId,
        query: '',
        includeHistory: false,
        includeArchivedEvents: false,
        effectiveAtChapterId: seeded.chapter3.id,
      });
      expect(atChapter3.entityStates[0]?.value).toBe('recovered');
      expect(atChapter3.knowledgeStates[0]?.knowledgeStatus).toBe('knows');
      expect(
        value.continuity.list({
          projectId: seeded.project.projectId,
          query: '',
          includeHistory: true,
          includeArchivedEvents: false,
          effectiveAtChapterId: null,
        }).entityStates,
      ).toHaveLength(2);
    } finally {
      await closeHarness(value);
    }
  });

  it('rejects AI writes, dependency cycles, and overlapping multi-location participants', async () => {
    const value = await harness();
    try {
      const seeded = await seed(value);
      await expect(
        value.continuity.setEntityState(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'ai',
          entityId: seeded.character.id,
          stateKey: 'health',
          value: 'invented',
          validFromChapterId: seeded.chapter1.id,
          validUntilChapterId: null,
          evidence: [],
          sourceVersionId: seeded.version.versionId,
        }),
      ).rejects.toMatchObject({ code: 'CONTINUITY_AUTHOR_REQUIRED' });

      let catalog = await value.continuity.saveTimelineEvent(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        eventId: null,
        title: '南城会面',
        startValue: '2026-07-20',
        endValue: null,
        precision: 'day',
        chapterId: seeded.chapter1.id,
        locationId: seeded.location1.id,
        description: '',
        participantIds: [seeded.character.id],
        witnessIds: [],
        subjectIds: [],
        dependencyIds: [],
      });
      const first = catalog.timelineEvents[0]!;
      await expect(
        value.continuity.saveTimelineEvent(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          eventId: null,
          title: '北城现身',
          startValue: '2026-07-20',
          endValue: null,
          precision: 'day',
          chapterId: seeded.chapter1.id,
          locationId: seeded.location2.id,
          description: '',
          participantIds: [seeded.character.id],
          witnessIds: [],
          subjectIds: [],
          dependencyIds: [],
        }),
      ).rejects.toMatchObject({ code: 'CONTINUITY_CONFLICT' });

      catalog = await value.continuity.saveTimelineEvent(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        eventId: null,
        title: '后续调查',
        startValue: '2026-07-21',
        endValue: null,
        precision: 'day',
        chapterId: seeded.chapter2.id,
        locationId: seeded.location2.id,
        description: '',
        participantIds: [],
        witnessIds: [],
        subjectIds: [],
        dependencyIds: [first.id],
      });
      const second = catalog.timelineEvents.find((event) => event.title === '后续调查')!;
      await expect(
        value.continuity.saveTimelineEvent(randomUUID(), {
          projectId: seeded.project.projectId,
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
          witnessIds: first.witnessIds,
          subjectIds: first.subjectIds,
          dependencyIds: [second.id],
        }),
      ).rejects.toMatchObject({ code: 'CONTINUITY_CONFLICT' });
    } finally {
      await closeHarness(value);
    }
  });
});
