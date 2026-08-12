import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { GenerationRunService } from '../../packages/core-service/src/generation/generation-run-service.js';
import { IdeaCapsuleService } from '../../packages/core-service/src/idea-capsule-service.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { RecoveryService } from '../../packages/core-service/src/recovery.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-08-12T10:00:00.000Z') };

interface Harness {
  readonly parent: string;
  readonly restoreParent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly recovery: RecoveryService;
  readonly generations: GenerationRunService;
  readonly ideas: IdeaCapsuleService;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-m11-05-clone-'));
  temporaryDirectories.push(root);
  const parent = path.join(root, 'projects');
  const restoreParent = path.join(root, 'restored');
  const backupRootDirectory = path.join(root, 'recovery');
  await Promise.all([
    mkdir(parent, { recursive: true }),
    mkdir(restoreParent, { recursive: true }),
    mkdir(backupRootDirectory, { recursive: true }),
  ]);
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
    restoreParent,
    appRuntime,
    workspace,
    recovery: new RecoveryService(workspace, { backupRootDirectory, clock }),
    generations: new GenerationRunService(workspace, { clock }),
    ideas: new IdeaCapsuleService(workspace, { clock }),
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

describe('M11-05 Idea Capsule clone and restore identity', () => {
  it('remaps project-scoped Generation and Idea identities while preserving conversion links', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '灵感恢复源项目', channel: '长篇', initialStructure: 'blank' },
        harness.parent,
      );
      const run = await harness.generations.create(randomUUID(), {
        projectId: project.projectId,
        scopeType: 'project',
        scopeId: project.projectId,
        chapterId: null,
        baseDraftId: null,
        baseDraftRevision: null,
        runType: 'idea_explore',
        promptId: 'worldforge.idea-explore',
        promptVersion: 1,
        outputMode: 'structured',
        providerId: 'fixture-provider',
        actualModel: 'fixture-model',
        supportStatus: 'unverified',
        constraintPackage: null,
      });
      const idea = await harness.ideas.create(randomUUID(), {
        projectId: project.projectId,
        ideaKind: 'plot',
        title: '回到原点的城门',
        summary: '用于验证恢复副本的项目级 sourceContext 重映射。',
        content: '转换目标与灵感审计都应保留，但新副本不得继续引用旧项目 ID。',
        divergenceLevel: 'different',
        depthLevel: 'expand',
        sourceContext: {
          scopeType: 'project',
          scopeId: project.projectId,
          chapterId: null,
        },
      });
      const target = {
        targetType: 'plot_node' as const,
        draft: {
          parentId: null,
          nodeType: 'arc' as const,
          title: '回到原点的城门',
          goal: '验证恢复副本的转换目标',
          coreConflict: '',
          expectedResult: '',
          status: 'outlined' as const,
        },
      };
      const preview = harness.ideas.previewConversion({
        projectId: project.projectId,
        ideaId: idea.id,
        target,
      });
      const applied = await harness.ideas.applyConversion(randomUUID(), {
        projectId: project.projectId,
        ideaId: idea.id,
        target,
        previewHash: preview.previewHash,
      });
      const checkpoint = await harness.recovery.createOperationCheckpoint(randomUUID(), {
        projectId: project.projectId,
        operation: 'manual-protection',
      });

      const restored = await harness.recovery.restoreCheckpoint(
        randomUUID(),
        { projectId: project.projectId, backupId: checkpoint.backupId },
        harness.restoreParent,
      );
      expect(restored.projectId).not.toBe(project.projectId);
      expect(
        harness.generations.get({ projectId: project.projectId, runId: run.runId }).scopeId,
      ).toBe(project.projectId);
      expect(
        harness.ideas.get({ projectId: project.projectId, ideaId: idea.id }).idea.sourceContext
          .scopeId,
      ).toBe(project.projectId);

      await harness.workspace.close(randomUUID(), project.projectId);
      await harness.workspace.open(randomUUID(), { workspacePath: restored.workspacePath });
      const restoredRun = harness.generations.get({
        projectId: restored.projectId,
        runId: run.runId,
      });
      expect(restoredRun).toMatchObject({
        projectId: restored.projectId,
        scopeType: 'project',
        scopeId: restored.projectId,
        status: 'cancelled',
        stage: 'cancelled',
      });
      const restoredIdea = harness.ideas.get({
        projectId: restored.projectId,
        ideaId: idea.id,
      });
      expect(restoredIdea.idea).toMatchObject({
        projectId: restored.projectId,
        status: 'converted',
        sourceContext: { scopeType: 'project', scopeId: restored.projectId, chapterId: null },
      });
      expect(restoredIdea.conversion).toMatchObject({
        projectId: restored.projectId,
        targetType: 'plot_node',
        targetId: applied.conversion.targetId,
        status: 'applied',
      });
      expect(
        harness.workspace.readProject(restored.projectId, (database) =>
          database
            .prepare('SELECT project_id AS projectId FROM plot_nodes WHERE id = ?')
            .get(applied.conversion.targetId),
        ),
      ).toEqual({ projectId: restored.projectId });
    } finally {
      await closeHarness(harness);
    }
  });
});
