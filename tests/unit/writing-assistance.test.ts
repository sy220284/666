import { describe, expect, it, vi } from 'vitest';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { loadWritingAssistance } from '../../apps/desktop/renderer/src/features/writing/writing-assistance.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const chapterId = '22222222-2222-4222-8222-222222222222';
const characterId = '33333333-3333-4333-8333-333333333333';
const previousChapterId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const previousVersionId = '77777777-7777-4777-8777-777777777777';

function success<Data>(data: Data) {
  return Promise.resolve({ state: 'success' as const, data });
}

function unavailable() {
  return Promise.resolve({
    state: 'failure' as const,
    error: { code: 'COMMON_INTERNAL_999', message: '暂时不可用', retryable: true },
  });
}

function chapterAssist(previousVersion: string | null = previousVersionId) {
  return {
    view: 'chapter_assist' as const,
    projectId,
    bounded: true as const,
    chapterId,
    chapterTitle: '当前章',
    goal: {
      title: '过河',
      goal: '确认追兵位置',
      coreConflict: '救人与隐藏身份不可兼得',
      expectedResult: '主角决定冒险过河',
    },
    sceneBeats: [
      {
        id: '55555555-5555-4555-8555-555555555555',
        title: '河边试探',
        goal: '确认暗号',
        required: true,
        wordTargetPercent: 40,
      },
    ],
    characters: [
      {
        id: characterId,
        name: '赵二',
        summary: '擅长在危局中快速判断。',
        states: [{ key: '伤势', value: '左肩带伤' }],
        knowledge: [{ information: '追兵暗号', status: 'suspects' as const }],
      },
    ],
    relationships: [],
    timeline: [],
    foreshadowings: [
      {
        id: '99999999-9999-4999-8999-999999999999',
        title: '河灯暗号',
        description: '河灯数量对应追兵位置。',
        status: 'planted',
        attention: 'due' as const,
        revealFromChapterId: null,
        revealByChapterId: null,
      },
    ],
    milestones: [],
    todos: [
      {
        todoId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        projectId,
        chapterId,
        sceneBeatId: null,
        logicalBlockId: null,
        validationIssueId: null,
        title: '补出赵二认出暗号的细节',
        status: 'open' as const,
        createdAt: '2026-07-29T00:00:00.000Z',
        updatedAt: '2026-07-29T00:00:00.000Z',
        completedAt: null,
      },
    ],
    previousChapter: {
      chapterId: previousChapterId,
      chapterTitle: '上一章',
      finalVersionId: previousVersion,
    },
  };
}

function assistanceBridge(options?: {
  readonly failProjection?: boolean;
  readonly failVersion?: boolean;
  readonly failDraft?: boolean;
  readonly previousVersionId?: string | null;
  readonly endingText?: string;
  readonly noPreviousChapter?: boolean;
}): RendererBridgeAdapter {
  const projection = chapterAssist(
    options?.previousVersionId === undefined ? previousVersionId : options.previousVersionId,
  );
  return {
    storyKnowledge: {
      project: vi.fn(() =>
        options?.failProjection
          ? unavailable()
          : success({
              ...projection,
              previousChapter: options?.noPreviousChapter ? null : projection.previousChapter,
            }),
      ),
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

describe('本章写作辅助 bounded projection', () => {
  it('只通过 Story Knowledge 读取本章目标、人物状态、伏笔和待办', async () => {
    const bridge = assistanceBridge();
    const view = await loadWritingAssistance(bridge, projectId, chapterId);

    expect(view).toMatchObject({
      chapterTitle: '当前章',
      goal: { goal: '确认追兵位置' },
      sceneBeats: [{ title: '河边试探', required: true, wordTargetPercent: 40 }],
      characters: [
        {
          name: '赵二',
          states: [{ key: '伤势', value: '左肩带伤' }],
          knowledge: [{ information: '追兵暗号', status: 'suspects' }],
        },
      ],
      foreshadowings: [{ title: '河灯暗号', attention: 'due' }],
      todos: [{ title: '补出赵二认出暗号的细节' }],
    });
    expect(bridge.storyKnowledge.project).toHaveBeenCalledOnce();
    expect(bridge.storyKnowledge.project).toHaveBeenCalledWith(
      { view: 'chapter_assist', projectId, chapterId, limit: 50 },
      expect.objectContaining({
        mode: 'replace',
        laneKey: `writing-assistance:${projectId}`,
      }),
    );
  });

  it('优先读取上一章定稿结尾', async () => {
    const bridge = assistanceBridge();
    const view = await loadWritingAssistance(bridge, projectId, chapterId);
    expect(view.previousEnding).toEqual({
      chapterId: previousChapterId,
      chapterTitle: '上一章',
      text: '上一章定稿结尾',
      source: 'final-version',
    });
    expect(bridge.version.get).toHaveBeenCalledOnce();
    expect(bridge.draft.open).not.toHaveBeenCalled();
  });

  it('定稿失败时只回退上一章当前稿，并截取过长结尾', async () => {
    const ending = `${'开场'.repeat(400)}\n\n${'收束'.repeat(300)}`;
    const bridge = assistanceBridge({ failVersion: true, endingText: ending });
    const view = await loadWritingAssistance(bridge, projectId, chapterId);
    expect(view.previousEnding?.source).toBe('current-draft');
    expect(view.previousEnding?.text).toHaveLength(601);
    expect(view.previousEnding?.text.startsWith('…')).toBe(true);
    expect(view.warnings).toContain('上一章定稿暂时无法读取');
  });

  it('没有上一章时不读取 Version 或 Draft；Projection 失败则 fail-closed', async () => {
    const firstChapterBridge = assistanceBridge({ noPreviousChapter: true });
    const firstChapter = await loadWritingAssistance(firstChapterBridge, projectId, chapterId);
    expect(firstChapter.previousEnding).toBeNull();
    expect(firstChapterBridge.version.get).not.toHaveBeenCalled();
    expect(firstChapterBridge.draft.open).not.toHaveBeenCalled();

    const failedBridge = assistanceBridge({ failProjection: true });
    await expect(loadWritingAssistance(failedBridge, projectId, chapterId)).rejects.toThrow(
      'WRITING_ASSISTANCE_FAILURE',
    );
    expect(failedBridge.version.get).not.toHaveBeenCalled();
    expect(failedBridge.draft.open).not.toHaveBeenCalled();
  });
});
