import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { IdeaCapsuleService } from '../../packages/core-service/src/idea-capsule-service.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-08-12T10:20:00.000Z') };
const ideaCounts = [100, 1_000, 5_000] as const;

function percentile95(samples: readonly number[]): number {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? Number.POSITIVE_INFINITY;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

async function measureIdeaCapsule(ideaCount: (typeof ideaCounts)[number]) {
  const root = await mkdtemp(path.join(tmpdir(), `worldforge-m11-05-perf-${ideaCount}-`));
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
      { name: `${ideaCount}条灵感性能作品`, channel: '长篇', initialStructure: 'blank' },
      parent,
    );
    const sourceContext = JSON.stringify({
      scopeType: 'project',
      scopeId: project.projectId,
      chapterId: null,
    });
    const ids: string[] = [];
    await workspace.writeProject(randomUUID(), project.projectId, (database) => {
      const insert = database.prepare(
        `INSERT INTO idea_cards(
           id, project_id, idea_kind, title, summary, content,
           divergence_level, depth_level, source_context_json,
           generation_run_id, status, created_at, updated_at
         ) VALUES(?, ?, 'plot', ?, ?, ?, 'different', 'expand', ?, NULL, 'active', ?, ?)`,
      );
      for (let index = 0; index < ideaCount; index += 1) {
        const id = randomUUID();
        ids.push(id);
        insert.run(
          id,
          project.projectId,
          `性能灵感 ${index + 1}`,
          `第 ${index + 1} 条灵感摘要，用于测试有界分页读取。`,
          '这是一段长度受控的灵感正文，用于验证长篇项目中灵感库增长后仍保持稳定读取。',
          sourceContext,
          '2026-08-12T10:20:00.000Z',
          '2026-08-12T10:20:00.000Z',
        );
      }
      return true;
    });

    const ideas = new IdeaCapsuleService(workspace, { clock });
    const listSamples: number[] = [];
    const previewSamples: number[] = [];
    let listBytes = 0;
    const previewIdeaId = ids[Math.floor(ids.length / 2)]!;
    const target = {
      targetType: 'plot_node' as const,
      draft: {
        parentId: null,
        nodeType: 'arc' as const,
        title: '性能转换预览',
        goal: '验证 preview 单点读取',
        coreConflict: '',
        expectedResult: '',
        status: 'outlined' as const,
      },
    };

    for (let index = 0; index < 30; index += 1) {
      let started = performance.now();
      const page = ideas.list({
        projectId: project.projectId,
        status: null,
        limit: 50,
        cursor: null,
      });
      listSamples.push(performance.now() - started);
      listBytes = Math.max(listBytes, Buffer.byteLength(JSON.stringify(page), 'utf8'));
      expect(page.ideas.length).toBe(Math.min(50, ideaCount));

      started = performance.now();
      const preview = ideas.previewConversion({
        projectId: project.projectId,
        ideaId: previewIdeaId,
        target,
      });
      previewSamples.push(performance.now() - started);
      expect(preview.previewHash).toMatch(/^[a-f0-9]{64}$/u);
    }

    return {
      ideaCount,
      listP95: percentile95(listSamples),
      previewP95: percentile95(previewSamples),
      listBytes,
    };
  } finally {
    await workspace.shutdown();
    await runtime.close();
  }
}

describe('M11-05 Idea Capsule long-project performance budget', () => {
  it('keeps paged list and conversion preview bounded as the Idea library grows', async () => {
    const datasets: Awaited<ReturnType<typeof measureIdeaCapsule>>[] = [];
    for (const ideaCount of ideaCounts) datasets.push(await measureIdeaCapsule(ideaCount));

    const metrics = datasets.flatMap((dataset) => [
      {
        metric: 'idea_list_p95_ms',
        dataset: `${dataset.ideaCount}-ideas`,
        result: dataset.listP95,
        budget: 80,
      },
      {
        metric: 'idea_conversion_preview_p95_ms',
        dataset: `${dataset.ideaCount}-ideas`,
        result: dataset.previewP95,
        budget: 80,
      },
      {
        metric: 'idea_list_renderer_payload_bytes',
        dataset: `${dataset.ideaCount}-ideas`,
        result: dataset.listBytes,
        budget: 128 * 1024,
      },
    ]);
    const evaluated = metrics.map((metric) => ({
      ...metric,
      passed: metric.result <= metric.budget,
    }));
    process.stdout.write(
      `${JSON.stringify({ benchmark: 'm11-05-idea-capsule', metrics: evaluated })}\n`,
    );
    expect(evaluated.every((metric) => metric.passed)).toBe(true);
  });
});
