import { createHash, randomUUID } from 'node:crypto';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import {
  ProjectWorkspaceService,
  type ProjectWorkspaceError,
  type ProjectWorkspaceServiceOptions,
} from '../../packages/core-service/src/project-workspace.js';

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-project-workspace-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

interface Harness {
  readonly root: string;
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly service: ProjectWorkspaceService;
}

async function createHarness(
  overrides: Partial<ProjectWorkspaceServiceOptions> = {},
): Promise<Harness> {
  const root = await temporaryDirectory();
  const parent = path.join(root, 'projects');
  await mkdir(parent, { recursive: true });
  const clock = { now: () => new Date('2026-07-16T09:00:00.000Z') };
  const appRuntime = await openAppRuntime({
    databasePath: path.join(root, 'app.sqlite'),
    migrationsDirectory: 'migrations/app',
    recoveryDirectory: path.join(root, 'app-recovery'),
    appVersion: '0.1.0',
    clock,
  });
  const service = new ProjectWorkspaceService({
    projectMigrationsDirectory: 'migrations/project',
    projectMigrationRecoveryDirectory: path.join(root, 'project-migration-recovery'),
    appVersion: '0.1.0',
    recentProjects: appRuntime.recentProjects,
    clock,
    ...overrides,
  });
  return { root, parent, appRuntime, service };
}

async function closeHarness(harness: Harness): Promise<void> {
  await harness.service.shutdown();
  await harness.appRuntime.close();
}

