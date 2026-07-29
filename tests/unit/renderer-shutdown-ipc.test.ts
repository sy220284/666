import { describe, expect, it, vi } from 'vitest';

import {
  PROTOCOL_VERSION,
  RENDERER_SHUTDOWN_CHANNELS,
  type RendererShutdownPrepare,
} from '@worldforge/contracts';
import {
  requestRendererDraftFlush,
  type RendererShutdownEvent,
} from '../../apps/desktop/main/src/renderer-shutdown-ipc.js';

const rendererUrl = 'worldforge-app://renderer/index.html';

function harness() {
  const listeners = new Map<string, (event: RendererShutdownEvent, raw: unknown) => void>();
  const ipcMain = {
    on(channel: string, listener: (event: unknown, raw: unknown) => void) {
      listeners.set(channel, listener);
      return ipcMain;
    },
    off(channel: string, listener: (event: unknown, raw: unknown) => void) {
      if (listeners.get(channel) === listener) listeners.delete(channel);
      return ipcMain;
    },
  };
  const send = vi.fn();
  return { ipcMain, listeners, send };
}

describe('关闭前当前稿刷新握手', () => {
  it('只接受当前应用页面、匹配请求标识且通过合同校验的结果', async () => {
    const value = harness();
    const pending = requestRendererDraftFlush(
      value.ipcMain,
      { send: value.send },
      rendererUrl,
      1_000,
    );
    const request = value.send.mock.calls[0]?.[1] as RendererShutdownPrepare;
    const respond = value.listeners.get(RENDERER_SHUTDOWN_CHANNELS.result);
    respond?.({ senderFrame: { url: 'https://untrusted.invalid/' } }, { ...request, saved: true });
    respond?.(
      { senderFrame: { url: rendererUrl } },
      { ...request, requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', saved: true },
    );
    respond?.({ senderFrame: { url: rendererUrl } }, { ...request, saved: true, extra: true });
    respond?.({ senderFrame: { url: rendererUrl } }, { ...request, saved: true });

    await expect(pending).resolves.toBe(true);
    expect(request.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(value.listeners.size).toBe(0);
  });

  it('保存失败和超时均关闭失败，不会静默退出', async () => {
    const failed = harness();
    const failedPending = requestRendererDraftFlush(
      failed.ipcMain,
      { send: failed.send },
      rendererUrl,
      1_000,
    );
    const request = failed.send.mock.calls[0]?.[1] as RendererShutdownPrepare;
    failed.listeners.get(RENDERER_SHUTDOWN_CHANNELS.result)?.(
      { senderFrame: { url: rendererUrl } },
      { ...request, saved: false },
    );
    await expect(failedPending).resolves.toBe(false);

    vi.useFakeTimers();
    try {
      const timedOut = harness();
      const timedOutPending = requestRendererDraftFlush(
        timedOut.ipcMain,
        { send: timedOut.send },
        rendererUrl,
        25,
      );
      await vi.advanceTimersByTimeAsync(25);
      await expect(timedOutPending).resolves.toBe(false);
      expect(timedOut.listeners.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
