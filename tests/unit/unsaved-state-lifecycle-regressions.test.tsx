import { createRequire } from 'node:module';

import type { AppSettings, AppearancePreferences, Entity, EntityCatalog } from '@worldforge/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { createElement as createReactElement, ReactElement } from 'react';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { EntityCanonPanel } from '../../apps/desktop/renderer/src/features/canon/entity-canon-panel.js';
import { ProviderSettings } from '../../apps/desktop/renderer/src/features/settings/provider-settings.js';
import {
  SettingsPage,
  type SettingsPageProps,
} from '../../apps/desktop/renderer/src/features/settings/settings-page.js';
import { registeredUnsavedChangeLabels } from '../../apps/desktop/renderer/src/runtime/unsaved-changes.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const entityControls = vi.hoisted(() => ({
  resource: {
    state: 'success' as const,
    data: null as unknown,
    error: null as unknown,
    refresh: vi.fn(),
  },
  commandRun: vi.fn(),
}));

vi.mock('../../apps/desktop/renderer/src/bridge/use-bridge-resource.js', () => ({
  useBridgeQuery: () => entityControls.resource,
  useBridgeCommand: () => ({
    pending: false,
    error: null,
    run: entityControls.commandRun,
  }),
}));

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
  update(element: ReactElement): void;
  unmount(): void;
}
const { act, create } = rendererRequire('react-test-renderer') as {
  readonly act: (callback: () => void | Promise<void>) => Promise<void>;
  readonly create: (element: ReactElement) => TestRenderer;
};

const projectId = '11111111-1111-4111-8111-111111111111';
const entityId = '22222222-2222-4222-8222-222222222222';
const activeRenderers: TestRenderer[] = [];

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

function success<T>(data: T) {
  return {
    state: 'success' as const,
    generation: 1,
    requestId: '33333333-3333-4333-8333-333333333333',
    data,
  };
}