describe('project workspace lifecycle', () => {
  it('creates a private .worldforge workspace, manifest, project database, and recent record', async () => {
    const harness = await createHarness();
    try {
      const summary = await harness.service.create(
        randomUUID(),
        { name: '长夜灯火', channel: '网络小说' },
        harness.parent,
      );
      expect(summary).toMatchObject({
        name: '长夜灯火',
        channel: '网络小说',
        databaseMode: 'read-write',
        compatibility: 'current',
        readOnlyReason: null,
      });
      expect(path.basename(summary.workspacePath)).toBe('长夜灯火.worldforge');
      expect((await stat(summary.workspacePath)).mode & 0o777).toBe(0o700);

      const manifestPath = path.join(summary.workspacePath, 'manifest.json');
      const databasePath = path.join(summary.workspacePath, 'project.sqlite');
      expect((await stat(manifestPath)).mode & 0o777).toBe(0o600);
      expect((await stat(databasePath)).mode & 0o777).toBe(0o600);
      expect(JSON.parse(await readFile(manifestPath, 'utf8'))).toEqual({
        format: 'worldforge-project',
        manifestVersion: 1,
        projectId: summary.projectId,
        displayName: '长夜灯火',
        databaseFile: 'project.sqlite',
        projectSchemaVersion: 2,
        createdAt: '2026-07-16T09:00:00.000Z',
      });

      const project = new DatabaseSync(databasePath, { readOnly: true });
      expect(project.prepare('SELECT * FROM projects').get()).toEqual({
        id: summary.projectId,
        name: '长夜灯火',
        channel: '网络小说',
        active_style_profile_id: null,
        schema_version: 2,
        created_at: '2026-07-16T09:00:00.000Z',
        updated_at: '2026-07-16T09:00:00.000Z',
      });
      project.close();

      await expect(harness.appRuntime.recentProjects.list(randomUUID())).resolves.toMatchObject([
        {
          projectId: summary.projectId,
          workspacePath: summary.workspacePath,
          displayName: '长夜灯火',
          missingSince: null,
        },
      ]);
      await expect(
        harness.service.create(
          randomUUID(),
          { name: '另一个项目', channel: '未分类' },
          harness.parent,
        ),
      ).rejects.toMatchObject<ProjectWorkspaceError>({ code: 'PROJECT_ALREADY_ACTIVE' });

      await expect(harness.service.close(randomUUID(), summary.projectId)).resolves.toEqual({
        projectId: summary.projectId,
        closed: true,
      });
      await expect(
        harness.service.open(randomUUID(), { recentProjectId: summary.projectId }),
      ).resolves.toMatchObject({ projectId: summary.projectId, databaseMode: 'read-write' });
    } finally {
      await closeHarness(harness);
    }
  });

  it('enforces active project IDs and rejects traversal and symbolic-link escapes', async () => {
    const harness = await createHarness();
    try {
      const summary = await harness.service.create(
        randomUUID(),
        { name: '边界测试', channel: '未分类' },
        harness.parent,
      );
      expect(() => harness.service.assertActiveProject(randomUUID())).toThrowError(
        expect.objectContaining({ code: 'PROJECT_ID_MISMATCH' }),
      );
      await expect(
        harness.service.resolveProjectPath(summary.projectId, '../outside.txt'),
      ).rejects.toMatchObject({ code: 'PROJECT_PATH_OUTSIDE_SCOPE' });
      await expect(
        harness.service.resolveProjectPath(summary.projectId, path.join(harness.root, 'absolute')),
      ).rejects.toMatchObject({ code: 'PROJECT_PATH_OUTSIDE_SCOPE' });

      const outside = path.join(harness.root, 'outside');
      await mkdir(outside);
      await writeFile(path.join(outside, 'private.txt'), 'outside-data');
      await symlink(outside, path.join(summary.workspacePath, 'escape'));
      await expect(
        harness.service.resolveProjectPath(summary.projectId, 'escape/private.txt'),
      ).rejects.toMatchObject({ code: 'PROJECT_PATH_OUTSIDE_SCOPE' });
    } finally {
      await closeHarness(harness);
    }
  });

  it('serializes lifecycle commands so concurrent creates cannot activate two projects', async () => {
    const harness = await createHarness();
    try {
      const results = await Promise.allSettled([
        harness.service.create(
          randomUUID(),
          { name: '并发项目甲', channel: '未分类' },
          harness.parent,
        ),
        harness.service.create(
          randomUUID(),
          { name: '并发项目乙', channel: '未分类' },
          harness.parent,
        ),
      ]);
      const fulfilled = results.filter((result) => result.status === 'fulfilled');
      const rejected = results.filter((result) => result.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]).toMatchObject({ reason: { code: 'PROJECT_ALREADY_ACTIVE' } });
      expect(
        (await readdir(harness.parent)).filter((name) => name.endsWith('.worldforge')),
      ).toHaveLength(1);
    } finally {
      await closeHarness(harness);
    }
  });

  it('rejects missing workspaces, manifest symlinks, and manifest/database project mismatches', async () => {
    const harness = await createHarness();
    try {
      await expect(
        harness.service.open(randomUUID(), { workspacePath: path.join(harness.root, 'missing') }),
      ).rejects.toMatchObject({ code: 'PROJECT_PATH_MISSING' });

      const summary = await harness.service.create(
        randomUUID(),
        { name: '清单边界', channel: '未分类' },
        harness.parent,
      );
      await harness.service.close(randomUUID(), summary.projectId);
      const manifestPath = path.join(summary.workspacePath, 'manifest.json');
      const outsideManifest = path.join(harness.root, 'outside-manifest.json');
      await writeFile(outsideManifest, await readFile(manifestPath));
      await rm(manifestPath);
      await symlink(outsideManifest, manifestPath);
      await expect(
        harness.service.open(randomUUID(), { workspacePath: summary.workspacePath }),
      ).rejects.toMatchObject({ code: 'PROJECT_PATH_OUTSIDE_SCOPE' });

      await rm(manifestPath);
      const mismatched = JSON.parse(await readFile(outsideManifest, 'utf8')) as Record<
        string,
        unknown
      >;
      mismatched.projectId = randomUUID();
      await writeFile(manifestPath, `${JSON.stringify(mismatched)}\n`, { mode: 0o600 });
      await expect(
        harness.service.open(randomUUID(), { workspacePath: summary.workspacePath }),
      ).rejects.toMatchObject({ code: 'PROJECT_ID_MISMATCH' });
      expect(harness.service.activeProject).toBeNull();
    } finally {
      await closeHarness(harness);
    }
  });
});

