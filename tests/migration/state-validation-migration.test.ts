import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-26T08:00:00.000Z') };
const schema28Triggers = [
  'trg_story_todo_anchor_scope_insert_0028',
  'trg_story_todo_anchor_scope_update_0028',
  'trg_story_comment_anchor_scope_insert_0028',
  'trg_story_comment_anchor_scope_update_0028',
] as const;

interface Schema27Fixture {
  readonly root: string;
  readonly databasePath: string;
  readonly recoveryRoot: string;
  readonly projectId: string;
  readonly workspacePath: string;
  readonly appRuntime: Awaited<ReturnType<typeof openAppRuntime>>;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function createSchema27Fixture(dirty: boolean): Promise<Schema27Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-state-validation-migration-'));
  temporaryDirectories.push(root);
  const parent = path.join(root, 'projects');
  const recoveryRoot = path.join(root, 'project-migration-recovery');
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
    projectMigrationRecoveryDirectory: recoveryRoot,
    appVersion: '0.1.0',
    recentProjects: appRuntime.recentProjects,
    clock,
  });
  const project = await workspace.create(
    randomUUID(),
    { name: dirty ? '历史脏锚点' : '历史干净锚点', channel: '长篇' },
    parent,
  );
  await workspace.shutdown();

  const databasePath = path.join(project.workspacePath, 'project.sqlite');
  const database = new DatabaseSync(databasePath, { readBigInts: true });
  try {
    for (const trigger of schema28Triggers) database.exec(`DROP TRIGGER ${trigger}`);
    database.prepare('DELETE FROM schema_migrations WHERE version = 28').run();
    database.prepare('UPDATE projects SET schema_version = 27').run();
    if (dirty) {
      database
        .prepare(
          `INSERT INTO story_todos(
             id, project_id, chapter_id, scene_beat_id, logical_block_id,
             validation_issue_id, title, status, created_at, updated_at, completed_at
           ) VALUES(?, ?, NULL, NULL, ?, NULL, ?, 'open', ?, ?, NULL)`,
        )
        .run(
          randomUUID(),
          project.projectId,
          'historical-orphan-block',
          '历史非法锚点',
          clock.now().toISOString(),
          clock.now().toISOString(),
        );
    }
  } finally {
    database.close();
  }

  const manifestPath = path.join(project.workspacePath, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
  manifest.projectSchemaVersion = 27;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  return {
    root,
    databasePath,
    recoveryRoot,
    projectId: project.projectId,
    workspacePath: project.workspacePath,
    appRuntime,
  };
}

function inspectSchema28(databasePath: string): {
  readonly schemaVersion: bigint;
  readonly triggerCount: bigint;
  readonly dirtyTodoCount: bigint;
} {
  const database = new DatabaseSync(databasePath, { readOnly: true, readBigInts: true });
  try {
    const schemaVersion = database
      .prepare('SELECT MAX(version) AS version FROM schema_migrations')
      .get()?.version as bigint;
    const triggerCount = database
      .prepare(
        `SELECT COUNT(*) AS count
           FROM sqlite_master
          WHERE type = 'trigger'
            AND name IN (?, ?, ?, ?)`,
      )
      .get(...schema28Triggers)?.count as bigint;
    const dirtyTodoCount = database
      .prepare("SELECT COUNT(*) AS count FROM story_todos WHERE title = '历史非法锚点'")
      .get()?.count as bigint;
    return { schemaVersion, triggerCount, dirtyTodoCount };
  } finally {
    database.close();
  }
}

