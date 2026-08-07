import { describe, expect, it, vi } from 'vitest';

import type { GenerationIntent } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { startGenerationTask } from '../../apps/desktop/renderer/src/features/writing/generation-start.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

type StartInput = Parameters<typeof startGenerationTask>[0];

const success = <Data>(data: Data) => ({ state: 'success' as const, data });

function candidateDocument(candidateId: string, beatId = 'beat-a') {
  return {
    candidateId,
    candidateType: 'chapter',
    blocks: [{ candidateBlockId: `${candidateId}-block`, beatId }],
  };
}

function setup(overrides: Partial<StartInput> = {}) {
  const statuses: string[] = [];
  const pending: boolean[] = [];
  const intents: GenerationIntent[] = [];
  const started: string[] = [];
  const start = vi.fn(async () =>
    success({ run: { stage: 'queued', runId: 'run-a' }, taskId: 'task-a' }),
  );
  const get = vi.fn(async ({ candidateId }: { candidateId: string }) =>
    success(candidateDocument(candidateId)),
  );
  const defaultDraft = {
    draftId: 'draft-a',
    revision: 7,
    blocks: [
      {
        logicalBlockId: 'block-a',
        contentHash: 'hash-a',
        locked: false,
      },
      { logicalBlockId: 'block-b', contentHash: null, locked: false },
      { logicalBlockId: 'block-c', contentHash: 'hash-c', locked: true },
    ],
  } as StartInput['draft'];
  const { bridge: bridgeOverride, ...inputOverrides } = overrides;
  const authoritativeDraft = inputOverrides.draft ?? defaultDraft;
  const bridge = contractInput<RendererBridgeAdapter>({
    ...bridgeOverride,
    draft: {
      open: async () => success(authoritativeDraft),
      ...bridgeOverride?.draft,
    },
    generation: { start, ...bridgeOverride?.generation },
    candidate: { get, ...bridgeOverride?.candidate },
  });
  const input = contractInput<StartInput>({
    bridge,
    projectId: 'project-a',
    chapterId: 'chapter-a',
    commandPrefix: 'writing:project-a:chapter-a:',
    draft: defaultDraft,
    providerId: 'provider-a',
    readOnly: false,
    flush: async () => true,
    generationMode: 'chapter',
    chapterSource: 'direct_chapter_goal',
    chapterGoal: ' 推进冲突 ',
    tendency: ' 加快节奏 ',
    generationInstruction: ' 保持第三人称 ',
    targetCharacters: 2_000,
    candidateCount: 3,
    sceneBeats: [
      { id: 'beat-a', required: true },
      { id: 'beat-b', required: false },
    ],
    selectedSkeletonId: 'skeleton-a',
    acknowledgeStaleSkeleton: true,
    mergeMappingMode: 'segment',
    mergeCandidateIds: new Set(['candidate-a', 'candidate-b']),
    mergeBeatSources: {},
    getRewriteSelectionAnchor: async () => null,
    continuationOfRunId: null,
    intentOverride: null,
    setPending: (value) => pending.push(value),
    setStatus: (value) => statuses.push(value),
    setLastIntent: (value) => intents.push(value),
    onStarted: (_run, taskId) => started.push(taskId),
    ...inputOverrides,
  });
  return { bridge, get, input, intents, pending, start, started, statuses };
}

