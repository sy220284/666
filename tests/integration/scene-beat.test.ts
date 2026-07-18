import { randomUUID } from 'node:crypto';
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

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-18T14:00:00.000Z') };

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

async function createHarness(
  faultInjector?: ConstructorParameters<typeof SceneBeatService>[1]['faultInjector'],
): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-scene-beat-'));
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
    beats: new SceneBeatService(workspace, { clock, faultInjector }),
  };
}

async function closeHarness(harness: Harness): Promise<void> {
  await harness.workspace.shutdown();
  await harness.appRuntime.close();
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const fields = {
  plotNodeId: null,
  goal: '让主角发现第一条反证',
  coreConflict: '目击证词与物证相反',
  expectedResult: '主角决定继续追查',
  beatType: 'turn' as const,
  wordTargetPercent: 18,
  required: true,
  characterIds: [],
  locationIds: [],
};

describe('M3-02 SceneBeat planning and正文 association', () => {
  it('creates, orders, soft-deletes, restores, and keeps Draft content unchanged', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: 'SceneBeat生命周期', channel: '长篇' },
        harness.parent,
      );
      const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      const beforeDraft = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      const linkedLogicalBlockId = beforeDraft.blocks[0]!.logicalBlockId;

      let list = await harness.beats.create(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        title: '发现反证',
        ...fields,
        placement: { kind: 'end' },
      });
      const first = list.beats[0]!;
      list = await harness.beats.create(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        title: '决定追查',
        ...fields,
        beatType: 'development',
        required: false,
        placement: { kind: 'end' },
      });
      const second = list.beats.find((beat) => beat.title === '决定追查')!;
      list = await harness.beats.move(randomUUID(), {
        projectId: project.projectId,
        sceneBeatId: second.id,
        chapterId: chapter.id,
        placement: { kind: 'before', siblingId: first.id },
      });
      expect(list.beats.map((beat) => beat.title)).toEqual(['决定追查', '发现反证']);

      list = await harness.beats.setBlockLinks(randomUUID(), {
        projectId: project.projectId,
        sceneBeatId: first.id,
        logicalBlockIds: [linkedLogicalBlockId],
      });
      expect(list.beats.find((beat) => beat.id === first.id)?.blockLinks).toHaveLength(1);

      list = await harness.beats.delete(randomUUID(), {
        projectId: project.projectId,
        sceneBeatId: first.id,
      });
      expect(list.deletedBeats.map((beat) => beat.id)).toContain(first.id);
      expect(list.deletedBeats.find((beat) => beat.id === first.id)?.blockLinks).toEqual([]);
      expect(
        await harness.drafts.open(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
        }),
      ).toEqual(beforeDraft);

      list = await harness.beats.restore(randomUUID(), {
        projectId: project.projectId,
        sceneBeatId: first.id,
        placement: { kind: 'end' },
      });
      expect(list.beats.at(-1)?.id).toBe(first.id);
      expect(list.beats.at(-1)?.blockLinks).toEqual([]);
    } finally {
      await closeHarness(harness);
    }
  });

  it('converts selected blocks and moves planning across chapters without changing正文 revisions', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: 'SceneBeat跨章', channel: '长篇' },
        harness.parent,
      );
      const first = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      const structure = await harness.structure.createChapter(randomUUID(), {
        projectId: project.projectId,
        volumeId: first.volumeId,
        title: '第二章',
        placement: { kind: 'end' },
      });
      const second = structure.volumes[0]!.chapters[1]!;
      const sourceDraft = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: first.id,
      });
      const targetDraft = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: second.id,
      });

      const list = await harness.beats.convertBlocks(randomUUID(), {
        projectId: project.projectId,
        chapterId: first.id,
        logicalBlockIds: [sourceDraft.blocks[0]!.logicalBlockId],
        title: '跨章伏笔',
        ...fields,
        placement: { kind: 'end' },
      });
      const beat = list.beats[0]!;
      const previewInput = {
        projectId: project.projectId,
        sceneBeatId: beat.id,
        targetChapterId: second.id,
        placement: { kind: 'end' as const },
      };
      const preview = harness.beats.previewCrossChapterMove(previewInput);
      expect(preview).toMatchObject({
        sourceChapterId: first.id,
        targetChapterId: second.id,
        linkedBlockCount: 1,
        canExecute: true,
      });
      expect(preview.warnings.join('')).toContain('正文');

      const moved = await harness.beats.moveAcrossChapters(randomUUID(), {
        ...previewInput,
        planHash: preview.planHash,
      });
      expect(moved.beats[0]).toMatchObject({ id: beat.id, chapterId: second.id });
      expect(moved.beats[0]!.blockLinks[0]).toMatchObject({ chapterId: first.id });
      expect(
        await harness.drafts.open(randomUUID(), {
          projectId: project.projectId,
          chapterId: first.id,
        }),
      ).toEqual(sourceDraft);
      expect(
        await harness.drafts.open(randomUUID(), {
          projectId: project.projectId,
          chapterId: second.id,
        }),
      ).toEqual(targetDraft);
    } finally {
      await closeHarness(harness);
    }
  });

  it('rolls back interrupted writes and rejects stale cross-chapter plans', async () => {
    let fail = true;
    const harness = await createHarness((stage) => {
      if (fail && stage === 'after-beat-write') throw new Error('INJECTED_SCENE_BEAT_FAILURE');
    });
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: 'SceneBeat事务', channel: '长篇' },
        harness.parent,
      );
      const first = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      const structure = await harness.structure.createChapter(randomUUID(), {
        projectId: project.projectId,
        volumeId: first.volumeId,
        title: '第二章',
      });
      const second = structure.volumes[0]!.chapters[1]!;
      await expect(
        harness.beats.create(randomUUID(), {
          projectId: project.projectId,
          chapterId: first.id,
          title: '应回滚',
          ...fields,
        }),
      ).rejects.toThrow('INJECTED_SCENE_BEAT_FAILURE');
      expect(
        harness.beats.list({ projectId: project.projectId, chapterId: first.id }).beats,
      ).toEqual([]);

      fail = false;
      const created = await harness.beats.create(randomUUID(), {
        projectId: project.projectId,
        chapterId: first.id,
        title: '新计划',
        ...fields,
      });
      const beat = created.beats[0]!;
      const input = {
        projectId: project.projectId,
        sceneBeatId: beat.id,
        targetChapterId: second.id,
        placement: { kind: 'end' as const },
      };
      const preview = harness.beats.previewCrossChapterMove(input);
      await harness.beats.update(randomUUID(), {
        projectId: project.projectId,
        sceneBeatId: beat.id,
        patch: { goal: '预览后发生变化' },
      });
      await expect(
        harness.beats.moveAcrossChapters(randomUUID(), { ...input, planHash: preview.planHash }),
      ).rejects.toMatchObject({ code: 'SCENE_BEAT_CONFLICT' });
    } finally {
      await closeHarness(harness);
    }
  });
});
