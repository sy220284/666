import { createRequire } from 'node:module';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RhythmDashboard } from '@worldforge/contracts';
import type { createElement as createReactElement, ReactElement } from 'react';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { RhythmPanel } from '../../apps/desktop/renderer/src/features/checks/rhythm-panel.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const rendererRequire = createRequire(
  new URL('../../apps/desktop/renderer/package.json', import.meta.url),
);
const { createElement } = rendererRequire('react') as {
  readonly createElement: typeof createReactElement;
};
interface TestInstance {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
  readonly children: readonly (TestInstance | string)[];
  findAll(predicate: (node: TestInstance) => boolean): TestInstance[];
}
interface TestRenderer {
  readonly root: TestInstance;
  unmount(): void;
}
const { act, create } = rendererRequire('react-test-renderer') as {
  readonly act: (callback: () => void | Promise<void>) => Promise<void>;
  readonly create: (element: ReactElement) => TestRenderer;
};

const projectId = '11111111-1111-4111-8111-111111111111';
const timestamp = '2026-08-19T08:00:00.000Z';

function dashboard(): RhythmDashboard {
  return {
    projectId,
    profile: {
      projectId,
      channel: '男频',
      enabled: true,
      excitementMinPer1000: 1,
      excitementMaxPer1000: 3,
      hookEnabled: true,
      goldenThreeEnabled: true,
      targetDailyCharacters: 4000,
      idleThresholdSeconds: 300,
      timeZone: 'Asia/Shanghai',
      statisticsStartedAt: timestamp,
      updatedAt: timestamp,
    },
    today: { day: '2026-08-19', manualNetCharacters: 1200, effectiveSeconds: 1800 },
    cumulativeManualNetCharacters: 1200,
    cumulativeEffectiveSeconds: 1800,
    days: [],
    chapters: [],
    suggestions: [],
    calculatedAt: timestamp,
  };
}

function success(data: RhythmDashboard) {
  return {
    state: 'success' as const,
    generation: 1,
    requestId: '22222222-2222-4222-8222-222222222222',
    data,
  };
}

function textContent(instance: TestInstance): string {
  return instance.children
    .map((child) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('rhythm panel operation ownership', () => {
  it('rejects recalculation while a profile save owns the panel operation lane', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal(
      'FormData',
      class {
        get(name: string): FormDataEntryValue | null {
          const values: Record<string, string> = {
            enabled: 'on',
            minimum: '1',
            maximum: '3',
            hookEnabled: 'on',
            goldenThreeEnabled: 'on',
            targetDailyCharacters: '4000',
            idleThresholdSeconds: '300',
            timeZone: 'Asia/Shanghai',
          };
          return values[name] ?? null;
        }
      },
    );

    let resolveSave!: (value: ReturnType<typeof success>) => void;
    const updateProfile = vi.fn(
      () =>
        new Promise<ReturnType<typeof success>>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const run = vi.fn(async () => success(dashboard()));
    const bridge = contractInput<RendererBridgeAdapter>({
      rhythm: {
        get: vi.fn(async () => success(dashboard())),
        updateProfile,
        run,
      },
    });

    let renderer!: TestRenderer;
    await act(async () => {
      renderer = create(createElement(RhythmPanel, { bridge, projectId, readOnly: false }));
      await flushPromises();
    });
    const form = renderer.root.findAll((node) => node.type === 'form')[0];
    const recalculate = renderer.root.findAll(
      (node) => node.type === 'button' && textContent(node) === '重新计算',
    )[0];
    if (!form || !recalculate) throw new Error('RHYTHM_CONTROLS_MISSING');

    await act(async () => {
      (form.props.onChange as () => void)();
      void (
        form.props.onSubmit as (event: { preventDefault(): void; currentTarget: object }) => void
      )({
        preventDefault() {},
        currentTarget: {},
      });
      (recalculate.props.onClick as () => void)();
      await flushPromises();
    });

    expect(updateProfile).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
    expect(recalculate.props.disabled).toBe(true);

    await act(async () => {
      resolveSave(success(dashboard()));
      await flushPromises();
    });
    expect(renderer.root.findAll((node) => node.type === 'form')[0]?.props['data-unsaved']).toBe(
      'false',
    );

    await act(async () => renderer.unmount());
  });
});
