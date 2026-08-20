import { createRequire } from 'node:module';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JournalCatalog } from '@worldforge/contracts';
import type { createElement as createReactElement, ReactElement } from 'react';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { JournalWorkbench } from '../../apps/desktop/renderer/src/features/journal/journal-workbench.js';
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
const updatedAt = '2026-08-20T00:00:00.000Z';

function textContent(instance: TestInstance): string {
  return instance.children
    .map((child) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

function button(root: TestInstance, label: string): TestInstance {
  const match = root.findAll(
    (node) => node.type === 'button' && textContent(node).includes(label),
  )[0];
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function emptyCatalog(): JournalCatalog {
  return contractInput<JournalCatalog>({
    projectId,
    entries: [],
    preferences: { projectId, schedule: 'off', updatedAt },
    nextCursor: null,
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('JournalWorkbench 作品时区', () => {
  it('今日复盘读取作品时区而不是电脑时区', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T02:30:00.000Z'));
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const catalog = emptyCatalog();
    const generate = vi.fn().mockResolvedValue({ ok: true, data: catalog });
    vi.stubGlobal('window', {
      setTimeout: (...args: Parameters<typeof globalThis.setTimeout>) =>
        globalThis.setTimeout(...args),
      clearTimeout: (timer: ReturnType<typeof globalThis.setTimeout>) =>
        globalThis.clearTimeout(timer),
      worldforgeJournal: {
        catchUp: vi.fn().mockResolvedValue({ ok: true, data: catalog }),
        generate,
      },
    });
    const bridge = contractInput<RendererBridgeAdapter>({
      providers: {
        list: vi.fn().mockResolvedValue({ state: 'success', data: { providers: [] } }),
      },
      rhythm: {
        get: vi.fn().mockResolvedValue({
          state: 'success',
          data: {
            profile: {
              projectId,
              channel: 'male-frequency',
              enabled: true,
              excitementMinPer1000: 0,
              excitementMaxPer1000: 10,
              hookEnabled: true,
              goldenThreeEnabled: true,
              targetDailyCharacters: 4000,
              idleThresholdSeconds: 300,
              timeZone: 'America/New_York',
              statisticsStartedAt: updatedAt,
              updatedAt,
            },
          },
        }),
      },
      generation: { start: vi.fn(), getRun: vi.fn() },
    });

    let renderer!: TestRenderer;
    await act(async () => {
      renderer = create(
        createElement(JournalWorkbench, {
          bridge,
          projectId,
          readOnly: false,
          onNavigate: vi.fn(),
        }),
      );
      await flushPromises();
    });

    expect(textContent(renderer.root)).toContain('作品时区 America/New_York');
    await act(async () => {
      const onClick = button(renderer.root, '今日复盘').props.onClick;
      if (typeof onClick !== 'function') throw new Error('Missing today handler.');
      (onClick as () => void)();
      await flushPromises();
    });

    expect(generate).toHaveBeenCalledWith({
      projectId,
      periodType: 'manual',
      periodStart: '2026-08-19T04:00:00.000Z',
      periodEnd: '2026-08-20T04:00:00.000Z',
    });

    await act(async () => renderer.unmount());
  });
});
