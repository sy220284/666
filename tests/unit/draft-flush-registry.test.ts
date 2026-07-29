import { describe, expect, it, vi } from 'vitest';

import {
  flushRegisteredDraft,
  registerDraftFlushHandler,
} from '../../apps/desktop/renderer/src/runtime/draft-flush-registry.js';

describe('当前稿刷新注册表', () => {
  it('无活动编辑器时安全通过，注册后调用唯一活动处理器', async () => {
    await expect(flushRegisteredDraft()).resolves.toBe(true);
    const handler = vi.fn(async () => false);
    const stop = registerDraftFlushHandler(handler);
    await expect(flushRegisteredDraft()).resolves.toBe(false);
    expect(handler).toHaveBeenCalledOnce();
    stop();
    await expect(flushRegisteredDraft()).resolves.toBe(true);
  });

  it('旧组件卸载不会清除后来注册的处理器', async () => {
    const stopOld = registerDraftFlushHandler(async () => false);
    const current = vi.fn(async () => true);
    const stopCurrent = registerDraftFlushHandler(current);
    stopOld();
    await expect(flushRegisteredDraft()).resolves.toBe(true);
    expect(current).toHaveBeenCalledOnce();
    stopCurrent();
  });
});
