import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';
import type { createElement as createReactElement } from 'react';
import type { renderToStaticMarkup as renderReactToStaticMarkup } from 'react-dom/server';

import { DraftFlushFailureDialogView } from '../../apps/desktop/renderer/src/components/draft-flush-failure-dialog.js';
import { HistoricalNavigationNoticeView } from '../../apps/desktop/renderer/src/features/writing/historical-navigation-notice.js';

const rendererRequire = createRequire(
  new URL('../../apps/desktop/renderer/package.json', import.meta.url),
);
const { createElement } = rendererRequire('react') as {
  readonly createElement: typeof createReactElement;
};
const { renderToStaticMarkup } = rendererRequire('react-dom/server') as {
  readonly renderToStaticMarkup: typeof renderReactToStaticMarkup;
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
