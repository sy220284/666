import { createHash, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ConstraintPackageService } from '../../packages/core-service/src/constraint-package.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import { draftContentHash } from '../../packages/core-service/src/draft/draft-model.js';
import { LongformAiService } from '../../packages/core-service/src/longform-ai-service.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { RecoveryService } from '../../packages/core-service/src/recovery/recovery-service.js';
import { SearchIndexService } from '../../packages/core-service/src/search-index.js';
import { StoryKnowledgeProjectionService } from '../../packages/core-service/src/story-knowledge-service.js';
import { VersionService } from '../../packages/core-service/src/version.js';

const timestamp = '2026-08-13T10:00:00.000Z';
const clock = { now: () => new Date(timestamp) };
const temporaryDirectories: string[] = [];
const SEARCH_PHRASE = '玄烛城铜铃跨卷暗号';

interface ScaleDataset {
  readonly label: '300万字' | '500万字';
  readonly characters: number;
  readonly chapterCount: number;
  readonly chapterCharacters: number;
}

interface SeededProject {
  readonly projectId: string;
  readonly workspacePath: string;
  readonly firstChapterId: string;
  readonly lastChapterId: string;
  readonly lastDraftId: string;
  readonly lastLogicalBlockId: string;
  readonly lastContentHash: string;
  readonly lastText: string;
}

const datasets: readonly ScaleDataset[] = [
  { label: '300万字', characters: 3_000_000, chapterCount: 600, chapterCharacters: 5_000 },
  { label: '500万字', characters: 5_000_000, chapterCount: 1_000, chapterCharacters: 5_000 },
];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function chapterText(index: number, length: number): string {
  const marker = index % 50 === 0 ? SEARCH_PHRASE : '普通长篇正文';
  const seed = `${marker}。第${index + 1}章继续人物行动、关系变化、伏笔推进与场景细节。`;
  return seed.repeat(Math.ceil(length / seed.length)).slice(0, length);
}

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function seedProject(
  workspace: ProjectWorkspaceService,
  parent: string,
  dataset: ScaleDataset,
): Promise<SeededProject> {
  const project = await workspace.create(
    randomUUID(),
    { name: `${dataset.label}长篇性能作品`, channel: '长篇', initialStructure: 'blank' },
    parent,
  );
  let firstChapterId = '';
  let lastChapterId = '';
  let lastDraftId = '';
  let lastLogicalBlockId = '';
  let lastContentHash = '';
  let lastText = '';
  await workspace.writeProject(randomUUID(), project.projectId, (database) => {
    const insertVolume = database.prepare(
      `INSERT INTO volumes(id, project_id, title, order_key, status, deleted_at)
       VALUES(?, ?, ?, ?, 'writing', NULL)`,
    );
    const insertChapter = database.prepare(
      `INSERT INTO chapters(
         id, volume_id, title, order_key, status, target_word_min, target_word_max,
         active_draft_id, final_version_id, deleted_at
       ) VALUES(?, ?, ?, ?, 'finalized', 3000, 7000, NULL, NULL, NULL)`,
    );
    const insertDraft = database.prepare(
      `INSERT INTO drafts(id, chapter_id, status, revision, created_at, updated_at)
       VALUES(?, ?, 'active', 0, ?, ?)`,
    );
    const attachDraft = database.prepare('UPDATE chapters SET active_draft_id = ? WHERE id = ?');
    const insertDraftBlock = database.prepare(
      `INSERT INTO draft_blocks(
         id, draft_id, logical_block_id, order_key, block_type, text,
         attributes_json, source, locked, content_hash, revision
       ) VALUES(?, ?, ?, 1024, 'paragraph', ?, '{}', 'manual', 0, ?, 0)`,
    );
    const insertVersion = database.prepare(
      `INSERT INTO versions(
         id, chapter_id, source_draft_id, source_revision, version_type,
         parent_version_id, source_candidate_id, title, description, label,
         word_count, content_hash, created_at
       ) VALUES(?, ?, ?, 0, 'manual', NULL, NULL, ?, '', NULL, ?, ?, ?)`,
    );
    const insertVersionBlock = database.prepare(
      `INSERT INTO version_blocks(
         version_id, logical_block_id, order_key, block_type, text,
         attributes_json, source, locked, content_hash
       ) VALUES(?, ?, 1024, 'paragraph', ?, '{}', 'manual', 0, ?)`,
    );
    const finalize = database.prepare('UPDATE chapters SET final_version_id = ? WHERE id = ?');

    const volumeCount = 10;
    const chaptersPerVolume = dataset.chapterCount / volumeCount;
    for (let volumeIndex = 0; volumeIndex < volumeCount; volumeIndex += 1) {
      const volumeId = randomUUID();
      insertVolume.run(
        volumeId,
        project.projectId,
        `第${volumeIndex + 1}卷`,
        (volumeIndex + 1) * 1024,
      );
      for (let localIndex = 0; localIndex < chaptersPerVolume; localIndex += 1) {
        const index = volumeIndex * chaptersPerVolume + localIndex;
        const chapterId = randomUUID();
        const draftId = randomUUID();
        const logicalBlockId = randomUUID();
        const versionId = randomUUID();
        const text = chapterText(index, dataset.chapterCharacters);
        const contentHash = draftContentHash({
          blockType: 'paragraph',
          content: text,
          attributes: {},
        });
        insertChapter.run(chapterId, volumeId, `第${index + 1}章`, (localIndex + 1) * 1024);
        insertDraft.run(draftId, chapterId, timestamp, timestamp);
        attachDraft.run(draftId, chapterId);
        insertDraftBlock.run(randomUUID(), draftId, logicalBlockId, text, contentHash);
        insertVersion.run(
          versionId,
          chapterId,
          draftId,
          `第${index + 1}章定稿`,
          text.length,
          hash(text),
          timestamp,
        );
        insertVersionBlock.run(versionId, logicalBlockId, text, contentHash);
        finalize.run(versionId, chapterId);
        if (index === 0) firstChapterId = chapterId;
        if (index === dataset.chapterCount - 1) {
          lastChapterId = chapterId;
          lastDraftId = draftId;
          lastLogicalBlockId = logicalBlockId;
          lastContentHash = contentHash;
          lastText = text;
        }
      }
    }
  });
  return {
    projectId: project.projectId,
    workspacePath: project.workspacePath,
    firstChapterId,
    lastChapterId,
    lastDraftId,
    lastLogicalBlockId,
    lastContentHash,
    lastText,
  };
}

