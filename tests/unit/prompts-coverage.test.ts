import { describe, expect, it } from 'vitest';

import type { ContractSchema, ModelSupportProfile } from '@worldforge/contracts';
import { cleanChapterText, cleanStructuredEnvelope } from '../../packages/prompts/src/cleaners.js';
import { selectChapterOutputMode } from '../../packages/prompts/src/mode-policy.js';
import {
  assessSkeletonCoverage,
  parseChapterCandidate,
  parseChapterTextCandidate,
  parseSkeletonCandidate,
  parseStructuredOutput,
} from '../../packages/prompts/src/parsers.js';
import {
  CHAPTER_SPIKE_PROMPT_ID,
  SKELETON_SPIKE_PROMPT_ID,
  chapterSpikePrompt,
  getPromptDefinition,
  promptRegistry,
  skeletonSpikePrompt,
} from '../../packages/prompts/src/registry.js';

const hash = 'a'.repeat(64);
const beat = { beatId: 'beat-1', event: '主角进入现场' };
const skeletonOutput = {
  titleSuggestion: '标题',
  tendency: '悬疑推进',
  beats: [
    {
      beatId: 'beat-1',
      order: 1,
      event: '进入现场',
      cause: '收到线索',
      consequence: '发现异常',
      informationReleased: ['线索'],
      characterIntentions: [{ characterId: 'hero', intention: '查明真相' }],
      transitionToNext: '继续追查',
    },
  ],
  endingHook: '门后传来脚步声',
  risks: [],
};
const chapterOutput = {
  blocks: [
    { temporaryId: 'block-1', beatId: 'beat-1', type: 'paragraph' as const, content: '正文。' },
  ],
};

describe('Prompt cleaners and parsers regression coverage', () => {
  it('cleans structured fences, whitespace and unchanged JSON', () => {
    expect(cleanStructuredEnvelope(' {"ok":true} ')).toEqual({
      text: '{"ok":true}',
      changed: true,
    });
    expect(cleanStructuredEnvelope('{"ok":true}')).toEqual({
      text: '{"ok":true}',
      changed: false,
    });
    expect(cleanStructuredEnvelope('```json\r\n{"ok":true}\r\n```')).toEqual({
      text: '{"ok":true}',
      changed: true,
    });
    expect(cleanStructuredEnvelope('```yaml\na: 1\n```').text).toContain('```yaml');
  });

  it('cleans chapter wrappers, labels, endings and line endings', () => {
    expect(cleanChapterText('```markdown\r\n以下是正文：\r\n第一段\r\n本章完\r\n```')).toEqual({
      text: '第一段',
      changed: true,
    });
    expect(cleanChapterText('以下是正文\n第二段')).toMatchObject({ text: '第二段', changed: true });
    expect(cleanChapterText('原文')).toEqual({ text: '原文', changed: false });
    expect(cleanChapterText('```text\n\n```').text).toBe('');
  });

  it('covers first-pass success, schema rejection and syntax repair outcomes', () => {
    const accepting = {
      safeParse: (value: unknown) => ({ success: true, data: value }),
    } as ContractSchema<unknown>;
    const rejecting = {
      safeParse: () => ({ success: false, error: new Error('schema') }),
    } as unknown as ContractSchema<unknown>;

    expect(parseStructuredOutput('{"value":1}', accepting)).toEqual({
      ok: true,
      value: { value: 1 },
      repaired: false,
      attempts: 1,
    });
    expect(parseStructuredOutput('{"value":1}', rejecting)).toMatchObject({
      ok: false,
      attempts: 1,
      failure: 'schema',
    });
    expect(parseStructuredOutput('not-json', accepting)).toMatchObject({
      ok: false,
      attempts: 1,
      failure: 'json-syntax',
    });
    expect(parseStructuredOutput('```json\n{"value":2}\n```', accepting)).toEqual({
      ok: true,
      value: { value: 2 },
      repaired: true,
      attempts: 2,
    });
    expect(parseStructuredOutput('```json\n{"value":2}\n```', rejecting)).toMatchObject({
      ok: false,
      attempts: 2,
      failure: 'schema',
    });
    expect(parseStructuredOutput('```json\nstill-invalid\n```', accepting)).toMatchObject({
      ok: false,
      attempts: 2,
      failure: 'json-syntax',
    });
  });

  it('parses authoritative skeleton and chapter schemas and rejects malformed outputs', () => {
    expect(parseSkeletonCandidate(JSON.stringify(skeletonOutput))).toMatchObject({ ok: true });
    expect(parseSkeletonCandidate(JSON.stringify({ ...skeletonOutput, beats: [] }))).toMatchObject({
      ok: false,
      failure: 'schema',
    });
    expect(parseChapterCandidate(JSON.stringify(chapterOutput))).toMatchObject({ ok: true });
    expect(parseChapterCandidate(JSON.stringify({ blocks: [] }))).toMatchObject({
      ok: false,
      failure: 'schema',
    });
  });

  it('assesses complete, partial, duplicate and empty beat requirements', () => {
    expect(assessSkeletonCoverage(skeletonOutput, ['beat-1', 'beat-1'])).toEqual({
      accepted: true,
      coverageRate: 1,
      missingBeatIds: [],
    });
    expect(assessSkeletonCoverage(skeletonOutput, ['beat-1', 'beat-2'])).toEqual({
      accepted: false,
      coverageRate: 0.5,
      missingBeatIds: ['beat-2'],
    });
    expect(assessSkeletonCoverage(skeletonOutput, [])).toEqual({
      accepted: true,
      coverageRate: 1,
      missingBeatIds: [],
    });
  });

  it('accepts cleaned chapter text and rejects empty output', () => {
    expect(parseChapterTextCandidate('以下是正文：\n正文\n本章完')).toEqual({
      ok: true,
      text: '正文',
      cleaned: true,
    });
    expect(parseChapterTextCandidate('直接正文')).toEqual({
      ok: true,
      text: '直接正文',
      cleaned: false,
    });
    expect(parseChapterTextCandidate(' \n 本章完 ')).toEqual({
      ok: false,
      errorCode: 'AI_OUTPUT_INVALID_008',
      reason: 'empty-output',
    });
  });
});

