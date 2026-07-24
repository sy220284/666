import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import { EntityCanonService } from '../../packages/core-service/src/entity-canon.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { SearchIndexService } from '../../packages/core-service/src/search-index.js';
import { VersionService } from '../../packages/core-service/src/version.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-24T06:30:00.000Z') };

interface Harness {
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly drafts: DraftService;
  readonly versions: VersionService;
  readonly canon: EntityCanonService;
  readonly search: SearchIndexService;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-search-index-'));
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
    versions: new VersionService(workspace, { clock }),
    canon: new EntityCanonService(workspace, { clock }),
    search: new SearchIndexService(workspace, { clock }),
  };
}

async function closeHarness(harness: Harness): Promise<void> {
  await harness.workspace.shutdown();
  await harness.appRuntime.close();
}

async function consumeAll(search: SearchIndexService, projectId: string): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    const result = await search.processPending(randomUUID(), { projectId, limit: 100 });
    if (result.remaining === 0) return;
  }
  throw new Error('SEARCH_QUEUE_DID_NOT_DRAIN');
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M4-01 FTS5 public index and project dictionary', () => {
  it('indexes Draft, Version and Entity, falls back while stale, and re-reads authority rows', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '检索项目', channel: '长篇' },
        harness.parent,
      );
      const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      const opened = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      const saved = await harness.drafts.saveSnapshot(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: opened.draftId,
        blocks: [
          {
            clientBlockId: opened.blocks[0]!.logicalBlockId,
            logicalBlockId: opened.blocks[0]!.logicalBlockId,
            blockType: 'paragraph',
            text: '玄烛城夜雨长街暗号只在更鼓之后启用。',
            attributes: {},
          },
        ],
      });
      const version = await harness.versions.create(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: saved.draftId,
        baseRevision: saved.revision,
        title: '夜雨留档',
      });
      const entity = (
        await harness.canon.create(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          entityType: 'location',
          name: '玄烛城夜雨长街',
          aliases: ['夜雨街'],
          summary: '暗号交接地点',
        })
      ).entities[0]!;
      await harness.canon.setFact(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        entityId: entity.id,
        factKey: 'signal',
        value: { phrase: '玄烛城夜雨' },
        description: '更鼓后生效',
        sourceType: 'author',
        sourceId: null,
      });

      expect(harness.search.getState(project.projectId)).toMatchObject({
        status: 'stale',
        pendingCount: 3,
      });
      await consumeAll(harness.search, project.projectId);
      expect(harness.search.getState(project.projectId)).toMatchObject({
        status: 'ready',
        pendingCount: 0,
        failedCount: 0,
      });

      const longQuery = harness.search.search({
        projectId: project.projectId,
        query: '玄烛城夜雨',
        limit: 20,
      });
      expect(longQuery.strategy).toBe('fts');
      expect(new Set(longQuery.items.map((item) => item.sourceType))).toEqual(
        new Set(['draft', 'version', 'entity']),
      );
      expect(longQuery.items.find((item) => item.sourceType === 'version')?.targetId).toBe(
        version.versionId,
      );
      expect(longQuery.items.find((item) => item.sourceType === 'entity')?.targetId).toBe(entity.id);

      const shortQuery = harness.search.search({
        projectId: project.projectId,
        query: '城',
        limit: 20,
      });
      expect(shortQuery.strategy).toBe('authoritative-like');
      expect(shortQuery.items.length).toBeGreaterThan(0);

      await harness.search.upsertDictionary(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        term: '夜雨',
        category: 'location',
        action: 'alias',
        replacementTerm: '玄烛城夜雨',
        notes: '项目内简称',
      });
      const aliased = harness.search.search({
        projectId: project.projectId,
        query: '夜雨',
        limit: 20,
      });
      expect(aliased).toMatchObject({ strategy: 'dictionary', normalizedQuery: '玄烛城夜雨' });
      expect(aliased.items.length).toBeGreaterThan(0);
      await expect(
        harness.search.upsertDictionary(randomUUID(), {
          projectId: project.projectId,
          authority: 'ai',
          term: '伪词',
          category: 'custom',
          action: 'canonical',
          replacementTerm: null,
          notes: '',
        }),
      ).rejects.toMatchObject({ code: 'SEARCH_DICTIONARY_AUTHOR_REQUIRED' });

      const changed = await harness.drafts.applyPatch(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: saved.draftId,
        baseRevision: saved.revision,
        operations: [
          {
            type: 'update',
            logicalBlockId: saved.blocks[0]!.logicalBlockId,
            expectedHash: saved.blocks[0]!.contentHash!,
            content: '新月碑文仅存于当前活动正文，历史留档没有这句话。',
          },
        ],
      });
      expect(changed.revision).toBe(saved.revision + 1);
      const staleResult = harness.search.search({
        projectId: project.projectId,
        query: '新月碑文',
        sourceTypes: ['draft'],
      });
      expect(staleResult).toMatchObject({ strategy: 'authoritative-like', indexStatus: 'stale' });
      expect(staleResult.items).toHaveLength(1);

      await consumeAll(harness.search, project.projectId);
      const freshResult = harness.search.search({
        projectId: project.projectId,
        query: '新月碑文',
        sourceTypes: ['draft'],
      });
      expect(freshResult).toMatchObject({ strategy: 'fts', indexStatus: 'ready' });
      expect(freshResult.items).toHaveLength(1);

      await harness.workspace.writeProject(randomUUID(), project.projectId, (connection) => {
        connection.prepare('DELETE FROM fts_draft_blocks WHERE draft_id = ?').run(saved.draftId);
      });
      expect(
        harness.search.search({
          projectId: project.projectId,
          query: '新月碑文',
          sourceTypes: ['draft'],
        }).items,
      ).toEqual([]);
      const rebuilt = await harness.search.rebuild(randomUUID(), project.projectId);
      expect(rebuilt).toMatchObject({ status: 'ready', failedCount: 0, draftCount: 1 });
      expect(
        harness.search.search({
          projectId: project.projectId,
          query: '新月碑文',
          sourceTypes: ['draft'],
        }).items,
      ).toHaveLength(1);
    } finally {
      await closeHarness(harness);
    }
  });

  it('keeps failed indexing stale, retries safely, and blocks cross-project authority leakage', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '故障项目', channel: '长篇' },
        harness.parent,
      );
      await consumeAll(harness.search, project.projectId);
      const entity = (
        await harness.canon.create(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          entityType: 'character',
          name: '沈照',
          aliases: [],
          summary: '索引故障目标',
        })
      ).entities[0]!;
      const failing = new SearchIndexService(harness.workspace, {
        clock,
        faultInjector: (target) => {
          if (target.targetType === 'entity' && target.targetId === entity.id) {
            throw Object.assign(new Error('injected-search-index-failure'), {
              code: 'INJECTED_INDEX_FAILURE',
            });
          }
        },
      });
      const failed = await failing.processPending(randomUUID(), {
        projectId: project.projectId,
        limit: 100,
      });
      expect(failed).toMatchObject({ status: 'stale', failed: 1, remaining: 1 });
      expect(failing.getState(project.projectId)).toMatchObject({
        status: 'stale',
        failedCount: 1,
        lastErrorCode: 'INJECTED_INDEX_FAILURE',
      });
      await consumeAll(harness.search, project.projectId);
      expect(harness.search.getState(project.projectId)).toMatchObject({
        status: 'ready',
        failedCount: 0,
      });

      const foreignProjectId = randomUUID();
      const foreignVolumeId = randomUUID();
      const foreignChapterId = randomUUID();
      const foreignDraftId = randomUUID();
      const foreignBlockId = randomUUID();
      const now = clock.now().toISOString();
      await harness.workspace.writeProject(randomUUID(), project.projectId, (connection) => {
        connection
          .prepare(
            `INSERT INTO projects(id, name, channel, active_style_profile_id, schema_version, created_at, updated_at)
             VALUES(?, 'Foreign', 'test', NULL, 21, ?, ?)`,
          )
          .run(foreignProjectId, now, now);
        connection
          .prepare(
            `INSERT INTO volumes(id, project_id, title, order_key, status, deleted_at)
             VALUES(?, ?, '异项目卷', 2048, 'pending', NULL)`,
          )
          .run(foreignVolumeId, foreignProjectId);
        connection
          .prepare(
            `INSERT INTO chapters(id, volume_id, title, order_key, status, target_word_min, target_word_max, active_draft_id, final_version_id, deleted_at)
             VALUES(?, ?, '异项目章', 2048, 'writing', NULL, NULL, NULL, NULL, NULL)`,
          )
          .run(foreignChapterId, foreignVolumeId);
        connection
          .prepare(
            `INSERT INTO drafts(id, chapter_id, status, revision, created_at, updated_at)
             VALUES(?, ?, 'active', 0, ?, ?)`,
          )
          .run(foreignDraftId, foreignChapterId, now, now);
        connection
          .prepare('UPDATE chapters SET active_draft_id = ? WHERE id = ?')
          .run(foreignDraftId, foreignChapterId);
        connection
          .prepare(
            `INSERT INTO draft_blocks(id, draft_id, logical_block_id, order_key, block_type, text, attributes_json, source, locked, content_hash, revision)
             VALUES(?, ?, ?, 1024, 'paragraph', '异项目绝密检索词', '{}', 'author', 0, NULL, 0)`,
          )
          .run(foreignBlockId, foreignDraftId, foreignBlockId);
      });
      await consumeAll(harness.search, project.projectId);
      expect(
        harness.search.search({
          projectId: project.projectId,
          query: '异项目绝密检索词',
          sourceTypes: ['draft'],
        }).items,
      ).toEqual([]);
    } finally {
      await closeHarness(harness);
    }
  });
});
