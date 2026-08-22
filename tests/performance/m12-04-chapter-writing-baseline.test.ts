import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { calculateWritingStatistics } from '../../packages/editor-core/src/index.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-08-22T09:00:00.000Z') };

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

describe('M12-04 long chapter author-operation performance', () => {
  it('records real 8K and 20K chapter statistics and SQLite autosave transaction baselines', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-m12-04-writing-perf-'));
    temporaryDirectories.push(root);
    const projectParent = path.join(root, 'projects');
    await mkdir(projectParent, { recursive: true });
    const runtime = await openAppRuntime({
      databasePath: path.join(root, 'app.sqlite'),
      migrationsDirectory: 'migrations/app',
      recoveryDirectory: path.join(root, 'app-recovery'),
      appVersion: '1.0.1',
      clock,
    });
    const workspace = new ProjectWorkspaceService({
      projectMigrationsDirectory: 'migrations/project',
      projectMigrationRecoveryDirectory: path.join(root, 'migration-recovery'),
      appVersion: '1.0.1',
      recentProjects: runtime.recentProjects,
      clock,
    });
    const structure = new ProjectStructureService(workspace, { clock });
    const drafts = new DraftService(workspace, { clock });
    const metrics: Array<{
      readonly characters: number;
      readonly samples: number;
      readonly statisticsP95Ms: number;
      readonly autosaveP95Ms: number;
    }> = [];

    try {
      const project = await workspace.create(
        randomUUID(),
        { name: 'M12-04 单章真实写作性能', channel: '长篇写作' },
        projectParent,
      );
      const chapter = structure.list(project.projectId).volumes[0]!.chapters[0]!;
      let draft = await drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });

      for (const characters of [8_000, 20_000]) {
        const text = '长街灯火未眠，人物行动推动伏笔与情节继续向前。'
          .repeat(Math.ceil(characters / 23))
          .slice(0, characters);
        const statisticsSamples: number[] = [];
        const autosaveSamples: number[] = [];

        for (let index = 0; index < 16; index += 1) {
          let started = performance.now();
          const statistics = calculateWritingStatistics(`${text}${index}`, 3_000, 20_000);
          statisticsSamples.push(performance.now() - started);
          expect(statistics.characterCount).toBeGreaterThanOrEqual(characters);

          const block = draft.blocks[0]!;
          started = performance.now();
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
                content: `${text}${index}`,
              },
            ],
          });
          autosaveSamples.push(performance.now() - started);
        }

        const metric = {
          characters,
          samples: statisticsSamples.length,
          statisticsP95Ms: percentile95(statisticsSamples),
          autosaveP95Ms: percentile95(autosaveSamples),
        };
        expect(metric.statisticsP95Ms).toBeLessThanOrEqual(50);
        expect(metric.autosaveP95Ms).toBeLessThanOrEqual(150);
        metrics.push(metric);
      }
    } finally {
      await workspace.shutdown();
      await runtime.close();
    }

    const output = process.env.WORLDFORGE_M12_04_PERF_OUTPUT;
    if (output) {
      await mkdir(path.dirname(output), { recursive: true });
      await writeFile(output, `${JSON.stringify(metrics, null, 2)}\n`, 'utf8');
    }
  });
});
