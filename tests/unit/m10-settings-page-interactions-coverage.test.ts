import { createRequire } from 'node:module';

import type {
  AppSettings,
  AppearancePreferences,
  CoreStatus,
  DiagnosticPreview,
  ProjectWorkspaceSummary,
} from '@worldforge/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { createElement as createReactElement, ReactElement } from 'react';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import type { SettingsPageProps } from '../../apps/desktop/renderer/src/features/settings/settings-page.js';
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

const projectId = '11111111-1111-4111-8111-111111111111';
const settings: AppSettings = {
  schemaVersion: 1,
  language: 'zh-CN',
  startupBehavior: 'show-home',
  defaultMode: 'beginner',
  creativePath: 'autonomous',
  onboardingCompleted: true,
  onboardingTipsSeen: [],
  onboardingScaffoldDismissed: true,
  themeId: 'theme-a',
  themeVariant: 'eye-care',
  reduceMotion: false,
};
const appearance: AppearancePreferences = {
  workspaceAlignment: 'center',
  uiScalePercent: 100,
  bodyFontSize: 18,
  contentWidth: 'normal',
};
const project = contractInput<ProjectWorkspaceSummary>({
  projectId,
  name: '长夜行舟',
  databaseMode: 'read-write',
});
const coreStatus: CoreStatus = {
  status: 'degraded',
  pid: 1234,
  restartCount: 2,
  lastErrorCode: 'CORE_TEST_FAILURE',
  diagnosticId: 'diag-123',
};
const diagnosticPreview: DiagnosticPreview = {
  manifest: {
    generatedAt: '2026-08-17T00:00:00.000Z',
    included: ['app-info', 'core-status'],
    excluded: ['project-content', 'provider-credentials'],
    contentIncluded: false,
    credentialIncluded: false,
  },
  app: { version: '1.0.0', platform: 'linux', protocolVersion: 1 },
  core: coreStatus,
  display: { platform: 'linux', scaleFactor: 1 },
  logs: { includedFiles: 0, includedEntries: 0, redacted: true },
};

function success<T>(data: T) {
  return {
    state: 'success' as const,
    generation: 1,
    requestId: '22222222-2222-4222-8222-222222222222',
    data,
  };
}

function failure(message: string, code = 'COMMON_INTERNAL_999') {
  return {
    state: 'failure' as const,
    generation: 1,
    requestId: '33333333-3333-4333-8333-333333333333',
    error: { code, message, retryable: false },
  };
}

function cancelled() {
  return {
    state: 'cancelled' as const,
    generation: 1,
    requestId: null,
  };
}

function textContent(node: TestInstance | string): string {
  if (typeof node === 'string') return node;
  return node.children.map(textContent).join('');
}

function control(root: TestInstance, type: string, predicate: (node: TestInstance) => boolean) {
  const result = root.findAll((node) => node.type === type && predicate(node))[0];
  if (!result) throw new Error(`Missing ${type} control.`);
  return result;
}

function button(root: TestInstance, label: string): TestInstance {
  return control(root, 'button', (node) => textContent(node).includes(label));
}

function form(root: TestInstance, section: string): TestInstance {
  return control(root, 'form', (node) => node.props['data-settings-section'] === section);
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

function baseBridge(overrides: Partial<RendererBridgeAdapter['app']> = {}): RendererBridgeAdapter {
  return contractInput<RendererBridgeAdapter>({
    app: {
      previewDiagnostics: vi.fn(async () => success(diagnosticPreview)),
      exportDiagnostics: vi.fn(async () =>
        success({ fileName: 'worldforge-diagnostics.zip', bytes: 1234, sha256: 'a'.repeat(64) }),
      ),
      ...overrides,
    },
  });
}

function props(
  bridge: RendererBridgeAdapter,
  overrides: Partial<SettingsPageProps> = {},
): SettingsPageProps {
  return {
    bridge,
    disclosureMode: 'professional',
    settings,
    appearance,
    coreStatus,
    project,
    providers: [],
    pendingKey: null,
    message: '设置已同步。',
    onClose: vi.fn(),
    onSaveSettings: vi.fn(async () => true),
    onResetSettings: vi.fn(),
    onSaveAppearance: vi.fn(async () => true),
    onRestartCore: vi.fn(),
    onOpenOnboarding: vi.fn(),
    aiReady: true,
    onProvidersChanged: vi.fn(),
    onProviderConnectionVerified: vi.fn(),
    onProviderInvalidated: vi.fn(),
    ...overrides,
  };
}

async function mount(input: SettingsPageProps): Promise<TestRenderer> {
  vi.doMock('../../apps/desktop/renderer/src/features/settings/provider-settings.js', () => ({
    ProviderSettings: () =>
      createElement('div', { 'data-mock-provider-settings': true }, '连接设置'),
  }));
  vi.doMock('../../apps/desktop/renderer/src/features/settings/longform-ai-settings.js', () => ({
    LongformAiSettingsPanel: () =>
      createElement('div', { 'data-mock-longform-settings': true }, '长篇智能设置'),
  }));
  const { SettingsPage } =
    await import('../../apps/desktop/renderer/src/features/settings/settings-page.js');
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(createElement(SettingsPage, input));
    await Promise.resolve();
  });
  return renderer;
}

