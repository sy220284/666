import { createRequire } from 'node:module';

import { describe, expect, it, vi } from 'vitest';

import type { createElement as createReactElement } from 'react';
import type { renderToStaticMarkup as renderReactToStaticMarkup } from 'react-dom/server';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { SearchPanel } from '../../apps/desktop/renderer/src/features/checks/search-panel.js';
import { ProviderSettings } from '../../apps/desktop/renderer/src/features/settings/provider-settings.js';
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

describe('M10-22 Renderer异步所有权初始界面', () => {
  it('服务端渲染搜索与Provider初始状态时不触发异步副作用', () => {
    const bridge = contractInput<RendererBridgeAdapter>({});
    const onNavigate = vi.fn();
    const onProvidersChanged = vi.fn();
    const onProviderConnectionVerified = vi.fn();
    const onProviderInvalidated = vi.fn();

    const searchMarkup = renderToStaticMarkup(
      createElement(SearchPanel, {
        bridge,
        projectId: '00000000-0000-4000-8000-000000000022',
        readOnly: false,
        onNavigate,
      }),
    );
    const providerMarkup = renderToStaticMarkup(
      createElement(ProviderSettings, {
        bridge,
        onProvidersChanged,
        onProviderConnectionVerified,
        onProviderInvalidated,
      }),
    );

    expect(searchMarkup).toContain('data-project-search');
    expect(searchMarkup).toContain('保存词条');
    expect(providerMarkup).toContain('data-provider-settings');
    expect(providerMarkup).toContain('Anthropic');
    expect(onNavigate).not.toHaveBeenCalled();
    expect(onProvidersChanged).not.toHaveBeenCalled();
    expect(onProviderConnectionVerified).not.toHaveBeenCalled();
    expect(onProviderInvalidated).not.toHaveBeenCalled();
  });
});
