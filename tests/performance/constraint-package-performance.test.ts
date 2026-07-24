import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ConstraintPackageService } from '../../packages/core-service/src/constraint-package.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-24T12:00:00.000Z') };

function percentile95(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]!;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M4-02 constraint package performance', () => {
  it('assembles and trims a 1.5 million character draft within the local budget', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-constraint-performance-'));
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
    try {
      const project = await workspace.create(
        randomUUID(),
        { name: '约束包性能项目', channel: '长篇' },
        parent,
      );
      const chapter = new ProjectStructureService(workspace, { clock }).list(project.projectId)
        .volumes[0]!.chapters[0]!;
      const blockText = '玄烛城雨夜追索。'.repeat(10_000).slice(0, 100_000);
      await workspace.writeProject(randomUUID(), project.projectId, (connection) => {
        connection
          .prepare('DELETE FROM draft_blocks WHERE draft_id = ?')
          .run(chapter.activeDraftId);
        const insert = connection.prepare(
          `INSERT INTO draft_blocks(
             id, draft_id, logical_block_id, order_key, block_type, text,
             attributes_json, source, locked, content_hash, revision
           ) VALUES(?, ?, ?, ?, 'paragraph', ?, '{}', 'manual', 0, NULL, 0)`,
        );
        for (let index = 0; index < 15; index += 1) {
          insert.run(
            randomUUID(),
            chapter.activeDraftId,
            randomUUID(),
            (index + 1) * 1024,
            blockText,
          );
        }
      });
      const service = new ConstraintPackageService(workspace);
      const input = {
        projectId: project.projectId,
        chapterId: chapter.id,
        taskType: 'chapter' as const,
        maxInputTokens: 262_144,
        safetyMarginTokens: 4_096,
        maxSupplementalResults: 0,
      };
      service.build(input);
      const durations: number[] = [];
      let last;
      for (let index = 0; index < 5; index += 1) {
        const started = performance.now();
        last = service.build(input);
        durations.push(performance.now() - started);
      }
      const p95 = percentile95(durations);
      console.info(JSON.stringify({ fixtureCharacters: 1_500_000, buildP95Ms: p95 }));
      expect(p95).toBeLessThan(1_000);
      expect(last!.estimatedTokens).toBeLessThanOrEqual(last!.budget.usableTokens);
      expect(last!.trimLog.length).toBeGreaterThan(0);
    } finally {
      await workspace.shutdown();
      await appRuntime.close();
    }
  }, 30_000);
});
