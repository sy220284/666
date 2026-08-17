import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import { ProjectPlanningService } from '../../packages/core-service/src/project-planning.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { SceneBeatService } from '../../packages/core-service/src/scene-beat.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const directories: string[] = [];
const clock = { now: () => new Date('2026-08-17T00:00:00.000Z') };
const fields = {
  plotNodeId: null,
  goal: '推进目标',
  coreConflict: '核心冲突',
  expectedResult: '预期结果',
  beatType: 'turn' as const,
  wordTargetPercent: 20,
  required: true,
  characterIds: [],
  locationIds: [],
};

interface Harness {
  readonly root: string;
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly planning: ProjectPlanningService;
  readonly drafts: DraftService;
  readonly beats: SceneBeatService;
}

async function harness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-scene-beat-edge-'));
  directories.push(root);
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
    projectMigrationRecoveryDirectory: path.join(root, 'migration-recovery'),
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
    planning: new ProjectPlanningService(workspace, { clock }),
    drafts: new DraftService(workspace, { clock }),
    beats: new SceneBeatService(workspace, { clock }),
  };
}

async function close(value: Harness): Promise<void> {
  await value.workspace.shutdown();
  await value.appRuntime.close();
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function seed(value: Harness, name = 'SceneBeat边界') {
  const project = await value.workspace.create(
    randomUUID(),
    { name, channel: '长篇' },
    value.parent,
  );
  const first = value.structure.list(project.projectId).volumes[0]!.chapters[0]!;
  const structure = await value.structure.createChapter(randomUUID(), {
    projectId: project.projectId,
    volumeId: first.volumeId,
    title: '第二章',
    placement: { kind: 'end' },
  });
  return { project, first, second: structure.volumes[0]!.chapters[1]! };
}

function fakeReadService(row: Record<string, unknown>, projectFound = true): SceneBeatService {
  const connection = contractInput<DatabaseSync>({
    prepare: (sql: string) => ({
      get: (..._args: unknown[]) => {
        if (sql.includes('SELECT 1 FROM projects')) return projectFound ? { found: 1 } : undefined;
        if (sql.includes('FROM chapters chapter')) return { found: 1 };
        throw new Error(`UNEXPECTED_FAKE_GET:${sql}`);
      },
      all: (..._args: unknown[]) => {
        if (sql.includes('FROM scene_beats')) return [row];
        if (sql.includes('FROM scene_beat_block_links')) return [];
        throw new Error(`UNEXPECTED_FAKE_ALL:${sql}`);
      },
    }),
  });
  const workspace = contractInput<ProjectWorkspaceService>({
    readProject: (_projectId: string, operation: (database: DatabaseSync) => unknown) =>
      operation(connection),
  });
  return new SceneBeatService(workspace);
}

function rebalanceFailureService(failOnApplyRun: number): SceneBeatService {
  const currentId = randomUUID();
  const chapterId = randomUUID();
  const firstId = randomUUID();
  const secondId = randomUUID();
  let orderUpdatePrepareCount = 0;
  let applyRunCount = 0;
  const connection = contractInput<DatabaseSync>({
    prepare: (sql: string) => {
      if (sql.includes('FROM scene_beats') && sql.includes('WHERE id = ? AND project_id = ?')) {
        return {
          get: () => ({ id: currentId, projectId: randomUUID(), chapterId }),
        };
      }
      if (sql.includes('SELECT id, order_key AS orderKey')) {
        return {
          all: () => [
            { id: firstId, orderKey: 1n },
            { id: secondId, orderKey: 2n },
          ],
        };
      }
      if (sql.includes('SELECT MIN(order_key) AS minimum')) {
        return { get: () => ({ minimum: 1n, maximum: 3n }) };
      }
      if (sql === 'UPDATE scene_beats SET order_key = ? WHERE id = ?') {
        orderUpdatePrepareCount += 1;
        if (orderUpdatePrepareCount === 1) return { run: () => ({ changes: 1 }) };
        return {
          run: () => {
            applyRunCount += 1;
            return { changes: applyRunCount === failOnApplyRun ? 0 : 1 };
          },
        };
      }
      throw new Error(`UNEXPECTED_REBALANCE_SQL:${sql}`);
    },
  });
  const workspace = contractInput<ProjectWorkspaceService>({
    writeProject: async (
      _requestId: string,
      _projectId: string,
      operation: (database: DatabaseSync) => unknown,
    ) => operation(connection),
  });
  const service = new SceneBeatService(workspace);
  Object.assign(service, { __currentId: currentId, __secondId: secondId, __chapterId: chapterId });
  return service;
}

function fakeRow(): Record<string, unknown> {
  return {
    id: randomUUID(),
    projectId: randomUUID(),
    chapterId: randomUUID(),
    plotNodeId: null,
    title: '受控行',
    goal: '目标',
    coreConflict: '冲突',
    expectedResult: '结果',
    beatType: 'turn',
    wordTargetPercent: 20,
    isRequired: 1,
    orderKey: 1024,
    characterIdsJson: '[]',
    locationIdsJson: '[]',
    deletedAt: null,
    updatedAt: '2026-08-17T00:00:00.000Z',
  };
}

describe('SceneBeat defensive and boundary coverage', () => {
  it('surfaces both rebalance write invariants when a planned sibling update affects no row', async () => {
    for (const failOnApplyRun of [1, 3]) {
      const service = rebalanceFailureService(failOnApplyRun) as SceneBeatService & {
        __currentId: string;
        __secondId: string;
        __chapterId: string;
      };
      await expect(
        service.move(randomUUID(), {
          projectId: randomUUID(),
          sceneBeatId: service.__currentId,
          chapterId: service.__chapterId,
          placement: { kind: 'before', siblingId: service.__secondId },
        }),
      ).rejects.toMatchObject({ code: 'SCENE_BEAT_INVARIANT' });
    }
  });

  it('rejects corrupt persisted scalar types and a missing persisted project', () => {
    const valid = fakeRow();
    const projectId = String(valid.projectId);
    const chapterId = String(valid.chapterId);
    expect(fakeReadService(valid).list({ projectId, chapterId }).beats).toHaveLength(1);

    expect(() =>
      fakeReadService({ ...valid, title: 7 }).list({ projectId, chapterId }),
    ).toThrowError(expect.objectContaining({ code: 'SCENE_BEAT_INVARIANT' }));
    expect(() =>
      fakeReadService({ ...valid, orderKey: 1.5 }).list({ projectId, chapterId }),
    ).toThrowError(expect.objectContaining({ code: 'SCENE_BEAT_INVARIANT' }));
    expect(() => fakeReadService(valid, false).list({ projectId, chapterId })).toThrowError(
      expect.objectContaining({ code: 'SCENE_BEAT_NOT_FOUND' }),
    );
  });

  it('rejects missing project/chapter/plot node/beat and duplicate titles or invalid positions', async () => {
    const value = await harness();
    try {
      const { project, first } = await seed(value);
      expect(() =>
        value.beats.list({ projectId: project.projectId, chapterId: randomUUID() }),
      ).toThrowError(expect.objectContaining({ code: 'SCENE_BEAT_NOT_FOUND' }));

      await expect(
        value.beats.create(randomUUID(), {
          projectId: project.projectId,
          chapterId: first.id,
          title: '无效节点',
          ...fields,
          plotNodeId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'SCENE_BEAT_NOT_FOUND' });

      const created = await value.beats.create(randomUUID(), {
        projectId: project.projectId,
        chapterId: first.id,
        title: '唯一标题',
        ...fields,
      });
      const beat = created.beats[0]!;
      await expect(
        value.beats.create(randomUUID(), {
          projectId: project.projectId,
          chapterId: first.id,
          title: '唯一标题',
          ...fields,
        }),
      ).rejects.toMatchObject({ code: 'SCENE_BEAT_CONFLICT' });
      await expect(
        value.beats.move(randomUUID(), {
          projectId: project.projectId,
          sceneBeatId: beat.id,
          chapterId: first.id,
          placement: { kind: 'before', siblingId: randomUUID() },
        }),
      ).rejects.toMatchObject({ code: 'SCENE_BEAT_INVALID_POSITION' });
      await expect(
        value.beats.update(randomUUID(), {
          projectId: project.projectId,
          sceneBeatId: randomUUID(),
          patch: { goal: '不存在' },
        }),
      ).rejects.toMatchObject({ code: 'SCENE_BEAT_NOT_FOUND' });
    } finally {
      await close(value);
    }
  });

  it('covers block-link empty, missing and ownership-conflict paths', async () => {
    const value = await harness();
    try {
      const { project, first } = await seed(value, 'SceneBeat块关联');
      const draft = await value.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: first.id,
      });
      const logicalBlockId = draft.blocks[0]!.logicalBlockId;
      const created = await value.beats.create(randomUUID(), {
        projectId: project.projectId,
        chapterId: first.id,
        title: '第一节拍',
        ...fields,
      });
      const firstBeat = created.beats[0]!;
      const withSecond = await value.beats.create(randomUUID(), {
        projectId: project.projectId,
        chapterId: first.id,
        title: '第二节拍',
        ...fields,
      });
      const secondBeat = withSecond.beats.find((item) => item.title === '第二节拍')!;

      await expect(
        value.beats.setBlockLinks(randomUUID(), {
          projectId: project.projectId,
          sceneBeatId: firstBeat.id,
          logicalBlockIds: [],
        }),
      ).resolves.toMatchObject({ beats: expect.any(Array) });
      await expect(
        value.beats.setBlockLinks(randomUUID(), {
          projectId: project.projectId,
          sceneBeatId: firstBeat.id,
          logicalBlockIds: [randomUUID()],
        }),
      ).rejects.toMatchObject({ code: 'SCENE_BEAT_NOT_FOUND' });
      await value.beats.setBlockLinks(randomUUID(), {
        projectId: project.projectId,
        sceneBeatId: firstBeat.id,
        logicalBlockIds: [logicalBlockId],
      });
      await expect(
        value.beats.setBlockLinks(randomUUID(), {
          projectId: project.projectId,
          sceneBeatId: secondBeat.id,
          logicalBlockIds: [logicalBlockId],
        }),
      ).rejects.toMatchObject({ code: 'SCENE_BEAT_CONFLICT' });
    } finally {
      await close(value);
    }
  });

  it('covers same-chapter and duplicate-title previews, direct cross-chapter rejection and restore guards', async () => {
    const value = await harness();
    try {
      const { project, first, second } = await seed(value, 'SceneBeat跨章边界');
      const firstList = await value.beats.create(randomUUID(), {
        projectId: project.projectId,
        chapterId: first.id,
        title: '同名节拍',
        ...fields,
      });
      const beat = firstList.beats[0]!;

      const same = value.beats.previewCrossChapterMove({
        projectId: project.projectId,
        sceneBeatId: beat.id,
        targetChapterId: first.id,
        placement: { kind: 'end' },
      });
      expect(same.canExecute).toBe(false);
      expect(same.warnings.join('')).toContain('当前章节相同');

      await value.beats.create(randomUUID(), {
        projectId: project.projectId,
        chapterId: second.id,
        title: '同名节拍',
        ...fields,
      });
      await value.beats.create(randomUUID(), {
        projectId: project.projectId,
        chapterId: second.id,
        title: '目标兄弟',
        ...fields,
      });
      const duplicate = value.beats.previewCrossChapterMove({
        projectId: project.projectId,
        sceneBeatId: beat.id,
        targetChapterId: second.id,
        placement: { kind: 'end' },
      });
      expect(duplicate.canExecute).toBe(false);
      expect(duplicate.warnings.join('')).toContain('同名');

      await expect(
        value.beats.move(randomUUID(), {
          projectId: project.projectId,
          sceneBeatId: beat.id,
          chapterId: second.id,
          placement: { kind: 'end' },
        }),
      ).rejects.toMatchObject({ code: 'SCENE_BEAT_INVALID_POSITION' });
      await expect(
        value.beats.restore(randomUUID(), {
          projectId: project.projectId,
          sceneBeatId: beat.id,
        }),
      ).rejects.toMatchObject({ code: 'SCENE_BEAT_CONFLICT' });

      await value.beats.delete(randomUUID(), {
        projectId: project.projectId,
        sceneBeatId: beat.id,
      });
      const restored = await value.beats.restore(randomUUID(), {
        projectId: project.projectId,
        sceneBeatId: beat.id,
      });
      expect(restored.beats.some((item) => item.id === beat.id)).toBe(true);
    } finally {
      await close(value);
    }
  });

  it('covers valid plot-node updates and persisted entity/number invariant failures', async () => {
    const value = await harness();
    try {
      const { project, first } = await seed(value, 'SceneBeat持久化防御');
      const outline = await value.planning.createPlotNode(randomUUID(), {
        projectId: project.projectId,
        parentId: null,
        nodeType: 'volume',
        title: '节点',
        goal: '节点目标',
        coreConflict: '',
        expectedResult: '',
        status: 'outlined',
        placement: { kind: 'end' },
      });
      const plotNode = outline.nodes[0]!;
      const created = await value.beats.create(randomUUID(), {
        projectId: project.projectId,
        chapterId: first.id,
        title: '可更新',
        ...fields,
      });
      const beat = created.beats[0]!;
      const updated = await value.beats.update(randomUUID(), {
        projectId: project.projectId,
        sceneBeatId: beat.id,
        patch: {
          plotNodeId: plotNode.id,
          title: '更新标题',
          goal: '更新目标',
          coreConflict: '更新冲突',
          expectedResult: '更新结果',
          beatType: 'development',
          wordTargetPercent: 25,
          required: false,
          characterIds: [],
          locationIds: [],
        },
      });
      expect(updated.beats[0]).toMatchObject({
        plotNodeId: plotNode.id,
        title: '更新标题',
        required: false,
      });

      await value.workspace.writeProject(randomUUID(), project.projectId, (connection) => {
        connection.exec('PRAGMA ignore_check_constraints = ON');
        connection
          .prepare('UPDATE scene_beats SET character_ids_json = ? WHERE id = ?')
          .run('{}', beat.id);
        connection.exec('PRAGMA ignore_check_constraints = OFF');
      });
      expect(() =>
        value.beats.list({ projectId: project.projectId, chapterId: first.id }),
      ).toThrowError(expect.objectContaining({ code: 'SCENE_BEAT_INVARIANT' }));

      await value.workspace.writeProject(randomUUID(), project.projectId, (connection) => {
        connection.exec('PRAGMA ignore_check_constraints = ON');
        connection
          .prepare(
            'UPDATE scene_beats SET character_ids_json = ?, word_target_percent = ? WHERE id = ?',
          )
          .run('[]', 9_007_199_254_740_992n, beat.id);
        connection.exec('PRAGMA ignore_check_constraints = OFF');
      });
      expect(() =>
        value.beats.list({ projectId: project.projectId, chapterId: first.id }),
      ).toThrowError(expect.objectContaining({ code: 'SCENE_BEAT_INVARIANT' }));
    } finally {
      await close(value);
    }
  });

  it('uses the upper temporary range when the lower bound is exhausted and rejects a fully exhausted range', async () => {
    const value = await harness();
    try {
      const { project, first } = await seed(value, 'SceneBeat排序极值');
      const one = await value.beats.create(randomUUID(), {
        projectId: project.projectId,
        chapterId: first.id,
        title: '甲',
        ...fields,
      });
      const firstBeat = one.beats[0]!;
      const two = await value.beats.create(randomUUID(), {
        projectId: project.projectId,
        chapterId: first.id,
        title: '乙',
        ...fields,
      });
      const secondBeat = two.beats.find((item) => item.title === '乙')!;
      const three = await value.beats.create(randomUUID(), {
        projectId: project.projectId,
        chapterId: first.id,
        title: '丙',
        ...fields,
      });
      const thirdBeat = three.beats.find((item) => item.title === '丙')!;

      await value.workspace.writeProject(randomUUID(), project.projectId, (connection) => {
        connection
          .prepare('UPDATE scene_beats SET order_key = ? WHERE id = ?')
          .run(1n, firstBeat.id);
        connection
          .prepare('UPDATE scene_beats SET order_key = ? WHERE id = ?')
          .run(2n, secondBeat.id);
        connection
          .prepare('UPDATE scene_beats SET order_key = ? WHERE id = ?')
          .run(3n, thirdBeat.id);
      });
      await expect(
        value.beats.move(randomUUID(), {
          projectId: project.projectId,
          sceneBeatId: thirdBeat.id,
          chapterId: first.id,
          placement: { kind: 'before', siblingId: secondBeat.id },
        }),
      ).resolves.toMatchObject({ beats: expect.any(Array) });

      await value.workspace.writeProject(randomUUID(), project.projectId, (connection) => {
        connection
          .prepare('UPDATE scene_beats SET order_key = ? WHERE id = ?')
          .run(-9_223_372_036_854_775_808n, firstBeat.id);
        connection
          .prepare('UPDATE scene_beats SET order_key = ? WHERE id = ?')
          .run(-9_223_372_036_854_775_807n, secondBeat.id);
      });
      await expect(
        value.beats.move(randomUUID(), {
          projectId: project.projectId,
          sceneBeatId: secondBeat.id,
          chapterId: first.id,
          placement: { kind: 'end' },
        }),
      ).resolves.toMatchObject({ beats: expect.any(Array) });

      await value.workspace.writeProject(randomUUID(), project.projectId, (connection) => {
        connection
          .prepare('UPDATE scene_beats SET order_key = ? WHERE id = ?')
          .run(-9_223_372_036_854_775_808n, firstBeat.id);
        connection
          .prepare('UPDATE scene_beats SET order_key = ? WHERE id = ?')
          .run(9_223_372_036_854_775_807n, secondBeat.id);
      });
      await expect(
        value.beats.move(randomUUID(), {
          projectId: project.projectId,
          sceneBeatId: secondBeat.id,
          chapterId: first.id,
          placement: { kind: 'end' },
        }),
      ).rejects.toMatchObject({ code: 'SCENE_BEAT_INVARIANT' });
    } finally {
      await close(value);
    }
  });
});
