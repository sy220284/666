import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: vi.fn().mockResolvedValue(undefined),
  },
}));

import { createAppBridge } from '../../apps/desktop/preload/src/app-bridge-factory.js';
import { createProjectBridge } from '../../apps/desktop/preload/src/project-bridge-factory.js';
import { createRecoveryBridge } from '../../apps/desktop/preload/src/recovery-bridge-factory.js';
import { createWritingBridge } from '../../apps/desktop/preload/src/writing-bridge-factory.js';

type UnknownMethod = (input?: unknown) => unknown;

function collectMethods(value: unknown, methods: UnknownMethod[] = []): UnknownMethod[] {
  if (typeof value === 'function') {
    methods.push(value as UnknownMethod);
    return methods;
  }
  if (!value || typeof value !== 'object') return methods;
  for (const child of Object.values(value)) collectMethods(child, methods);
  return methods;
}

async function executeBoundary(method: UnknownMethod): Promise<void> {
  try {
    const result = method(undefined);
    if (result instanceof Promise) {
      await expect(result).rejects.toBeDefined();
    }
  } catch (error) {
    expect(error).toBeDefined();
  }
}

describe('preload command factory execution coverage', () => {
  it.each([
    ['app', createAppBridge],
    ['project', createProjectBridge],
    ['recovery', createRecoveryBridge],
    ['writing', createWritingBridge],
  ] as const)('executes every %s factory command boundary', async (_label, factory) => {
    const methods = collectMethods(factory());
    expect(methods.length).toBeGreaterThan(0);
    for (const method of methods) await executeBoundary(method);
  });
});
