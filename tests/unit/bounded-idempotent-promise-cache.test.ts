import { describe, expect, it } from 'vitest';

import {
  BoundedIdempotentPromiseCache,
  IdempotentRequestConflictError,
} from '../../packages/core-service/src/bounded-idempotent-promise-cache.js';

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('BoundedIdempotentPromiseCache', () => {
  it('never evicts pending requests when the retained-result limit is exceeded', async () => {
    const cache = new BoundedIdempotentPromiseCache(2);
    const first = deferred<string>();
    const second = deferred<string>();
    const third = deferred<string>();

    cache.remember('first', 'command:first', first.promise);
    cache.remember('second', 'command:second', second.promise);
    cache.remember('third', 'command:third', third.promise);

    expect(cache.size).toBe(3);
    expect(cache.get('first', 'command:first')).toBe(first.promise);
    expect(cache.get('second', 'command:second')).toBe(second.promise);
    expect(cache.get('third', 'command:third')).toBe(third.promise);

    first.resolve('done');
    await first.promise;
    await Promise.resolve();

    expect(cache.size).toBe(2);
    expect(cache.get('first', 'command:first')).toBeUndefined();
    expect(cache.get('second', 'command:second')).toBe(second.promise);
    expect(cache.get('third', 'command:third')).toBe(third.promise);

    second.resolve('second');
    third.resolve('third');
    await Promise.all([second.promise, third.promise]);
  });

  it('removes failed requests so callers can retry the same requestId', async () => {
    const cache = new BoundedIdempotentPromiseCache(2);
    const failed = deferred<string>();
    cache.remember('retryable', 'command:retry', failed.promise);

    failed.reject(new Error('failed'));
    await expect(failed.promise).rejects.toThrow('failed');
    await Promise.resolve();

    expect(cache.get('retryable', 'command:retry')).toBeUndefined();
  });

  it('shares identical requests and rejects requestId reuse with another fingerprint', async () => {
    const cache = new BoundedIdempotentPromiseCache();
    const pending = deferred<string>();

    expect(cache.remember('shared', 'generation:start:a', pending.promise)).toBe(pending.promise);
    expect(cache.get('shared', 'generation:start:a')).toBe(pending.promise);
    expect(() => cache.get('shared', 'generation:start:b')).toThrow(IdempotentRequestConflictError);

    pending.resolve('done');
    await expect(pending.promise).resolves.toBe('done');
    expect(cache.get('shared', 'generation:start:a')).toBe(pending.promise);
    expect(() => cache.remember('shared', 'generation:start:b', Promise.resolve('wrong'))).toThrow(
      IdempotentRequestConflictError,
    );
  });
});
