import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import {
  calculateWritingStatistics,
  computeCandidateDiff,
  planDiffExecution,
  type CandidateDiffBlock,
  type DraftDiffBlock,
} from '../../packages/editor-core/src/index.js';
import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { SearchIndexService } from '../../packages/core-service/src/search-index.js';
import { createChineseLongParagraphFixture } from '../../packages/testkit/src/index.js';

interface PerformanceMetric {
  readonly metric: string;
  readonly dataset: string;
  readonly samples: number;
  readonly result: number;
  readonly budget: number;
  readonly unit: 'ms';
  readonly passed: boolean;
}

const temporaryDirectories: string[] = [];
const metrics: PerformanceMetric[] = [];
const clock = { now: () => new Date('2026-07-28T08:00:00.000Z') };

function percentile95(samples: readonly number[]): number {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? Number.POSITIVE_INFINITY;
}

function record(
  metric: Omit<PerformanceMetric, 'unit' | 'passed'>,
  comparator: 'less-than' | 'less-than-or-equal' = 'less-than-or-equal',
): void {
  const passed =
    comparator === 'less-than' ? metric.result < metric.budget : metric.result <= metric.budget;
  metrics.push({ ...metric, unit: 'ms', passed });
  expect(passed).toBe(true);
}

async function createProjectHarness(prefix: string) {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
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
  return {
    root,
    parent,
    appRuntime,
    workspace,
    structure: new ProjectStructureService(workspace, { clock }),
    drafts: new DraftService(workspace, { clock }),
    search: new SearchIndexService(workspace, { clock }),
  };
}

const draft = (logicalBlockId: string, content: string): DraftDiffBlock => ({
  logicalBlockId,
  content,
});
const candidate = (
  temporaryId: string,
  content: string,
  logicalBlockId: string,
): CandidateDiffBlock => ({ temporaryId, content, logicalBlockId });

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

