import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ConstraintPackageService } from '../../packages/core-service/src/constraint-package.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { SearchIndexService } from '../../packages/core-service/src/search-index.js';
import { VersionService } from '../../packages/core-service/src/version.js';
import { LongformAiService } from '../../packages/core-service/src/longform-ai-service.js';

interface GateConfig {
  readonly decisionRule: {
    readonly minimumCriticalCoverage: number;
    readonly minimumFtsRecall: number;
    readonly maximumSemanticOnlyCriticalMissRate: number;
  };
  readonly scenarios: readonly {
    readonly id: string;
    readonly critical: boolean;
    readonly route: 'fts' | 'structure' | 'digest-context' | 'semantic-only';
    readonly query: string;
    readonly expectedNeedle: string;
  }[];
}

const temporaryDirectories: string[] = [];
const now = '2026-08-13T11:00:00.000Z';
const clock = { now: () => new Date(now) };

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M11-07 semantic retrieval evidence gate', () => {
  it('keeps all critical author tasks covered without creating a vector layer', async () => {
    const config = JSON.parse(
      await readFile('evals/m11-07-semantic-retrieval-gate.json', 'utf8'),
    ) as GateConfig;
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-m11-07-retrieval-gate-'));
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
        { name: '语义检索证据门', channel: '长篇' },
        parent,
      );
      const structureService = new ProjectStructureService(workspace, { clock });
      const initial = structureService.list(project.projectId);
      const volume = initial.volumes[0]!;
      const first = volume.chapters[0]!;
      await structureService.updateChapter(randomUUID(), {
        projectId: project.projectId,
        chapterId: first.id,
        patch: { title: '雨夜旧约' },
      });
      const withSecond = await structureService.createChapter(randomUUID(), {
        projectId: project.projectId,
        volumeId: volume.id,
        title: '跨卷回响',
        placement: { kind: 'end' },
      });
      const second = withSecond.volumes[0]!.chapters[1]!;
      const drafts = new DraftService(workspace, { clock });
      const versions = new VersionService(workspace, { clock });
      const opened = await drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: first.id,
      });
      const block = opened.blocks[0]!;
      const edited = await drafts.applyPatch(randomUUID(), {
        projectId: project.projectId,
        chapterId: first.id,
        draftId: opened.draftId,
        baseRevision: opened.revision,
        operations: [
          {
            type: 'update',
            logicalBlockId: block.logicalBlockId,
            expectedHash: block.contentHash!,
            content: '守灯人交出铜铃暗号，约定钟楼醒来时再见。',
          },
        ],
      });
      const version = await versions.create(randomUUID(), {
        projectId: project.projectId,
        chapterId: first.id,
        draftId: edited.draftId,
        baseRevision: edited.revision,
        title: '雨夜旧约定稿',
      });
      const longform = new LongformAiService(workspace, { clock });
      const finalizingVersions = new VersionService(workspace, { clock, digests: longform });
      await finalizingVersions.setFinal(randomUUID(), {
        projectId: project.projectId,
        chapterId: first.id,
        versionId: version.versionId,
      });
      const search = new SearchIndexService(workspace, { clock });
      await search.rebuild(randomUUID(), project.projectId);
      const structure = structureService.list(project.projectId);
      const constraints = new ConstraintPackageService(workspace, { searchIndex: search }).build({
        projectId: project.projectId,
        chapterId: second.id,
        taskType: 'chapter',
        maxInputTokens: 16_384,
        safetyMarginTokens: 512,
        maxSupplementalResults: 0,
      });
      const digestContent = Object.values(constraints.sections)
        .flat()
        .filter((source) => source.sourceType.endsWith('_digest'))
        .map((source) => source.content)
        .join('\n');
      const chapterTitles = structure.volumes.flatMap((item) =>
        item.chapters.map((chapter) => chapter.title),
      );

      const results = config.scenarios.map((scenario) => {
        if (scenario.route === 'fts') {
          const result = search.search({
            projectId: project.projectId,
            query: scenario.query,
            sourceTypes: ['draft', 'version', 'entity'],
            limit: 20,
          });
          return {
            ...scenario,
            passed: result.items.some((item) => item.excerpt.includes(scenario.expectedNeedle)),
          };
        }
        if (scenario.route === 'structure') {
          return { ...scenario, passed: chapterTitles.includes(scenario.expectedNeedle) };
        }
        if (scenario.route === 'digest-context') {
          return { ...scenario, passed: digestContent.includes(scenario.expectedNeedle) };
        }
        return { ...scenario, passed: false };
      });
      const critical = results.filter((result) => result.critical);
      const fts = results.filter((result) => result.route === 'fts');
      const semanticOnlyCritical = results.filter(
        (result) => result.critical && result.route === 'semantic-only' && !result.passed,
      );
      const criticalCoverage = critical.filter((result) => result.passed).length / critical.length;
      const ftsRecall = fts.filter((result) => result.passed).length / fts.length;
      const semanticOnlyCriticalMissRate = semanticOnlyCritical.length / critical.length;
      const decision =
        criticalCoverage >= config.decisionRule.minimumCriticalCoverage &&
        ftsRecall >= config.decisionRule.minimumFtsRecall &&
        semanticOnlyCriticalMissRate <= config.decisionRule.maximumSemanticOnlyCriticalMissRate
          ? 'vector-layer-not-triggered'
          : 'vector-evaluation-required';

      expect(criticalCoverage).toBeGreaterThanOrEqual(config.decisionRule.minimumCriticalCoverage);
      expect(ftsRecall).toBeGreaterThanOrEqual(config.decisionRule.minimumFtsRecall);
      expect(semanticOnlyCriticalMissRate).toBeLessThanOrEqual(
        config.decisionRule.maximumSemanticOnlyCriticalMissRate,
      );
      expect(decision).toBe('vector-layer-not-triggered');
      const vectorTables = workspace.readProject(project.projectId, (database) =>
        database
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND (name LIKE '%vector%' OR name LIKE '%embedding%')",
          )
          .all(),
      );
      expect(vectorTables).toEqual([]);
      process.stdout.write(
        `${JSON.stringify({ benchmark: 'm11-07-semantic-retrieval-gate', decision, criticalCoverage, ftsRecall, semanticOnlyCriticalMissRate, results })}\n`,
      );
    } finally {
      await workspace.shutdown();
      await runtime.close();
    }
  }, 30_000);
});
