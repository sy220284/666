import type { ProviderSummary } from '@worldforge/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import {
  providerScopeLabel,
  refreshProviderSettings,
  runProviderSettingsCommand,
} from '../../apps/desktop/renderer/src/features/provider/provider-settings-controller.js';
import { RendererCommandCoordinator } from '../../apps/desktop/renderer/src/runtime/command-coordinator.js';

function deferred(): { readonly promise: Promise<void>; resolve(): void } {
  let resolvePromise!: () => void;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

function bridgeWithList(list: RendererBridgeAdapter['providers']['list']): RendererBridgeAdapter {
  return { providers: { list } } as unknown as RendererBridgeAdapter;
}

describe('M10-13 Provider settings controller', () => {
  it('refreshes provider state and reports empty and populated results', async () => {
    const provider = {} as ProviderSummary;
    const list = vi
      .fn<RendererBridgeAdapter['providers']['list']>()
      .mockResolvedValueOnce({
        state: 'success',
        generation: 1,
        requestId: crypto.randomUUID(),
        data: { providers: [provider] },
      })
      .mockResolvedValueOnce({
        state: 'success',
        generation: 2,
        requestId: crypto.randomUUID(),
        data: { providers: [] },
      });
    const setProviders = vi.fn();
    const onProvidersChanged = vi.fn();
    const setMessage = vi.fn();
    const input = {
      bridge: bridgeWithList(list),
      setProviders,
      onProvidersChanged,
      setMessage,
    };

    await refreshProviderSettings(input);
    await refreshProviderSettings(input);

    expect(setProviders).toHaveBeenNthCalledWith(1, [provider]);
    expect(setProviders).toHaveBeenNthCalledWith(2, []);
    expect(onProvidersChanged).toHaveBeenCalledTimes(2);
    expect(setMessage).toHaveBeenNthCalledWith(1, 'AI连接已加载。');
    expect(setMessage).toHaveBeenNthCalledWith(2, '尚未配置AI连接；离线写作功能不受影响。');
  });

  it('reports bridge failures while ignoring stale or replaced refreshes', async () => {
    const setMessage = vi.fn();
    const failureBridge = bridgeWithList(
      vi.fn().mockResolvedValue({
        state: 'failure',
        generation: 1,
        requestId: null,
        error: {
          code: 'COMMON_INTERNAL_999',
          message: 'provider list failed',
          retryable: true,
        },
      }),
    );
    await refreshProviderSettings({
      bridge: failureBridge,
      setProviders: vi.fn(),
      onProvidersChanged: vi.fn(),
      setMessage,
    });
    expect(setMessage).toHaveBeenCalledWith(expect.stringContaining('本地服务遇到异常'));
    expect(setMessage).not.toHaveBeenCalledWith(expect.stringContaining('provider list failed'));

    const staleMessage = vi.fn();
    await refreshProviderSettings(
      {
        bridge: bridgeWithList(
          vi.fn().mockResolvedValue({
            state: 'success',
            generation: 2,
            requestId: crypto.randomUUID(),
            data: { providers: [] },
          }),
        ),
        setProviders: vi.fn(),
        onProvidersChanged: vi.fn(),
        setMessage: staleMessage,
      },
      { key: 'provider-command', token: 1, isCurrent: () => false },
    );
    expect(staleMessage).not.toHaveBeenCalled();

    await refreshProviderSettings({
      bridge: bridgeWithList(vi.fn().mockRejectedValue(new Error('transport failed'))),
      setProviders: vi.fn(),
      onProvidersChanged: vi.fn(),
      setMessage,
    });
    expect(setMessage).toHaveBeenLastCalledWith('AI连接读取未完成，请重试。');
  });

  it('owns pending state and rejects a second provider command', async () => {
    const coordinator = new RendererCommandCoordinator();
    const gate = deferred();
    const setPending = vi.fn();
    const setMessage = vi.fn();
    const first = runProviderSettingsCommand({
      coordinator,
      pendingKey: 'save',
      setPending,
      setMessage,
      operation: async () => gate.promise,
    });
    await Promise.resolve();

    await runProviderSettingsCommand({
      coordinator,
      pendingKey: 'remove:provider-a',
      setPending,
      setMessage,
      operation: async () => undefined,
    });
    expect(setMessage).toHaveBeenCalledWith('已有AI连接操作正在处理，请完成后再试。');

    gate.resolve();
    await first;
    expect(setPending.mock.calls).toEqual([['save'], [null]]);
  });

  it('releases pending state and reports an unexpected command failure', async () => {
    const setPending = vi.fn();
    const setMessage = vi.fn();
    await runProviderSettingsCommand({
      coordinator: new RendererCommandCoordinator(),
      pendingKey: 'test:provider-a',
      setPending,
      setMessage,
      operation: async () => Promise.reject(new Error('test failed')),
    });

    expect(setPending.mock.calls).toEqual([['test:provider-a'], [null]]);
    expect(setMessage).toHaveBeenCalledWith('AI连接操作未完成，请重试。');
  });

  it('labels every provider endpoint scope', () => {
    expect(providerScopeLabel('loopback')).toBe('当前设备');
    expect(providerScopeLabel('lan')).toBe('局域网');
    expect(providerScopeLabel('remote')).toBe('外部网络');
  });
});
