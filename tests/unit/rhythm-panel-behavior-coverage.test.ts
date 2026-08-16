import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
const activeRenderers: TestRenderer[] = [];

function textContent(instance: TestInstance): string {
  return instance.children
    .map((child) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function dashboard(overrides: Partial<RhythmDashboard> = {}): RhythmDashboard {
  return contractInput<RhythmDashboard>({
    profile: {
      enabled: true,
      excitementMinPer1000: 1.5,
      excitementMaxPer1000: 4.5,
      hookEnabled: true,
      goldenThreeEnabled: false,
      targetDailyCharacters: 6000,
      idleThresholdSeconds: 600,
      timeZone: 'Asia/Shanghai',
      statisticsStartedAt: '2026-08-01T08:00:00.000Z',
    },
    today: {
      manualNetCharacters: 1888,
      effectiveSeconds: 750,
    },
    cumulativeManualNetCharacters: 12345,
    chapters: [
      {
        chapterId: 'chapter-1',
        ordinal: 1,
        title: '开篇',
        characterCount: 3200,
        excitementPer1000: 2.25,
        endingHookDetected: true,
        inGoldenThree: true,
      },
      {
        chapterId: 'chapter-2',
        ordinal: 4,
        title: '转折',
        characterCount: 2800,
        excitementPer1000: 1,
        endingHookDetected: false,
        inGoldenThree: false,
      },
    ],
    suggestions: [
      {
        suggestionId: 'suggestion-1',
        priority: 'high',
        kind: 'hook',
        message: '章末可加强钩子。',
        evidence: ['当前章末冲突较弱', '最近三章留存波动'],
      },
    ],
    ...overrides,
  });
}

function createBridge() {
  const get = vi.fn().mockResolvedValue({ state: 'success', data: dashboard() });
  const updateProfile = vi.fn().mockResolvedValue({ state: 'success', data: dashboard() });
  const run = vi.fn().mockResolvedValue({ state: 'success', data: dashboard() });
  return {
    bridge: contractInput<RendererBridgeAdapter>({ rhythm: { get, updateProfile, run } }),
    get,
    updateProfile,
    run,
  };
}

async function renderPanel(bridge: RendererBridgeAdapter, readOnly = false): Promise<TestRenderer> {
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(createElement(RhythmPanel, { bridge, projectId, readOnly }));
    await flushPromises();
  });
  activeRenderers.push(renderer);
  return renderer;
}

function form(root: TestInstance): TestInstance {
  const node = root.findAll((candidate) => candidate.type === 'form')[0];
  if (!node) throw new Error('Missing rhythm form.');
  return node;
}

function recalcButton(root: TestInstance): TestInstance {
  const node = root.findAll(
    (candidate) => candidate.type === 'button' && textContent(candidate).includes('重新计算'),
  )[0];
  if (!node) throw new Error('Missing recalculate button.');
  return node;
}

function submit(node: TestInstance, currentTarget: unknown): void {
  const handler = node.props.onSubmit;
  if (typeof handler !== 'function') throw new Error('Missing onSubmit.');
  (handler as (event: unknown) => void)({ currentTarget, preventDefault: vi.fn() });
}

