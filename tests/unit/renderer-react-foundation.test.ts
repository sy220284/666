import type { WorldforgeBridge } from '@worldforge/contracts';
import { describe, expect, it, vi } from 'vitest';

import {
  createLatestRequestGate,
  createRendererBridgeAdapter,
} from '../../apps/desktop/renderer/src/bridge/adapter.js';
import { disposeLegacySurface } from '../../apps/desktop/renderer/src/foundation/legacy-surface.js';
import {
  arbitrateStatus,
  type StatusSignal,
} from '../../apps/desktop/renderer/src/foundation/status-arbiter.js';
import { useUiStore } from '../../apps/desktop/renderer/src/state/ui-store.js';

describe('renderer React foundation', () => {
  it('arbitrates P0 before lower priorities and prefers persistent ties', () => {
    const signals: StatusSignal[] = [
      { id: 'toast', priority: 'P3', message: 'saved', createdAt: 30, persistent: false },
      { id: 'task', priority: 'P2', message: 'running', createdAt: 20, persistent: true },
      { id: 'failure', priority: 'P0', message: 'read only', createdAt: 10, persistent: true },
    ];
    expect(arbitrateStatus(signals)?.id).toBe('failure');
    expect(
      arbitrateStatus([
        { id: 'new', priority: 'P1', message: 'new', createdAt: 20, persistent: false },
        {
          id: 'persistent',
          priority: 'P1',
          message: 'persistent',
          createdAt: 10,
          persistent: true,
        },
      ])?.id,
    ).toBe('persistent');
  });

  it('keeps the Zustand store limited to transient UI identifiers and controls', () => {
    const state = useUiStore.getState();
    expect(state.route).toBe('home');
    expect(state.selectedProjectId).toBeNull();
    expect(state.selectedChapterId).toBeNull();
    expect(state).not.toHaveProperty('project');
    expect(state).not.toHaveProperty('draft');
    expect(state).not.toHaveProperty('candidate');
    expect(state).not.toHaveProperty('version');
    expect(state).not.toHaveProperty('entityState');
  });

  it('disposes the compatibility surface in durability-first order', async () => {
    const calls: string[] = [];
    await disposeLegacySurface({
      flushAutosave: async () => {
        calls.push('flush');
      },
      cancelAsync: () => calls.push('cancel'),
      destroyEditor: () => calls.push('destroy'),
      removeListeners: () => calls.push('listeners'),
    });
    expect(calls).toEqual(['flush', 'cancel', 'destroy', 'listeners']);
  });

  it('drops stale bridge responses and honours cancellation', async () => {
    const adapter = createRendererBridgeAdapter({} as WorldforgeBridge);
    const gate = createLatestRequestGate();
    const staleToken = gate.issue();
    gate.issue();

    await expect(
      adapter.invoke(
        async () => ({ ok: true, requestId: crypto.randomUUID(), data: 'old' }),
        { latest: staleToken },
      ),
    ).resolves.toEqual({ status: 'stale' });

    const controller = new AbortController();
    controller.abort();
    const operation = vi.fn(async () => ({
      ok: true as const,
      requestId: crypto.randomUUID(),
      data: 'ignored',
    }));
    await expect(adapter.invoke(operation, { signal: controller.signal })).resolves.toEqual({
      status: 'cancelled',
    });
    expect(operation).not.toHaveBeenCalled();
  });
});
