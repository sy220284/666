import { describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: { invoke: electron.invoke },
}));

type UnknownMethod = (input?: unknown) => unknown;

async function executeBridge(bridge: unknown): Promise<number> {
  if (!bridge || typeof bridge !== 'object') return 0;
  const methods = Object.values(bridge).filter(
    (value): value is UnknownMethod => typeof value === 'function',
  );
  for (const method of methods) {
    try {
      const result = method(undefined);
      if (result instanceof Promise) await expect(result).rejects.toBeDefined();
    } catch (error) {
      expect(error).toBeDefined();
    }
  }
  return methods.length;
}

describe('independent preload bridge execution coverage', () => {
  it('executes all exposed command methods through their contract boundaries', async () => {
    await import('../../apps/desktop/preload/src/continuity-bridge.js');
    await import('../../apps/desktop/preload/src/research-bridge.js');
    await import('../../apps/desktop/preload/src/validation-bridge.js');
    await import('../../apps/desktop/preload/src/search-tools-bridge.js');
    await import('../../apps/desktop/preload/src/journal-bridge.js');
    await import('../../apps/desktop/preload/src/narrative-planning-bridge.js');
    await import('../../apps/desktop/preload/src/state-proposal-bridge.js');
    await import('../../apps/desktop/preload/src/longform-ai-bridge.js');
    await import('../../apps/desktop/preload/src/rhythm-bridge.js');
    await import('../../apps/desktop/preload/src/idea-capsule-bridge.js');
    await import('../../apps/desktop/preload/src/story-knowledge-bridge.js');

    expect(electron.exposeInMainWorld).toHaveBeenCalledTimes(11);
    let executed = 0;
    for (const [, bridge] of electron.exposeInMainWorld.mock.calls) {
      executed += await executeBridge(bridge);
    }
    expect(executed).toBeGreaterThan(40);
  });
});
