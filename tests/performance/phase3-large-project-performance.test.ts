import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import path from 'node:path';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ConstraintPackageService } from '../../packages/core-service/src/constraint-package.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import { draftContentHash } from '../../packages/core-service/src/draft/draft-model.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { SearchIndexService } from '../../packages/core-service/src/search-index.js';
import { VersionService } from '../../packages/core-service/src/version.js';

const CHAPTER_COUNT = 500;
const VOLUME_COUNT = 10;
const CHAPTERS_PER_VOLUME = CHAPTER_COUNT / VOLUME_COUNT;
const CHAPTER_CHARACTERS = 3_000;
const ENTITY_COUNT = 150;
const FORESHADOWING_COUNT = 200;
const CHARACTER_ARC_COUNT = 50;
const VERSION_COUNT = 100;
const SEARCH_PHRASE = '玄烛城夜雨长街暗号';
const timestamp = '2026-08-12T00:00:00.000Z';
const clock = { now: () => new Date(timestamp) };
const temporaryDirectories: string[] = [];

interface LargeProjectMetric {
  readonly metric: string;
  readonly samples: number;
  readonly resultMs: number;
  readonly budgetMs: number;
  readonly passed: boolean;
}

interface ChapterFixture {
  readonly chapterId: string;
  readonly draftId: string;
  readonly logicalBlockId: string;
  readonly text: string;
}

interface Harness {
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly drafts: DraftService;
  readonly search: SearchIndexService;
  readonly versions: VersionService;
  readonly constraints: ConstraintPackageService;
}

const metrics: LargeProjectMetric[] = [];

function percentile95(samples: readonly number[]): number {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? Number.POSITIVE_INFINITY;
}

function recordMetric(metric: string, samples: readonly number[], budgetMs: number): number {
  const resultMs = samples.length === 1 ? samples[0]! : percentile95(samples);
  const passed = resultMs <= budgetMs;
  metrics.push({ metric, samples: samples.length, resultMs, budgetMs, passed });
  expect(passed).toBe(true);
  return resultMs;
}

function createChapterText(index: number): string {
  const marker = index % 25 === 0 ? SEARCH_PHRASE : '普通长篇章节';
  const seed = `${marker}。第${String(index + 1).padStart(3, '0')}章用于真实大作品性能基线，人物行动、伏笔推进与场景细节持续展开。`;
  return seed.repeat(Math.ceil(CHAPTER_CHARACTERS / seed.length)).slice(0, CHAPTER_CHARACTERS);
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-phase3-large-project-'));
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
    versions: new VersionService(workspace, { clock }),
    constraints: new ConstraintPackageService(workspace),
  };
}

