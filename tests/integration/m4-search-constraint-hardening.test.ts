import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { HardenedConstraintPackageService } from '../../packages/core-service/src/constraint-package-hardening.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { HardenedSearchIndexService } from '../../packages/core-service/src/search-index-hardening.js';
import { VersionService } from '../../packages/core-service/src/version.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-25T08:00:00.000Z') };

interface Harness {
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly drafts: DraftService;
  readonly versions: VersionService;
  readonly search: HardenedSearchIndexService;
  readonly constraints: HardenedConstraintPackageService;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-m4-hardening-'));
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
    search: new HardenedSearchIndexService(workspace, { clock }),
    constraints: new HardenedConstraintPackageService(workspace),
  };
}

async function closeHarness(harness: Harness): Promise<void> {
  await harness.workspace.shutdown();
  await harness.appRuntime.close();
}

async function saveChapter(
  harness: Harness,
  projectId: string,
  chapterId: string,
  content: string,
) {
  const opened = await harness.drafts.open(randomUUID(), { projectId, chapterId });
  return harness.drafts.saveSnapshot(randomUUID(), {
    projectId,
    chapterId,
    draftId: opened.draftId,
    blocks: [
      {
        clientBlockId: opened.blocks[0]?.logicalBlockId ?? randomUUID(),
        logicalBlockId: opened.blocks[0]?.logicalBlockId ?? null,
        blockType: 'paragraph',
        text: content,
        attributes: {},
      },
    ],
  });
}

async function consumeAll(search: HardenedSearchIndexService, projectId: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
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

describe('M4 search and constraint hardening', () => {
  it('returns unanchored Draft and Version title hits during short-query authority fallback', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '标题回退项目', channel: '长篇' },
        harness.parent,
      );
      const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      await harness.workspace.writeProject(randomUUID(), project.projectId, (connection) => {
        connection.prepare('UPDATE chapters SET title = ? WHERE id = ?').run('城门夜雨', chapter.id);
      });
      const saved = await saveChapter(harness, project.projectId, chapter.id, '正文没有目标单字。');
      const version = await harness.versions.create(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: saved.draftId,
        baseRevision: saved.revision,
        title: '标题留档',
      });

      const draftResult = harness.search.search({
        projectId: project.projectId,
        query: '城',
        sourceTypes: ['draft'],
        limit: 10,
      });
      expect(draftResult).toMatchObject({ strategy: 'authoritative-like' });
      expect(draftResult.items).toEqual([
        expect.objectContaining({
          sourceType: 'draft',
          targetId: saved.draftId,
          anchorId: null,
          title: '城门夜雨',
        }),
      ]);

      const versionResult = harness.search.search({
        projectId: project.projectId,
        query: '城',
        sourceTypes: ['version'],
        limit: 10,
      });
      expect(versionResult.items).toEqual([
        expect.objectContaining({
          sourceType: 'version',
          targetId: version.versionId,
          anchorId: null,
          title: '城门夜雨',
        }),
      ]);
    } finally {
      await closeHarness(harness);
    }
  });

  it('filters future chapters and the current Draft before applying supplemental result limits', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '时序召回项目', channel: '悬疑长篇' },
        harness.parent,
      );
      const initial = harness.structure.list(project.projectId);
      const volume = initial.volumes[0]!;
      const previous = volume.chapters[0]!;
      const withCurrent = await harness.structure.createChapter(randomUUID(), {
        projectId: project.projectId,
        volumeId: volume.id,
        title: '当前章',
        placement: { kind: 'end' },
      });
      const current = withCurrent.volumes[0]!.chapters[1]!;
      const withFuture = await harness.structure.createChapter(randomUUID(), {
        projectId: project.projectId,
        volumeId: volume.id,
        title: '未来章',
        placement: { kind: 'end' },
      });
      const future = withFuture.volumes[0]!.chapters[2]!;

      await saveChapter(harness, project.projectId, previous.id, '玄枢暗号只在前章留下。');
      await saveChapter(
        harness,
        project.projectId,
        current.id,
        `当前稿 ${'玄枢暗号 '.repeat(40)}`,
      );
      await saveChapter(
        harness,
        project.projectId,
        future.id,
        `未来内容 ${'玄枢暗号 '.repeat(80)}`,
      );
      await consumeAll(harness.search, project.projectId);

      const result = harness.constraints.build({
        projectId: project.projectId,
        chapterId: current.id,
        taskType: 'rewrite',
        query: '玄枢暗号',
        maxInputTokens: 32_768,
        safetyMarginTokens: 2_048,
        maxSupplementalResults: 1,
      });
      const supplemental = result.sections.P4.filter(
        (source) => source.sourceType === 'supplemental_search',
      );
      expect(supplemental).toHaveLength(1);
      expect(supplemental[0]).toMatchObject({ chapterId: previous.id });
      expect(result.sections.P3.some((source) => source.sourceType === 'current_draft')).toBe(true);
      expect(
        supplemental.some(
          (source) => source.chapterId === current.id || source.chapterId === future.id,
        ),
      ).toBe(false);
    } finally {
      await closeHarness(harness);
    }
  });
});
