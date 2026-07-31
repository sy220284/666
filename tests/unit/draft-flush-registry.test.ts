import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DRAFT_FLUSH_FAILED_EVENT,
  flushRegisteredDraft,
  registerDraftFlushHandler,
} from '../../apps/desktop/renderer/src/runtime/draft-flush-registry.js';

let stopActive: (() => void) | null = null;

afterEach(() => {
  stopActive?.();
  stopActive = null;
  vi.unstubAllGlobals();
});

describe('当前稿刷新注册表', () => {
  it('无活动编辑器时安全通过，注册后调用唯一活动处理器', async () => {
    await expect(flushRegisteredDraft()).resolves.toBe(true);
    const handler = vi.fn(async () => false);
    stopActive = registerDraftFlushHandler(handler);
    await expect(flushRegisteredDraft()).resolves.toBe(false);
    expect(handler).toHaveBeenCalledOnce();
    stopActive();
    stopActive = null;
    await expect(flushRegisteredDraft()).resolves.toBe(true);
  });

  it('旧组件卸载不会清除后来注册的处理器', async () => {
    const stopOld = registerDraftFlushHandler(async () => false);
    const current = vi.fn(async () => true);
    stopActive = registerDraftFlushHandler(current);
    stopOld();
    await expect(flushRegisteredDraft()).resolves.toBe(true);
    expect(current).toHaveBeenCalledOnce();
  });

  it('保存返回false时发布阻断事件', async () => {
    const events: string[] = [];
    vi.stubGlobal('window', {
      dispatchEvent(event: Event) {
        events.push(event.type);
        return true;
      },
    });
    stopActive = registerDraftFlushHandler(async () => false);

    await expect(flushRegisteredDraft()).resolves.toBe(false);
    expect(events).toEqual([DRAFT_FLUSH_FAILED_EVENT]);
  });

  it('处理器抛出异常时转换为失败并发布阻断事件', async () => {
    const dispatchEvent = vi.fn(() => true);
    vi.stubGlobal('window', { dispatchEvent });
    stopActive = registerDraftFlushHandler(async () => {
      throw new Error('save failed');
    });

    await expect(flushRegisteredDraft()).resolves.toBe(false);
    expect(dispatchEvent).toHaveBeenCalledOnce();
  });
});
