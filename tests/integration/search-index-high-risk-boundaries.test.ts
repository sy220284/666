import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import { EntityCanonService } from '../../packages/core-service/src/entity-canon.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { ResearchService } from '../../packages/core-service/src/research-service.js';
import { SearchIndexService } from '../../packages/core-service/src/search-index.js';
import { VersionService } from '../../packages/core-service/src/version.js';

const roots: string[] = [];
const clock = { now: () => new Date('2026-08-18T00:00:00.000Z') };

type Harness = Awaited<ReturnType<typeof createHarness>>;

async function createHarness() {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-search-risk-'));
  roots.push(root);
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
    versions: new VersionService(workspace, { clock }),
    canon: new EntityCanonService(workspace, { clock }),
    research: new ResearchService(workspace, { clock }),
    search: new SearchIndexService(workspace, { clock }),
  };
}

async function closeHarness(harness: Harness): Promise<void> {
  await harness.workspace.shutdown();
  await harness.appRuntime.close();
}

async function drain(search: SearchIndexService, projectId: string): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    const result = await search.processPending(randomUUID(), { projectId, limit: 100 });
    if (result.remaining === 0) return;
  }
  throw new Error('SEARCH_QUEUE_DID_NOT_DRAIN');
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('search index high-risk authoritative boundaries', () => {
  it('returns title-only version hits without a stale block anchor', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '标题检索风险', channel: '长篇' },
        harness.parent,
      );
      const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database
          .prepare('UPDATE chapters SET title = ? WHERE id = ?')
          .run('孤灯章题密钥', chapter.id);
      });
      const draft = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      const saved = await harness.drafts.saveSnapshot(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        blocks: [
          {
            clientBlockId: draft.blocks[0]!.logicalBlockId,
            logicalBlockId: draft.blocks[0]!.logicalBlockId,
            blockType: 'paragraph',
            text: '正文刻意不含章题检索词。',
            attributes: {},
          },
        ],
      });
      const version = await harness.versions.create(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: saved.draftId,
        baseRevision: saved.revision,
        title: '标题边界留档',
      });
      await drain(harness.search, project.projectId);

      const result = harness.search.search({
        projectId: project.projectId,
        query: '孤灯章题密钥',
        sourceTypes: ['version'],
      });
      expect(result.strategy).toBe('fts');
      expect(result.items).toEqual([
        expect.objectContaining({
          sourceType: 'version',
          targetId: version.versionId,
          anchorId: null,
          title: '孤灯章题密钥',
        }),
      ]);
    } finally {
      await closeHarness(harness);
    }
  });

  it('honors includeArchived for entity and research sources in FTS and fallback search', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '归档检索风险', channel: '长篇' },
        harness.parent,
      );
      const entity = (
        await harness.canon.create(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          entityType: 'item',
          name: '玄砂封印钥',
          aliases: ['旧钥'],
          summary: '只用于归档检索边界',
        })
      ).entities[0]!;
      const researchCatalog = await harness.research.createNote(randomUUID(), {
        projectId: project.projectId,
        title: '玄砂封印档案',
        body: '归档资料正文',
        sourceType: 'manual',
        sourceLabel: '作者摘录',
        sourceUri: null,
        tags: ['玄砂封印'],
      });
      const note = researchCatalog.notes[0]!;
      await harness.canon.archive(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        entityId: entity.id,
      });
      await harness.research.setNoteStatus(randomUUID(), {
        projectId: project.projectId,
        noteId: note.id,
        expectedUpdatedAt: note.updatedAt,
        status: 'archived',
      });
      await drain(harness.search, project.projectId);

      for (const query of ['玄砂封印', '砂']) {
        const hidden = harness.search.search({
          projectId: project.projectId,
          query,
          sourceTypes: ['entity', 'research'],
          includeArchived: false,
        });
        expect(hidden.items).toEqual([]);

        const visible = harness.search.search({
          projectId: project.projectId,
          query,
          sourceTypes: ['entity', 'research'],
          includeArchived: true,
        });
        expect(new Set(visible.items.map((item) => item.targetId))).toEqual(
          new Set([entity.id, note.id]),
        );
      }
    } finally {
      await closeHarness(harness);
    }
  });

  it('drops stale FTS hits when the authoritative entity or research row disappeared', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '索引陈旧风险', channel: '长篇' },
        harness.parent,
      );
      const entity = (
        await harness.canon.create(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          entityType: 'character',
          name: '断链检索人物',
          aliases: [],
          summary: '用于制造权威行消失后的陈旧索引命中',
        })
      ).entities[0]!;
      const catalog = await harness.research.createNote(randomUUID(), {
        projectId: project.projectId,
        title: '断链检索资料',
        body: '用于制造权威行消失后的陈旧索引命中',
        sourceType: 'manual',
        sourceLabel: '测试',
        sourceUri: 'local:stale-hit',
        tags: ['断链检索'],
      });
      const note = catalog.notes[0]!;
      await drain(harness.search, project.projectId);

      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database.prepare('DELETE FROM canon_facts WHERE entity_id = ?').run(entity.id);
        database.prepare('DELETE FROM entities WHERE id = ?').run(entity.id);
        database.prepare('DELETE FROM research_notes WHERE id = ?').run(note.id);
        database.prepare('DELETE FROM search_index_queue').run();
        database
          .prepare(
            "UPDATE search_index_state SET status = 'ready', stale_at = NULL, last_error_code = NULL WHERE singleton_id = 1",
          )
          .run();
      });

      const result = harness.search.search({
        projectId: project.projectId,
        query: '断链检索',
        sourceTypes: ['entity', 'research'],
        includeArchived: true,
      });
      expect(result.strategy).toBe('fts');
      expect(result.items).toEqual([]);
    } finally {
      await closeHarness(harness);
    }
  });
});
