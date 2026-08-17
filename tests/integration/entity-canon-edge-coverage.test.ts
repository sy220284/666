import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { EntityCanonService } from '../../packages/core-service/src/entity-canon.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { SceneBeatService } from '../../packages/core-service/src/scene-beat.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const directories: string[] = [];
const clock = { now: () => new Date('2026-08-17T00:00:00.000Z') };

interface Harness {
  readonly root: string;
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly beats: SceneBeatService;
  readonly canon: EntityCanonService;
}

async function harness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-entity-canon-edge-'));
  directories.push(root);
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

async function close(value: Harness): Promise<void> {
  await value.workspace.shutdown();
  await value.appRuntime.close();
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createProject(value: Harness, name: string) {
  return value.workspace.create(randomUUID(), { name, channel: '长篇' }, value.parent);
}

async function createEntity(
  value: Harness,
  projectId: string,
  name: string,
  entityType: 'character' | 'location' = 'character',
) {
  return (
    await value.canon.create(randomUUID(), {
      projectId,
      authority: 'author',
      entityType,
      name,
      aliases: [],
      summary: '',
    })
  ).entities.find((entity) => entity.name === name)!;
}

function fakeCatalogService(input: {
  readonly projectFound?: boolean;
  readonly entityRow: Record<string, unknown>;
  readonly facts?: readonly Record<string, unknown>[];
}): EntityCanonService {
  const connection = contractInput<DatabaseSync>({
    prepare: (sql: string) => ({
      get: (..._args: unknown[]) => {
        if (sql.includes('SELECT 1 FROM projects'))
          return input.projectFound === false ? undefined : { found: 1 };
        throw new Error(`UNEXPECTED_FAKE_GET:${sql}`);
      },
      all: (..._args: unknown[]) => {
        if (sql.includes('FROM entities')) return [input.entityRow];
        if (sql.includes('FROM canon_facts')) return [...(input.facts ?? [])];
        throw new Error(`UNEXPECTED_FAKE_ALL:${sql}`);
      },
    }),
  });
  const workspace = contractInput<ProjectWorkspaceService>({
    readProject: (_projectId: string, operation: (database: DatabaseSync) => unknown) =>
      operation(connection),
  });
  return new EntityCanonService(workspace);
}

function fakePreviewService(
  row: Record<string, unknown>,
  sceneTotal: unknown,
  canonTotal: unknown,
): EntityCanonService {
  const connection = contractInput<DatabaseSync>({
    prepare: (sql: string) => ({
      get: (..._args: unknown[]) => {
        if (sql.includes('FROM entities WHERE id = ?')) return row;
        if (sql.includes('FROM scene_beat_entities')) return { total: sceneTotal };
        if (sql.includes('FROM canon_facts WHERE project_id')) return { total: canonTotal };
        throw new Error(`UNEXPECTED_PREVIEW_GET:${sql}`);
      },
      all: (..._args: unknown[]) => {
        if (sql.includes('FROM sqlite_master')) return [];
        throw new Error(`UNEXPECTED_PREVIEW_ALL:${sql}`);
      },
    }),
  });
  const workspace = contractInput<ProjectWorkspaceService>({
    readProject: (_projectId: string, operation: (database: DatabaseSync) => unknown) =>
      operation(connection),
  });
  return new EntityCanonService(workspace);
}

function validEntityRow(projectId: string, entityId: string): Record<string, unknown> {
  return {
    id: entityId,
    projectId,
    entityType: 'character',
    name: '林照夜',
    aliasesJson: '[]',
    summary: '',
    status: 'active',
    archivedAt: null,
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
  };
}

function validFactRow(projectId: string, entityId: string): Record<string, unknown> {
  return {
    id: randomUUID(),
    projectId,
    entityId,
    factKey: 'weapon',
    valueJson: JSON.stringify({ name: '刀' }),
    description: '',
    sourceType: 'author',
    sourceId: null,
    status: 'current',
    confirmedAt: '2026-08-17T00:00:00.000Z',
    supersededAt: null,
    createdAt: '2026-08-17T00:00:00.000Z',
  };
}

describe('entity canon defensive and boundary coverage', () => {
  it('updates all entity fields, preserves omitted fields, enforces active-name uniqueness and skips it after archive', async () => {
    const value = await harness();
    try {
      const project = await createProject(value, '实体更新');
      const first = await createEntity(value, project.projectId, '林照夜');
      await createEntity(value, project.projectId, '临江城', 'location');

      let catalog = await value.canon.update(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        entityId: first.id,
        patch: {
          entityType: 'location',
          name: ' 夜渡口 ',
          aliases: ['渡口', ' 渡口 ', '旧渡'],
          summary: '  新摘要  ',
        },
      });
      expect(catalog.entities.find((entity) => entity.id === first.id)).toMatchObject({
        entityType: 'location',
        name: '夜渡口',
        aliases: ['渡口', '旧渡'],
        summary: '新摘要',
      });

      catalog = await value.canon.update(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        entityId: first.id,
        patch: { summary: '仅更新摘要' },
      });
      expect(catalog.entities.find((entity) => entity.id === first.id)).toMatchObject({
        entityType: 'location',
        name: '夜渡口',
        aliases: ['渡口', '旧渡'],
        summary: '仅更新摘要',
      });

      await expect(
        value.canon.update(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          entityId: first.id,
          patch: { name: '临江城' },
        }),
      ).rejects.toMatchObject({ code: 'ENTITY_CONFLICT' });

      await value.canon.archive(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        entityId: first.id,
      });
      catalog = await value.canon.update(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        entityId: first.id,
        patch: { name: '临江城' },
      });
      expect(catalog.entities.find((entity) => entity.id === first.id)).toMatchObject({
        status: 'archived',
        name: '临江城',
      });
      expect(value.canon.list({ projectId: project.projectId }).entities).toHaveLength(1);
    } finally {
      await close(value);
    }
  });

  it('rejects duplicate entity creation and writes to archived entities', async () => {
    const value = await harness();
    try {
      const project = await createProject(value, '归档写保护');
      const entity = await createEntity(value, project.projectId, '巡夜司', 'location');
      await expect(
        value.canon.create(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          entityType: 'location',
          name: ' 巡夜司 ',
          aliases: [],
          summary: '',
        }),
      ).rejects.toMatchObject({ code: 'ENTITY_CONFLICT' });

      await value.canon.archive(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        entityId: entity.id,
      });
      await expect(
        value.canon.setFact(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          entityId: entity.id,
          factKey: 'weapon',
          value: '旧刀',
          description: '',
          sourceType: 'author',
          sourceId: null,
        }),
      ).rejects.toMatchObject({ code: 'ENTITY_CONFLICT' });
      await expect(
        value.canon.linkSceneBeat(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          entityId: entity.id,
          sceneBeatId: randomUUID(),
          role: 'location',
        }),
      ).rejects.toMatchObject({ code: 'ENTITY_CONFLICT' });
    } finally {
      await close(value);
    }
  });

  it('rejects a missing active scene beat for a valid active entity', async () => {
    const value = await harness();
    try {
      const project = await createProject(value, '缺失节拍');
      const entity = await createEntity(value, project.projectId, '主角');
      await expect(
        value.canon.linkSceneBeat(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          entityId: entity.id,
          sceneBeatId: randomUUID(),
          role: 'character',
        }),
      ).rejects.toMatchObject({ code: 'ENTITY_NOT_FOUND' });
    } finally {
      await close(value);
    }
  });

  it('rejects wrong delete confirmation and a zero-row delete without corrupting the archived entity', async () => {
    const value = await harness();
    try {
      const project = await createProject(value, '删除边界');
      const entity = await createEntity(value, project.projectId, '待删人物');
      await value.canon.archive(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        entityId: entity.id,
      });
      await expect(
        value.canon.delete(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          entityId: entity.id,
          confirmName: '别名',
        }),
      ).rejects.toMatchObject({ code: 'ENTITY_INVALID' });

      await value.workspace.writeProject(randomUUID(), project.projectId, (connection) => {
        connection.exec(`CREATE TRIGGER ignore_entity_delete
          BEFORE DELETE ON entities
          WHEN OLD.id = '${entity.id}'
          BEGIN
            SELECT RAISE(IGNORE);
          END;`);
      });
      await expect(
        value.canon.delete(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          entityId: entity.id,
          confirmName: entity.name,
        }),
      ).rejects.toMatchObject({ code: 'ENTITY_CONFLICT' });
      expect(
        value.canon.list({ projectId: project.projectId, includeArchived: true }).entities[0],
      ).toMatchObject({ id: entity.id, status: 'archived' });
    } finally {
      await close(value);
    }
  });

  it('accepts bigint reference counts and rejects an invalid persisted count', () => {
    const projectId = randomUUID();
    const entityId = randomUUID();
    const archived = {
      ...validEntityRow(projectId, entityId),
      status: 'archived',
      archivedAt: '2026-08-17T00:00:00.000Z',
    };
    expect(
      fakePreviewService(archived, 2n, 3).previewDelete({ projectId, entityId }),
    ).toMatchObject({
      sceneBeatReferenceCount: 2,
      canonFactCount: 3,
    });
    expect(() =>
      fakePreviewService(archived, 1.5, 0).previewDelete({ projectId, entityId }),
    ).toThrowError(expect.objectContaining({ code: 'CANON_INVARIANT' }));
  });

  it('rejects a missing persisted project and corrupt persisted entity text/alias/fact JSON', () => {
    const projectId = randomUUID();
    const entityId = randomUUID();
    const valid = validEntityRow(projectId, entityId);
    expect(() =>
      fakeCatalogService({ projectFound: false, entityRow: valid }).list({ projectId }),
    ).toThrowError(expect.objectContaining({ code: 'ENTITY_NOT_FOUND' }));
    expect(() =>
      fakeCatalogService({ entityRow: { ...valid, name: 7 } }).list({ projectId }),
    ).toThrowError(expect.objectContaining({ code: 'CANON_INVARIANT' }));
    expect(() =>
      fakeCatalogService({ entityRow: { ...valid, aliasesJson: '{broken' } }).list({ projectId }),
    ).toThrowError(expect.objectContaining({ code: 'CANON_INVARIANT' }));
    expect(() =>
      fakeCatalogService({
        entityRow: valid,
        facts: [{ ...validFactRow(projectId, entityId), valueJson: '{broken' }],
      }).list({ projectId }),
    ).toThrowError(expect.objectContaining({ code: 'CANON_INVARIANT' }));
  });
});