describe('Writing生成启动编排', () => {
  it.each([
    [{ providerId: '' }, undefined],
    [{ readOnly: true }, undefined],
    [{ flush: async () => false }, undefined],
    [{ generationMode: 'skeleton', chapterGoal: '' }, '请先填写本章目标。'],
    [{ chapterGoal: '' }, '直接生成正文需要本章目标。'],
    [{ chapterSource: 'skeleton_candidate', selectedSkeletonId: '' }, '请选择一个骨架候选。'],
    [
      { chapterSource: 'canonical_scene_beats', sceneBeats: [] },
      '当前章节没有可用于生成的场景节拍。',
    ],
    [{ generationMode: 'rewrite', generationInstruction: '' }, '请填写改写指令。'],
  ] satisfies ReadonlyArray<readonly [Partial<StartInput>, string | undefined]>)(
    '拒绝不满足前置条件的请求 %#',
    async (overrides, expectedStatus) => {
      const context = setup(overrides);
      await startGenerationTask(context.input);
      expect(context.start).not.toHaveBeenCalled();
      if (expectedStatus) expect(context.statuses.at(-1)).toBe(expectedStatus);
    },
  );

  it('组装骨架、章节三来源与显式Intent', async () => {
    const skeleton = setup({ generationMode: 'skeleton' });
    await startGenerationTask(skeleton.input);
    expect(skeleton.intents[0]).toMatchObject({
      runType: 'skeleton',
      chapterGoal: '推进冲突',
      tendency: '加快节奏',
      requiredSceneBeatIds: ['beat-a'],
    });

    for (const [chapterSource, source] of [
      ['direct_chapter_goal', { sourceType: 'direct_chapter_goal', chapterGoal: '推进冲突' }],
      [
        'skeleton_candidate',
        {
          sourceType: 'skeleton_candidate',
          selectedSkeletonCandidateId: 'skeleton-a',
          acknowledgeStaleSource: true,
        },
      ],
      [
        'canonical_scene_beats',
        { sourceType: 'canonical_scene_beats', sceneBeatIds: ['beat-a', 'beat-b'] },
      ],
    ] as const) {
      const context = setup({ chapterSource });
      await startGenerationTask(context.input);
      expect(context.intents[0]).toMatchObject({ runType: 'chapter', source });
      expect(context.pending).toEqual([true, false]);
      expect(context.started).toEqual(['task-a']);
    }

    const override = { runType: 'skeleton', chapterGoal: '原样使用' } as GenerationIntent;
    const explicit = setup({ intentOverride: override, chapterGoal: '' });
    await startGenerationTask(explicit.input);
    expect(explicit.intents[0]).toBe(override);
  });

  it('组装续写与选择/正文块改写范围', async () => {
    const continuation = setup({
      continuationOfRunId: 'run-old',
      chapterGoal: '',
      generationInstruction: ' ',
    });
    await startGenerationTask(continuation.input);
    expect(continuation.intents[0]).toMatchObject({
      runType: 'chapter',
      source: { chapterGoal: '从已保存的部分结果继续本章，不重复已有正文。' },
      styleInstructions: [],
    });

    const anchor = { logicalBlockId: 'block-a' } as Awaited<
      ReturnType<StartInput['getRewriteSelectionAnchor']>
    >;
    const selected = setup({
      generationMode: 'rewrite',
      getRewriteSelectionAnchor: async () => anchor,
    });
    await startGenerationTask(selected.input);
    expect(selected.intents[0]).toMatchObject({
      runType: 'rewrite',
      scope: { scopeType: 'selection', anchor },
    });

    const blocks = setup({ generationMode: 'rewrite' });
    await startGenerationTask(blocks.input);
    expect(blocks.intents[0]).toMatchObject({
      scope: {
        scopeType: 'blocks',
        logicalBlockIds: ['block-a'],
        expectedBlockHashes: ['hash-a'],
      },
    });

    const unavailable = setup({
      generationMode: 'rewrite',
      draft: { draftId: 'draft-a', revision: 1, blocks: [] } as StartInput['draft'],
    });
    await startGenerationTask(unavailable.input);
    expect(unavailable.statuses.at(-1)).toBe('没有可改写的未锁定正文块。');
  });

  it('校验并组装分段与节拍融合', async () => {
    const tooFew = setup({ generationMode: 'merge', mergeCandidateIds: new Set(['one']) });
    await startGenerationTask(tooFew.input);
    expect(tooFew.statuses.at(-1)).toBe('融合至少需要两个明确的来源单元。');

    const segment = setup({ generationMode: 'merge' });
    await startGenerationTask(segment.input);
    expect(segment.intents[0]).toMatchObject({
      runType: 'merge',
      mapping: { mappingType: 'segment' },
      instruction: '保持第三人称',
    });

    const beat = setup({
      generationMode: 'merge',
      mergeMappingMode: 'beat',
      mergeBeatSources: { 'beat-a': 'candidate-a', 'beat-b': 'current_draft' },
      generationInstruction: ' ',
    });
    await startGenerationTask(beat.input);
    expect(beat.intents[0]).toMatchObject({
      mapping: {
        mappingType: 'beat',
        units: [
          { sceneBeatId: 'beat-a', sourceCandidateId: 'candidate-a', keepCurrentDraft: false },
          { sceneBeatId: 'beat-b', sourceCandidateId: null, keepCurrentDraft: true },
        ],
      },
    });
    expect(beat.intents[0]).not.toHaveProperty('instruction');

    const missingBeat = setup({
      generationMode: 'merge',
      mergeMappingMode: 'beat',
      mergeBeatSources: { 'beat-missing': 'candidate-a', 'beat-b': 'current_draft' },
    });
    await startGenerationTask(missingBeat.input);
    expect(missingBeat.statuses.at(-1)).toContain('没有关联到对应场景节拍');
  });

  it('处理读取失败、启动失败与取消结果', async () => {
    const invalidSource = setup({
      generationMode: 'merge',
      bridge: contractInput<RendererBridgeAdapter>({
        candidate: { get: async () => success({ candidateType: 'skeleton' }) },
        generation: { start: vi.fn() },
      }),
    });
    await startGenerationTask(invalidSource.input);
    expect(invalidSource.statuses.at(-1)).toBe('融合来源读取失败或包含骨架。');

    for (const outcome of [
      { state: 'cancelled' as const },
      {
        state: 'failure' as const,
        error: { code: 'COMMON_TIMEOUT_005', message: 'timeout' },
      },
    ]) {
      const context = setup({
        bridge: contractInput<RendererBridgeAdapter>({
          candidate: { get: vi.fn() },
          generation: { start: async () => outcome },
        }),
      });
      await startGenerationTask(context.input);
      expect(context.statuses.at(-1)).toContain('生成');
    }
  });
});
