import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import {
  applyProjectBriefUpdateInTransaction,
  ProjectPlanningService,
  type ProjectPlanningError,
} from '../../packages/core-service/src/project-planning.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-08-17T12:00:00.000Z') };

interface Harness {
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly planning: ProjectPlanningService;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-project-planning-edge-'));
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
    planning: new ProjectPlanningService(workspace, { clock }),
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

async function createRoot(
  harness: Harness,
  projectId: string,
  title: string,
  placement: { kind: 'end' } | { kind: 'after'; siblingId: string } = { kind: 'end' },
) {
  const list = await harness.planning.createPlotNode(randomUUID(), {
    projectId,
    parentId: null,
    nodeType: 'arc',
    title,
    goal: `${title}-goal`,
    coreConflict: `${title}-conflict`,
    expectedResult: `${title}-result`,
    status: 'pending',
    placement,
  });
  return list.nodes.find((node) => node.title === title)!;
}

async function createChild(harness: Harness, projectId: string, parentId: string, title: string) {
  const list = await harness.planning.createPlotNode(randomUUID(), {
    projectId,
    parentId,
    nodeType: 'chapter',
    title,
    goal: '',
    coreConflict: '',
    expectedResult: '',
    status: 'pending',
    placement: { kind: 'end' },
  });
  return list.nodes.find((node) => node.title === title)!;
}

describe('ProjectPlanningService edge coverage', () => {
  it('covers missing project, malformed brief rules, missing nodes and sparse update fallbacks', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '规划边界', channel: '长篇', initialStructure: 'blank' },
        harness.parent,
      );
      await expect(
        harness.workspace.writeProject(randomUUID(), project.projectId, (database) =>
          applyProjectBriefUpdateInTransaction(
            database,
            {
              projectId: randomUUID(),
              concept: '',
              readingPromise: '',
              protagonistGoal: '',
              coreConflict: '',
              endingIntent: '',
              required: [],
              forbidden: [],
            },
            clock.now().toISOString(),
            randomUUID,
          ),
        ),
      ).rejects.toMatchObject<ProjectPlanningError>({ code: 'PLANNING_NOT_FOUND' });

      await harness.planning.updateBrief(randomUUID(), {
        projectId: project.projectId,
        concept: '概念',
        readingPromise: '',
        protagonistGoal: '',
        coreConflict: '',
        endingIntent: '',
        required: ['必须项'],
        forbidden: [],
      });
      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database
          .prepare('UPDATE project_briefs SET required_json = ? WHERE project_id = ?')
          .run('[1]', project.projectId);
      });
      expect(() => harness.planning.getBrief(project.projectId)).toThrowError(
        expect.objectContaining({ code: 'PLANNING_INVARIANT' }),
      );

      const node = await createRoot(harness, project.projectId, '保留字段');
      const updated = await harness.planning.updatePlotNode(randomUUID(), {
        projectId: project.projectId,
        nodeId: node.id,
        patch: { goal: '只改目标' },
      });
      expect(updated.nodes.find((item) => item.id === node.id)).toMatchObject({
        nodeType: node.nodeType,
        title: node.title,
        goal: '只改目标',
        coreConflict: node.coreConflict,
        expectedResult: node.expectedResult,
        status: node.status,
      });
      await expect(
        harness.planning.updatePlotNode(randomUUID(), {
          projectId: project.projectId,
          nodeId: randomUUID(),
          patch: { goal: '不存在' },
        }),
      ).rejects.toMatchObject<ProjectPlanningError>({ code: 'PLANNING_NOT_FOUND' });
    } finally {
      await closeHarness(harness);
    }
  });

  it('covers duplicate sibling titles, invalid sibling placement and self-parent rejection', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '规划冲突', channel: '长篇', initialStructure: 'blank' },
        harness.parent,
      );
      const first = await createRoot(harness, project.projectId, '重复标题');
      await expect(
        createRoot(harness, project.projectId, '重复标题'),
      ).rejects.toMatchObject<ProjectPlanningError>({ code: 'PLANNING_CONFLICT' });
      const second = await createRoot(harness, project.projectId, '第二节点');
      await expect(
        harness.planning.updatePlotNode(randomUUID(), {
          projectId: project.projectId,
          nodeId: second.id,
          patch: { title: first.title },
        }),
      ).rejects.toMatchObject<ProjectPlanningError>({ code: 'PLANNING_CONFLICT' });
      await expect(
        harness.planning.movePlotNode(randomUUID(), {
          projectId: project.projectId,
          nodeId: first.id,
          targetParentId: first.id,
          placement: { kind: 'end' },
        }),
      ).rejects.toMatchObject<ProjectPlanningError>({ code: 'PLANNING_INVALID_POSITION' });
      await expect(
        harness.planning.movePlotNode(randomUUID(), {
          projectId: project.projectId,
          nodeId: first.id,
          targetParentId: null,
          placement: { kind: 'before', siblingId: randomUUID() },
        }),
      ).rejects.toMatchObject<ProjectPlanningError>({ code: 'PLANNING_INVALID_POSITION' });
    } finally {
      await closeHarness(harness);
    }
  });

  it('deletes nodes, rejects missing deletes, and rolls back injected post-delete failure', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '规划删除', channel: '长篇', initialStructure: 'blank' },
        harness.parent,
      );
      const deleted = await createRoot(harness, project.projectId, '待删除');
      const afterDelete = await harness.planning.deletePlotNode(randomUUID(), {
        projectId: project.projectId,
        nodeId: deleted.id,
      });
      expect(afterDelete.nodes.some((node) => node.id === deleted.id)).toBe(false);
      await expect(
        harness.planning.deletePlotNode(randomUUID(), {
          projectId: project.projectId,
          nodeId: deleted.id,
        }),
      ).rejects.toMatchObject<ProjectPlanningError>({ code: 'PLANNING_NOT_FOUND' });

      const rollback = await createRoot(harness, project.projectId, '回滚删除');
      const faulty = new ProjectPlanningService(harness.workspace, {
        clock,
        faultInjector: (stage) => {
          if (stage === 'after-node-delete') throw new Error('after-delete-failure');
        },
      });
      await expect(
        faulty.deletePlotNode(randomUUID(), { projectId: project.projectId, nodeId: rollback.id }),
      ).rejects.toThrow('after-delete-failure');
      expect(harness.planning.listPlotNodes(project.projectId).nodes).toContainEqual(
        expect.objectContaining({ id: rollback.id }),
      );
    } finally {
      await closeHarness(harness);
    }
  });

  it('uses the high-side temporary order range and rejects an exhausted integer range', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '规划极值键', channel: '长篇', initialStructure: 'blank' },
        harness.parent,
      );
      const target = await createRoot(harness, project.projectId, '目标父节点');
      const lowChild = await createChild(harness, project.projectId, target.id, '最低键');
      const moving = await createRoot(harness, project.projectId, '迁入节点');
      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database
          .prepare('UPDATE plot_nodes SET order_key = ? WHERE id = ?')
          .run(-9223372036854775808n, lowChild.id);
      });
      const moved = await harness.planning.movePlotNode(randomUUID(), {
        projectId: project.projectId,
        nodeId: moving.id,
        targetParentId: target.id,
        placement: { kind: 'end' },
      });
      expect(moved.nodes.find((node) => node.id === moving.id)?.parentId).toBe(target.id);

      const maxChild = await createChild(harness, project.projectId, target.id, '最高键');
      const blocked = await createRoot(harness, project.projectId, '无法暂存');
      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database
          .prepare('UPDATE plot_nodes SET order_key = ? WHERE id = ?')
          .run(-9223372036854775808n, lowChild.id);
        database
          .prepare('UPDATE plot_nodes SET order_key = ? WHERE id = ?')
          .run(9223372036854775807n, maxChild.id);
      });
      await expect(
        harness.planning.movePlotNode(randomUUID(), {
          projectId: project.projectId,
          nodeId: blocked.id,
          targetParentId: target.id,
          placement: { kind: 'end' },
        }),
      ).rejects.toMatchObject<ProjectPlanningError>({ code: 'PLANNING_INVARIANT' });
    } finally {
      await closeHarness(harness);
    }
  });

  it('raises invariant when a rebalance staging or final update affects zero rows', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '规划重排零写', channel: '长篇', initialStructure: 'blank' },
        harness.parent,
      );
      const first = await createRoot(harness, project.projectId, '甲');
      const second = await createRoot(harness, project.projectId, '乙');
      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database.prepare('UPDATE plot_nodes SET order_key = 1 WHERE id = ?').run(first.id);
        database.prepare('UPDATE plot_nodes SET order_key = 2 WHERE id = ?').run(second.id);
        database.exec(`
          CREATE TRIGGER ignore_rebalance_stage
          BEFORE UPDATE OF order_key ON plot_nodes
          WHEN NEW.order_key < 0
          BEGIN SELECT RAISE(IGNORE); END;
        `);
      });
      await expect(
        harness.planning.createPlotNode(randomUUID(), {
          projectId: project.projectId,
          parentId: null,
          nodeType: 'arc',
          title: '中间一',
          goal: '',
          coreConflict: '',
          expectedResult: '',
          status: 'pending',
          placement: { kind: 'after', siblingId: first.id },
        }),
      ).rejects.toMatchObject<ProjectPlanningError>({ code: 'PLANNING_INVARIANT' });
      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database.exec('DROP TRIGGER ignore_rebalance_stage');
        database.exec(`
          CREATE TRIGGER ignore_rebalance_commit
          BEFORE UPDATE OF order_key ON plot_nodes
          WHEN OLD.order_key < 0 AND NEW.order_key >= 0
          BEGIN SELECT RAISE(IGNORE); END;
        `);
      });
      await expect(
        harness.planning.createPlotNode(randomUUID(), {
          projectId: project.projectId,
          parentId: null,
          nodeType: 'arc',
          title: '中间二',
          goal: '',
          coreConflict: '',
          expectedResult: '',
          status: 'pending',
          placement: { kind: 'after', siblingId: first.id },
        }),
      ).rejects.toMatchObject<ProjectPlanningError>({ code: 'PLANNING_INVARIANT' });
    } finally {
      await closeHarness(harness);
    }
  });

  it('raises invariant when move staging or final commit affects zero rows', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '规划移动零写', channel: '长篇', initialStructure: 'blank' },
        harness.parent,
      );
      const target = await createRoot(harness, project.projectId, '目标');
      const staging = await createRoot(harness, project.projectId, '暂存失败');
      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database.exec(`
          CREATE TRIGGER ignore_move_stage
          BEFORE UPDATE OF parent_id ON plot_nodes
          WHEN OLD.id = '${staging.id}' AND OLD.parent_id IS NOT NEW.parent_id
          BEGIN SELECT RAISE(IGNORE); END;
        `);
      });
      await expect(
        harness.planning.movePlotNode(randomUUID(), {
          projectId: project.projectId,
          nodeId: staging.id,
          targetParentId: target.id,
          placement: { kind: 'end' },
        }),
      ).rejects.toMatchObject<ProjectPlanningError>({ code: 'PLANNING_INVARIANT' });
      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database.exec('DROP TRIGGER ignore_move_stage');
      });

      const committed = await createRoot(harness, project.projectId, '提交失败');
      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database.exec(`
          CREATE TRIGGER ignore_move_commit
          BEFORE UPDATE OF order_key ON plot_nodes
          WHEN OLD.id = '${committed.id}'
            AND OLD.parent_id = '${target.id}'
            AND NEW.parent_id = '${target.id}'
            AND OLD.order_key IS NOT NEW.order_key
          BEGIN SELECT RAISE(IGNORE); END;
        `);
      });
      await expect(
        harness.planning.movePlotNode(randomUUID(), {
          projectId: project.projectId,
          nodeId: committed.id,
          targetParentId: target.id,
          placement: { kind: 'end' },
        }),
      ).rejects.toMatchObject<ProjectPlanningError>({ code: 'PLANNING_INVARIANT' });
    } finally {
      await closeHarness(harness);
    }
  });
});