describe('Prompt mode policy coverage', () => {
  const profile = (overrides: Partial<ModelSupportProfile> = {}): ModelSupportProfile => ({
    providerId: 'provider',
    model: 'model',
    taskType: 'chapter',
    promptId: CHAPTER_SPIKE_PROMPT_ID,
    promptVersion: 1,
    status: 'verified',
    metrics: { structuredSchemaRate: 1 },
    limitations: [],
    ...overrides,
  });
  const input = {
    preferStructured: true,
    promptId: CHAPTER_SPIKE_PROMPT_ID,
    promptVersion: 1,
  };

  it.each([
    [{ ...input, preferStructured: false }, 'text-preferred'],
    [input, 'profile-missing'],
    [{ ...input, profile: profile({ taskType: 'skeleton' }) }, 'profile-mismatch'],
    [{ ...input, profile: profile({ promptId: 'other.prompt' }) }, 'profile-mismatch'],
    [{ ...input, profile: profile({ promptVersion: 2 }) }, 'profile-mismatch'],
    [{ ...input, profile: profile({ status: 'limited' }) }, 'profile-not-verified'],
    [{ ...input, profile: profile({ metrics: undefined }) }, 'structured-schema-unverified'],
    [
      { ...input, profile: profile({ metrics: { structuredSchemaRate: 0.99 } }) },
      'structured-schema-unverified',
    ],
  ])('selects text mode for %s', (value, reason) => {
    expect(selectChapterOutputMode(value)).toEqual({ mode: 'text', reason });
  });

  it('selects structured mode only for the exact verified profile', () => {
    expect(selectChapterOutputMode({ ...input, profile: profile() })).toEqual({
      mode: 'structured',
      reason: 'verified-profile',
    });
  });
});

describe('Prompt registry coverage', () => {
  it('builds the skeleton bundle with structured output metadata', () => {
    const bundle = skeletonSpikePrompt.build({
      constraintHash: hash,
      targetLanguage: 'zh-CN',
      chapterGoal: '推进调查',
      requiredBeats: [beat],
      tendency: '悬疑',
    });
    expect(bundle.structuredOutput?.name).toBe('skeleton_candidate_v1');
    expect(bundle.metadata).toEqual({
      promptId: SKELETON_SPIKE_PROMPT_ID,
      promptVersion: 1,
      taskType: 'skeleton',
      constraintHash: hash,
    });
    expect(JSON.parse(bundle.messages[0]?.content ?? '{}')).toMatchObject({
      requiredBeats: [beat],
    });
  });

  it('builds both text and structured chapter bundles', () => {
    const base = {
      constraintHash: hash,
      targetLanguage: 'zh-CN',
      chapterGoal: '完成本章',
      beats: [beat],
      targetCharacters: 3000,
    };
    const text = chapterSpikePrompt.build({ ...base, outputMode: 'text' });
    expect(text.structuredOutput).toBeUndefined();
    expect(text.system).toContain('只输出正文');
    const structured = chapterSpikePrompt.build({ ...base, outputMode: 'structured' });
    expect(structured.structuredOutput?.name).toBe('chapter_candidate_v1');
    expect(structured.system).toContain('Schema');
  });

  it('resolves known definitions and rejects unknown prompt IDs and versions', () => {
    expect(getPromptDefinition(SKELETON_SPIKE_PROMPT_ID, 1)).toBe(skeletonSpikePrompt);
    expect(getPromptDefinition(CHAPTER_SPIKE_PROMPT_ID, 1)).toBe(chapterSpikePrompt);
    expect(promptRegistry).toEqual([skeletonSpikePrompt, chapterSpikePrompt]);
    expect(() => getPromptDefinition('unknown.prompt', 1)).toThrow('Unknown prompt');
    expect(() => getPromptDefinition(CHAPTER_SPIKE_PROMPT_ID, 2)).toThrow('Unknown prompt version');
  });
});
