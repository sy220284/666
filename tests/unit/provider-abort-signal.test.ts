import { describe, expect, it, vi } from 'vitest';

import { createReplayableAbortBoundary } from '../../packages/core-service/src/provider-abort-signal.js';

describe('Provider可重放取消边界', () => {
  it('父信号预先取消时向迟注册监听器立即重放abort', () => {
    const parent = new AbortController();
    parent.abort(new Error('cancelled'));
    const boundary = createReplayableAbortBoundary(parent.signal);
    const listener = vi.fn();

    boundary.signal?.addEventListener('abort', listener, { once: true });

    expect(boundary.signal?.aborted).toBe(true);
    expect(boundary.signal?.reason).toBe(parent.signal.reason);
    expect(listener).toHaveBeenCalledOnce();
    boundary.dispose();
  });

  it('父信号在内部监听器注册前取消时仍向迟注册监听器重放abort', () => {
    const parent = new AbortController();
    const boundary = createReplayableAbortBoundary(parent.signal);
    parent.abort('late-cancel');
    const listener = vi.fn();

    boundary.signal?.addEventListener('abort', listener, { once: true });

    expect(boundary.signal?.aborted).toBe(true);
    expect(boundary.signal?.reason).toBe('late-cancel');
    expect(listener).toHaveBeenCalledOnce();
    boundary.dispose();
  });
});