function textContent(instance: TestInstance): string {
  return instance.children
    .map((child) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

function nodeWithProp(root: TestInstance, name: string, value?: unknown): TestInstance {
  const node = root.findAll((candidate) => {
    if (!(name in candidate.props)) return false;
    return value === undefined || candidate.props[name] === value;
  })[0];
  if (!node) throw new Error(`MISSING_NODE:${name}`);
  return node;
}

function button(root: TestInstance, label: string): TestInstance {
  const node = root.findAll(
    (candidate) => candidate.type === 'button' && textContent(candidate).includes(label),
  )[0];
  if (!node) throw new Error(`MISSING_BUTTON:${label}`);
  return node;
}

async function invoke(node: TestInstance, prop: 'onClick' | 'onChange', argument?: unknown) {
  const handler = node.props[prop];
  if (typeof handler !== 'function') throw new Error(`MISSING_HANDLER:${prop}`);
  await act(async () => {
    (handler as (value?: unknown) => unknown)(argument);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount(element: ReactElement): Promise<TestRenderer> {
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(element);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  activeRenderers.push(renderer);
  return renderer;
}

function settingsProps(overrides: Partial<SettingsPageProps> = {}): SettingsPageProps {
  return {
    bridge: contractInput<RendererBridgeAdapter>({}),
    disclosureMode: 'professional',
    settings,
    appearance,
    coreStatus: null,
    project: null,
    providers: [],
    pendingKey: null,
    message: null,
    onClose: vi.fn(),
    onSaveSettings: vi.fn(async () => true),
    onResetSettings: vi.fn(),
    onSaveAppearance: vi.fn(async () => true),
    onRestartCore: vi.fn(),
    onOpenOnboarding: vi.fn(),
    aiReady: false,
    onProvidersChanged: vi.fn(),
    onProviderConnectionVerified: vi.fn(),
    onProviderInvalidated: vi.fn(),
    ...overrides,
  };
}

function archivedEntity(): Entity {
  return contractInput<Entity>({
    id: entityId,
    projectId,
    entityType: 'character',
    name: '沈砚',
    aliases: [],
    summary: '主角',
    status: 'archived',
    archivedAt: '2026-08-19T00:00:00.000Z',
    createdAt: '2026-08-18T00:00:00.000Z',
    updatedAt: '2026-08-19T00:00:00.000Z',
    facts: [],
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    confirm: vi.fn(() => true),
    prompt: vi.fn(() => '沈砚'),
  });
  entityControls.resource.state = 'success';
  entityControls.resource.error = null;
  entityControls.resource.refresh.mockReset();
  entityControls.commandRun.mockReset();
  entityControls.commandRun.mockImplementation(async (operation: () => Promise<unknown>) => {
    const outcome = (await operation()) as { state?: string; data?: unknown };
    return outcome.state === 'success' ? outcome.data : null;
  });
});

afterEach(async () => {
  await act(async () => {
    for (const renderer of activeRenderers.splice(0)) renderer.unmount();
  });
  vi.unstubAllGlobals();
  expect(registeredUnsavedChangeLabels()).toEqual([]);
});

describe('unsaved state lifecycle regressions', () => {
  it('clears the general-settings guard only after persisted settings are refreshed', async () => {
    const onResetSettings = vi.fn();
    const input = settingsProps({ onResetSettings });
    const renderer = await mount(createElement(SettingsPage, input));
    const mode = nodeWithProp(renderer.root, 'data-default-mode');

    await invoke(mode, 'onChange', { target: { value: 'professional' } });
    expect(nodeWithProp(renderer.root, 'data-settings-section', 'general').props['data-unsaved']).toBe(
      'true',
    );

    await invoke(button(renderer.root, '恢复默认'), 'onClick');
    expect(onResetSettings).toHaveBeenCalledOnce();
    expect(registeredUnsavedChangeLabels()).toContain('通用设置');

    await act(async () => {
      renderer.update(
        createElement(SettingsPage, {
          ...input,
          settings: { ...settings, startupBehavior: 'reopen-last' },
        }),
      );
      await Promise.resolve();
    });

    expect(nodeWithProp(renderer.root, 'data-settings-section', 'general').props['data-unsaved']).toBe(
      'false',
    );
    expect(registeredUnsavedChangeLabels()).not.toContain('通用设置');
  });

  it('marks user-selected provider presets and new-connection drafts as unsaved', async () => {
    const bridge = contractInput<RendererBridgeAdapter>({
      providers: {
        list: vi.fn(async () => success({ providers: [] })),
      },
    });
    const renderer = await mount(
      createElement(ProviderSettings, {
        bridge,
        onProvidersChanged: vi.fn(),
        onProviderConnectionVerified: vi.fn(),
        onProviderInvalidated: vi.fn(),
      }),
    );

    expect(nodeWithProp(renderer.root, 'data-provider-settings').props['data-unsaved']).toBe('false');
    await invoke(nodeWithProp(renderer.root, 'data-provider-preset', 'anthropic'), 'onClick');
    expect(nodeWithProp(renderer.root, 'data-provider-settings').props['data-unsaved']).toBe('true');
    expect(registeredUnsavedChangeLabels()).toContain('智能连接设置');

    await invoke(button(renderer.root, '新建本机连接'), 'onClick');
    expect(nodeWithProp(renderer.root, 'data-provider-settings').props['data-unsaved']).toBe('true');
    expect(registeredUnsavedChangeLabels()).toContain('智能连接设置');
  });

  it('clears entity and fact guards after a successful permanent entity deletion', async () => {
    const selected = archivedEntity();
    const catalog = contractInput<EntityCatalog>({ projectId, entities: [selected] });
    entityControls.resource.data = catalog;
    const bridge = contractInput<RendererBridgeAdapter>({
      canon: {
        list: vi.fn(async () => success(catalog)),
        previewDelete: vi.fn(async () =>
          success({
            projectId,
            entityId,
            entityName: selected.name,
            archived: true,
            sceneBeatReferenceCount: 0,
            canonFactCount: 0,
            canDelete: true,
            blockers: [],
          }),
        ),
        delete: vi.fn(async () => success({ projectId, entityId, deleted: true })),
      },
    });
    const renderer = await mount(
      createElement(EntityCanonPanel, {
        bridge,
        projectId,
        readOnly: false,
        selectedEntityId: entityId,
      }),
    );

    await invoke(nodeWithProp(renderer.root, 'data-canon-entity-form'), 'onChange');
    await invoke(nodeWithProp(renderer.root, 'data-canon-fact-form'), 'onChange');
    expect(registeredUnsavedChangeLabels()).toEqual(['设定条目', '设定事实']);

    await invoke(nodeWithProp(renderer.root, 'data-delete-entity'), 'onClick');
    expect(bridge.canon.delete).toHaveBeenCalledWith({
      projectId,
      authority: 'author',
      entityId,
      confirmName: selected.name,
    });
    expect(registeredUnsavedChangeLabels()).not.toContain('设定条目');
    expect(registeredUnsavedChangeLabels()).not.toContain('设定事实');
  });
});