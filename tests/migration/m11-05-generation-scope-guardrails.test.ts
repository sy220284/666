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
const clock = { now: () => new Date('2026-08-12T21:45:00.000Z') };

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('M11-05 generation scope guardrails migration', () => {
  it('keeps legacy generation chapter-scoped and selection bound to the active Draft', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-m11-05-guardrails-'));
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
      { name: 'M11-05 范围兜底', channel: '长篇' },
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
      const insertTrigger = database
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'trg_generation_runs_scope_insert'",
        )
        .get() as { readonly sql: string };
      const updateTrigger = database
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'trg_generation_runs_scope_update'",
        )
        .get() as { readonly sql: string };

      for (const sql of [insertTrigger.sql, updateTrigger.sql]) {
        expect(sql).toContain("NEW.run_type NOT IN ('idea_explore', 'journal_summarize')");
        expect(sql).toContain("NEW.scope_type <> 'chapter'");
        expect(sql).toContain('NEW.scope_id <> NEW.chapter_id');
        expect(sql).toContain('chapter.active_draft_id = draft.id');
        expect(sql).toContain("draft.status = 'active'");
      }
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      database.close();
    }
  });
});
