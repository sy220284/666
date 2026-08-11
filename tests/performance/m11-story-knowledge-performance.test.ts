import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { StoryKnowledgeProjectionService } from '../../packages/core-service/src/story-knowledge-service.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-08-11T06:00:00.000Z') };
const chapterCounts = [100, 300, 1000] as const;

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

async function measureStoryKnowledge(chapterCount: (typeof chapterCounts)[number]) {
  const root = await mkdtemp(path.join(tmpdir(), `worldforge-m11-04-${chapterCount}-`));
  temporaryDirectories.push(root);
  const parent = path.join(root, 'projects');
  await mkdir(parent, { recursive: true });
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
  try {
    const project = await workspace.create(
      randomUUID(),
      { name: `${chapterCount}章性能作品`, channel: '长篇' },
      parent,
    );
    const structure = new ProjectStructureService(workspace, { clock });
    const initial = structure.list(project.projectId);
    const volume = initial.volumes[0]!;
    const firstChapter = volume.chapters[0]!;
    let anchorChapterId = firstChapter.id;
    let previousChapterId: string | null = null;

    if (chapterCount > 1) {
      const inserted: string[] = [];
      await workspace.writeProject(randomUUID(), project.projectId, (connection) => {
        const maximum = connection
          .prepare(`SELECT MAX(order_key) AS value FROM chapters WHERE volume_id = ?`)
          .get(volume.id) as unknown as { readonly value: number | bigint };
        const start = Number(maximum.value);
        const insert = connection.prepare(
          `INSERT INTO chapters(
             id, volume_id, title, status, order_key, final_version_id,
             target_word_min, target_word_max, created_at, updated_at, deleted_at
           ) VALUES (?, ?, ?, 'draft', ?, NULL, NULL, NULL, ?, ?, NULL)`,
        );
        const timestamp = clock.now().toISOString();
        for (let index = 0; index < chapterCount - 1; index += 1) {
          const chapterId = randomUUID();
          inserted.push(chapterId);
          insert.run(
            chapterId,
            volume.id,
            `性能章${index + 2}`,
            start + index + 1,
            timestamp,
            timestamp,
          );
        }
        return true;
      });
      anchorChapterId = inserted.at(-1)!;
      previousChapterId = inserted.at(-2) ?? firstChapter.id;
    }

    const story = new StoryKnowledgeProjectionService(workspace);
    const chapterAssistSamples: number[] = [];
    const historySamples: number[] = [];
    let chapterAssistBytes = 0;
    let historyBytes = 0;

    for (let index = 0; index < 30; index += 1) {
      let started = performance.now();
      const chapterAssist = story.project({
        view: 'chapter_assist',
        projectId: project.projectId,
        chapterId: anchorChapterId,
        limit: 30,
      });
      chapterAssistSamples.push(performance.now() - started);
      if (chapterAssist.view !== 'chapter_assist') throw new Error('投影类型错误');
      chapterAssistBytes = Math.max(
        chapterAssistBytes,
        Buffer.byteLength(JSON.stringify(chapterAssist), 'utf8'),
      );
      expect(chapterAssist.previousChapter?.chapterId ?? null).toBe(previousChapterId);

      started = performance.now();
      const history = story.project({
        view: 'history',
        projectId: project.projectId,
        chapterId: anchorChapterId,
        beforeCreatedAt: null,
        beforeVersionId: null,
        limit: 30,
      });
      historySamples.push(performance.now() - started);
      if (history.view !== 'history') throw new Error('投影类型错误');
      historyBytes = Math.max(historyBytes, Buffer.byteLength(JSON.stringify(history), 'utf8'));
    }

    return {
      chapterCount,
      chapterAssistP95: percentile95(chapterAssistSamples),
      historyP95: percentile95(historySamples),
      chapterAssistBytes,
      historyBytes,
    };
  } finally {
    await workspace.shutdown();
    await runtime.close();
  }
}

describe('M11-04 故事知识长篇性能预算', () => {
  it('100/300/1000章项目保持有界查询与渲染层投影体积', async () => {
    const datasets: Awaited<ReturnType<typeof measureStoryKnowledge>>[] = [];
    for (const chapterCount of chapterCounts)
      datasets.push(await measureStoryKnowledge(chapterCount));

    const metrics = datasets.flatMap((dataset) => [
      {
        metric: 'chapter_assist_p95_ms',
        dataset: `${dataset.chapterCount}-chapters`,
        result: dataset.chapterAssistP95,
        budget: 80,
      },
      {
        metric: 'history_projection_p95_ms',
        dataset: `${dataset.chapterCount}-chapters`,
        result: dataset.historyP95,
        budget: 80,
      },
      {
        metric: 'chapter_assist_renderer_payload_bytes',
        dataset: `${dataset.chapterCount}-chapters`,
        result: dataset.chapterAssistBytes,
        budget: 128 * 1024,
      },
      {
        metric: 'history_renderer_payload_bytes',
        dataset: `${dataset.chapterCount}-chapters`,
        result: dataset.historyBytes,
        budget: 128 * 1024,
      },
    ]);
    const evaluated = metrics.map((metric) => ({
      ...metric,
      passed: metric.result <= metric.budget,
    }));

    expect(evaluated.every((metric) => metric.passed)).toBe(true);
    const output = process.env.WORLDFORGE_M11_04_PERF_OUTPUT;
    if (output) {
      await mkdir(path.dirname(output), { recursive: true });
      await writeFile(output, `${JSON.stringify(evaluated, null, 2)}\n`, 'utf8');
    }
  });
});
