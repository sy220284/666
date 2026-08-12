import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import {
  IdeaCapsuleService,
  type IdeaCapsuleServiceError,
} from '../../packages/core-service/src/idea-capsule-service.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';

const temporaryDirectories: string[] = [];

interface Harness {
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly ideas: IdeaCapsuleService;
  readonly advance: () => void;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-idea-capsule-'));
  temporaryDirectories.push(root);
  const parent = path.join(root, 'projects');
  await mkdir(parent, { recursive: true });
  let current = Date.parse('2026-08-12T09:30:00.000Z');
  const clock = { now: () => new Date(current) };
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
    ideas: new IdeaCapsuleService(workspace, { clock }),
    advance: () => {
      current += 1_000;
    },
  };
}

async function closeHarness(harness: Harness): Promise<void> {
  await harness.workspace.shutdown();
  await harness.appRuntime.close();
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

function plotTarget(title: string) {
  return {
    targetType: 'plot_node' as const,
    draft: {
      parentId: null,
      nodeType: 'arc' as const,
      title,
      goal: '让灵感进入正式大纲',
      coreConflict: '',
      expectedResult: '',
      status: 'outlined' as const,
    },
  };
}

describe('M11-05 Idea Capsule authoritative lifecycle', () => {
  it('keeps preview zero-write, rejects stale previews, and rolls back target plus audit atomically', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '灵感转换事务', channel: '长篇', initialStructure: 'blank' },
        harness.parent,
      );
      const idea = await harness.ideas.create(randomUUID(), {
        projectId: project.projectId,
        ideaKind: 'plot',
        title: '镜像城门',
        summary: '主角每次回城都发现守门人的记忆更早一步被改写。',
        content: '城门记录逐次提前，最终指向主角尚未做出的选择。',
        divergenceLevel: 'different',
        depthLevel: 'expand',
        sourceContext: {
          scopeType: 'project',
          scopeId: project.projectId,
          chapterId: null,
        },
      });
      const target = plotTarget('镜像城门');
      const preview = harness.ideas.previewConversion({
        projectId: project.projectId,
        ideaId: idea.id,
        target,
      });

      expect(
        harness.workspace.readProject(project.projectId, (database) =>
          Number(database.prepare('SELECT COUNT(*) AS count FROM plot_nodes').get()!.count),
        ),
      ).toBe(0);
      expect(
        harness.ideas.get({ projectId: project.projectId, ideaId: idea.id }).conversion,
      ).toBeNull();

      harness.advance();
      await harness.ideas.setStatus(randomUUID(), {
        projectId: project.projectId,
        ideaId: idea.id,
        status: 'favorite',
      });
      await expect(
        harness.ideas.applyConversion(randomUUID(), {
          projectId: project.projectId,
          ideaId: idea.id,
          target,
          previewHash: preview.previewHash,
        }),
      ).rejects.toMatchObject<IdeaCapsuleServiceError>({ code: 'IDEA_CONFLICT' });
      expect(
        harness.workspace.readProject(project.projectId, (database) =>
          Number(database.prepare('SELECT COUNT(*) AS count FROM plot_nodes').get()!.count),
        ),
      ).toBe(0);

      const freshPreview = harness.ideas.previewConversion({
        projectId: project.projectId,
        ideaId: idea.id,
        target,
      });
      expect(freshPreview.previewHash).not.toBe(preview.previewHash);
      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database.exec(`CREATE TRIGGER m11_05_fail_conversion
          BEFORE INSERT ON idea_conversions
          BEGIN
            SELECT RAISE(ABORT, 'M11_05_INJECTED_CONVERSION_FAILURE');
          END;`);
      });
      await expect(
        harness.ideas.applyConversion(randomUUID(), {
          projectId: project.projectId,
          ideaId: idea.id,
          target,
          previewHash: freshPreview.previewHash,
        }),
      ).rejects.toMatchObject({
        code: 'DATABASE_WRITE_FAILED',
        message: 'The database write failed and was rolled back.',
      });
      expect(
        harness.workspace.readProject(project.projectId, (database) => ({
          plotNodes: Number(
            database.prepare('SELECT COUNT(*) AS count FROM plot_nodes').get()!.count,
          ),
          conversions: Number(
            database.prepare('SELECT COUNT(*) AS count FROM idea_conversions').get()!.count,
          ),
        })),
      ).toEqual({ plotNodes: 0, conversions: 0 });
      expect(harness.ideas.get({ projectId: project.projectId, ideaId: idea.id }).idea.status).toBe(
        'favorite',
      );

      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database.exec('DROP TRIGGER m11_05_fail_conversion;');
      });
      const applied = await harness.ideas.applyConversion(randomUUID(), {
        projectId: project.projectId,
        ideaId: idea.id,
        target,
        previewHash: freshPreview.previewHash,
      });
      expect(applied.idea.status).toBe('converted');
      expect(applied.conversion).toMatchObject({ targetType: 'plot_node', status: 'applied' });
      expect(
        harness.workspace.readProject(project.projectId, (database) =>
          Number(database.prepare('SELECT COUNT(*) AS count FROM plot_nodes').get()!.count),
        ),
      ).toBe(1);
    } finally {
      await closeHarness(harness);
    }
  });

  it('reports converted targets as missing or stale without duplicating target snapshots', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '灵感目标生命周期', channel: '长篇', initialStructure: 'blank' },
        harness.parent,
      );
      const plotIdea = await harness.ideas.create(randomUUID(), {
        projectId: project.projectId,
        ideaKind: 'plot',
        title: '消失的支线',
        summary: '用于验证删除后的动态状态。',
        content: '转换后删除目标节点，灵感详情应动态报告目标缺失。',
        divergenceLevel: 'safe',
        depthLevel: 'spark',
        sourceContext: { scopeType: 'project', scopeId: project.projectId, chapterId: null },
      });
      const plotPreview = harness.ideas.previewConversion({
        projectId: project.projectId,
        ideaId: plotIdea.id,
        target: plotTarget('消失的支线'),
      });
      const plotApplied = await harness.ideas.applyConversion(randomUUID(), {
        projectId: project.projectId,
        ideaId: plotIdea.id,
        target: plotPreview.target,
        previewHash: plotPreview.previewHash,
      });
      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database
          .prepare('DELETE FROM plot_nodes WHERE id = ?')
          .run(plotApplied.conversion.targetId);
      });
      expect(
        harness.ideas.get({ projectId: project.projectId, ideaId: plotIdea.id }).conversion?.status,
      ).toBe('target_missing');

      const entityIdea = await harness.ideas.create(randomUUID(), {
        projectId: project.projectId,
        ideaKind: 'character',
        title: '旧城守门人',
        summary: '用于验证归档后的动态状态。',
        content: '人物被归档后，转换记录不复制人物快照，只报告目标失效。',
        divergenceLevel: 'different',
        depthLevel: 'expand',
        sourceContext: { scopeType: 'project', scopeId: project.projectId, chapterId: null },
      });
      const entityTarget = {
        targetType: 'entity' as const,
        draft: {
          entityType: 'character' as const,
          name: '旧城守门人',
          aliases: [],
          summary: '知道城门过去的全部版本。',
        },
      };
      const entityPreview = harness.ideas.previewConversion({
        projectId: project.projectId,
        ideaId: entityIdea.id,
        target: entityTarget,
      });
      const entityApplied = await harness.ideas.applyConversion(randomUUID(), {
        projectId: project.projectId,
        ideaId: entityIdea.id,
        target: entityTarget,
        previewHash: entityPreview.previewHash,
      });
      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database
          .prepare("UPDATE entities SET status = 'archived', archived_at = ? WHERE id = ?")
          .run('2026-08-12T09:40:00.000Z', entityApplied.conversion.targetId);
      });
      expect(
        harness.ideas.get({ projectId: project.projectId, ideaId: entityIdea.id }).conversion
          ?.status,
      ).toBe('target_stale');
    } finally {
      await closeHarness(harness);
    }
  });
});
