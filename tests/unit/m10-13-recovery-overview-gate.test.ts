import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { RecoveryOverview } from '@worldforge/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';

const mocks = vi.hoisted(() => ({
  useBridgeQuery: vi.fn(),
}));

vi.mock('../../apps/desktop/renderer/src/bridge/use-bridge-resource.js', () => ({
  useBridgeQuery: mocks.useBridgeQuery,
}));

import { RecoveryOverviewGate } from '../../apps/desktop/renderer/src/features/data-tools/recovery-overview-gate.js';

const projectId = '00000000-0000-4000-8000-000000000013';
const overview = { projectId } as unknown as RecoveryOverview;

function bridgeFixture() {
  const getOverview = vi.fn(async () => ({
    state: 'cancelled' as const,
    generation: 2,
    requestId: crypto.randomUUID(),
  }));
  const bridge = {
    marker: 'bridge',
    recovery: { getOverview, marker: 'recovery' },
  } as unknown as RendererBridgeAdapter;
  return { bridge, getOverview };
}

function renderGate(bridge: RendererBridgeAdapter) {
  let childBridge: RendererBridgeAdapter | null = null;
  const markup = renderToStaticMarkup(
    createElement(RecoveryOverviewGate, {
      bridge,
      projectId,
      children: (value) => {
        childBridge = value;
        return createElement('span', null, '恢复信息已加载');
      },
    }),
  );
  return { markup, childBridge };
}

describe('M10-13 Recovery overview gate', () => {
  beforeEach(() => {
    mocks.useBridgeQuery.mockReset();
  });

  it('renders loading, failure, cancelled and unavailable states without exposing empty data', () => {
    const { bridge } = bridgeFixture();
    const refresh = vi.fn(async () => undefined);

    mocks.useBridgeQuery.mockReturnValueOnce({
      state: 'loading',
      data: null,
      error: null,
      refresh,
    });
    expect(renderGate(bridge).markup).toContain('正在读取恢复信息');

    mocks.useBridgeQuery.mockReturnValueOnce({
      state: 'failure',
      data: null,
      error: {
        code: 'BRIDGE_UNEXPECTED_FAILURE',
        message: 'overview unavailable',
        retryable: true,
      },
      refresh,
    });
    expect(renderGate(bridge).markup).toContain('恢复信息不可用');

    mocks.useBridgeQuery.mockReturnValueOnce({
      state: 'cancelled',
      data: null,
      error: null,
      refresh,
    });
    expect(renderGate(bridge).markup).toContain('恢复信息读取已取消');

    mocks.useBridgeQuery.mockReturnValueOnce({
      state: 'failure',
      data: null,
      error: null,
      refresh,
    });
    expect(renderGate(bridge).markup).toContain('无法确认恢复点与空间状态');
  });

  it('loads through the real bridge and consumes the preloaded overview exactly once', async () => {
    const { bridge, getOverview } = bridgeFixture();
    const refresh = vi.fn(async () => undefined);
    mocks.useBridgeQuery.mockReturnValue({
      state: 'success',
      data: overview,
      error: null,
      refresh,
    });

    const rendered = renderGate(bridge);
    expect(rendered.markup).toContain('恢复信息已加载');
    expect(rendered.childBridge).not.toBeNull();

    const load = mocks.useBridgeQuery.mock.calls[0]?.[1] as () => Promise<unknown>;
    await load();
    expect(getOverview).toHaveBeenCalledTimes(1);

    const preloaded = rendered.childBridge!;
    expect((preloaded as unknown as { marker: string }).marker).toBe('bridge');
    expect((preloaded.recovery as unknown as { marker: string }).marker).toBe('recovery');

    const first = await preloaded.recovery.getOverview(projectId, { mode: 'share' });
    expect(first).toMatchObject({ state: 'success', data: overview });
    expect(getOverview).toHaveBeenCalledTimes(1);

    await preloaded.recovery.getOverview(projectId, { mode: 'share' });
    expect(getOverview).toHaveBeenCalledTimes(2);
  });
});