async function unmount(renderer: TestRenderer): Promise<void> {
  await act(async () => {
    renderer.unmount();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock('../../apps/desktop/renderer/src/features/settings/provider-settings.js');
  vi.doUnmock('../../apps/desktop/renderer/src/features/settings/longform-ai-settings.js');
  vi.unstubAllGlobals();
});

describe('M10 设置页父级交互覆盖', () => {
  it('覆盖通用设置、分区导航以及编辑器保存', async () => {
    const bridge = baseBridge();
    const input = props(bridge);
    const renderer = await mount(input);

    expect(textContent(renderer.root)).toContain('设置已同步。');
    await invoke(button(renderer.root, '返回上一页'), 'onClick');
    await invoke(button(renderer.root, '重新打开项目引导'), 'onClick');
    await invoke(button(renderer.root, '恢复默认'), 'onClick');
    expect(input.onClose).toHaveBeenCalled();
    expect(input.onOpenOnboarding).toHaveBeenCalled();
    expect(input.onResetSettings).toHaveBeenCalled();

    const generalSelects = form(renderer.root, 'general').findAll((node) => node.type === 'select');
    await invoke(generalSelects[1]!, 'onChange', { target: { value: 'reopen-last' } });
    await invoke(
      control(renderer.root, 'select', (node) => Boolean(node.props['data-default-mode'])),
      'onChange',
      { target: { value: 'professional' } },
    );
    await invoke(
      control(renderer.root, 'select', (node) => Boolean(node.props['data-creative-path'])),
      'onChange',
      { target: { value: 'hybrid' } },
    );
    await invoke(form(renderer.root, 'general'), 'onSubmit', { preventDefault: vi.fn() });
    expect(input.onSaveSettings).toHaveBeenCalledWith({
      language: 'zh-CN',
      startupBehavior: 'reopen-last',
      defaultMode: 'professional',
      creativePath: 'hybrid',
    });

    await invoke(
      control(
        renderer.root,
        'button',
        (node) => node.props['data-settings-navigation'] === 'editor',
      ),
      'onClick',
    );
    await invoke(
      control(renderer.root, 'input', (node) => Boolean(node.props['data-body-font-size'])),
      'onChange',
      { target: { value: '22' } },
    );
    await invoke(
      control(renderer.root, 'select', (node) => Boolean(node.props['data-content-width'])),
      'onChange',
      { target: { value: 'wide' } },
    );
    await invoke(form(renderer.root, 'editor'), 'onSubmit', { preventDefault: vi.fn() });
    expect(input.onSaveAppearance).toHaveBeenCalledWith({
      ...appearance,
      bodyFontSize: 22,
      contentWidth: 'wide',
    });

    await invoke(
      control(
        renderer.root,
        'button',
        (node) => node.props['data-settings-navigation'] === 'providers',
      ),
      'onClick',
    );
    expect(
      renderer.root.findAll((node) => Boolean(node.props['data-mock-provider-settings'])),
    ).toHaveLength(1);

    await invoke(
      control(
        renderer.root,
        'button',
        (node) => node.props['data-settings-navigation'] === 'longform',
      ),
      'onClick',
    );
    expect(
      renderer.root.findAll((node) => Boolean(node.props['data-mock-longform-settings'])),
    ).toHaveLength(1);
    await unmount(renderer);
  });

  it('覆盖外观主题联动和设置保存失败保护', async () => {
    const bridge = baseBridge();
    const input = props(bridge);
    const renderer = await mount(input);
    await invoke(
      control(
        renderer.root,
        'button',
        (node) => node.props['data-settings-navigation'] === 'appearance',
      ),
      'onClick',
    );
    await invoke(
      control(renderer.root, 'select', (node) => Boolean(node.props['data-theme-id'])),
      'onChange',
      { target: { value: 'theme-b' } },
    );
    await invoke(
      control(renderer.root, 'select', (node) => Boolean(node.props['data-theme-variant'])),
      'onChange',
      { target: { value: 'dark' } },
    );
    await invoke(
      control(renderer.root, 'select', (node) => Boolean(node.props['data-ui-scale'])),
      'onChange',
      { target: { value: '120' } },
    );
    await invoke(
      control(renderer.root, 'select', (node) => Boolean(node.props['data-workspace-alignment'])),
      'onChange',
      { target: { value: 'right' } },
    );
    await invoke(
      control(renderer.root, 'input', (node) => Boolean(node.props['data-reduce-motion'])),
      'onChange',
      { target: { checked: true } },
    );
    await invoke(form(renderer.root, 'appearance'), 'onSubmit', { preventDefault: vi.fn() });
    expect(input.onSaveSettings).toHaveBeenLastCalledWith({
      themeId: 'theme-b',
      themeVariant: 'dark',
      reduceMotion: true,
    });
    expect(input.onSaveAppearance).toHaveBeenLastCalledWith({
      ...appearance,
      uiScalePercent: 120,
      workspaceAlignment: 'right',
    });
    await unmount(renderer);

    const blockedAppearance = vi.fn(async () => true);
    const failedInput = props(baseBridge(), {
      onSaveSettings: vi.fn(async () => false),
      onSaveAppearance: blockedAppearance,
    });
    const failed = await mount(failedInput);
    await invoke(
      control(
        failed.root,
        'button',
        (node) => node.props['data-settings-navigation'] === 'appearance',
      ),
      'onClick',
    );
    await invoke(form(failed.root, 'appearance'), 'onSubmit', { preventDefault: vi.fn() });
    expect(blockedAppearance).not.toHaveBeenCalled();
    await unmount(failed);
  });

  it('覆盖诊断预览与导出的全部结果分支以及核心重启', async () => {
    const previewDiagnostics = vi
      .fn()
      .mockResolvedValueOnce(failure('preview failed'))
      .mockResolvedValueOnce(cancelled())
      .mockResolvedValue(success(diagnosticPreview));
    const exportDiagnostics = vi
      .fn()
      .mockResolvedValueOnce(failure('cancelled', 'COMMON_CANCELLED_004'))
      .mockResolvedValueOnce(failure('export failed'))
      .mockResolvedValueOnce(cancelled())
      .mockResolvedValue(
        success({ fileName: 'worldforge-diagnostics.zip', bytes: 1234, sha256: 'b'.repeat(64) }),
      );
    const input = props(baseBridge({ previewDiagnostics, exportDiagnostics }));
    const renderer = await mount(input);
    await invoke(
      control(
        renderer.root,
        'button',
        (node) => node.props['data-settings-navigation'] === 'advanced',
      ),
      'onClick',
    );
    expect(textContent(renderer.root)).toContain('部分功能受限');
    expect(textContent(renderer.root)).toContain('CORE_TEST_FAILURE');
    expect(textContent(renderer.root)).toContain('diag-123');

    const previewButton = () => button(renderer.root, '预览诊断清单');
    await invoke(previewButton(), 'onClick');
    expect(textContent(renderer.root)).toContain('预览失败');
    await invoke(previewButton(), 'onClick');
    expect(textContent(renderer.root)).toContain('预览已取消。');
    await invoke(previewButton(), 'onClick');
    expect(textContent(renderer.root)).toContain('app-info、core-status');
    expect(textContent(renderer.root)).toContain('project-content、provider-credentials');

    const confirm = control(renderer.root, 'input', (node) =>
      Boolean(node.props['data-confirm-diagnostic-export']),
    );
    await invoke(confirm, 'onChange', { target: { checked: true } });
    const exportButton = () =>
      control(renderer.root, 'button', (node) => Boolean(node.props['data-export-diagnostics']));
    await invoke(exportButton(), 'onClick');
    expect(textContent(renderer.root)).toContain('已取消诊断导出。');
    await invoke(exportButton(), 'onClick');
    expect(textContent(renderer.root)).toContain('导出失败');
    await invoke(exportButton(), 'onClick');
    expect(textContent(renderer.root)).toContain('导出已取消。');
    await invoke(exportButton(), 'onClick');
    expect(textContent(renderer.root)).toContain('已导出 worldforge-diagnostics.zip · 1234 字节');
    expect(textContent(renderer.root)).toContain('bbbbbbbbbbbb…');

    await invoke(button(renderer.root, '安全重启本地服务'), 'onClick');
    expect(input.onRestartCore).toHaveBeenCalled();
    await unmount(renderer);

    const pending = await mount(
      props(baseBridge(), { pendingKey: 'app.restartCore', coreStatus: null, message: null }),
    );
    await invoke(
      control(
        pending.root,
        'button',
        (node) => node.props['data-settings-navigation'] === 'advanced',
      ),
      'onClick',
    );
    expect(textContent(pending.root)).toContain('状态未知');
    expect(textContent(pending.root)).toContain('正在重启…');
    await unmount(pending);
  });
});
