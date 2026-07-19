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
const clock = { now: () => new Date('2026-07-19T08:00:00.000Z') };

interface Harness {
  readonly root: string;
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly beats: SceneBeatService;
  readonly canon: EntityCanonService;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-entity-canon-'));
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

describe('M3-03 Entity and static Canon', () => {
  it('normalizes aliases, preserves fact history, and keeps one current fact', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: 'Canon历史', channel: '长篇' },
        harness.parent,
      );
      let catalog = await harness.canon.create(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        entityType: 'character',
        name: ' 林照夜 ',
        aliases: ['阿夜', ' 阿夜 ', '夜巡使'],
        summary: '主角',
      });
      const entity = catalog.entities[0]!;
      expect(entity).toMatchObject({ name: '林照夜', aliases: ['阿夜', '夜巡使'] });

      catalog = await harness.canon.setFact(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        entityId: entity.id,
        factKey: ' Current Weapon ',
        value: { name: '旧刀' },
        description: '初始设定',
        sourceType: 'author',
        sourceId: null,
      });
      catalog = await harness.canon.setFact(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        entityId: entity.id,
        factKey: 'current weapon',
        value: { name: '照胆刀' },
        description: '作者修订',
        sourceType: 'author',
        sourceId: null,
      });

      const facts = catalog.entities[0]!.facts;
      expect(facts).toHaveLength(2);
      expect(facts.filter((fact) => fact.status === 'current')).toHaveLength(1);
      expect(facts.find((fact) => fact.status === 'current')).toMatchObject({
        factKey: 'current-weapon',
        value: { name: '照胆刀' },
      });
      expect(facts.find((fact) => fact.status === 'historical')?.supersededAt).not.toBeNull();

      const persisted = harness.workspace.readProject(project.projectId, (connection) =>
        connection
          .prepare(
            `SELECT COUNT(*) AS total FROM canon_facts
              WHERE entity_id = ? AND fact_key = ? AND status = 'current'`,
          )
          .get(entity.id, 'current-weapon'),
      );
      expect(Number(persisted?.total)).toBe(1);
    } finally {
      await closeHarness(harness);
    }
  });

  it('rejects AI writes and cross-project Entity references', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: 'Canon权限', channel: '长篇' },
        harness.parent,
      );
      await expect(
        harness.canon.create(randomUUID(), {
          projectId: project.projectId,
          authority: 'ai',
          entityType: 'location',
          name: '推测地点',
          aliases: [],
          summary: '',
        }),
      ).rejects.toMatchObject({ code: 'CANON_AUTHOR_REQUIRED' });

      const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      const beat = (
        await harness.beats.create(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
          plotNodeId: null,
          title: '抵达城门',
          goal: '',
          coreConflict: '',
          expectedResult: '',
          beatType: 'setup',
          wordTargetPercent: 10,
          required: true,
          characterIds: [],
          locationIds: [],
        })
      ).beats[0]!;

      const foreignProjectId = randomUUID();
      const foreignEntityId = randomUUID();
      await harness.workspace.writeProject(randomUUID(), project.projectId, (connection) => {
        const now = clock.now().toISOString();
        connection
          .prepare(
            `INSERT INTO projects(
               id, name, channel, active_style_profile_id, schema_version, created_at, updated_at
             ) VALUES(?, 'Foreign', 'test', NULL, 12, ?, ?)`,
          )
          .run(foreignProjectId, now, now);
        connection
          .prepare(
            `INSERT INTO entities(
               id, project_id, entity_type, name, aliases_json, summary,
               status, archived_at, created_at, updated_at
             ) VALUES(?, ?, 'location', '异项目地点', '[]', '', 'active', NULL, ?, ?)`,
          )
          .run(foreignEntityId, foreignProjectId, now, now);
      });

      await expect(
        harness.canon.linkSceneBeat(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          sceneBeatId: beat.id,
          entityId: foreignEntityId,
          role: 'location',
        }),
      ).rejects.toMatchObject({ code: 'ENTITY_NOT_FOUND' });
    } finally {
      await closeHarness(harness);
    }
  });

  it('previews references and requires archive plus reference removal before deletion', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: 'Canon删除', channel: '长篇' },
        harness.parent,
      );
      const entity = (
        await harness.canon.create(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          entityType: 'faction',
          name: '巡夜司',
          aliases: [],
          summary: '',
        })
      ).entities[0]!;
      const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      const beat = (
        await harness.beats.create(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
          plotNodeId: null,
          title: '巡夜司介入',
          goal: '',
          coreConflict: '',
          expectedResult: '',
          beatType: 'development',
          wordTargetPercent: 20,
          required: true,
          characterIds: [],
          locationIds: [],
        })
      ).beats[0]!;
      await harness.canon.linkSceneBeat(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        sceneBeatId: beat.id,
        entityId: entity.id,
        role: 'participant',
      });

      expect(
        harness.canon.previewDelete({ projectId: project.projectId, entityId: entity.id }),
      ).toMatchObject({
        archived: false,
        sceneBeatReferenceCount: 1,
        canDelete: false,
      });
      await harness.canon.archive(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        entityId: entity.id,
      });
      await expect(
        harness.canon.delete(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          entityId: entity.id,
          confirmName: entity.name,
        }),
      ).rejects.toMatchObject({ code: 'ENTITY_REFERENCED' });

      await harness.workspace.writeProject(randomUUID(), project.projectId, (connection) => {
        connection.prepare('DELETE FROM scene_beat_entities WHERE entity_id = ?').run(entity.id);
      });
      const deleted = await harness.canon.delete(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        entityId: entity.id,
        confirmName: entity.name,
      });
      expect(deleted).toEqual({ projectId: project.projectId, entityId: entity.id, deleted: true });
      expect(
        harness.canon.list({ projectId: project.projectId, includeArchived: true }).entities,
      ).toEqual([]);
    } finally {
      await closeHarness(harness);
    }
  });
});
