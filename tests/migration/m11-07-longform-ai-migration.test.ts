import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { latestProjectMigrationVersion } from '../../packages/testkit/src/index.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-08-13T08:00:00.000Z') };

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M11-07 long-form AI foundation migration', () => {
  it('creates one strict rebuildable digest table with scoped invalidation', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-m11-07-migration-'));
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
      { name: '长篇迁移校验', channel: '长篇' },
      parent,
    );
    await workspace.shutdown();
    await appRuntime.close();

    const database = new DatabaseSync(path.join(project.workspacePath, 'project.sqlite'), {
      readBigInts: true,
    });
    try {
      expect(database.prepare('SELECT schema_version FROM projects').get()).toEqual({
        schema_version: BigInt(await latestProjectMigrationVersion()),
      });
      const tables = database
        .prepare(
          "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name LIKE 'story_digest%'",
        )
        .all() as unknown as Array<{ readonly name: string; readonly sql: string }>;
      expect(tables).toHaveLength(1);
      expect(tables[0]).toMatchObject({ name: 'story_digests' });
      expect(tables[0]!.sql).toContain('STRICT');
      expect(tables[0]!.sql).toContain("scope_type IN ('chapter', 'volume', 'project')");
      expect(tables[0]!.sql).toContain("freshness IN ('fresh', 'stale')");
      expect(tables[0]!.sql).toContain('UNIQUE(project_id, scope_type, scope_id)');

      const triggers = database
        .prepare(
          "SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'trg_story_digest_%' ORDER BY name",
        )
        .all() as unknown as Array<{ readonly name: string; readonly sql: string }>;
      expect(triggers.map((trigger) => trigger.name)).toEqual([
        'trg_story_digest_chapter_structure_invalidate',
        'trg_story_digest_finalize_invalidate',
        'trg_story_digest_scope_insert',
        'trg_story_digest_scope_update',
        'trg_story_digest_volume_structure_invalidate',
      ]);
      expect(triggers.find((trigger) => trigger.name.includes('finalize'))?.sql).toContain(
        "freshness = 'stale'",
      );
      expect(() =>
        database
          .prepare(
            `INSERT INTO story_digests(
               id, project_id, scope_type, scope_id, source_hash,
               source_version_ids_json, semantic_revision, freshness, content,
               generation_source, generated_at, updated_at
             ) VALUES(?, ?, 'chapter', ?, ?, '[]', 1, 'fresh', '',
                      'local_extractive_v1', ?, ?)`,
          )
          .run(
            randomUUID(),
            project.projectId,
            randomUUID(),
            'a'.repeat(64),
            clock.now().toISOString(),
            clock.now().toISOString(),
          ),
      ).toThrow(/STORY_DIGEST_CHAPTER_SCOPE_INVALID/u);
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      database.close();
    }
  });
});
