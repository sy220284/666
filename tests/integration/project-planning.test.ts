import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { CandidateService } from '../../packages/core-service/src/candidate.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import { ProjectPlanningService } from '../../packages/core-service/src/project-planning.js';
import type { ProjectPlanningError } from '../../packages/core-service/src/project-planning.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { VersionService } from '../../packages/core-service/src/version.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-18T12:30:00.000Z') };

interface Harness {
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly planning: ProjectPlanningService;
  readonly drafts: DraftService;
  readonly versions: VersionService;
  readonly candidates: CandidateService;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-project-planning-'));
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
    planning: new ProjectPlanningService(workspace, { clock }),
    drafts: new DraftService(workspace, { clock }),
    versions: new VersionService(workspace, { clock }),
    candidates: new CandidateService(workspace, { clock }),
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

describe('M3-01 ProjectBrief and PlotNode planning', () => {
  it('supports skipping the brief, filling it later, and reopening the same authoritative data', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '可跳过任务书', channel: '长篇', initialStructure: 'blank' },
        harness.parent,
      );
      expect(harness.planning.getBrief(project.projectId)).toEqual({
        id: null,
        projectId: project.projectId,
        concept: '',
        readingPromise: '',
        protagonistGoal: '',
        coreConflict: '',
        endingIntent: '',
        required: [],
        forbidden: [],
        updatedAt: null,
      });
      expect(harness.planning.listPlotNodes(project.projectId)).toEqual({
        projectId: project.projectId,
        nodes: [],
      });

      const updated = await harness.planning.updateBrief(randomUUID(), {
        projectId: project.projectId,
        concept: '一个失去名字的人追查被改写的历史。',
        readingPromise: '持续升级的谜团与可验证的线索回收。',
        protagonistGoal: '找回自己的名字并阻止第二次改写。',
        coreConflict: '个人记忆与权威档案互相否定。',
        endingIntent: '主角公开真相，但保留一个无法证实的缺口。',
        required: ['每卷回收至少一个核心线索', '主角始终保有主动选择'],
        forbidden: ['无代价复活', '靠误会拖延主线'],
      });
      expect(updated).toMatchObject({
        id: expect.any(String),
        concept: '一个失去名字的人追查被改写的历史。',
        required: ['每卷回收至少一个核心线索', '主角始终保有主动选择'],
        updatedAt: clock.now().toISOString(),
      });

      await harness.workspace.close(randomUUID(), project.projectId);
      await harness.workspace.open(randomUUID(), { workspacePath: project.workspacePath });
      expect(harness.planning.getBrief(project.projectId)).toEqual(updated);
    } finally {
      await closeHarness(harness);
    }
  });

  it('creates a hierarchical outline, reorders it atomically, and rejects cycles', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '大纲树事务', channel: '悬疑', initialStructure: 'blank' },
        harness.parent,
      );
      let outline = await harness.planning.createPlotNode(randomUUID(), {
        projectId: project.projectId,
        parentId: null,
        nodeType: 'volume',
        title: '第一卷',
        goal: '建立谜团',
        coreConflict: '主角不被任何档案承认',
        expectedResult: '主角获得第一份反证',
        status: 'outlined',
        placement: { kind: 'end' },
      });
      const firstVolume = outline.nodes[0]!;
      outline = await harness.planning.createPlotNode(randomUUID(), {
        projectId: project.projectId,
        parentId: null,
        nodeType: 'volume',
        title: '第二卷',
        goal: '扩大谜团',
        coreConflict: '',
        expectedResult: '',
        status: 'pending',
        placement: { kind: 'end' },
      });
      const secondVolume = outline.nodes.find((node) => node.title === '第二卷')!;
      outline = await harness.planning.createPlotNode(randomUUID(), {
        projectId: project.projectId,
        parentId: firstVolume.id,
        nodeType: 'arc',
        title: '失名案',
        goal: '证明主角曾经存在',
        coreConflict: '所有证人记忆一致但物证相反',
        expectedResult: '找到被删改的原始编号',
        status: 'outlined',
        placement: { kind: 'end' },
      });
      const arc = outline.nodes.find((node) => node.title === '失名案')!;
      outline = await harness.planning.createPlotNode(randomUUID(), {
        projectId: project.projectId,
        parentId: firstVolume.id,
        nodeType: 'chapter',
        title: '雨夜档案室',
        goal: '取得原始卷宗',
        coreConflict: '卷宗与值班记录互相矛盾',
        expectedResult: '主角带走编号残页',
        status: 'pending',
        placement: { kind: 'after', siblingId: arc.id },
      });
      const chapter = outline.nodes.find((node) => node.title === '雨夜档案室')!;

      const beforeFailure = harness.planning.listPlotNodes(project.projectId);
      const faulty = new ProjectPlanningService(harness.workspace, {
        clock,
        faultInjector: (stage) => {
          if (stage === 'after-node-move') throw new Error('injected-outline-move-failure');
        },
      });
      await expect(
        faulty.movePlotNode(randomUUID(), {
          projectId: project.projectId,
          nodeId: chapter.id,
          targetParentId: secondVolume.id,
          placement: { kind: 'end' },
        }),
      ).rejects.toThrow('injected-outline-move-failure');
      expect(harness.planning.listPlotNodes(project.projectId)).toEqual(beforeFailure);

      const moved = await harness.planning.movePlotNode(randomUUID(), {
        projectId: project.projectId,
        nodeId: chapter.id,
        targetParentId: secondVolume.id,
        placement: { kind: 'end' },
      });
      expect(moved.nodes.find((node) => node.id === chapter.id)?.parentId).toBe(secondVolume.id);

      await expect(
        harness.planning.movePlotNode(randomUUID(), {
          projectId: project.projectId,
          nodeId: firstVolume.id,
          targetParentId: arc.id,
          placement: { kind: 'end' },
        }),
      ).rejects.toMatchObject<ProjectPlanningError>({ code: 'PLANNING_INVALID_POSITION' });
    } finally {
      await closeHarness(harness);
    }
  });

  it('rebalances adjacent sibling order keys without violating the unique index', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '大纲键重排', channel: '长篇', initialStructure: 'blank' },
        harness.parent,
      );
      let outline = await harness.planning.createPlotNode(randomUUID(), {
        projectId: project.projectId,
        parentId: null,
        nodeType: 'volume',
        title: '前节点',
        goal: '',
        coreConflict: '',
        expectedResult: '',
        status: 'pending',
        placement: { kind: 'end' },
      });
      const first = outline.nodes[0]!;
      outline = await harness.planning.createPlotNode(randomUUID(), {
        projectId: project.projectId,
        parentId: null,
        nodeType: 'volume',
        title: '后节点',
        goal: '',
        coreConflict: '',
        expectedResult: '',
        status: 'pending',
        placement: { kind: 'end' },
      });
      const second = outline.nodes.find((node) => node.title === '后节点')!;
      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database.prepare('UPDATE plot_nodes SET order_key = 1 WHERE id = ?').run(first.id);
        database.prepare('UPDATE plot_nodes SET order_key = 2 WHERE id = ?').run(second.id);
      });

      const rebalanced = await harness.planning.createPlotNode(randomUUID(), {
        projectId: project.projectId,
        parentId: null,
        nodeType: 'arc',
        title: '中间节点',
        goal: '',
        coreConflict: '',
        expectedResult: '',
        status: 'pending',
        placement: { kind: 'after', siblingId: first.id },
      });
      const ordered = [...rebalanced.nodes].sort((left, right) =>
        BigInt(left.orderKey) < BigInt(right.orderKey) ? -1 : 1,
      );
      expect(ordered.map((node) => node.title)).toEqual(['前节点', '中间节点', '后节点']);
      expect(new Set(ordered.map((node) => node.orderKey)).size).toBe(3);
    } finally {
      await closeHarness(harness);
    }
  });

  it('changes planning data without changing Draft, Version, Candidate, or PatchLog state', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '规划隔离', channel: '长篇' },
        harness.parent,
      );
      const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      const draft = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      const version = await harness.versions.create(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseRevision: draft.revision,
        title: '规划前版本',
      });
      const source = draft.blocks[0]!;
      const candidate = await harness.candidates.createFixture(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseDraftRevision: draft.revision,
        candidateType: 'rewrite',
        completeness: 'partial',
        title: '规划隔离候选',
        blocks: [
          {
            logicalBlockId: source.logicalBlockId,
            blockType: source.blockType,
            text: '候选文本',
            attributes: source.attributes,
            sourceBlockHash: source.contentHash,
          },
        ],
      });
      const before = {
        draft: await harness.drafts.open(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
        }),
        version: harness.versions.get({
          projectId: project.projectId,
          chapterId: chapter.id,
          versionId: version.versionId,
        }),
        candidate: harness.candidates.get({
          projectId: project.projectId,
          chapterId: chapter.id,
          candidateId: candidate.candidateId,
        }),
        patchCount: harness.workspace.readProject(project.projectId, (database) =>
          Number(database.prepare('SELECT COUNT(*) AS count FROM draft_patch_log').get()!.count),
        ),
      };

      await harness.planning.updateBrief(randomUUID(), {
        projectId: project.projectId,
        concept: '规划变化不触碰正文',
        readingPromise: '',
        protagonistGoal: '',
        coreConflict: '',
        endingIntent: '',
        required: [],
        forbidden: [],
      });
      const outline = await harness.planning.createPlotNode(randomUUID(), {
        projectId: project.projectId,
        parentId: null,
        nodeType: 'arc',
        title: '独立规划线',
        goal: '验证隔离',
        coreConflict: '',
        expectedResult: '',
        status: 'pending',
        placement: { kind: 'end' },
      });
      await harness.planning.updatePlotNode(randomUUID(), {
        projectId: project.projectId,
        nodeId: outline.nodes[0]!.id,
        patch: { status: 'outlined', expectedResult: '规划已保存' },
      });

      expect(
        await harness.drafts.open(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
        }),
      ).toEqual(before.draft);
      expect(
        harness.versions.get({
          projectId: project.projectId,
          chapterId: chapter.id,
          versionId: version.versionId,
        }),
      ).toEqual(before.version);
      expect(
        harness.candidates.get({
          projectId: project.projectId,
          chapterId: chapter.id,
          candidateId: candidate.candidateId,
        }),
      ).toEqual(before.candidate);
      expect(
        harness.workspace.readProject(project.projectId, (database) =>
          Number(database.prepare('SELECT COUNT(*) AS count FROM draft_patch_log').get()!.count),
        ),
      ).toBe(before.patchCount);
    } finally {
      await closeHarness(harness);
    }
  });
});
