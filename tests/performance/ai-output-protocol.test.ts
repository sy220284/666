import { describe, expect, it } from 'vitest';

import {
  GenerationRequestSchema,
  ModelSupportProfileSchema,
  SkeletonCandidateOutputSchema,
} from '../../packages/contracts/src/index.js';
import {
  CHAPTER_SPIKE_PROMPT_ID,
  SKELETON_SPIKE_PROMPT_ID,
  cleanChapterText,
  getPromptDefinition,
  parseChapterCandidate,
  parseChapterTextCandidate,
  parseSkeletonCandidate,
  selectChapterOutputMode,
} from '../../packages/prompts/src/index.js';
import {
  DeterministicProviderStub,
  collectProviderStubResult,
  runSkeletonCandidates,
} from '../../packages/testkit/src/index.js';

const constraintHash = 'a'.repeat(64);
const requestId = (suffix: number) =>
  `00000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;

function skeleton(tendency: string) {
  return {
    tendency,
    beats: [
      {
        beatId: 'beat-tide',
        order: 1,
        event: '林澈核对潮汐日期',
        cause: '来信日期与潮汐表矛盾',
        consequence: '他决定前往旧渡口',
        informationReleased: ['日期来自不同年代'],
        characterIntentions: [{ characterId: 'lin-che', intention: '确认来信年代' }],
      },
    ],
    endingHook: '旧渡口的铜铃自行响起。',
    risks: [],
  };
}

describe('M0-07 strict AI output contracts', () => {
  it('accepts the frozen request and output shapes while rejecting extra fields', () => {
    expect(
      GenerationRequestSchema.parse({
        runId: requestId(1),
        model: 'deterministic-v1',
        systemPrompt: '只输出公开合成骨架。',
        messages: [{ role: 'user', content: '生成两个不同倾向。' }],
        maxOutputTokens: 2_000,
        structuredOutput: { name: 'skeleton_candidate', schema: { type: 'object' } },
        metadata: {
          taskType: 'skeleton',
          promptId: SKELETON_SPIKE_PROMPT_ID,
          promptVersion: 1,
          constraintHash,
        },
      }),
    ).toMatchObject({ maxOutputTokens: 2_000 });
    expect(
      GenerationRequestSchema.safeParse({
        runId: requestId(1),
        model: 'deterministic-v1',
        systemPrompt: '公开合成输入',
        messages: [],
        maxOutputTokens: 10,
        metadata: {
          taskType: 'skeleton',
          promptId: SKELETON_SPIKE_PROMPT_ID,
          promptVersion: 1.5,
          constraintHash,
        },
        unsafeOverride: true,
      }).success,
    ).toBe(false);
    expect(
      SkeletonCandidateOutputSchema.safeParse({ ...skeleton('悬疑'), prose: '整章正文' }).success,
    ).toBe(false);
  });

  it('registers stable T0/T1 protocol probes with bound schemas and modes', () => {
    const t0 = getPromptDefinition(SKELETON_SPIKE_PROMPT_ID, 1);
    const t1 = getPromptDefinition(CHAPTER_SPIKE_PROMPT_ID, 1);
    expect(t0).toMatchObject({ taskType: 'skeleton', supportedModes: ['structured'] });
    expect(t1).toMatchObject({ taskType: 'chapter', supportedModes: ['text', 'structured'] });

    const bundle = t0.build({
      constraintHash,
      targetLanguage: 'zh-CN',
      chapterGoal: '核对来信年代并找到第二条线索',
      requiredBeats: [{ beatId: 'beat-tide', event: '核对潮汐日期' }],
      tendency: '悬疑递进',
    });
    expect(bundle.metadata).toEqual({
      promptId: SKELETON_SPIKE_PROMPT_ID,
      promptVersion: 1,
      taskType: 'skeleton',
      constraintHash,
    });
    expect(bundle.structuredOutput?.name).toBe('skeleton_candidate_v1');
    expect(bundle.structuredOutput?.schema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      properties: {
        beats: {
          type: 'array',
          items: { type: 'object', additionalProperties: false },
        },
      },
    });
  });
});

describe('M0-07 T0/T1 protocol and degradation', () => {
  it('parses multiple T0 candidates and permits exactly one registered envelope repair', async () => {
    const first = JSON.stringify(skeleton('因果优先'));
    const second = `\`\`\`json\n${JSON.stringify(skeleton('悬念优先'))}\n\`\`\``;
    const results = await runSkeletonCandidates([
      {
        provider: new DeterministicProviderStub({ kind: 'normal', text: first }),
        request: { requestId: requestId(2), prompt: '公开合成T0输入' },
        requiredBeatIds: ['beat-tide'],
      },
      {
        provider: new DeterministicProviderStub({ kind: 'normal', text: second }),
        request: { requestId: requestId(3), prompt: '公开合成T0输入' },
        requiredBeatIds: ['beat-tide'],
      },
    ]);
    expect(results.map((result) => result.status)).toEqual(['complete', 'complete']);
    expect(results[0]).toMatchObject({ repaired: false, candidate: { tendency: '因果优先' } });
    expect(results[1]).toMatchObject({ repaired: true, candidate: { tendency: '悬念优先' } });

    const invalidResult = await runSkeletonCandidates([
      {
        provider: new DeterministicProviderStub({ kind: 'invalid-json' }),
        request: { requestId: requestId(7), prompt: '无效JSON协议测试' },
        requiredBeatIds: ['beat-tide'],
      },
    ]);
    expect(invalidResult[0]).toMatchObject({
      status: 'invalid',
      errorCode: 'AI_OUTPUT_INVALID_008',
      attempts: 1,
    });

    const incompleteCoverage = await runSkeletonCandidates([
      {
        provider: new DeterministicProviderStub({ kind: 'normal', text: first }),
        request: { requestId: requestId(9), prompt: '必选节拍覆盖测试' },
        requiredBeatIds: ['beat-tide', 'beat-missing'],
      },
    ]);
    expect(incompleteCoverage[0]).toMatchObject({
      status: 'invalid',
      errorCode: 'AI_OUTPUT_INVALID_008',
      missingBeatIds: ['beat-missing'],
    });

    const invalid = parseSkeletonCandidate('{"tendency":"不完整",');
    expect(invalid).toMatchObject({
      ok: false,
      errorCode: 'AI_OUTPUT_INVALID_008',
      attempts: 1,
    });
    expect(parseSkeletonCandidate('  {"tendency":"仍不完整",  ')).toMatchObject({
      ok: false,
      attempts: 1,
    });
  });

  it('defaults T1 to text and enables structured blocks only for a matching verified profile', () => {
    const verified = ModelSupportProfileSchema.parse({
      providerId: 'deterministic-stub',
      model: 'deterministic-v1',
      taskType: 'chapter',
      promptId: CHAPTER_SPIKE_PROMPT_ID,
      promptVersion: 1,
      status: 'verified',
      evaluatedAt: '2026-07-15T00:00:00.000Z',
      fixtureSetVersion: 'm0-07-v1',
      metrics: { structuredSchemaRate: 1 },
      limitations: ['仅用于确定性协议验证，不代表真实模型质量。'],
    });
    expect(
      selectChapterOutputMode({
        preferStructured: true,
        promptId: CHAPTER_SPIKE_PROMPT_ID,
        promptVersion: 1,
        profile: verified,
      }),
    ).toEqual({ mode: 'structured', reason: 'verified-profile' });
    expect(
      selectChapterOutputMode({
        preferStructured: true,
        promptId: CHAPTER_SPIKE_PROMPT_ID,
        promptVersion: 2,
        profile: verified,
      }),
    ).toEqual({ mode: 'text', reason: 'profile-mismatch' });
    expect(
      selectChapterOutputMode({
        preferStructured: false,
        promptId: CHAPTER_SPIKE_PROMPT_ID,
        promptVersion: 1,
        profile: verified,
      }),
    ).toEqual({ mode: 'text', reason: 'text-preferred' });
  });

  it('cleans only registered T1 wrappers and preserves similar phrases inside prose', () => {
    expect(cleanChapterText('以下是正文：\n雨落旧渡口。\n本章完')).toEqual({
      text: '雨落旧渡口。',
      changed: true,
    });
    expect(cleanChapterText('他在信里写道：“以下是正文：别忘了本章完这三个字。”')).toEqual({
      text: '他在信里写道：“以下是正文：别忘了本章完这三个字。”',
      changed: false,
    });
    expect(parseChapterTextCandidate('以下是正文：\n雨落旧渡口。\n本章完')).toEqual({
      ok: true,
      text: '雨落旧渡口。',
      cleaned: true,
    });
    expect(parseChapterTextCandidate('本章完')).toMatchObject({
      ok: false,
      errorCode: 'AI_OUTPUT_INVALID_008',
    });
    expect(
      parseChapterCandidate(
        JSON.stringify({
          blocks: [
            {
              temporaryId: 'candidate-block-1',
              beatId: 'beat-tide',
              type: 'paragraph',
              content: '雨落旧渡口。',
            },
          ],
        }),
      ),
    ).toMatchObject({ ok: true, repaired: false });
  });

  it('preserves partial text and canonical errors for disconnect, timeout, and cancellation', async () => {
    const streamed = await collectProviderStubResult(
      new DeterministicProviderStub({ kind: 'token-stream', tokens: ['雨', '落', '渡口'] }),
      { requestId: requestId(8), prompt: '中文分片测试' },
    );
    expect(streamed).toEqual({ status: 'complete', text: '雨落渡口' });

    const disconnected = await collectProviderStubResult(
      new DeterministicProviderStub({
        kind: 'disconnect',
        tokens: ['雨落', '渡口', '未发送'],
        afterTokens: 2,
      }),
      { requestId: requestId(4), prompt: '断流协议测试' },
    );
    expect(disconnected).toEqual({
      status: 'partial',
      text: '雨落渡口',
      errorCode: 'AI_STREAM_INTERRUPTED_009',
    });

    const timedOut = await collectProviderStubResult(
      new DeterministicProviderStub({ kind: 'timeout', timeoutMilliseconds: 3_000 }),
      { requestId: requestId(5), prompt: '超时协议测试' },
    );
    expect(timedOut).toEqual({
      status: 'failed',
      text: '',
      errorCode: 'AI_REQUEST_TIMEOUT_006',
    });

    const controller = new AbortController();
    const pending = collectProviderStubResult(
      new DeterministicProviderStub({
        kind: 'cancellation',
        tokensBeforeWait: ['已接收'],
      }),
      { requestId: requestId(6), prompt: '取消协议测试', signal: controller.signal },
    );
    await Promise.resolve();
    controller.abort();
    await expect(pending).resolves.toEqual({
      status: 'cancelled',
      text: '已接收',
      errorCode: 'COMMON_CANCELLED_004',
    });
  });
});
