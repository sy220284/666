import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { afterEach, describe, expect, it } from 'vitest';

import {
  calculateWritingStatistics,
  findTextRanges,
} from '../../packages/editor-core/src/index.js';
import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-17T02:20:00.000Z') };

function percentile95(samples: readonly number[]): number {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? Number.POSITIVE_INFINITY;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M1-06 writing performance budgets', () => {
  it('keeps 2K local typing/statistics, current-chapter find and SQLite autosave below P95 budgets', async () => {
    const text = '雨落长街，灯火未眠。'.repeat(200);
    const typingSamples: number[] = [];
    const findSamples: number[] = [];
    for (let index = 0; index < 60; index += 1) {
      let started = performance.now();
      calculateWritingStatistics(`${text}${index}`, 200, 8_000);
      typingSamples.push(performance.now() - started);
      started = performance.now();
      findTextRanges(text, '灯火');
      findSamples.push(performance.now() - started);
    }

    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-m1-writing-perf-'));
    temporaryDirectories.push(root);
    const projectParent = path.join(root, 'projects');
    await mkdir(projectParent, { recursive: true });
    const runtime = await openAppRuntime({
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
      recentProjects: runtime.recentProjects,
      clock,
    });
    const structure = new ProjectStructureService(workspace, { clock });
    const drafts = new DraftService(workspace, { clock });
    const autosaveSamples: number[] = [];
    try {
      const project = await workspace.create(
        randomUUID(),
        { name: 'M1性能项目', channel: '测试' },
        projectParent,
      );
      const chapter = structure.list(project.projectId).volumes[0]!.chapters[0]!;
      let draft = await drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      for (let index = 0; index < 40; index += 1) {
        const block = draft.blocks[0]!;
        const started = performance.now();
        draft = await drafts.applyPatch(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
          draftId: draft.draftId,
          baseRevision: draft.revision,
          operations: [
            {
              type: 'update',
              logicalBlockId: block.logicalBlockId,
              expectedHash: block.contentHash!,
              content: `${text.slice(0, 2_000)}${index}`,
            },
          ],
        });
        autosaveSamples.push(performance.now() - started);
      }
    } finally {
      await workspace.shutdown();
      await runtime.close();
    }

    const metrics = [
      {
        metric: 'typing_latency_p95_ms',
        dataset: '2k-draft-local-statistics-path',
        samples: typingSamples.length,
        result: percentile95(typingSamples),
        budget: 50,
      },
      {
        metric: 'chapter_find_p95_ms',
        dataset: '2k-draft-current-chapter-find',
        samples: findSamples.length,
        result: percentile95(findSamples),
        budget: 100,
      },
      {
        metric: 'autosave_transaction_p95_ms',
        dataset: '2k-draft-sqlite-patch-transaction',
        samples: autosaveSamples.length,
        result: percentile95(autosaveSamples),
        budget: 150,
      },
    ].map((metric) => ({ ...metric, passed: metric.result <= metric.budget }));

    expect(metrics.every((metric) => metric.passed)).toBe(true);
    const output = process.env.WORLDFORGE_M1_PERF_OUTPUT;
    if (output) {
      await mkdir(path.dirname(output), { recursive: true });
      await writeFile(output, `${JSON.stringify(metrics, null, 2)}\n`, 'utf8');
    }
  });
});
