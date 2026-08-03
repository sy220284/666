import { describe, expect, it, vi } from 'vitest';

import { startSingleFlightPolling } from '../../apps/desktop/renderer/src/runtime/single-flight-polling.js';

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

describe('single-flight polling', () => {
  it('never overlaps a slow poll and schedules the next read only after settlement', async () => {
    vi.useFakeTimers();
    const first = deferred<number>();
    const second = deferred<number>();
    const poll = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const onResult = vi.fn(() => true);
    const stop = startSingleFlightPolling({ intervalMs: 1_000, poll, onResult });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(poll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(poll).toHaveBeenCalledTimes(1);

    first.resolve(1);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(999);
    expect(poll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(poll).toHaveBeenCalledTimes(2);

    stop();
    second.resolve(2);
    await Promise.resolve();
    vi.useRealTimers();
  });

  it('consumes a rejected poll and can retry without an unhandled rejection', async () => {
    vi.useFakeTimers();
    const poll = vi.fn().mockRejectedValueOnce(new Error('temporary')).mockResolvedValueOnce(2);
    const onError = vi.fn(() => true);
    const stop = startSingleFlightPolling({
      intervalMs: 500,
      poll,
      onResult: () => false,
      onError,
    });

    await vi.advanceTimersByTimeAsync(500);
    await Promise.resolve();
    expect(onError).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(poll).toHaveBeenCalledTimes(2);

    stop();
    vi.useRealTimers();
  });
});
