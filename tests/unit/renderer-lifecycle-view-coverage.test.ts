import { createRequire } from 'node:module';

import { describe, expect, it, vi } from 'vitest';
import type { createElement as createReactElement, ReactElement } from 'react';
import type { renderToStaticMarkup as renderReactToStaticMarkup } from 'react-dom/server';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { DraftFlushFailureDialogView } from '../../apps/desktop/renderer/src/components/draft-flush-failure-dialog.js';
import {
  HistoricalNavigationNotice,
  HistoricalNavigationNoticeView,
} from '../../apps/desktop/renderer/src/features/writing/historical-navigation-notice.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const rendererRequire = createRequire(
  new URL('../../apps/desktop/renderer/package.json', import.meta.url),
);
const { createElement } = rendererRequire('react') as {
  readonly createElement: typeof createReactElement;
};
const { renderToStaticMarkup } = rendererRequire('react-dom/server') as {
  readonly renderToStaticMarkup: typeof renderReactToStaticMarkup;
};
interface TestInstance {
  readonly children: readonly (TestInstance | string)[];
}
interface TestRenderer {
  readonly root: TestInstance;
  unmount(): void;
}
const { act, create } = rendererRequire('react-test-renderer') as {
  readonly act: (callback: () => void | Promise<void>) => Promise<void>;
  readonly create: (element: ReactElement) => TestRenderer;
};

function render(component: Parameters<typeof createElement>[0], props: object): string {
  return renderToStaticMarkup(createElement(component, props));
}

describe('Renderer 生命周期组件纯视图覆盖', () => {
  it('覆盖历史导航 loading、missing 和 ready 三个确定状态', () => {
    expect(
      render(HistoricalNavigationNoticeView, {
        state: { status: 'loading' },
        logicalBlockId: 'block-1',
      }),
    ).toContain('正在读取问题所依据的定稿');
    expect(
      render(HistoricalNavigationNoticeView, {
        state: { status: 'missing' },
        logicalBlockId: 'block-1',
      }),
    ).toContain('没有跳转到可能错误的正文');
    const ready = render(HistoricalNavigationNoticeView, {
      state: { status: 'ready', versionTitle: '定稿 3', text: '问题原文' },
      logicalBlockId: 'block-1',
    });
    expect(ready).toContain('来源：定稿 3');
    expect(ready).toContain('问题原文');
    expect(ready).toContain('data-version-navigation-block="block-1"');
  });

  it('按历史版本读取结果切换 ready、missing，并在卸载后忽略旧结果', async () => {
    const navigation = {
      projectId: '5a198db8-5a43-45ea-b777-7dfb63742bb7',
      chapterId: '481b7b8f-c7b4-4a87-88b6-1d27721a3bb8',
      versionId: '14c75ab9-cff0-4e04-8d10-2613247773ec',
      logicalBlockId: 'b82f7a0f-963e-45ca-8505-cdd014b73691',
    };
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

    const readyBridge = contractInput<RendererBridgeAdapter>({
      version: {
        get: vi.fn(async () =>
          success({
            title: '定稿 3',
            blocks: [{ logicalBlockId: navigation.logicalBlockId, text: '问题原文' }],
          }),
        ),
      },
    });
    let ready!: TestRenderer;
    await act(async () => {
      ready = create(
        createElement(HistoricalNavigationNotice, { bridge: readyBridge, ...navigation }),
      );
      await flushPromises();
    });
    expect(textContent(ready.root)).toContain('来源：定稿 3');
    expect(textContent(ready.root)).toContain('问题原文');
    await act(async () => ready.unmount());

    for (const bridge of [
      contractInput<RendererBridgeAdapter>({
        version: { get: vi.fn(async () => failure('COMMON_INTERNAL_999')) },
      }),
      contractInput<RendererBridgeAdapter>({
        version: {
          get: vi.fn(async () =>
            success({
              title: '定稿 3',
              blocks: [{ logicalBlockId: '另一个段落', text: '无关正文' }],
            }),
          ),
        },
      }),
    ]) {
      let missing!: TestRenderer;
      await act(async () => {
        missing = create(createElement(HistoricalNavigationNotice, { bridge, ...navigation }));
        await flushPromises();
      });
      expect(textContent(missing.root)).toContain('没有跳转到可能错误的正文');
      await act(async () => missing.unmount());
    }

    type VersionOutcome = Awaited<ReturnType<RendererBridgeAdapter['version']['get']>>;
    let resolveVersion!: (outcome: VersionOutcome) => void;
    const deferredBridge = contractInput<RendererBridgeAdapter>({
      version: {
        get: vi.fn(() => new Promise<VersionOutcome>((resolve) => (resolveVersion = resolve))),
      },
    });
    let deferred!: TestRenderer;
    await act(async () => {
      deferred = create(
        createElement(HistoricalNavigationNotice, { bridge: deferredBridge, ...navigation }),
      );
    });
    await act(async () => deferred.unmount());
    await act(async () => {
      resolveVersion(
        contractInput<VersionOutcome>(
          success({
            title: '迟到的定稿',
            blocks: [{ logicalBlockId: navigation.logicalBlockId, text: '迟到正文' }],
          }),
        ),
      );
      await flushPromises();
    });
    vi.unstubAllGlobals();
  });

  it('覆盖保存失败对话框空闲与重试状态', () => {
    const handlers = {
      onRetry: () => undefined,
      onReturn: () => undefined,
      onOpenRecovery: () => undefined,
      onCancel: () => undefined,
    };
    const idle = render(DraftFlushFailureDialogView, {
      notice: '当前稿尚未安全保存，操作已经停止。',
      retrying: false,
      ...handlers,
    });
    const retrying = render(DraftFlushFailureDialogView, {
      notice: '正在处理。',
      retrying: true,
      ...handlers,
    });

    expect(idle).toContain('重试保存');
    expect(idle).toContain('打开恢复中心');
    expect(retrying).toContain('正在重试…');
    expect(retrying.match(/disabled=""/gu)?.length).toBe(2);
  });
});

function success<T>(data: T) {
  return {
    state: 'success' as const,
    generation: 1,
    requestId: '1297f55c-68b9-4a09-bf74-c3ba6cb4a2af',
    data,
  };
}

function failure(code: 'COMMON_INTERNAL_999') {
  return {
    state: 'failure' as const,
    generation: 1,
    requestId: '1297f55c-68b9-4a09-bf74-c3ba6cb4a2af',
    error: { code, message: 'internal detail', retryable: true },
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
