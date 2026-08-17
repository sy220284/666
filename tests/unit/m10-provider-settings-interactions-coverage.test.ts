import { createRequire } from 'node:module';

import type { ProviderConnectionTestResult, ProviderSummary } from '@worldforge/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { createElement as createReactElement, ReactElement } from 'react';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import type { ProviderSettingsProps } from '../../apps/desktop/renderer/src/features/settings/provider-settings.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const rendererRequire = createRequire(
  new URL('../../apps/desktop/renderer/package.json', import.meta.url),
);
const { createElement } = rendererRequire('react') as {
  readonly createElement: typeof createReactElement;
};
const { act, create } = rendererRequire('react-test-renderer') as {
  readonly act: (callback: () => void | Promise<void>) => Promise<void>;
  readonly create: (element: ReactElement) => TestRenderer;
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

const now = '2026-08-17T00:00:00.000Z';
const endpoint = {
  scope: 'loopback' as const,
  origin: 'http://127.0.0.1:11434',
  secureTransport: false,
  warnings: ['仅发送到当前设备。'],
};
const provider: ProviderSummary = {
  id: 'local-openai',
  name: '本地模型',
  protocol: 'openai_compatible',
  baseUrl: 'http://127.0.0.1:11434/v1',
  model: 'writer-model',
  timeoutMs: 30_000,
  options: {},
  credentialConfigured: true,
  endpoint,
  createdAt: now,
  updatedAt: now,
};
const customProvider: ProviderSummary = {
  ...provider,
  id: 'legacy-custom',
  name: '旧接口',
  protocol: 'custom',
  credentialConfigured: false,
  endpoint: { ...endpoint, scope: 'remote', secureTransport: true, warnings: [] },
};
const connection: ProviderConnectionTestResult = {
  providerId: provider.id,
  protocol: provider.protocol,
  endpoint,
  reachable: true,
  authentication: 'verified',
  modelList: 'verified',
  actualModel: provider.model,
  streaming: true,
  structuredOutput: false,
  tokenUsageAvailable: false,
  latencyMs: 12,
  checkedAt: now,
  warnings: ['模型列表已验证。'],
};

function success<T>(data: T) {
  return {
    state: 'success' as const,
    generation: 1,
    requestId: '11111111-1111-4111-8111-111111111111',
    data,
  };
}

function failure(message: string) {
  return {
    state: 'failure' as const,
    generation: 1,
    requestId: null,
    error: {
      code: 'COMMON_INTERNAL_999' as const,
      message,
      retryable: true,
    },
  };
}

function textContent(instance: TestInstance): string {
  return instance.children
    .map((child) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

function control(root: TestInstance, type: string, predicate: (node: TestInstance) => boolean) {
  const result = root.findAll((node) => node.type === type && predicate(node))[0];
  if (!result) throw new Error(`Missing ${type} control.`);
  return result;
}

function button(root: TestInstance, label: string, index = 0): TestInstance {
  const result = root.findAll(
    (node) => node.type === 'button' && textContent(node).includes(label),
  )[index];
  if (!result) throw new Error(`Missing button ${label}#${index}.`);
  return result;
}

async function invoke(
  node: TestInstance,
  prop: 'onClick' | 'onChange' | 'onSubmit',
  argument?: unknown,
): Promise<void> {
  const handler = node.props[prop];
  if (typeof handler !== 'function') throw new Error(`Missing ${prop}.`);
  await act(async () => {
    (handler as (value?: unknown) => unknown)(argument);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function bridge(overrides: Partial<RendererBridgeAdapter['providers']> = {}) {
  return contractInput<RendererBridgeAdapter>({
    providers: {
      list: vi.fn(async () => success({ providers: [provider, customProvider] })),
      save: vi.fn(async () => success(provider)),
      remove: vi.fn(async () => success({ providerId: provider.id, removed: true })),
      testConnection: vi.fn(async () => success(connection)),
      ...overrides,
    },
  });
}

function props(
  providerBridge: RendererBridgeAdapter,
  overrides: Partial<ProviderSettingsProps> = {},
): ProviderSettingsProps {
  return {
    bridge: providerBridge,
    onProvidersChanged: vi.fn(),
    onProviderConnectionVerified: vi.fn(),
    onProviderInvalidated: vi.fn(),
    ...overrides,
  };
}

async function mount(input: ProviderSettingsProps): Promise<TestRenderer> {
  const { ProviderSettings } =
    await import('../../apps/desktop/renderer/src/features/settings/provider-settings.js');
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(createElement(ProviderSettings, input));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return renderer;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

describe('M10 智能连接设置交互覆盖', () => {
  it('加载连接并覆盖预设、字段编辑、协议切换与密钥替换保存', async () => {
    const providerBridge = bridge();
    const input = props(providerBridge);
    const renderer = await mount(input);

    expect(input.onProvidersChanged).toHaveBeenCalledWith([provider, customProvider]);
    expect(textContent(renderer.root)).toContain('智能连接已加载。');
    expect(textContent(renderer.root)).toContain('历史配置只读');
    expect(textContent(renderer.root)).toContain('外部网络');
    expect(textContent(renderer.root)).toContain('加密连接');

    await invoke(
      control(
        renderer.root,
        'button',
        (node) => node.props['data-provider-preset'] === 'anthropic',
      ),
      'onClick',
    );
    expect(textContent(renderer.root)).toContain('Anthropic预设已填入');

    await invoke(
      control(renderer.root, 'input', (node) => Boolean(node.props['data-provider-name'])),
      'onChange',
      { target: { value: 'Claude服务' } },
    );
    await invoke(
      control(renderer.root, 'input', (node) => Boolean(node.props['data-provider-model'])),
      'onChange',
      { target: { value: 'claude-model' } },
    );
    await invoke(
      control(renderer.root, 'input', (node) => Boolean(node.props['data-provider-credential'])),
      'onChange',
      { target: { value: 'secret' } },
    );
    await invoke(
      control(renderer.root, 'input', (node) => Boolean(node.props['data-provider-id'])),
      'onChange',
      { target: { value: 'claude-local' } },
    );
    await invoke(
      control(renderer.root, 'select', (node) => Boolean(node.props['data-provider-protocol'])),
      'onChange',
      { target: { value: 'openai_compatible' } },
    );
    await invoke(
      control(renderer.root, 'select', (node) => Boolean(node.props['data-provider-protocol'])),
      'onChange',
      { target: { value: 'anthropic' } },
    );
    await invoke(
      control(renderer.root, 'input', (node) => Boolean(node.props['data-provider-base-url'])),
      'onChange',
      { target: { value: 'https://example.invalid/v1' } },
    );
    await invoke(
      control(renderer.root, 'input', (node) => Boolean(node.props['data-provider-timeout'])),
      'onChange',
      { target: { value: '45000' } },
    );
    await invoke(
      control(renderer.root, 'form', () => true),
      'onSubmit',
      {
        preventDefault: vi.fn(),
      },
    );

    expect(providerBridge.providers.save).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          id: 'claude-local',
          name: 'Claude服务',
          protocol: 'anthropic',
          baseUrl: 'https://example.invalid/v1',
          model: 'claude-model',
          timeoutMs: 45_000,
        }),
        credential: { action: 'replace', credential: 'secret' },
      }),
    );
    expect(input.onProviderInvalidated).toHaveBeenCalledWith(provider.id);
    renderer.unmount();
  });

  it('覆盖编辑、保留/移除密钥、测试连接、双击删除与重置', async () => {
    const providerBridge = bridge();
    const input = props(providerBridge);
    const renderer = await mount(input);

    await invoke(button(renderer.root, '编辑'), 'onClick');
    expect(textContent(renderer.root)).toContain('密钥不会回显');
    await invoke(
      control(renderer.root, 'form', () => true),
      'onSubmit',
      {
        preventDefault: vi.fn(),
      },
    );
    expect(providerBridge.providers.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ credential: { action: 'preserve' } }),
    );

    await invoke(button(renderer.root, '编辑'), 'onClick');
    await invoke(
      control(renderer.root, 'input', (node) =>
        Boolean(node.props['data-provider-remove-credential']),
      ),
      'onChange',
      { target: { checked: true } },
    );
    await invoke(
      control(renderer.root, 'form', () => true),
      'onSubmit',
      {
        preventDefault: vi.fn(),
      },
    );
    expect(providerBridge.providers.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ credential: { action: 'remove' } }),
    );

    await invoke(
      control(renderer.root, 'button', (node) => node.props['data-provider-test'] === provider.id),
      'onClick',
    );
    expect(providerBridge.providers.testConnection).toHaveBeenCalledWith(provider.id, {
      mode: 'replace',
    });
    expect(input.onProviderConnectionVerified).toHaveBeenCalledWith(connection);
    expect(textContent(renderer.root)).toContain('连接成功：writer-model，12毫秒');
    expect(textContent(renderer.root)).toContain('使用本地估算');
    expect(textContent(renderer.root)).toContain('未通过');

    const remove = () =>
      control(
        renderer.root,
        'button',
        (node) => node.props['data-provider-remove'] === provider.id,
      );
    await invoke(remove(), 'onClick');
    expect(textContent(renderer.root)).toContain('再次点击删除');
    await invoke(remove(), 'onClick');
    expect(providerBridge.providers.remove).toHaveBeenCalledWith(provider.id);
    expect(input.onProviderInvalidated).toHaveBeenCalledWith(provider.id);

    await invoke(button(renderer.root, '新建本机连接'), 'onClick');
    expect(textContent(renderer.root)).toContain('Ollama（本机）预设已填入');
    renderer.unmount();
  });

  it('覆盖保存/测试/删除失败以及连接已不存在分支', async () => {
    const save = vi
      .fn()
      .mockResolvedValueOnce(failure('save failed'))
      .mockResolvedValueOnce(success(provider));
    const testConnection = vi.fn().mockResolvedValue(failure('test failed'));
    const remove = vi
      .fn()
      .mockResolvedValueOnce(failure('remove failed'))
      .mockResolvedValueOnce(success({ providerId: provider.id, removed: false }));
    const providerBridge = bridge({ save, testConnection, remove });
    const renderer = await mount(props(providerBridge));

    await invoke(
      control(renderer.root, 'form', () => true),
      'onSubmit',
      {
        preventDefault: vi.fn(),
      },
    );
    expect(textContent(renderer.root)).toContain('本地服务遇到异常');

    await invoke(
      control(renderer.root, 'button', (node) => node.props['data-provider-test'] === provider.id),
      'onClick',
    );
    expect(textContent(renderer.root)).toContain('本地服务遇到异常');

    const removeButton = () =>
      control(
        renderer.root,
        'button',
        (node) => node.props['data-provider-remove'] === provider.id,
      );
    await invoke(removeButton(), 'onClick');
    await invoke(removeButton(), 'onClick');
    expect(textContent(renderer.root)).toContain('本地服务遇到异常');
    await invoke(removeButton(), 'onClick');
    await invoke(removeButton(), 'onClick');
    expect(textContent(renderer.root)).toContain('该智能连接已不存在');

    renderer.unmount();
  });
});
