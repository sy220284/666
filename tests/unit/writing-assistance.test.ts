import { describe, expect, it, vi } from 'vitest';

import type {
  ContinuityCatalog,
  Entity,
  NarrativePlanningCatalog,
  PlotNode,
  SceneBeat,
  StoryTodo,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import {
  buildWritingAssistanceView,
  loadWritingAssistance,
} from '../../apps/desktop/renderer/src/features/writing/writing-assistance.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const chapterId = '22222222-2222-4222-8222-222222222222';
const characterId = '33333333-3333-4333-8333-333333333333';
const plotNodeId = '44444444-4444-4444-8444-444444444444';
const previousChapterId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const previousVersionId = '77777777-7777-4777-8777-777777777777';

function success<Data>(data: Data) {
  return Promise.resolve({ state: 'success' as const, data });
}

function unavailable() {
  return Promise.resolve({ state: 'error' as const, error: new Error('暂时不可用') });
}

function assistanceBridge(options?: {
  readonly finalVersionId?: string | null;
  readonly failSources?: boolean;
  readonly failVersion?: boolean;
  readonly failDraft?: boolean;
  readonly endingText?: string;
}): RendererBridgeAdapter {
  const finalVersionId =
    options?.finalVersionId === undefined ? previousVersionId : options.finalVersionId;
  const failSources = options?.failSources === true;
  const source = <Data>(data: Data) => (failSources ? unavailable() : success(data));
  return {
    planning: {
      listStructure: vi.fn(() =>
        source({
          volumes: [
            {
              chapters: [
                { id: previousChapterId, title: '上一章', finalVersionId },
                { id: chapterId, title: '当前章', finalVersionId: null },
              ],
            },
          ],
        }),
      ),
      listPlotNodes: vi.fn(() => source({ nodes: [] })),
      listSceneBeats: vi.fn(() => source({ beats: [] })),
    },
    canon: {
      list: vi.fn(() => source({ entities: [] })),
    },
    continuity: {
      list: vi.fn(() =>
        source({ projectId, entityStates: [], timelineEvents: [], knowledgeStates: [] }),
      ),
    },
    narrativePlanning: {
      list: vi.fn(() => source({ projectId, foreshadowings: [], characterArcs: [] })),
    },
    validation: {
      list: vi.fn(() => source({ todos: [] })),
    },
    version: {
      get: vi.fn(() =>
        options?.failVersion
          ? unavailable()
          : success({ blocks: [{ text: options?.endingText ?? '上一章定稿结尾' }] }),
      ),
    },
    draft: {
      open: vi.fn(() =>
        options?.failDraft
          ? unavailable()
          : success({ blocks: [{ text: options?.endingText ?? '上一章当前稿结尾' }] }),
      ),
    },
  } as RendererBridgeAdapter;
}

describe('本章写作辅助聚合', () => {
  it('只汇总当前章节关联的目标、人物状态、伏笔和待办', () => {
    const view = buildWritingAssistanceView({
      chapterId,
      chapterTitle: '第三章 夜渡清河',
      plotNodes: [
        {
          id: plotNodeId,
          projectId,
          parentId: null,
          nodeType: 'chapter',
          title: '第三章 夜渡清河',
          goal: '让主角确认追兵已经进入清河。',
          coreConflict: '救人与隐藏身份不可兼得。',
          expectedResult: '主角决定冒险带人过河。',
          orderKey: '1',
          status: 'outlined',
        } satisfies PlotNode,
      ],
      sceneBeats: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          projectId,
          chapterId,
          plotNodeId,
          title: '河边试探',
          goal: '通过对话确认追兵身份。',
          coreConflict: '双方都在隐藏目的。',
          expectedResult: '主角先一步识破暗号。',
          beatType: 'turn',
          wordTargetPercent: 40,
          required: true,
          orderKey: '1',
          characterIds: [characterId],
          locationIds: [],
          blockLinks: [],
          deletedAt: null,
          updatedAt: '2026-07-29T00:00:00.000Z',
        } satisfies SceneBeat,
      ],
      entities: [
        {
          id: characterId,
          projectId,
          entityType: 'character',
          name: '赵二',
          aliases: [],
          summary: '擅长在危局中做出快速判断。',
          status: 'active',
          archivedAt: null,
          createdAt: '2026-07-29T00:00:00.000Z',
          updatedAt: '2026-07-29T00:00:00.000Z',
          facts: [],
        } satisfies Entity,
      ],
      continuity: {
        projectId,
        entityStates: [
          {
            id: '66666666-6666-4666-8666-666666666666',
            projectId,
            entityId: characterId,
            stateKey: '伤势',
            value: '左肩带伤',
            validFromChapterId: chapterId,
            validUntilChapterId: null,
            recordStatus: 'current',
            evidence: [],
            sourceVersionId: '77777777-7777-4777-8777-777777777777',
            createdAt: '2026-07-29T00:00:00.000Z',
            supersededAt: null,
          },
        ],
        timelineEvents: [],
        knowledgeStates: [
          {
            id: '88888888-8888-4888-8888-888888888888',
            projectId,
            informationKey: '追兵暗号',
            characterId,
            knowledgeStatus: 'suspects',
            validFromChapterId: chapterId,
            validUntilChapterId: null,
            sourceVersionId: null,
            sourceLogicalBlockId: null,
            notes: '',
            recordStatus: 'current',
            createdAt: '2026-07-29T00:00:00.000Z',
            supersededAt: null,
          },
        ],
      } satisfies ContinuityCatalog,
      narrative: {
        projectId,
        foreshadowings: [
          {
            id: '99999999-9999-4999-8999-999999999999',
            projectId,
            title: '河灯暗号',
            description: '河灯数量对应追兵位置。',
            status: 'planted',
            revealFromChapterId: null,
            revealByChapterId: null,
            chapterLinks: [{ chapterId, role: 'reinforce' }],
            relations: [],
            attention: 'due',
            warnings: [],
            createdAt: '2026-07-29T00:00:00.000Z',
            updatedAt: '2026-07-29T00:00:00.000Z',
          },
        ],
        characterArcs: [],
      } satisfies NarrativePlanningCatalog,
      todos: [
        {
          todoId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          projectId,
          chapterId,
          sceneBeatId: null,
          logicalBlockId: null,
          validationIssueId: null,
          title: '补出赵二认出暗号的细节',
          status: 'open',
          createdAt: '2026-07-29T00:00:00.000Z',
          updatedAt: '2026-07-29T00:00:00.000Z',
          completedAt: null,
        } satisfies StoryTodo,
      ],
      previousEnding: {
        chapterId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        chapterTitle: '第二章 旧渡口',
        text: '河面最后一盏灯忽然灭了。',
        source: 'final-version',
      },
    });

    expect(view.goal?.goal).toContain('追兵');
    expect(view.sceneBeats).toEqual([
      expect.objectContaining({ title: '河边试探', required: true, wordTargetPercent: 40 }),
    ]);
    expect(view.characters).toEqual([
      expect.objectContaining({
        name: '赵二',
        states: [{ key: '伤势', value: '左肩带伤' }],
        knowledge: [{ information: '追兵暗号', status: 'suspects' }],
      }),
    ]);
    expect(view.foreshadowings[0]?.title).toBe('河灯暗号');
    expect(view.todos[0]?.title).toBe('补出赵二认出暗号的细节');
    expect(view.previousEnding?.text).toBe('河面最后一盏灯忽然灭了。');
  });

  it('不会把未关联人物和已完成待办带入当前章节', () => {
    const view = buildWritingAssistanceView({
      chapterId,
      chapterTitle: '空白章',
      plotNodes: [],
      sceneBeats: [],
      entities: [],
      continuity: {
        projectId,
        entityStates: [],
        timelineEvents: [],
        knowledgeStates: [],
      },
      narrative: { projectId, foreshadowings: [], characterArcs: [] },
      todos: [
        {
          todoId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          projectId,
          chapterId,
          sceneBeatId: null,
          logicalBlockId: null,
          validationIssueId: null,
          title: '已完成事项',
          status: 'done',
          createdAt: '2026-07-29T00:00:00.000Z',
          updatedAt: '2026-07-29T00:00:00.000Z',
          completedAt: '2026-07-29T00:00:00.000Z',
        },
      ],
      previousEnding: null,
    });

    expect(view.goal).toBeNull();
    expect(view.characters).toEqual([]);
    expect(view.todos).toEqual([]);
  });

  it('优先读取上一章定稿结尾并保留当前章节名称', async () => {
    const bridge = assistanceBridge();
    const view = await loadWritingAssistance(bridge, projectId, chapterId);
    expect(view.chapterTitle).toBe('当前章');
    expect(view.previousEnding).toEqual({
      chapterId: previousChapterId,
      chapterTitle: '上一章',
      text: '上一章定稿结尾',
      source: 'final-version',
    });
    expect(bridge.version.get).toHaveBeenCalledOnce();
    expect(bridge.draft.open).not.toHaveBeenCalled();
  });

  it('定稿读取失败时回退当前稿，并截取过长结尾', async () => {
    const ending = `${'开场'.repeat(400)}\n\n${'收束'.repeat(300)}`;
    const bridge = assistanceBridge({ failVersion: true, endingText: ending });
    const view = await loadWritingAssistance(bridge, projectId, chapterId);
    expect(view.previousEnding?.source).toBe('current-draft');
    expect(view.previousEnding?.text).toHaveLength(601);
    expect(view.previousEnding?.text.startsWith('…')).toBe(true);
    expect(view.warnings).toContain('上一章定稿暂时无法读取');
  });

  it('各聚合源和上一章当前稿不可用时安全返回空集合与中文说明', async () => {
    const failedSources = assistanceBridge({ failSources: true });
    const empty = await loadWritingAssistance(failedSources, projectId, chapterId);
    expect(empty).toMatchObject({
      chapterTitle: null,
      sceneBeats: [],
      characters: [],
      foreshadowings: [],
      todos: [],
      previousEnding: null,
    });
    expect(empty.warnings).toHaveLength(7);

    const failedDraft = assistanceBridge({
      finalVersionId: null,
      failDraft: true,
    });
    const withoutEnding = await loadWritingAssistance(failedDraft, projectId, chapterId);
    expect(withoutEnding.previousEnding).toBeNull();
    expect(withoutEnding.warnings).toContain('上一章当前稿暂时无法读取');
  });
});
