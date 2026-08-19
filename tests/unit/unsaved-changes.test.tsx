import { createRequire } from 'node:module';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { createElement as createReactElement, ReactElement } from 'react';

import {
  confirmRegisteredUnsavedChanges,
  registeredUnsavedChangeLabels,
  useUnsavedChangesGuard,
  type UnsavedChangesGuard,
} from '../../apps/desktop/renderer/src/runtime/unsaved-changes.js';

const rendererRequire = createRequire(
  new URL('../../apps/desktop/renderer/package.json', import.meta.url),
);
const { createElement } = rendererRequire('react') as {
  readonly createElement: typeof createReactElement;
};

interface TestRenderer {
  unmount(): void;
}
const { act, create } = rendererRequire('react-test-renderer') as {
  readonly act: (callback: () => void | Promise<void>) => Promise<void>;
  readonly create: (element: ReactElement) => TestRenderer;
};

function GuardHarness({
  label,
  expose,
}: {
  readonly label: string;
  readonly expose: (guard: UnsavedChangesGuard) => void;
}) {
  const guard = useUnsavedChangesGuard(label);
  expose(guard);
  return null;
}

async function renderGuard(label: string): Promise<{
  readonly renderer: TestRenderer;
  readonly guard: () => UnsavedChangesGuard;
}> {
  let current: UnsavedChangesGuard | null = null;
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(
      createElement(GuardHarness, {
        label,
        expose: (guard: UnsavedChangesGuard) => {
          current = guard;
        },
      }),
    );
  });
  return {
    renderer,
    guard: () => {
      if (!current) throw new Error('GUARD_NOT_EXPOSED');
      return current;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('unsaved changes governance', () => {
  it('registers immediately, blocks global navigation when cancelled and clears after local discard', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const confirm = vi.fn(() => false);
    vi.stubGlobal('window', { confirm });
    const harness = await renderGuard('作品核心');

    await act(async () => harness.guard().markDirty());
    expect(registeredUnsavedChangeLabels()).toEqual(['作品核心']);
    expect(confirmRegisteredUnsavedChanges('离开当前页面')).toBe(false);
    expect(confirm).toHaveBeenCalledWith(
      '作品核心有未保存修改。离开当前页面会放弃这些修改，是否继续？',
    );
    expect(registeredUnsavedChangeLabels()).toEqual(['作品核心']);

    confirm.mockReturnValue(true);
    await act(async () => {
      expect(harness.guard().confirmDiscard('暂时收起作品核心')).toBe(true);
    });
    expect(registeredUnsavedChangeLabels()).toEqual([]);
    expect(harness.guard().dirty).toBe(false);

    await act(async () => harness.renderer.unmount());
  });

  it('deduplicates labels and unregisters dirty forms on unmount without clearing other forms', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('window', { confirm: vi.fn(() => true) });
    const first = await renderGuard('场景');
    const second = await renderGuard('场景');
    const third = await renderGuard('章节信息');

    await act(async () => {
      first.guard().markDirty();
      second.guard().markDirty();
      third.guard().markDirty();
    });
    expect(registeredUnsavedChangeLabels()).toEqual(['场景', '章节信息']);

    await act(async () => first.renderer.unmount());
    expect(registeredUnsavedChangeLabels()).toEqual(['场景', '章节信息']);
    await act(async () => second.renderer.unmount());
    expect(registeredUnsavedChangeLabels()).toEqual(['章节信息']);
    await act(async () => third.renderer.unmount());
    expect(registeredUnsavedChangeLabels()).toEqual([]);
  });
});