async function seedLargeProject(harness: Harness): Promise<{
  readonly projectId: string;
  readonly workspacePath: string;
  readonly chapters: readonly ChapterFixture[];
}> {
  const project = await harness.workspace.create(
    randomUUID(),
    { name: 'Phase3真实大作品', channel: '长篇', initialStructure: 'blank' },
    harness.parent,
  );
  const chapters: ChapterFixture[] = [];
  const entityIds: string[] = [];

  await harness.workspace.writeProject(randomUUID(), project.projectId, (connection) => {
    const insertVolume = connection.prepare(
      `INSERT INTO volumes(id, project_id, title, order_key, status, deleted_at)
       VALUES(?, ?, ?, ?, 'active', NULL)`,
    );
    const insertChapter = connection.prepare(
      `INSERT INTO chapters(
         id, volume_id, title, order_key, status, target_word_min, target_word_max,
         active_draft_id, final_version_id, deleted_at
       ) VALUES(?, ?, ?, ?, 'writing', 2500, 4000, NULL, NULL, NULL)`,
    );
    const insertDraft = connection.prepare(
      `INSERT INTO drafts(id, chapter_id, status, revision, created_at, updated_at)
       VALUES(?, ?, 'active', 0, ?, ?)`,
    );
    const attachDraft = connection.prepare(
      'UPDATE chapters SET active_draft_id = ? WHERE id = ?',
    );
    const insertBlock = connection.prepare(
      `INSERT INTO draft_blocks(
         id, draft_id, logical_block_id, order_key, block_type, text,
         attributes_json, source, locked, content_hash, revision
       ) VALUES(?, ?, ?, 1024, 'paragraph', ?, '{}', 'manual', 0, ?, 0)`,
    );

    for (let volumeIndex = 0; volumeIndex < VOLUME_COUNT; volumeIndex += 1) {
      const volumeId = randomUUID();
      insertVolume.run(
        volumeId,
        project.projectId,
        `第${volumeIndex + 1}卷`,
        (volumeIndex + 1) * 1024,
      );
      for (let localIndex = 0; localIndex < CHAPTERS_PER_VOLUME; localIndex += 1) {
        const chapterIndex = volumeIndex * CHAPTERS_PER_VOLUME + localIndex;
        const chapterId = randomUUID();
        const draftId = randomUUID();
        const logicalBlockId = randomUUID();
        const text = createChapterText(chapterIndex);
        const contentHash = draftContentHash({
          blockType: 'paragraph',
          content: text,
          attributes: {},
        });
        insertChapter.run(
          chapterId,
          volumeId,
          `第${chapterIndex + 1}章`,
          (localIndex + 1) * 1024,
        );
        insertDraft.run(draftId, chapterId, timestamp, timestamp);
        attachDraft.run(draftId, chapterId);
        insertBlock.run(randomUUID(), draftId, logicalBlockId, text, contentHash);
        chapters.push({ chapterId, draftId, logicalBlockId, text });
      }
    }

    const insertEntity = connection.prepare(
      `INSERT INTO entities(
         id, project_id, entity_type, name, aliases_json, summary, status,
         archived_at, created_at, updated_at
       ) VALUES(?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?)`,
    );
    const insertFact = connection.prepare(
      `INSERT INTO canon_facts(
         id, project_id, entity_id, fact_key, value_json, description,
         source_type, source_id, status, confirmed_at, superseded_at, created_at
       ) VALUES(?, ?, ?, '定位', ?, ?, 'author', NULL, 'current', ?, NULL, ?)`,
    );
    for (let index = 0; index < ENTITY_COUNT; index += 1) {
      const entityId = randomUUID();
      const entityType = index < 100 ? 'character' : index < 125 ? 'location' : 'faction';
      entityIds.push(entityId);
      insertEntity.run(
        entityId,
        project.projectId,
        entityType,
        `实体${String(index + 1).padStart(3, '0')}`,
        JSON.stringify([`别名${index + 1}`]),
        `长篇作品核心${entityType}设定${index + 1}`,
        timestamp,
        timestamp,
      );
      insertFact.run(
        randomUUID(),
        project.projectId,
        entityId,
        JSON.stringify(`设定值${index + 1}`),
        `权威事实${index + 1}`,
        timestamp,
        timestamp,
      );
    }

    const insertForeshadowing = connection.prepare(
      `INSERT INTO foreshadowings(
         id, project_id, title, description, status, reveal_from_chapter_id,
         reveal_by_chapter_id, created_at, updated_at
       ) VALUES(?, ?, ?, ?, 'planned', ?, ?, ?, ?)`,
    );
    for (let index = 0; index < FORESHADOWING_COUNT; index += 1) {
      const from = chapters[index * 2]!;
      const to = chapters[Math.min(CHAPTER_COUNT - 1, index * 2 + 80)]!;
      insertForeshadowing.run(
        randomUUID(),
        project.projectId,
        `伏笔${String(index + 1).padStart(3, '0')}`,
        `跨章节伏笔链${index + 1}`,
        from.chapterId,
        to.chapterId,
        timestamp,
        timestamp,
      );
    }

    const insertArc = connection.prepare(
      `INSERT INTO character_arcs(
         id, project_id, character_id, title, arc_type, custom_type, status,
         author_intent, created_at, updated_at
       ) VALUES(?, ?, ?, ?, 'growth', NULL, 'active', ?, ?, ?)`,
    );
    for (let index = 0; index < CHARACTER_ARC_COUNT; index += 1) {
      insertArc.run(
        randomUUID(),
        project.projectId,
        entityIds[index]!,
        `人物弧光${String(index + 1).padStart(2, '0')}`,
        `人物${index + 1}在长篇中的阶段性成长`,
        timestamp,
        timestamp,
      );
    }
  });

  for (let index = 0; index < VERSION_COUNT; index += 1) {
    const chapter = chapters[index * 5]!;
    await harness.versions.create(randomUUID(), {
      projectId: project.projectId,
      chapterId: chapter.chapterId,
      draftId: chapter.draftId,
      baseRevision: 0,
      versionType: 'manual',
      title: `大作品基线版本${String(index + 1).padStart(3, '0')}`,
      description: 'Phase 3 large-project fixture',
      label: null,
    });
  }

  return { projectId: project.projectId, workspacePath: project.workspacePath, chapters };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

afterAll(async () => {
  const existingOutput = process.env.WORLDFORGE_M8_PERF_OUTPUT;
  if (!existingOutput) return;
  const output = path.join(path.dirname(existingOutput), 'phase3-large-project.json');
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(
    output,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        phase: 'Phase 3',
        capability: 'large-project-performance',
        generatedAt: new Date().toISOString(),
        environment: {
          platform: process.platform,
          architecture: process.arch,
          node: process.version,
          runner: process.env.CI ? 'ci' : 'local',
        },
        fixture: {
          volumes: VOLUME_COUNT,
          chapters: CHAPTER_COUNT,
          chapterCharacters: CHAPTER_CHARACTERS,
          minimumDraftCharacters: CHAPTER_COUNT * CHAPTER_CHARACTERS,
          entities: ENTITY_COUNT,
          foreshadowings: FORESHADOWING_COUNT,
          characterArcs: CHARACTER_ARC_COUNT,
          versions: VERSION_COUNT,
        },
        metrics,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
});

describe('Phase 3 realistic large-project performance', () => {
  it(
    'keeps a 500-chapter 1.5M-character project within existing blocking budgets',
    async () => {
      const harness = await createHarness();
      try {
        const fixture = await seedLargeProject(harness);
        const characterCount = fixture.chapters.reduce(
          (total, chapter) => total + chapter.text.length,
          0,
        );
        expect(characterCount).toBeGreaterThanOrEqual(1_500_000);

        await harness.workspace.close(randomUUID(), fixture.projectId);
        const reopenStartedAt = performance.now();
        await harness.workspace.open(randomUUID(), { workspacePath: fixture.workspacePath });
        recordMetric('medium_project_reopen_ms', [performance.now() - reopenStartedAt], 3_000);

        const structure = harness.structure.list(fixture.projectId);
        expect(structure.volumes).toHaveLength(VOLUME_COUNT);
        expect(
          structure.volumes.reduce((total, volume) => total + volume.chapters.length, 0),
        ).toBe(CHAPTER_COUNT);

        const chapterOpenSamples: number[] = [];
        for (let sample = 0; sample < 30; sample += 1) {
          const chapter = fixture.chapters[(sample * 17) % CHAPTER_COUNT]!;
          const startedAt = performance.now();
          const opened = await harness.drafts.open(randomUUID(), {
            projectId: fixture.projectId,
            chapterId: chapter.chapterId,
          });
          chapterOpenSamples.push(performance.now() - startedAt);
          expect(opened.blocks).toHaveLength(1);
          expect(opened.blocks[0]!.text).toHaveLength(CHAPTER_CHARACTERS);
        }
        recordMetric('draft_open_p95_ms', chapterOpenSamples, 800);

        const autosaveChapter = fixture.chapters[249]!;
        let opened = await harness.drafts.open(randomUUID(), {
          projectId: fixture.projectId,
          chapterId: autosaveChapter.chapterId,
        });
        const autosaveSamples: number[] = [];
        for (let sample = 0; sample < 30; sample += 1) {
          const block = opened.blocks[0]!;
          const nextText = `${autosaveChapter.text.slice(0, CHAPTER_CHARACTERS - 12)}保存性能${String(sample).padStart(2, '0')}`;
          const startedAt = performance.now();
          opened = await harness.drafts.applyPatch(randomUUID(), {
            projectId: fixture.projectId,
            chapterId: autosaveChapter.chapterId,
            draftId: opened.draftId,
            baseRevision: opened.revision,
            operations: [
              {
                type: 'update',
                logicalBlockId: block.logicalBlockId,
                expectedHash: block.contentHash!,
                content: nextText,
              },
            ],
          });
          autosaveSamples.push(performance.now() - startedAt);
        }
        recordMetric('large_project_autosave_p95_ms', autosaveSamples, 150);

        const rebuildStartedAt = performance.now();
        const rebuilt = await harness.search.rebuild(randomUUID(), fixture.projectId);
        const rebuildMs = performance.now() - rebuildStartedAt;
        expect(rebuilt.status).toBe('ready');
        expect(rebuilt.failedCount).toBe(0);
        expect(rebuilt.draftCount).toBe(CHAPTER_COUNT);
        recordMetric('large_project_fts_rebuild_ms', [rebuildMs], 10_000);

        for (let warmup = 0; warmup < 5; warmup += 1) {
          harness.search.search({
            projectId: fixture.projectId,
            query: SEARCH_PHRASE,
            sourceTypes: ['draft', 'version'],
            limit: 20,
          });
        }
        const querySamples: number[] = [];
        for (let sample = 0; sample < 30; sample += 1) {
          const startedAt = performance.now();
          const result = harness.search.search({
            projectId: fixture.projectId,
            query: SEARCH_PHRASE,
            sourceTypes: ['draft', 'version'],
            limit: 20,
          });
          querySamples.push(performance.now() - startedAt);
          expect(result.items.length).toBeGreaterThan(0);
        }
        recordMetric('large_project_fts_query_p95_ms', querySamples, 200);

        const constraintInput = {
          projectId: fixture.projectId,
          chapterId: fixture.chapters.at(-1)!.chapterId,
          taskType: 'chapter' as const,
          maxInputTokens: 262_144,
          safetyMarginTokens: 4_096,
          maxSupplementalResults: 20,
        };
        harness.constraints.build(constraintInput);
        const constraintSamples: number[] = [];
        for (let sample = 0; sample < 5; sample += 1) {
          const startedAt = performance.now();
          const result = harness.constraints.build(constraintInput);
          constraintSamples.push(performance.now() - startedAt);
          expect(result.estimatedTokens).toBeLessThanOrEqual(result.budget.usableTokens);
        }
        recordMetric('large_project_constraint_package_p95_ms', constraintSamples, 1_000);
      } finally {
        await harness.workspace.shutdown();
        await harness.appRuntime.close();
      }
    },
    120_000,
  );
});
