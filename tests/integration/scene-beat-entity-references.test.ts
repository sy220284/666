import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { EntityCanonService } from '../../packages/core-service/src/entity-canon.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { SceneBeatService } from '../../packages/core-service/src/scene-beat.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-20T11:30:00.000Z') };

interface Harness {
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly beats: SceneBeatService;
  readonly canon: EntityCanonService;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-scene-beat-entity-'));
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
    parent,
    appRuntime,
    workspace,
    structure: new ProjectStructureService(workspace, { clock }),
    beats: new SceneBeatService(workspace, { clock }),
    canon: new EntityCanonService(workspace, { clock }),
  };
}

async function closeHarness(harness: Harness): Promise<void> {
  await harness.workspace.shutdown();
  await harness.appRuntime.close();
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M3-02 SceneBeat entity references', () => {
  it('rejects invalid legacy IDs and synchronizes valid references into the relation table', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: 'SceneBeat实体真源', channel: '长篇' },
        harness.parent,
      );
      const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      const character = (
        await harness.canon.create(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          entityType: 'character',
          name: '林照夜',
          aliases: [],
          summary: '',
        })
      ).entities[0]!;
      const location = (
        await harness.canon.create(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          entityType: 'location',
          name: '旧档案馆',
          aliases: [],
          summary: '',
        })
      ).entities.find((entity) => entity.entityType === 'location')!;
      const archived = (
        await harness.canon.create(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          entityType: 'character',
          name: '已归档人物',
          aliases: [],
          summary: '',
        })
      ).entities.find((entity) => entity.name === '已归档人物')!;
      await harness.canon.archive(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        entityId: archived.id,
      });

      const list = await harness.beats.create(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        plotNodeId: null,
        title: '实体引用',
        goal: '',
        coreConflict: '',
        expectedResult: '',
        beatType: 'setup',
        wordTargetPercent: 10,
        required: true,
        characterIds: [character.id],
        locationIds: [location.id],
      });
      const beat = list.beats[0]!;
      expect(beat).toMatchObject({
        characterIds: [character.id],
        locationIds: [location.id],
      });
      expect(
        harness.workspace.readProject(project.projectId, (connection) =>
          connection
            .prepare(
              `SELECT entity_id AS entityId, role
                 FROM scene_beat_entities
                WHERE scene_beat_id = ?
                ORDER BY role, entity_id`,
            )
            .all(beat.id),
        ),
      ).toEqual([
        { entityId: character.id, role: 'character' },
        { entityId: location.id, role: 'location' },
      ]);
      expect(
        harness.canon.previewDelete({ projectId: project.projectId, entityId: character.id }),
      ).toMatchObject({ sceneBeatReferenceCount: 1, canDelete: false });

      for (const characterId of [randomUUID(), archived.id, location.id]) {
        await expect(
          harness.beats.update(randomUUID(), {
            projectId: project.projectId,
            sceneBeatId: beat.id,
            patch: { characterIds: [characterId] },
          }),
        ).rejects.toBeDefined();
      }

      const foreignProjectId = randomUUID();
      const foreignCharacterId = randomUUID();
      await harness.workspace.writeProject(randomUUID(), project.projectId, (connection) => {
        const now = clock.now().toISOString();
        connection
          .prepare(
            `INSERT INTO projects(
               id, name, channel, active_style_profile_id, schema_version, created_at, updated_at
             ) VALUES(?, 'Foreign', 'test', NULL, 15, ?, ?)`,
          )
          .run(foreignProjectId, now, now);
        connection
          .prepare(
            `INSERT INTO entities(
               id, project_id, entity_type, name, aliases_json, summary,
               status, archived_at, created_at, updated_at
             ) VALUES(?, ?, 'character', '异项目人物', '[]', '', 'active', NULL, ?, ?)`,
          )
          .run(foreignCharacterId, foreignProjectId, now, now);
      });
      await expect(
        harness.beats.update(randomUUID(), {
          projectId: project.projectId,
          sceneBeatId: beat.id,
          patch: { characterIds: [foreignCharacterId] },
        }),
      ).rejects.toBeDefined();

      const unchanged = harness.beats.list({
        projectId: project.projectId,
        chapterId: chapter.id,
      }).beats[0]!;
      expect(unchanged).toMatchObject({
        characterIds: [character.id],
        locationIds: [location.id],
      });
    } finally {
      await closeHarness(harness);
    }
  });
});
