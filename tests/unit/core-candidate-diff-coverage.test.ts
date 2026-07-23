import { beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeWorkerInstance {
  readonly listeners: Map<string, (value: unknown) => void>;
  readonly terminate: ReturnType<typeof vi.fn>;
  readonly url: URL;
  readonly options: unknown;
  emit(name: string, value: unknown): void;
}

const workerState = vi.hoisted(() => ({
  instances: [] as FakeWorkerInstance[],
}));

vi.mock('node:worker_threads', () => ({
  Worker: class {
    readonly listeners = new Map<string, (value: unknown) => void>();
    readonly terminate = vi.fn(async () => 0);
    readonly url: URL;
    readonly options: unknown;

    constructor(url: URL, options: unknown) {
      this.url = url;
      this.options = options;
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
  CandidateDiffCancelledError,
  computeCandidateDiff,
  computeCandidateDiffProgressively,
  type CandidateDiffResult,
  type CandidateDiffWorkerMessage,
  type CandidateDiffWorkerInput,
  type DraftDiffBlock,
  type CandidateDiffBlock,
} from '../../packages/core-service/src/candidate-apply-diff.js';

const draft = (logicalBlockId: string, content = logicalBlockId): DraftDiffBlock => ({
  logicalBlockId,
  content,
});
const candidate = (
  temporaryId: string,
  content = temporaryId,
  options: Pick<CandidateDiffBlock, 'logicalBlockId' | 'sourceLogicalBlockIds'> = {},
): CandidateDiffBlock => ({ temporaryId, content, ...options });

function workerInput(): {
  current: DraftDiffBlock[];
  proposed: CandidateDiffBlock[];
  result: CandidateDiffResult;
} {
  const current = [draft('a', '甲'.repeat(20_001))];
  const proposed = [candidate('next-a', '乙'.repeat(20_001), { logicalBlockId: 'a' })];
  const result: CandidateDiffResult = {
    structure: [
      {
        kind: 'modified',
        logicalBlockId: 'a',
        currentIndex: 0,
        candidateIndex: 0,
      },
    ],
    characterDiffs: [],
    execution: {
      strategy: 'worker',
      chapterCharacters: 20_001,
      continuousBlockingBudgetMilliseconds: 100,
      rationale: 'worker',
    },
  };
  return { current, proposed, result };
}

describe('Core candidate diff structural and cooperative coverage', () => {
  beforeEach(() => {
    workerState.instances.length = 0;
  });

  it('classifies every structural kind and character-diff shape', () => {
    const result = computeCandidateDiff(
      [
        draft('a', '甲'),
        draft('b', '乙'),
        draft('c', '丙'),
        draft('d', '丁戊'),
        draft('e', '己'),
        draft('f', '庚'),
        draft('gone', '辛'),
      ],
      [
        candidate('tc', '丙', { logicalBlockId: 'c' }),
        candidate('ta', '甲改', { logicalBlockId: 'a' }),
        candidate('tb', '乙', { logicalBlockId: 'b' }),
        candidate('td1', '丁', { sourceLogicalBlockIds: ['d'] }),
        candidate('td2', '戊改', { sourceLogicalBlockIds: ['d'] }),
        candidate('tef', '己庚合', { sourceLogicalBlockIds: ['e', 'f'] }),
        candidate('new', '新增'),
      ],
    );
    expect(result.structure.map((entry) => entry.kind)).toEqual(
      expect.arrayContaining([
        'moved',
        'modified',
        'unchanged',
        'split',
        'merged',
        'added',
        'deleted',
      ]),
    );
    expect(result.characterDiffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'block:a' }),
        expect.objectContaining({ key: 'split:d' }),
        expect.objectContaining({ key: 'merge:e+f' }),
      ]),
    );
    expect(result.execution.strategy).toBe('main-thread');
  });

  it.each([
    [[draft('a'), draft('a')], [], 'Duplicate current logicalBlockId'],
    [[draft('a')], [candidate('x'), candidate('x')], 'Duplicate candidate temporaryId'],
    [
      [draft('a')],
      [
        candidate('x', '一', { logicalBlockId: 'a' }),
        candidate('y', '二', { logicalBlockId: 'a' }),
      ],
      'Duplicate candidate logicalBlockId',
    ],
    [
      [draft('a')],
      [candidate('x', '一', { sourceLogicalBlockIds: ['a', 'a'] })],
      'Duplicate source logicalBlockId',
    ],
    [
      [draft('a')],
      [candidate('x', '一', { sourceLogicalBlockIds: ['missing'] })],
      'Unknown source logicalBlockId',
    ],
  ] as const)('rejects invalid candidate inputs %#', (current, proposed, message) => {
    expect(() => computeCandidateDiff(current, proposed)).toThrow(message);
  });

  it('rejects a source consumed by two structural groups', () => {
    expect(() =>
      computeCandidateDiff(
        [draft('a'), draft('b')],
        [
          candidate('merged', '甲乙', { sourceLogicalBlockIds: ['a', 'b'] }),
          candidate('split-1', '甲', { sourceLogicalBlockIds: ['a'] }),
          candidate('split-2', '乙', { sourceLogicalBlockIds: ['a'] }),
        ],
      ),
    ).toThrow('multiple structural groups');
  });

  it('uses main-thread and cooperative strategies and yields during long scans', async () => {
    await expect(
      computeCandidateDiffProgressively(
        [draft('a', '甲')],
        [candidate('a-next', '乙', { logicalBlockId: 'a' })],
      ),
    ).resolves.toMatchObject({ execution: { strategy: 'main-thread' } });

    const yieldControl = vi.fn(async () => undefined);
    const prefix = '同'.repeat(4_100);
    const result = await computeCandidateDiffProgressively(
      [draft('a', `${prefix}甲${'尾'.repeat(1_000)}`)],
      [candidate('a-next', `${prefix}乙${'尾'.repeat(1_000)}`, { logicalBlockId: 'a' })],
      { yieldControl },
    );
    expect(result.execution.strategy).toBe('cooperative-slices');
    expect(yieldControl.mock.calls.length).toBeGreaterThan(1);
    expect(result.characterDiffs[0]?.diff.segments).toEqual([
      { type: 'equal', text: prefix },
      { type: 'delete', text: '甲' },
      { type: 'insert', text: '乙' },
      { type: 'equal', text: '尾'.repeat(1_000) },
    ]);
  });

  it('cancels before cooperative work and after a yield checkpoint', async () => {
    const immediate = new AbortController();
    immediate.abort();
    await expect(
      computeCandidateDiffProgressively([draft('a')], [candidate('a')], {
        signal: immediate.signal,
      }),
    ).rejects.toBeInstanceOf(CandidateDiffCancelledError);

    const controller = new AbortController();
    const yieldControl = vi.fn(async () => controller.abort());
    await expect(
      computeCandidateDiffProgressively(
        [draft('a', '同'.repeat(5_001))],
        [candidate('a-next', `${'同'.repeat(5_000)}异`, { logicalBlockId: 'a' })],
        { signal: controller.signal, yieldControl },
      ),
    ).rejects.toBeInstanceOf(CandidateDiffCancelledError);
  });
});

describe('Core candidate diff Worker coverage', () => {
  beforeEach(() => {
    workerState.instances.length = 0;
  });

  it('sends the authoritative worker payload and resolves a successful message', async () => {
    const { current, proposed, result } = workerInput();
    const promise = computeCandidateDiffProgressively(current, proposed);
    const worker = workerState.instances[0];
    expect(worker?.options).toMatchObject({
      workerData: {
        kind: 'worldforge.candidate-diff',
        current,
        candidate: proposed,
      } satisfies CandidateDiffWorkerInput,
    });
    worker?.emit('message', { ok: true, result } satisfies CandidateDiffWorkerMessage);
    await expect(promise).resolves.toBe(result);
    worker?.emit('error', new Error('late error'));
    worker?.emit('exit', 1);
  });

  it('rejects worker-declared errors, runtime errors and nonzero exits', async () => {
    const declaredInput = workerInput();
    const declared = computeCandidateDiffProgressively(
      declaredInput.current,
      declaredInput.proposed,
    );
    workerState.instances[0]?.emit('message', {
      ok: false,
      message: 'worker rejected',
    } satisfies CandidateDiffWorkerMessage);
    await expect(declared).rejects.toThrow('worker rejected');

    const runtimeInput = workerInput();
    const runtime = computeCandidateDiffProgressively(runtimeInput.current, runtimeInput.proposed);
    workerState.instances[1]?.emit('error', new Error('worker runtime failed'));
    await expect(runtime).rejects.toThrow('worker runtime failed');

    const exitInput = workerInput();
    const exit = computeCandidateDiffProgressively(exitInput.current, exitInput.proposed);
    workerState.instances[2]?.emit('exit', 7);
    await expect(exit).rejects.toThrow('exited with code 7');
    workerState.instances[2]?.emit('exit', 0);
  });

  it('terminates and rejects when aborted while a Worker is active', async () => {
    const controller = new AbortController();
    const { current, proposed } = workerInput();
    const promise = computeCandidateDiffProgressively(current, proposed, {
      signal: controller.signal,
    });
    const worker = workerState.instances[0];
    controller.abort();
    await expect(promise).rejects.toBeInstanceOf(CandidateDiffCancelledError);
    expect(worker?.terminate).toHaveBeenCalledTimes(1);
    worker?.emit('message', { ok: false, message: 'late' });
  });
});