describe('M11-07 300万—500万字长篇性能与恢复', () => {
  it('keeps indexed navigation, bounded context, incremental digests and restored copies within budgets', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-m11-07-scale-'));
    temporaryDirectories.push(root);
    const parent = path.join(root, 'projects');
    const restoreParent = path.join(root, 'restored');
    await mkdir(parent, { recursive: true });
    await mkdir(restoreParent, { recursive: true });
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
    const recovery = new RecoveryService(workspace, {
      backupRootDirectory: path.join(root, 'backups'),
      clock,
    });
    const measurements: Array<Record<string, unknown>> = [];
    const initialHeap = process.memoryUsage().heapUsed;
    try {
      for (const dataset of datasets) {
        const seeded = await seedProject(workspace, parent, dataset);
        let activeProjectId = seeded.projectId;
        const structure = new ProjectStructureService(workspace, { clock });
        const search = new SearchIndexService(workspace, { clock });
        const longform = new LongformAiService(workspace, { clock });
        const constraints = new ConstraintPackageService(workspace, { searchIndex: search });
        const story = new StoryKnowledgeProjectionService(workspace);
        const drafts = new DraftService(workspace, { clock });
        const versions = new VersionService(workspace, { clock });

        const rebuildStarted = performance.now();
        const rebuilt = await longform.rebuild(randomUUID(), {
          projectId: seeded.projectId,
          scopeType: 'project',
          scopeId: seeded.projectId,
        });
        const digestRebuildMs = performance.now() - rebuildStarted;
        expect(rebuilt.rebuilt).toHaveLength(dataset.chapterCount + 11);

        const indexStarted = performance.now();
        const index = await search.rebuild(randomUUID(), seeded.projectId);
        const searchRebuildMs = performance.now() - indexStarted;
        expect(index).toMatchObject({ status: 'ready', failedCount: 0 });

        await workspace.close(randomUUID(), seeded.projectId);
        const openStarted = performance.now();
        await workspace.open(randomUUID(), { workspacePath: seeded.workspacePath });
        const projectOpenMs = performance.now() - openStarted;

        const commandStarted = performance.now();
        const catalog = structure.list(seeded.projectId);
        const chapterMatches = catalog.volumes
          .flatMap((volume) => volume.chapters)
          .filter((chapter) => chapter.title.includes(String(dataset.chapterCount)));
        const searchResult = search.search({
          projectId: seeded.projectId,
          query: SEARCH_PHRASE,
          sourceTypes: ['draft', 'version'],
          limit: 40,
        });
        const commandPaletteMs = performance.now() - commandStarted;
        expect(chapterMatches).toHaveLength(1);
        expect(searchResult.items.length).toBeGreaterThan(0);

        const storyStarted = performance.now();
        const storyProjection = story.project({
          view: 'chapter_assist',
          projectId: seeded.projectId,
          chapterId: seeded.lastChapterId,
          limit: 30,
        });
        const storyKnowledgeMs = performance.now() - storyStarted;
        expect(storyProjection.view).toBe('chapter_assist');

        const contextStarted = performance.now();
        const constraintPackage = constraints.build({
          projectId: seeded.projectId,
          chapterId: seeded.lastChapterId,
          taskType: 'chapter',
          maxInputTokens: 32_768,
          safetyMarginTokens: 1_024,
          maxSupplementalResults: 5,
        });
        const contextBuildMs = performance.now() - contextStarted;
        const digestSources = Object.values(constraintPackage.sections)
          .flat()
          .filter((source) => source.sourceType.endsWith('_digest'));
        expect(digestSources.length).toBeLessThanOrEqual(14);

        const incrementalStarted = performance.now();
        await longform.rebuild(randomUUID(), {
          projectId: seeded.projectId,
          scopeType: 'chapter',
          scopeId: seeded.firstChapterId,
        });
        const incrementalDigestMs = performance.now() - incrementalStarted;

        const autosaveStarted = performance.now();
        const saved = await drafts.applyPatch(randomUUID(), {
          projectId: seeded.projectId,
          chapterId: seeded.lastChapterId,
          draftId: seeded.lastDraftId,
          baseRevision: 0,
          operations: [
            {
              type: 'update',
              logicalBlockId: seeded.lastLogicalBlockId,
              expectedHash: seeded.lastContentHash,
              content: `${seeded.lastText.slice(0, -8)}连续写作已保存。`,
            },
          ],
        });
        const autosaveMs = performance.now() - autosaveStarted;
        expect(saved.revision).toBe(1);

        const historyStarted = performance.now();
        const history = versions.list({
          projectId: seeded.projectId,
          chapterId: seeded.lastChapterId,
        });
        const historyMs = performance.now() - historyStarted;
        expect(history.versions).toHaveLength(1);

        const sqliteBytes = (await stat(path.join(seeded.workspacePath, 'project.sqlite'))).size;
        const measurement: Record<string, unknown> = {
          dataset: dataset.label,
          characters: dataset.characters,
          chapters: dataset.chapterCount,
          projectOpenMs,
          digestRebuildMs,
          incrementalDigestMs,
          searchRebuildMs,
          commandPaletteMs,
          storyKnowledgeMs,
          contextBuildMs,
          autosaveMs,
          historyMs,
          sqliteBytes,
          digestSourceCount: digestSources.length,
        };

        expect(projectOpenMs).toBeLessThan(5_000);
        expect(digestRebuildMs).toBeLessThan(30_000);
        expect(incrementalDigestMs).toBeLessThan(1_500);
        expect(searchRebuildMs).toBeLessThan(30_000);
        expect(commandPaletteMs).toBeLessThan(500);
        expect(storyKnowledgeMs).toBeLessThan(500);
        expect(contextBuildMs).toBeLessThan(1_500);
        expect(autosaveMs).toBeLessThan(1_000);
        expect(historyMs).toBeLessThan(250);
        expect(sqliteBytes).toBeLessThan(160 * 1024 * 1024);

        if (dataset.label === '500万字') {
          const backupStarted = performance.now();
          const backup = await recovery.createNamedSnapshot(randomUUID(), {
            projectId: seeded.projectId,
            authority: 'author',
            name: '500万字恢复样本',
            note: 'M11-07 scale verification',
          });
          const backupMs = performance.now() - backupStarted;
          const restoreStarted = performance.now();
          const restored = await recovery.restoreCheckpoint(
            randomUUID(),
            { projectId: seeded.projectId, backupId: backup.backupId },
            restoreParent,
          );
          const restoreMs = performance.now() - restoreStarted;
          await workspace.close(randomUUID(), seeded.projectId);
          await workspace.open(randomUUID(), { workspacePath: restored.workspacePath });
          activeProjectId = restored.projectId;
          const restoredShape = workspace.readProject(restored.projectId, (database) => ({
            chapters: Number(
              database.prepare('SELECT COUNT(*) AS count FROM chapters').get()?.count,
            ),
            versions: Number(
              database.prepare('SELECT COUNT(*) AS count FROM versions').get()?.count,
            ),
            digests: Number(
              database.prepare('SELECT COUNT(*) AS count FROM story_digests').get()?.count,
            ),
          }));
          expect(restoredShape).toEqual({
            chapters: dataset.chapterCount,
            versions: dataset.chapterCount,
            digests: 0,
          });
          expect(backupMs).toBeLessThan(30_000);
          expect(restoreMs).toBeLessThan(30_000);
          Object.assign(measurement, { backupMs, restoreMs, backupBytes: backup.sizeBytes });
        }
        measurements.push(measurement);
        await workspace.close(randomUUID(), activeProjectId);
      }

      const heapGrowthBytes = Math.max(0, process.memoryUsage().heapUsed - initialHeap);
      expect(heapGrowthBytes).toBeLessThan(512 * 1024 * 1024);
      process.stdout.write(
        `${JSON.stringify({ benchmark: 'm11-07-longform-scale', heapGrowthBytes, measurements })}\n`,
      );
    } finally {
      await workspace.shutdown();
      await runtime.close();
    }
  }, 180_000);
});
