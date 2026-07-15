import { describe, expect, it } from 'vitest';

import {
  DeterministicProviderStub,
  ManualClock,
  SequenceIdFactory,
} from '../../packages/testkit/src/index.js';
import type { ProviderStubError } from '../../packages/testkit/src/index.js';

const request = (prompt: string, signal?: AbortSignal) => ({
  requestId: '00000000-0000-4000-8000-000000000001',
  prompt,
  ...(signal ? { signal } : {}),
});

describe('deterministic test clock and IDs', () => {
  it('replays timestamps and IDs without ambient time or randomness', () => {
    const clock = new ManualClock('2026-07-15T01:02:03.000Z');
    expect(clock.now().toISOString()).toBe('2026-07-15T01:02:03.000Z');
    expect(clock.advance(250).toISOString()).toBe('2026-07-15T01:02:03.250Z');
    expect(clock.set('2026-07-16T00:00:00.000Z').toISOString()).toBe('2026-07-16T00:00:00.000Z');

    const ids = new SequenceIdFactory(7);
    expect(ids.next('run')).toBe('run-00000007');
    expect(ids.nextUuid()).toBe('00000000-0000-4000-8000-000000000008');
    expect(() => clock.advance(-1)).toThrow(/non-negative/);
    expect(() => ids.next('Not Valid')).toThrow(/lowercase/);
  });
});

describe('deterministic Provider Stub', () => {
  it('supports normal and token streams while recording only prompt metadata', async () => {
    const normal = new DeterministicProviderStub(
      { kind: 'normal', text: '候选正文' },
      { clock: new ManualClock('2026-07-15T02:00:00.000Z') },
    );
    const privatePrompt = '只用于内存断言的敏感提示';
    await expect(normal.collect(request(privatePrompt))).resolves.toBe('候选正文');
    expect(normal.calls).toHaveLength(1);
    expect(normal.calls[0]).toMatchObject({
      promptCharacters: privatePrompt.length,
      startedAt: '2026-07-15T02:00:00.000Z',
      scenario: 'normal',
    });
    expect(JSON.stringify(normal.calls)).not.toContain(privatePrompt);

    const delays: number[] = [];
    const stream = new DeterministicProviderStub(
      { kind: 'token-stream', tokens: ['逐', '字', '输出'], tokenDelayMilliseconds: 12 },
      {
        delay: async (duration) => {
          delays.push(duration);
        },
      },
    );
    await expect(stream.collect(request('公开合成输入'))).resolves.toBe('逐字输出');
    expect(delays).toEqual([12, 12, 12]);
  });

  it('reproduces disconnect, timeout, rate-limit, and invalid JSON failures', async () => {
    const disconnect = new DeterministicProviderStub({
      kind: 'disconnect',
      tokens: ['已', '接收', '丢失'],
      afterTokens: 2,
    });
    const received: string[] = [];
    let disconnectError: unknown;
    try {
      for await (const chunk of disconnect.stream(request('断流测试'))) received.push(chunk);
    } catch (error) {
      disconnectError = error;
    }
    expect(received).toEqual(['已', '接收']);
    expect(disconnectError).toMatchObject({ code: 'AI_STREAM_INTERRUPTED_009' });

    const timeoutDurations: number[] = [];
    const timeout = new DeterministicProviderStub(
      { kind: 'timeout', timeoutMilliseconds: 3_000 },
      {
        delay: async (duration) => {
          timeoutDurations.push(duration);
        },
      },
    );
    await expect(timeout.collect(request('超时测试'))).rejects.toMatchObject({
      code: 'AI_REQUEST_TIMEOUT_006',
    });
    expect(timeoutDurations).toEqual([3_000]);

    const limited = new DeterministicProviderStub({
      kind: 'rate-limit',
      retryAfterMilliseconds: 1_500,
    });
    await expect(limited.collect(request('限流测试'))).rejects.toMatchObject({
      code: 'AI_RATE_LIMITED_005',
      retryAfterMilliseconds: 1_500,
    });

    const invalid = new DeterministicProviderStub({ kind: 'invalid-json' });
    const invalidPayload = await invalid.collect(request('JSON测试'));
    expect(() => JSON.parse(invalidPayload)).toThrow();
  });

  it('blocks until cancellation and then exposes the canonical cancellation code', async () => {
    const controller = new AbortController();
    const provider = new DeterministicProviderStub({
      kind: 'cancellation',
      tokensBeforeWait: ['开始'],
    });
    const stream = provider.stream(request('取消测试', controller.signal));
    await expect(stream.next()).resolves.toEqual({ value: '开始', done: false });
    const pending = stream.next();
    controller.abort();
    await expect(pending).rejects.toEqual(
      expect.objectContaining<Partial<ProviderStubError>>({ code: 'COMMON_CANCELLED_004' }),
    );
  });
});
