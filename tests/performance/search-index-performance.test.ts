import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { SearchIndexService } from '../../packages/core-service/src/search-index.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-24T07:00:00.000Z') };

interface Harness {
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly drafts: DraftService;
  readonly search: SearchIndexService;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-search-performance-'));
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
    parent,
    appRuntime,
    workspace,
    structure: new ProjectStructureService(workspace, { clock }),
    drafts: new DraftService(workspace, { clock }),
    search: new SearchIndexService(workspace, { clock }),
  };
}

function percentile(values: readonly number[], fraction: number): number {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)]!;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M4-01 search index performance', () => {
  it('keeps 1,500,000-character FTS query P95 within 200ms and records rebuild time', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '百万字检索', channel: '长篇' },
        harness.parent,
      );
      const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      const opened = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      const phrase = '玄烛城夜雨长街暗号';
      const filler = '长篇正文用于检索性能基线。'.repeat(300);
      const blocks = Array.from({ length: 400 }, (_, index) => ({
        clientBlockId: `performance-${index}`,
        logicalBlockId: index === 0 ? opened.blocks[0]!.logicalBlockId : null,
        blockType: 'paragraph' as const,
        text: `${index % 20 === 0 ? phrase : '普通段落'}${filler}${String(index).padStart(4, '0')}`,
        attributes: {},
      }));
      const characterCount = blocks.reduce((total, block) => total + Array.from(block.text).length, 0);
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
      const queryDurations: number[] = [];
      for (let index = 0; index < 30; index += 1) {
        const startedAt = performance.now();
        const result = harness.search.search({
          projectId: project.projectId,
          query: phrase,
          sourceTypes: ['draft'],
          limit: 20,
        });
        queryDurations.push(performance.now() - startedAt);
        expect(result.items.length).toBeGreaterThan(0);
      }
      const queryP95Ms = percentile(queryDurations, 0.95);
      console.info(
        JSON.stringify({
          benchmark: 'm4-01-search-index',
          characters: characterCount,
          rebuildMs: Number(rebuildMs.toFixed(2)),
          queryP95Ms: Number(queryP95Ms.toFixed(2)),
          querySamples: queryDurations.length,
        }),
      );
      expect(queryP95Ms).toBeLessThanOrEqual(200);
      expect(rebuildMs).toBeLessThan(10_000);
    } finally {
      await harness.workspace.shutdown();
      await harness.appRuntime.close();
    }
  });
});
