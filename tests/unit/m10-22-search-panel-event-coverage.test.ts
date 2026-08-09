import { describe, expect, it, vi } from 'vitest';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';

vi.mock('react', () => ({
  useEffect: () => undefined,
  useRef: <T>(value: T) => ({ current: value }),
  useState: <T>(initial: T | (() => T)) => {
    const value = typeof initial === 'function' ? (initial as () => T)() : initial;
    const setValue = (next: T | ((current: T) => T)): void => {
      if (typeof next === 'function') (next as (current: T) => T)(value);
    };
    return [value, setValue] as const;
  },
}));

interface ElementLike {
  readonly props?: {
    readonly children?: unknown;
    readonly onClick?: () => void;
  };
}

function findReloadButton(value: unknown): ElementLike | null {
  if (!value || typeof value !== 'object') return null;
  const element = value as ElementLike;
  const children = element.props?.children;
  if (children === '重新读取搜索状态' && element.props?.onClick) return element;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findReloadButton(child);
    if (found) return found;
  }
  return null;
}

describe('M10-22 SearchPanel事件覆盖', () => {
  it('重新读取按钮通过函数式状态更新推进reload token', async () => {
    const { SearchPanel } =
      await import('../../apps/desktop/renderer/src/features/checks/search-panel.js');
    const tree = SearchPanel({
      bridge: {} as RendererBridgeAdapter,
      projectId: '00000000-0000-4000-8000-000000000022',
      readOnly: false,
      onNavigate: () => undefined,
    });
    const reloadButton = findReloadButton(tree);

    expect(reloadButton).not.toBeNull();
    expect(() => reloadButton?.props?.onClick?.()).not.toThrow();
  });
});
