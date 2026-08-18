import { beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeWorkerInstance {
  readonly listeners: Map<string, (value: unknown) => void>;
  readonly terminate: ReturnType<typeof vi.fn>;
  emit(name: string, value: unknown): void;
}

const workerState = vi.hoisted(() => ({ instances: [] as FakeWorkerInstance[] }));

vi.mock('node:worker_threads', () => ({
  Worker: class {
    readonly listeners = new Map<string, (value: unknown) => void>();
    readonly terminate = vi.fn(async () => 0);
    constructor(_url: URL, _options: unknown) {
      workerState.instances.push(this);
    }
    once(name: string, listener: (value: unknown) => void): this {
      this.listeners.set(name, listener);
      return this;
    }
    emit(name: string, value: unknown): void {
      this.listeners.get(name)?.(value);
    }
  },
}));

import {
  computeCandidateDiff,
  computeCandidateDiffProgressively,
  type CandidateDiffResult,
  type CandidateDiffWorkerMessage,
} from '../../packages/core-service/src/candidate-apply-diff.js';

const draft = (logicalBlockId: string, content: string) => ({ logicalBlockId, content });
const candidate = (
  temporaryId: string,
  content: string,
  logicalBlockId?: string,
  sourceLogicalBlockIds?: readonly string[],
) => ({
  temporaryId,
  content,
  ...(logicalBlockId ? { logicalBlockId } : {}),
  ...(sourceLogicalBlockIds ? { sourceLogicalBlockIds } : {}),
});

beforeEach(() => {
  workerState.instances.length = 0;
});

describe('candidate apply diff edge coverage', () => {
  it('handles empty match sets, unknown direct identities and candidates that target consumed current blocks', () => {
    expect(computeCandidateDiff([], [])).toMatchObject({
      structure: [],
      characterDiffs: [],
      execution: { strategy: 'main-thread', chapterCharacters: 0 },
    });

    const unknown = computeCandidateDiff(
      [draft('a', '甲')],
      [candidate('unknown', '乙', 'missing')],
    );
    expect(unknown.structure).toEqual([
      { kind: 'deleted', logicalBlockId: 'a', currentIndex: 0 },
      { kind: 'added', temporaryId: 'unknown', candidateIndex: 0 },
    ]);

    const consumed = computeCandidateDiff(
      [draft('a', '甲'), draft('b', '乙')],
      [candidate('merge', '甲乙', undefined, ['a', 'b']), candidate('again-a', '甲', 'a')],
    );
    expect(consumed.structure).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'merged' }),
        { kind: 'added', temporaryId: 'again-a', candidateIndex: 1 },
      ]),
    );
  });

  it('covers equal, insert-only, delete-only and prefix/suffix block character diffs', () => {
    const equalMerge = computeCandidateDiff(
      [draft('a', '甲'), draft('b', '乙')],
      [candidate('merge', '甲乙', undefined, ['a', 'b'])],
    );
    expect(equalMerge.characterDiffs[0]?.diff).toEqual({
      segments: [{ type: 'equal', text: '甲乙' }],
      coarse: false,
    });

    expect(
      computeCandidateDiff([draft('a', '')], [candidate('next', '新增', 'a')]).characterDiffs[0]
        ?.diff.segments,
    ).toEqual([{ type: 'insert', text: '新增' }]);
    expect(
      computeCandidateDiff([draft('a', '删除')], [candidate('next', '', 'a')]).characterDiffs[0]
        ?.diff.segments,
    ).toEqual([{ type: 'delete', text: '删除' }]);
    expect(
      computeCandidateDiff([draft('a', '前旧后')], [candidate('next', '前新后', 'a')])
        .characterDiffs[0]?.diff.segments,
    ).toEqual([
      { type: 'equal', text: '前' },
      { type: 'delete', text: '旧' },
      { type: 'insert', text: '新' },
      { type: 'equal', text: '后' },
    ]);
  });

  it('uses default cooperative yielding and covers no-prefix/no-suffix, insert-only and delete-only segments', async () => {
    const replacement = await computeCandidateDiffProgressively(
      [draft('a', '甲'.repeat(6_000))],
      [candidate('next', '乙'.repeat(6_000), 'a')],
    );
    expect(replacement.execution.strategy).toBe('cooperative-slices');
    expect(replacement.characterDiffs[0]?.diff.segments).toEqual([
      { type: 'delete', text: '甲'.repeat(6_000) },
      { type: 'insert', text: '乙'.repeat(6_000) },
    ]);

    const inserted = await computeCandidateDiffProgressively(
      [draft('a', '')],
      [candidate('next', '乙'.repeat(6_000), 'a')],
    );
    expect(inserted.characterDiffs[0]?.diff.segments).toEqual([
      { type: 'insert', text: '乙'.repeat(6_000) },
    ]);

    const deleted = await computeCandidateDiffProgressively(
      [draft('a', '甲'.repeat(6_000))],
      [candidate('next', '', 'a')],
    );
    expect(deleted.characterDiffs[0]?.diff.segments).toEqual([
      { type: 'delete', text: '甲'.repeat(6_000) },
    ]);
  });

  it('yields while scanning a long common suffix and returns an unchanged cooperative merge without character edits', async () => {
    const yieldControl = vi.fn(async () => undefined);
    const suffix = '同'.repeat(6_000);
    const suffixResult = await computeCandidateDiffProgressively(
      [draft('a', `甲${suffix}`)],
      [candidate('next', `乙${suffix}`, 'a')],
      { yieldControl },
    );
    expect(yieldControl.mock.calls.length).toBeGreaterThan(2);
    expect(suffixResult.characterDiffs[0]?.diff.segments.at(-1)).toEqual({
      type: 'equal',
      text: suffix,
    });

    const equal = await computeCandidateDiffProgressively(
      [draft('a', '甲'.repeat(3_000)), draft('b', '乙'.repeat(3_000))],
      [candidate('merged', `${'甲'.repeat(3_000)}${'乙'.repeat(3_000)}`, undefined, ['a', 'b'])],
      { yieldControl: async () => undefined },
    );
    expect(equal.characterDiffs[0]?.diff).toEqual({
      segments: [{ type: 'equal', text: `${'甲'.repeat(3_000)}${'乙'.repeat(3_000)}` }],
      coarse: false,
    });
  });

  it('keeps late abort callbacks harmless after a worker result has already settled', async () => {
    let abortListener: (() => void) | undefined;
    const signal = {
      aborted: false,
      addEventListener: (_name: string, listener: () => void) => {
        abortListener = listener;
      },
      removeEventListener: vi.fn(),
    } as unknown as AbortSignal;
    const current = [draft('a', '甲'.repeat(20_001))];
    const proposed = [candidate('next', '乙'.repeat(20_001), 'a')];
    const result: CandidateDiffResult = {
      structure: [],
      characterDiffs: [],
      execution: {
        strategy: 'worker',
        chapterCharacters: 20_001,
        continuousBlockingBudgetMilliseconds: 100,
        rationale: 'worker',
      },
    };
    const promise = computeCandidateDiffProgressively(current, proposed, { signal });
    workerState.instances[0]?.emit('message', {
      ok: true,
      result,
    } satisfies CandidateDiffWorkerMessage);
    await expect(promise).resolves.toBe(result);
    abortListener?.();
    expect(workerState.instances[0]?.terminate).not.toHaveBeenCalled();
  });
});