describe('project move safety', () => {
  it('closes, copies, hashes, verifies, updates the recent path, and removes the source', async () => {
    const harness = await createHarness();
    const targetParent = path.join(harness.root, 'moved');
    await mkdir(targetParent);
    try {
      const created = await harness.service.create(
        randomUUID(),
        { name: '移动项目', channel: '悬疑' },
        harness.parent,
      );
      const moved = await harness.service.move(randomUUID(), created.projectId, targetParent);
      expect(moved).toMatchObject({
        projectId: created.projectId,
        sourceRetained: false,
        databaseMode: 'read-write',
      });
      expect(moved.workspacePath).toBe(path.join(targetParent, '移动项目.worldforge'));
      await expect(stat(created.workspacePath)).rejects.toMatchObject({ code: 'ENOENT' });
      expect((await stat(moved.workspacePath)).isDirectory()).toBe(true);
      expect(harness.service.activeProject).toMatchObject({ workspacePath: moved.workspacePath });
      await expect(harness.appRuntime.recentProjects.list(randomUUID())).resolves.toMatchObject([
        { projectId: created.projectId, workspacePath: moved.workspacePath },
      ]);
    } finally {
      await closeHarness(harness);
    }
  });

  it.each([
    {
      name: 'copy interruption',
      overrides: {
        copyWorkspace: async () => {
          throw new Error('injected-copy-interruption');
        },
      } satisfies Partial<ProjectWorkspaceServiceOptions>,
    },
    {
      name: 'hash mismatch',
      overrides: {
        hashWorkspace: async (workspacePath: string) =>
          workspacePath.includes('.move-') ? 'copy-hash' : 'source-hash',
      } satisfies Partial<ProjectWorkspaceServiceOptions>,
    },
    {
      name: 'insufficient disk space',
      overrides: {
        freeBytes: async () => 0n,
      } satisfies Partial<ProjectWorkspaceServiceOptions>,
    },
  ])('keeps the original active after $name', async ({ overrides }) => {
    const harness = await createHarness(overrides);
    const targetParent = path.join(harness.root, 'fault-target');
    await mkdir(targetParent);
    try {
      const created = await harness.service.create(
        randomUUID(),
        { name: '故障项目', channel: '未分类' },
        harness.parent,
      );
      await expect(
        harness.service.move(randomUUID(), created.projectId, targetParent),
      ).rejects.toMatchObject({ code: 'PROJECT_MOVE_FAILED' });
      expect((await stat(created.workspacePath)).isDirectory()).toBe(true);
      expect(harness.service.activeProject).toMatchObject({
        projectId: created.projectId,
        workspacePath: created.workspacePath,
      });
      await expect(stat(path.join(targetParent, '故障项目.worldforge'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      await closeHarness(harness);
    }
  });

  it('does not overwrite an existing target directory', async () => {
    const harness = await createHarness();
    const targetParent = path.join(harness.root, 'conflict-target');
    await mkdir(path.join(targetParent, '冲突项目.worldforge'), { recursive: true });
    try {
      const created = await harness.service.create(
        randomUUID(),
        { name: '冲突项目', channel: '未分类' },
        harness.parent,
      );
      await expect(
        harness.service.move(randomUUID(), created.projectId, targetParent),
      ).rejects.toMatchObject({ code: 'PROJECT_TARGET_CONFLICT' });
      expect(harness.service.activeProject).toMatchObject({ workspacePath: created.workspacePath });
      expect((await stat(created.workspacePath)).isDirectory()).toBe(true);
    } finally {
      await closeHarness(harness);
    }
  });
});

describe('read-only project compatibility', () => {
  it('opens future schemas read-only and rejects all project writes without changing the database', async () => {
    const harness = await createHarness();
    try {
      const created = await harness.service.create(
        randomUUID(),
        { name: '未来项目', channel: '未分类' },
        harness.parent,
      );
      await harness.service.close(randomUUID(), created.projectId);
      const databasePath = path.join(created.workspacePath, 'project.sqlite');
      const raw = new DatabaseSync(databasePath);
      raw
        .prepare(
          `INSERT INTO schema_migrations(version, name, checksum, applied_at, app_version)
           VALUES(99, 'future', 'future-checksum', ?, '9.0.0')`,
        )
        .run('2026-07-16T09:00:00.000Z');
      raw.close();
      const before = createHash('sha256')
        .update(await readFile(databasePath))
        .digest('hex');

      const opened = await harness.service.open(randomUUID(), {
        workspacePath: created.workspacePath,
      });
      expect(opened).toMatchObject({
        projectId: created.projectId,
        databaseMode: 'read-only',
        compatibility: 'future-schema',
        schemaVersion: 99,
        readOnlyReason: 'future-schema',
      });
      expect(() => harness.service.assertActiveProject(created.projectId, true)).toThrowError(
        expect.objectContaining({ code: 'PROJECT_READ_ONLY' }),
      );
      await expect(
        new ProjectStructureService(harness.service).createVolume(randomUUID(), {
          projectId: created.projectId,
          title: '禁止写入',
        }),
      ).rejects.toMatchObject({ code: 'PROJECT_READ_ONLY' });
      const target = path.join(harness.root, 'read-only-move');
      await mkdir(target);
      await expect(
        harness.service.move(randomUUID(), created.projectId, target),
      ).rejects.toMatchObject({ code: 'PROJECT_READ_ONLY' });
      const after = createHash('sha256')
        .update(await readFile(databasePath))
        .digest('hex');
      expect(after).toBe(before);
    } finally {
      await closeHarness(harness);
    }
  });

  it('detects broken foreign keys before opening a writer and leaves the database unchanged', async () => {
    const harness = await createHarness();
    try {
      const created = await harness.service.create(
        randomUUID(),
        { name: '损坏项目', channel: '未分类' },
        harness.parent,
      );
      await harness.service.close(randomUUID(), created.projectId);
      const databasePath = path.join(created.workspacePath, 'project.sqlite');
      const raw = new DatabaseSync(databasePath);
      raw.exec(`
        PRAGMA foreign_keys = OFF;
        CREATE TABLE damaged_parents(id TEXT PRIMARY KEY) STRICT;
        CREATE TABLE damaged_children(
          id TEXT PRIMARY KEY,
          parent_id TEXT NOT NULL REFERENCES damaged_parents(id)
        ) STRICT;
        INSERT INTO damaged_children(id, parent_id) VALUES('child', 'missing');
      `);
      raw.close();
      const before = createHash('sha256')
        .update(await readFile(databasePath))
        .digest('hex');

      const opened = await harness.service.open(randomUUID(), {
        workspacePath: created.workspacePath,
      });
      expect(opened).toMatchObject({
        projectId: created.projectId,
        databaseMode: 'read-only',
        compatibility: 'integrity-failed',
        readOnlyReason: 'integrity-failed',
      });
      expect(() => harness.service.assertActiveProject(created.projectId, true)).toThrowError(
        expect.objectContaining({ code: 'PROJECT_READ_ONLY' }),
      );
      const after = createHash('sha256')
        .update(await readFile(databasePath))
        .digest('hex');
      expect(after).toBe(before);
    } finally {
      await closeHarness(harness);
    }
  });
});

describe('permission failure', () => {
  it.runIf(process.getuid?.() !== 0)(
    'does not leave a partial workspace in a read-only root',
    async () => {
      const harness = await createHarness();
      const readOnlyParent = path.join(harness.root, 'read-only-parent');
      await mkdir(readOnlyParent, { mode: 0o500 });
      try {
        await expect(
          harness.service.create(
            randomUUID(),
            { name: '不能创建', channel: '未分类' },
            readOnlyParent,
          ),
        ).rejects.toMatchObject({ code: 'PROJECT_DIRECTORY_READ_ONLY' });
        expect(await readFile(path.join(harness.root, 'app.sqlite'))).not.toHaveLength(0);
      } finally {
        await chmod(readOnlyParent, 0o700);
        await closeHarness(harness);
      }
    },
  );
});
