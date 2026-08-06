import { useCallback, useMemo, type ReactNode } from 'react';

import type { RecoveryOverview } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { useBridgeQuery } from '../../bridge/use-bridge-resource.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import { recoveryOverviewAvailability } from './recovery-overview-state.js';

interface RecoveryOverviewGateProps {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly children: (bridge: RendererBridgeAdapter) => ReactNode;
}

export function RecoveryOverviewGate({ bridge, projectId, children }: RecoveryOverviewGateProps) {
  const load = useCallback(
    () => bridge.recovery.getOverview(projectId, { mode: 'share' }),
    [bridge, projectId],
  );
  const resource = useBridgeQuery(`recovery-gate:${projectId}`, load);
  const availability = recoveryOverviewAvailability(resource.state, resource.data !== null);
  const preloadedBridge = useMemo(
    () => (resource.data ? bridgeWithInitialRecoveryOverview(bridge, resource.data) : bridge),
    [bridge, resource.data],
  );

  if (availability === 'available') return children(preloadedBridge);

  const message = resource.error
    ? authorErrorSummary(resource.error)
    : resource.state === 'cancelled'
      ? '恢复信息读取已取消。'
      : '恢复信息当前不可用，无法确认恢复点与空间状态。';
  return (
    <section className="recovery-grid" data-recovery-overview-state={availability}>
      <div className="feature-card recovery-summary">
        <h2>{availability === 'loading' ? '正在读取恢复信息' : '恢复信息不可用'}</h2>
        <p role="status">
          {availability === 'loading' ? '正在读取本地恢复点、数据库模式与空间状态…' : message}
        </p>
        <button
          disabled={availability === 'loading'}
          type="button"
          onClick={resource.refresh}
        >
          重新读取
        </button>
      </div>
    </section>
  );
}

export function bridgeWithInitialRecoveryOverview(
  bridge: RendererBridgeAdapter,
  overview: RecoveryOverview,
): RendererBridgeAdapter {
  let initialOverviewAvailable = true;
  const recovery = new Proxy(bridge.recovery, {
    get(target, property, receiver) {
      if (property === 'getOverview') {
        return (...args: Parameters<RendererBridgeAdapter['recovery']['getOverview']>) => {
          if (initialOverviewAvailable) {
            initialOverviewAvailable = false;
            return Promise.resolve({
              state: 'success' as const,
              generation: 0,
              requestId: crypto.randomUUID(),
              data: overview,
            });
          }
          return target.getOverview(...args);
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });
  return new Proxy(bridge, {
    get(target, property, receiver) {
      return property === 'recovery' ? recovery : Reflect.get(target, property, receiver);
    },
  });
}