function click(node: TestInstance): void {
  const handler = node.props.onClick;
  if (typeof handler !== 'function') throw new Error('Missing onClick.');
  (handler as () => void)();
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(async () => {
  await act(async () => {
    for (const renderer of activeRenderers.splice(0)) renderer.unmount();
  });
  vi.unstubAllGlobals();
});

describe('RhythmPanel author behavior coverage', () => {
  it('loads and renders rhythm statistics, chapter signals and P3 suggestions', async () => {
    const harness = createBridge();
    const renderer = await renderPanel(harness.bridge);

    expect(harness.get).toHaveBeenCalledWith({ projectId }, { mode: 'replace' });
    expect(textContent(renderer.root)).toContain('今日人工净增 1888 字');
    expect(textContent(renderer.root)).toContain('有效输入 13 分钟');
    expect(textContent(renderer.root)).toContain('累计人工净增 12345 字');
    expect(textContent(renderer.root)).toContain('章末钩子 已识别 · 黄金三章');
    expect(textContent(renderer.root)).toContain('章末钩子 未识别');
    expect(textContent(renderer.root)).toContain('hook · P3建议');
    expect(textContent(renderer.root)).toContain('当前章末冲突较弱 · 最近三章留存波动');
  });

  it('reports load failures and ignores a late result after unmount', async () => {
    const failureHarness = createBridge();
    failureHarness.get.mockResolvedValueOnce({
      state: 'failure',
      error: { code: 'COMMON_TIMEOUT_005', message: '读取超时。', retryable: true },
    });
    const failedRenderer = await renderPanel(failureHarness.bridge);
    expect(textContent(failedRenderer.root)).toContain('节奏读取失败 · 操作等待超时');

    const cancelledHarness = createBridge();
    cancelledHarness.get.mockResolvedValueOnce({ state: 'cancelled' });
    const cancelledRenderer = await renderPanel(cancelledHarness.bridge);
    expect(textContent(cancelledRenderer.root)).toContain('所有节奏结果均为 P3 建议');

    const lateHarness = createBridge();
    const late = deferred<{ state: 'success'; data: RhythmDashboard }>();
    lateHarness.get.mockReturnValueOnce(late.promise);
    let lateRenderer!: TestRenderer;
    await act(async () => {
      lateRenderer = create(
        createElement(RhythmPanel, { bridge: lateHarness.bridge, projectId, readOnly: false }),
      );
    });
    activeRenderers.push(lateRenderer);
    await act(async () => lateRenderer.unmount());
    activeRenderers.splice(activeRenderers.indexOf(lateRenderer), 1);
    await act(async () => {
      late.resolve({ state: 'success', data: dashboard() });
      await flushPromises();
    });
    expect(lateHarness.get).toHaveBeenCalledOnce();
  });

  it('saves the complete author profile, then surfaces a later save failure', async () => {
    const harness = createBridge();
    const renderer = await renderPanel(harness.bridge);
    const values: Record<string, string | null> = {
      enabled: 'on',
      minimum: '2.25',
      maximum: '5.75',
      hookEnabled: null,
      goldenThreeEnabled: 'on',
      targetDailyCharacters: '8888',
      idleThresholdSeconds: '450',
      timeZone: 'Asia/Tokyo',
    };
    class FakeFormData {
      get(name: string): string | null {
        return values[name] ?? null;
      }
    }
    vi.stubGlobal('FormData', FakeFormData);

    await act(async () => {
      submit(form(renderer.root), {});
      await flushPromises();
    });
    expect(harness.updateProfile).toHaveBeenCalledWith({
      projectId,
      authority: 'author',
      enabled: true,
      excitementMinPer1000: 2.25,
      excitementMaxPer1000: 5.75,
      hookEnabled: false,
      goldenThreeEnabled: true,
      targetDailyCharacters: 8888,
      idleThresholdSeconds: 450,
      timeZone: 'Asia/Tokyo',
    });
    expect(textContent(renderer.root)).toContain('节奏参考区间与统计口径已保存。');

    harness.updateProfile.mockResolvedValueOnce({
      state: 'failure',
      error: { code: 'COMMON_CONFLICT_003', message: '配置已变化。', retryable: true },
    });
    await act(async () => {
      submit(form(renderer.root), {});
      await flushPromises();
    });
    expect(textContent(renderer.root)).toContain('节奏配置保存失败 · 内容状态已经变化');

    harness.updateProfile.mockResolvedValueOnce({ state: 'cancelled' });
    await act(async () => {
      submit(form(renderer.root), {});
      await flushPromises();
    });
    expect(textContent(renderer.root)).toContain('节奏配置保存失败 · 内容状态已经变化');
  });

  it('does not save before data is ready or in read-only mode', async () => {
    const pendingHarness = createBridge();
    const pending = deferred<{ state: 'success'; data: RhythmDashboard }>();
    pendingHarness.get.mockReturnValueOnce(pending.promise);
    let pendingRenderer!: TestRenderer;
    await act(async () => {
      pendingRenderer = create(
        createElement(RhythmPanel, {
          bridge: pendingHarness.bridge,
          projectId,
          readOnly: false,
        }),
      );
    });
    activeRenderers.push(pendingRenderer);
    expect(textContent(pendingRenderer.root)).toContain('所有节奏结果均为 P3 建议');
    expect(pendingRenderer.root.findAll((node) => node.type === 'form')).toHaveLength(0);
    await act(async () => {
      pending.resolve({ state: 'success', data: dashboard() });
      await flushPromises();
    });

    const readOnlyHarness = createBridge();
    const readOnlyRenderer = await renderPanel(readOnlyHarness.bridge, true);
    const submitButton = readOnlyRenderer.root.findAll(
      (node) => node.type === 'button' && textContent(node).includes('保存配置'),
    )[0]!;
    expect(submitButton.props.disabled).toBe(true);
    await act(async () => {
      submit(form(readOnlyRenderer.root), {});
      await flushPromises();
    });
    expect(readOnlyHarness.updateProfile).not.toHaveBeenCalled();
  });

  it('recalculates on demand, applying success and safely ignoring failure outcomes', async () => {
    const harness = createBridge();
    harness.run
      .mockResolvedValueOnce({
        state: 'success',
        data: dashboard({ cumulativeManualNetCharacters: 99999 }),
      })
      .mockResolvedValueOnce({
        state: 'failure',
        error: { code: 'COMMON_TIMEOUT_005', message: '重新计算超时。', retryable: true },
      });
    const renderer = await renderPanel(harness.bridge);

    await act(async () => {
      click(recalcButton(renderer.root));
      await flushPromises();
    });
    expect(harness.run).toHaveBeenNthCalledWith(1, { projectId });
    expect(textContent(renderer.root)).toContain('累计人工净增 99999 字');

    await act(async () => {
      click(recalcButton(renderer.root));
      await flushPromises();
    });
    expect(harness.run).toHaveBeenCalledTimes(2);
    expect(textContent(renderer.root)).toContain('累计人工净增 99999 字');
  });
});