afterAll(async () => {
  const output = process.env.WORLDFORGE_M8_PERF_OUTPUT;
  if (!output) return;
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(
    output,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        taskId: 'M8-02',
        generatedAt: new Date().toISOString(),
        environment: {
          platform: process.platform,
          architecture: process.arch,
          node: process.version,
          runner: process.env.CI ? 'ci' : 'local',
        },
        metrics,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
});

describe('M8-02 release performance evidence', () => {
  it('records 2K local typing and SQLite autosave P95', async () => {
    const text = '雨落长街，灯火未眠。'.repeat(200);
    const typingSamples: number[] = [];
    for (let index = 0; index < 60; index += 1) {
      const startedAt = performance.now();
      calculateWritingStatistics(`${text}${index}`, 200, 8_000);
      typingSamples.push(performance.now() - startedAt);
    }

    const harness = await createProjectHarness('worldforge-m8-writing-');
    const autosaveSamples: number[] = [];
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: 'M8性能项目', channel: '测试' },
        harness.parent,
      );
      const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      let opened = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      for (let index = 0; index < 40; index += 1) {
        const block = opened.blocks[0]!;
        const startedAt = performance.now();
        opened = await harness.drafts.applyPatch(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
          draftId: opened.draftId,
          baseRevision: opened.revision,
          operations: [
            {
              type: 'update',
              logicalBlockId: block.logicalBlockId,
              expectedHash: block.contentHash!,
              content: `${text.slice(0, 2_000)}${index}`,
            },
          ],
        });
        autosaveSamples.push(performance.now() - startedAt);
      }
    } finally {
      await harness.workspace.shutdown();
      await harness.appRuntime.close();
    }

    record({
      metric: 'typing_latency_p95_ms',
      dataset: '2k-draft-local-statistics-path',
      samples: typingSamples.length,
      result: percentile95(typingSamples),
      budget: 50,
    });
    record({
      metric: 'autosave_transaction_p95_ms',
      dataset: '2k-draft-sqlite-patch-transaction',
      samples: autosaveSamples.length,
      result: percentile95(autosaveSamples),
      budget: 150,
    });
  });

  it('records 5000-character Candidate Diff P95', () => {
    const source = createChineseLongParagraphFixture().text;
    const changed = `${source.slice(0, 700)}潮汐${source.slice(702, 2_800)}铜铃${source.slice(2_802)}`;
    const structureSamples: number[] = [];
    const completeSamples: number[] = [];

    for (let index = 0; index < 20; index += 1) {
      let startedAt = performance.now();
      const plan = planDiffExecution([draft('b1', source)], [candidate('c1', changed, 'b1')]);
      structureSamples.push(performance.now() - startedAt);
      expect(plan.strategy).toBe('main-thread');

      startedAt = performance.now();
      const result = computeCandidateDiff([draft('b1', source)], [candidate('c1', changed, 'b1')]);
      completeSamples.push(performance.now() - startedAt);
      expect(result.characterDiffs).toHaveLength(1);
    }

    record(
      {
        metric: 'candidate_diff_structure_p95_ms',
        dataset: '5000-character-chinese-diff',
        samples: structureSamples.length,
        result: percentile95(structureSamples),
        budget: 500,
      },
      'less-than',
    );
    record(
      {
        metric: 'candidate_diff_complete_p95_ms',
        dataset: '5000-character-chinese-diff',
        samples: completeSamples.length,
        result: percentile95(completeSamples),
        budget: 1_200,
      },
      'less-than',
    );
  });

  it('records 1.5M-character FTS rebuild and query performance', async () => {
    const harness = await createProjectHarness('worldforge-m8-search-');
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: 'M8百万字检索', channel: '长篇' },
        harness.parent,
      );
      const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      const opened = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      const phrase = '玄烛城夜雨长街暗号';
      const filler = '长篇正文用于检索性能基线。'.repeat(300);
      const blocks = Array.from({ length: 400 }, (_value, index) => ({
        clientBlockId: `m8-performance-${index}`,
        logicalBlockId: index === 0 ? opened.blocks[0]!.logicalBlockId : null,
        blockType: 'paragraph' as const,
        text: `${index % 20 === 0 ? phrase : '普通段落'}${filler}${String(index).padStart(4, '0')}`,
        attributes: {},
      }));
      const characterCount = blocks.reduce(
        (total, block) => total + Array.from(block.text).length,
        0,
      );
      expect(characterCount).toBeGreaterThanOrEqual(1_500_000);
      await harness.drafts.saveSnapshot(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: opened.draftId,
        blocks,
      });

      const rebuildStartedAt = performance.now();
      const rebuilt = await harness.search.rebuild(randomUUID(), project.projectId);
      const rebuildMs = performance.now() - rebuildStartedAt;
      expect(rebuilt).toMatchObject({ status: 'ready', failedCount: 0, draftCount: 1 });

      for (let index = 0; index < 5; index += 1) {
        harness.search.search({
          projectId: project.projectId,
          query: phrase,
          sourceTypes: ['draft'],
          limit: 20,
        });
      }
      const querySamples: number[] = [];
      for (let index = 0; index < 30; index += 1) {
        const startedAt = performance.now();
        const result = harness.search.search({
          projectId: project.projectId,
          query: phrase,
          sourceTypes: ['draft'],
          limit: 20,
        });
        querySamples.push(performance.now() - startedAt);
        expect(result.items.length).toBeGreaterThan(0);
      }

      record({
        metric: 'fts_query_p95_ms',
        dataset: `${characterCount}-character-project`,
        samples: querySamples.length,
        result: percentile95(querySamples),
        budget: 200,
      });
      record(
        {
          metric: 'fts_rebuild_ms',
          dataset: `${characterCount}-character-project`,
          samples: 1,
          result: rebuildMs,
          budget: 10_000,
        },
        'less-than',
      );
    } finally {
      await harness.workspace.shutdown();
      await harness.appRuntime.close();
    }
  });

  it('records sustained Core workload and event-loop delay', async () => {
    const histogram = monitorEventLoopDelay({ resolution: 10 });
    const harness = await createProjectHarness('worldforge-m8-sustained-');
    const initialHeap = process.memoryUsage().heapUsed;
    const startedAt = performance.now();
    histogram.enable();
    const memory = { heapGrowthBytes: 0 };
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: 'M8持续负载', channel: '长篇' },
        harness.parent,
      );
      const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      let opened = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      const base = '持续写作、保存、统计与索引负载。'.repeat(160);
      for (let index = 0; index < 300; index += 1) {
        const block = opened.blocks[0]!;
        opened = await harness.drafts.applyPatch(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
          draftId: opened.draftId,
          baseRevision: opened.revision,
          operations: [
            {
              type: 'update',
              logicalBlockId: block.logicalBlockId,
              expectedHash: block.contentHash!,
              content: `${base}${index}`,
            },
          ],
        });
        calculateWritingStatistics(opened.blocks[0]!.text, 200, 8_000);
        await new Promise((resolve) => setImmediate(resolve));
      }
      await harness.search.rebuild(randomUUID(), project.projectId);
      memory.heapGrowthBytes = Math.max(0, process.memoryUsage().heapUsed - initialHeap);
    } finally {
      histogram.disable();
      await harness.workspace.shutdown();
      await harness.appRuntime.close();
    }
    const elapsedMs = performance.now() - startedAt;
    const eventLoopP99Ms = histogram.percentile(99) / 1_000_000;
    record({
      metric: 'core_event_loop_delay_p99_ms',
      dataset: '300-autosave-sustained-workload',
      samples: 1,
      result: eventLoopP99Ms,
      budget: 100,
    });
    record({
      metric: 'sustained_workload_total_ms',
      dataset: '300-autosave-plus-fts-rebuild',
      samples: 1,
      result: elapsedMs,
      budget: 60_000,
    });
    expect(memory.heapGrowthBytes).toBeLessThan(128 * 1024 * 1024);
  });
});