describe('M4-04 state and validation migration', () => {
  it('preserves strict schema 28 ownership, result and compound-anchor guards', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-state-validation-migration-'));
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
      projectMigrationRecoveryDirectory: path.join(root, 'project-migration-recovery'),
      appVersion: '0.1.0',
      recentProjects: appRuntime.recentProjects,
      clock,
    });
    const project = await workspace.create(
      randomUUID(),
      { name: '状态与检查迁移', channel: '长篇' },
      parent,
    );
    await workspace.shutdown();
    await appRuntime.close();

    const database = new DatabaseSync(path.join(project.workspacePath, 'project.sqlite'), {
      readBigInts: true,
    });
    try {
      expect(database.prepare('SELECT schema_version FROM projects').get()).toEqual({
        schema_version: 28n,
      });
      for (const table of [
        'state_proposal_batches',
        'state_proposals',
        'validation_batches',
        'validation_issues',
        'story_todos',
        'story_comments',
        'generation_input_sources',
        'generation_result_refs',
      ]) {
        expect(
          database.prepare(`SELECT strict FROM pragma_table_list WHERE name = ?`).get(table),
        ).toEqual({ strict: 1n });
      }
      const inputSourceSql = database
        .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`)
        .get('generation_input_sources') as { readonly sql: string };
      expect(inputSourceSql.sql).toContain("'version'");
      const resultRefSql = database
        .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`)
        .get('generation_result_refs') as { readonly sql: string };
      expect(resultRefSql.sql).toContain("'state_proposal_batch'");
      expect(resultRefSql.sql).toContain("'validation_batch'");
      expect(
        database
          .prepare(
            `SELECT name FROM sqlite_master
              WHERE type = 'trigger' AND name IN (
                'trg_state_proposal_batch_scope_insert',
                'trg_state_proposal_scope_insert',
                'trg_validation_batch_scope_insert',
                'trg_validation_issue_scope_insert',
                'generation_state_batch_ref_requires_owned_batch',
                'generation_validation_batch_ref_requires_owned_batch',
                'trg_story_todo_anchor_scope_insert_0028',
                'trg_story_todo_anchor_scope_update_0028',
                'trg_story_comment_anchor_scope_insert_0028',
                'trg_story_comment_anchor_scope_update_0028'
              )
              ORDER BY name`,
          )
          .all(),
      ).toHaveLength(10);
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      database.close();
    }
  });

  it('upgrades a clean schema 27 database to schema 28', async () => {
    const fixture = await createSchema27Fixture(false);
    const workspace = new ProjectWorkspaceService({
      projectMigrationsDirectory: 'migrations/project',
      projectMigrationRecoveryDirectory: fixture.recoveryRoot,
      appVersion: '0.1.0',
      recentProjects: fixture.appRuntime.recentProjects,
      clock,
    });
    try {
      const opened = await workspace.open(randomUUID(), { workspacePath: fixture.workspacePath });
      expect(opened).toMatchObject({
        projectId: fixture.projectId,
        schemaVersion: 28,
        databaseMode: 'read-write',
        compatibility: 'migrated',
      });
    } finally {
      await workspace.shutdown();
      await fixture.appRuntime.close();
    }

    expect(inspectSchema28(fixture.databasePath)).toEqual({
      schemaVersion: 28n,
      triggerCount: 4n,
      dirtyTodoCount: 0n,
    });
  });

  it('rejects dirty schema 27 anchors before migration 28 without a partial upgrade', async () => {
    const fixture = await createSchema27Fixture(true);
    const workspace = new ProjectWorkspaceService({
      projectMigrationsDirectory: 'migrations/project',
      projectMigrationRecoveryDirectory: fixture.recoveryRoot,
      appVersion: '0.1.0',
      recentProjects: fixture.appRuntime.recentProjects,
      clock,
    });
    try {
      const opened = await workspace.open(randomUUID(), { workspacePath: fixture.workspacePath });
      expect(opened).toMatchObject({
        projectId: fixture.projectId,
        schemaVersion: 27,
        databaseMode: 'read-only',
        compatibility: 'migration-failed',
        readOnlyReason: 'migration-failed',
      });
      expect(
        await readdir(path.join(fixture.recoveryRoot, fixture.projectId)),
      ).toEqual([expect.stringMatching(/^project-v27-to-v28-.*\.sqlite$/u)]);
    } finally {
      await workspace.shutdown();
      await fixture.appRuntime.close();
    }

    expect(inspectSchema28(fixture.databasePath)).toEqual({
      schemaVersion: 27n,
      triggerCount: 0n,
      dirtyTodoCount: 1n,
    });
    const manifest = JSON.parse(
      await readFile(path.join(fixture.workspacePath, 'manifest.json'), 'utf8'),
    ) as { readonly projectSchemaVersion: number };
    expect(manifest.projectSchemaVersion).toBe(27);
  });
});
