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
const clock = { now: () => new Date('2026-08-15T07:15:00.000Z') };

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('M12-01 Project Journal migration', () => {
  it('keeps legacy runs chapter-scoped and permits Journal only at project scope', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-m12-01-journal-migration-'));
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
      { name: 'M12-01 日志迁移验证', channel: '长篇' },
      parent,
    );
    const projectId = project.projectId;
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
        expect(sql).toContain("NEW.run_type = 'journal_summarize'");
        expect(sql).toContain('GENERATION_JOURNAL_SCOPE_INVALID');
      }

      const insertRun = database.prepare(`
        INSERT INTO generation_runs(
          id, request_id, task_id, project_id, chapter_id,
          scope_type, scope_id, run_type, prompt_id, prompt_version,
          output_mode, provider_id, actual_model, support_status,
          status, stage, retry_count, partial_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertRun.run(
        randomUUID(),
        randomUUID(),
        randomUUID(),
        projectId,
        null,
        'project',
        projectId,
        'journal_summarize',
        'worldforge.journal-summarize',
        1,
        'structured',
        'provider-fixture',
        'model-fixture',
        'unverified',
        'queued',
        'queued',
        0,
        'unavailable',
        clock.now().toISOString(),
      );
      expect(
        database
          .prepare(
            "SELECT count(*) AS count FROM generation_runs WHERE run_type = 'journal_summarize'",
          )
          .get(),
      ).toEqual({ count: 1n });

      expect(() =>
        insertRun.run(
          randomUUID(),
          randomUUID(),
          randomUUID(),
          projectId,
          'legacy-chapter',
          'project',
          projectId,
          'journal_summarize',
          'worldforge.journal-summarize',
          1,
          'structured',
          'provider-fixture',
          'model-fixture',
          'unverified',
          'queued',
          'queued',
          0,
          'unavailable',
          clock.now().toISOString(),
        ),
      ).toThrow(/GENERATION_JOURNAL_SCOPE_INVALID/);

      expect(() =>
        insertRun.run(
          randomUUID(),
          randomUUID(),
          randomUUID(),
          projectId,
          null,
          'project',
          projectId,
          'skeleton',
          'worldforge.skeleton',
          1,
          'structured',
          'provider-fixture',
          'model-fixture',
          'unverified',
          'queued',
          'queued',
          0,
          'unavailable',
          clock.now().toISOString(),
        ),
      ).toThrow(/GENERATION_LEGACY_SCOPE_INVALID/);

      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      database.close();
    }
  });
});
