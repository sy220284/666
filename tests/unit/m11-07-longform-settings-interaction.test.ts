import { createRequire } from 'node:module';

import type { createElement as createReactElement, ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type {
  LongformAiSettings,
  ProjectStructure,
  ProjectWorkspaceSummary,
  ProviderSummary,
  StoryDigest,
} from '@worldforge/contracts';
import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { LongformAiSettingsPanel } from '../../apps/desktop/renderer/src/features/settings/longform-ai-settings.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

interface TestInstance {
  readonly props: Record<string, unknown>;
  readonly children: readonly (TestInstance | string)[];
  findAllByType(type: string): TestInstance[];
  findByProps(props: Record<string, unknown>): TestInstance;
}

interface TestRenderer {
  readonly root: TestInstance;
  unmount(): void;
}

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

const project: ProjectWorkspaceSummary = {
  projectId: '5a198db8-5a43-45ea-b777-7dfb63742bb7',
  name: '长夜行',
  channel: 'web-novel',
  workspacePath: '/safe/project',
  schemaVersion: 34,
  databaseMode: 'read-write',
  compatibility: 'current',
  readOnlyReason: null,
  createdAt: '2026-08-13T00:00:00.000Z',
};

const settings: LongformAiSettings = {
  schemaVersion: 1,
  activeStyleProfileId: null,
  styleProfiles: [],
  taskRoutes: [],
  updatedAt: null,
};

const structure: ProjectStructure = {
  projectId: project.projectId,
  volumes: [
    {
      id: '47ec1a73-cb73-454d-8133-b9574b8e6d91',
      projectId: project.projectId,
      title: '第一卷',
      orderKey: '1',
      status: 'finalized',
      deletedAt: null,
      chapters: [
        {
          id: '481b7b8f-c7b4-4a87-88b6-1d27721a3bb8',
          volumeId: '47ec1a73-cb73-454d-8133-b9574b8e6d91',
          title: '第一章',
          orderKey: '1',
          status: 'finalized',
          targetWordMin: null,
          targetWordMax: null,
          activeDraftId: null,
          finalVersionId: 'a19ee637-1789-49ee-b49d-7839b3b5585f',
          deletedAt: null,
        },
        {
          id: '4d8bb193-b682-4f39-abfe-cda2ddf5e494',
          volumeId: '47ec1a73-cb73-454d-8133-b9574b8e6d91',
          title: '第二章',
          orderKey: '2',
          status: 'finalized',
          targetWordMin: null,
          targetWordMax: null,
          activeDraftId: null,
          finalVersionId: '14c75ab9-cff0-4e04-8d10-2613247773ec',
          deletedAt: null,
        },
      ],
    },
  ],
};

const digest: StoryDigest = {
  id: '44b284f6-a320-46c2-8343-1cf08da9355b',
  projectId: project.projectId,
  scopeType: 'project',
  scopeId: project.projectId,
  sourceHash: 'a'.repeat(64),
  sourceVersionIds: ['a19ee637-1789-49ee-b49d-7839b3b5585f'],
  semanticRevision: 1,
  freshness: 'fresh',
  content: '主角带着铜铃跨卷追索旧约。',
  generationSource: 'local_extractive_v1',
  generatedAt: '2026-08-13T01:00:00.000Z',
  updatedAt: '2026-08-13T01:00:00.000Z',
};

const digestSet: readonly StoryDigest[] = [
  digest,
  {
    ...digest,
    id: '0e341550-34e0-4ddf-b852-2b94d1fbb7d3',
    scopeType: 'volume',
    scopeId: '47ec1a73-cb73-454d-8133-b9574b8e6d91',
    freshness: 'stale',
  },
  {
    ...digest,
    id: '25f6e56a-bfad-47af-a270-18607aa7f863',
    scopeType: 'chapter',
    scopeId: '481b7b8f-c7b4-4a87-88b6-1d27721a3bb8',
  },
];

const provider: ProviderSummary = {
  id: 'local-model',
  name: '本机模型',
  baseUrl: 'http://localhost:11434/',
  model: 'writer-7b',
  protocol: 'openai_compatible',
  options: {},
  credentialConfigured: true,
  endpoint: {
    scope: 'loopback',
    origin: 'http://localhost:11434',
    secureTransport: false,
    warnings: [],
  },
  timeoutMs: 60_000,
  createdAt: '2026-08-13T00:00:00.000Z',
  updatedAt: '2026-08-13T00:00:00.000Z',
};

describe('M11-07 long-form author settings interactions', () => {
  it('loads, rebuilds, learns style, evaluates and saves task routing', async () => {
    const updateSettings = vi.fn(async (input: { readonly settings: LongformAiSettings }) =>
      success({ ...input.settings, updatedAt: '2026-08-13T02:00:00.000Z' }),
    );
    const rebuildDigests = vi.fn(async () =>
      success({
        projectId: project.projectId,
        requestedScopeType: 'project' as const,
        requestedScopeId: project.projectId,
        rebuilt: [digest],
        skippedUnfinalizedChapters: 0,
      }),
    );
    const evaluateStyle = vi.fn(async () =>
      success({
        projectId: project.projectId,
        profileId: 'b68de1fd-cb0b-49c9-aa1a-d87ee694aee4',
        versionId: '14c75ab9-cff0-4e04-8d10-2613247773ec',
        status: 'within_profile' as const,
        measured: {
          averageSentenceCharacters: 18,
          averageParagraphCharacters: 60,
          dialogueRatio: 0.2,
        },
        target: {
          averageSentenceCharacters: 18,
          averageParagraphCharacters: 60,
          dialogueRatio: 0.2,
        },
        deviations: [],
      }),
    );
    const listDigests = vi.fn(async () =>
      success({ projectId: project.projectId, digests: digestSet }),
    );
    const bridge = contractInput<RendererBridgeAdapter>({
      longformAi: {
        getSettings: vi.fn(async () => success(settings)),
        listDigests,
        rebuildDigests,
        updateSettings,
        evaluateStyle,
      },
      planning: { listStructure: vi.fn(async () => success(structure)) },
    });

    let renderer!: TestRenderer;
    await act(async () => {
      renderer = create(
        createElement(LongformAiSettingsPanel, {
          bridge,
          project,
          providers: [provider],
          readOnly: false,
        }),
      );
      await flushPromises();
    });

    await click(renderer, '根据定稿重建');
    expect(rebuildDigests).toHaveBeenCalledOnce();
    expect(listDigests).toHaveBeenCalledTimes(2);
    expect(textContent(renderer.root)).toContain('有 1 项等待更新');

    await click(renderer, '使用“克制叙事”预设');
    await click(renderer, '从已定稿正文学习');
    const styleSelect = renderer.root.findByProps({ 'data-active-style-profile': true });
    expect(String(styleSelect.props.value)).not.toBe('');

    await click(renderer, '检查最近定稿');
    expect(evaluateStyle).toHaveBeenCalledOnce();

    const routeFieldset = renderer.root.findAllByType('fieldset')[0]!;
    const routeSelects = routeFieldset.findAllByType('select');
    await change(routeSelects[0]!, provider.id);
    await change(routeSelects[2]!, 'limited');

    await click(renderer, '保存长篇创作设置');
    expect(updateSettings).toHaveBeenCalledOnce();
    expect(updateSettings.mock.calls[0]![0].settings.taskRoutes[0]).toMatchObject({
      taskType: 'skeleton',
      primaryProviderId: provider.id,
      minimumSupport: 'limited',
    });

    await act(async () => renderer.unmount());
  });

  it('creates and removes manual styles and explains failure/read-only states', async () => {
    const failureBridge = contractInput<RendererBridgeAdapter>({
      longformAi: {
        getSettings: vi.fn(async () => failure('COMMON_INTERNAL_999')),
        listDigests: vi.fn(async () => failure('COMMON_INTERNAL_999')),
      },
      planning: { listStructure: vi.fn(async () => failure('COMMON_INTERNAL_999')) },
    });
    let failed!: TestRenderer;
    await act(async () => {
      failed = create(
        createElement(LongformAiSettingsPanel, {
          bridge: failureBridge,
          project: { ...project, databaseMode: 'read-only' },
          providers: [],
          readOnly: true,
        }),
      );
      await flushPromises();
    });
    expect(textContent(failed.root)).toContain('部分内容读取失败');
    expect(textContent(failed.root)).toContain('当前作品为只读模式');
    await act(async () => failed.unmount());

    const bridge = contractInput<RendererBridgeAdapter>({
      longformAi: {
        getSettings: vi.fn(async () => success(settings)),
        listDigests: vi.fn(async () => success({ projectId: project.projectId, digests: [] })),
      },
      planning: { listStructure: vi.fn(async () => success({ ...structure, volumes: [] })) },
    });
    let renderer!: TestRenderer;
    await act(async () => {
      renderer = create(
        createElement(LongformAiSettingsPanel, {
          bridge,
          project,
          providers: [],
          readOnly: false,
        }),
      );
      await flushPromises();
    });

    const name = renderer.root.findByProps({ placeholder: '例如：冷峻第三人称' });
    const instructions = renderer.root.findByProps({
      placeholder: '减少解释性心理描写\n冲突场景优先短句',
    });
    await change(name, '冷峻第三人称');
    await change(instructions, '减少解释性心理描写\n冲突场景优先短句');
    const form = renderer.root
      .findAllByType('form')
      .find((candidate) => candidate.props.className === 'longform-style-form')!;
    await act(async () => {
      (form.props.onSubmit as (event: { preventDefault(): void }) => void)({
        preventDefault: vi.fn(),
      });
    });
    expect(textContent(renderer.root)).toContain('冷峻第三人称');
    await click(renderer, '移除');
    expect(textContent(renderer.root)).not.toContain('冷峻第三人称');
    await click(renderer, '从已定稿正文学习');
    expect(textContent(renderer.root)).toContain('至少需要两份定稿');
    await act(async () => renderer.unmount());
  });

  it('surfaces operation failures and all style-check outcomes without blocking edits', async () => {
    const primaryProfileId = 'b68de1fd-cb0b-49c9-aa1a-d87ee694aee4';
    const secondaryProfileId = '7732ac16-351a-4d77-b12d-971f9f4420bc';
    const configuredSettings: LongformAiSettings = {
      ...settings,
      activeStyleProfileId: primaryProfileId,
      styleProfiles: [
        {
          id: primaryProfileId,
          name: '正文学习',
          origin: 'learned',
          instructions: ['延续正文节奏。'],
          sampleVersionIds: [
            'a19ee637-1789-49ee-b49d-7839b3b5585f',
            '14c75ab9-cff0-4e04-8d10-2613247773ec',
          ],
          targetMetrics: null,
          sceneMappings: [],
        },
        {
          id: secondaryProfileId,
          name: '手动提醒',
          origin: 'manual',
          instructions: ['保持动作清楚。'],
          sampleVersionIds: [],
          targetMetrics: null,
          sceneMappings: [],
        },
      ],
    };
    let evaluationIndex = 0;
    const evaluateStyle = vi.fn(async () => {
      const outcome = ['deviated', 'insufficient_samples', 'failure'][evaluationIndex++]!;
      if (outcome === 'failure') return failure('COMMON_INTERNAL_999');
      return success({
        projectId: project.projectId,
        profileId: primaryProfileId,
        versionId: '14c75ab9-cff0-4e04-8d10-2613247773ec',
        status: outcome as 'deviated' | 'insufficient_samples',
        measured: {
          averageSentenceCharacters: 30,
          averageParagraphCharacters: 90,
          dialogueRatio: 0.1,
        },
        target: null,
        deviations:
          outcome === 'deviated'
            ? [{ metric: 'dialogueRatio' as const, relativeDifference: 0.5 }]
            : [],
      });
    });
    const bridge = contractInput<RendererBridgeAdapter>({
      longformAi: {
        getSettings: vi.fn(async () => success(configuredSettings)),
        listDigests: vi.fn(async () =>
          success({
            projectId: project.projectId,
            digests: [{ ...digest, content: '', sourceVersionIds: [] }],
          }),
        ),
        rebuildDigests: vi.fn(async () => failure('COMMON_INTERNAL_999')),
        updateSettings: vi.fn(async () => failure('COMMON_INTERNAL_999')),
        evaluateStyle,
      },
      planning: { listStructure: vi.fn(async () => success(structure)) },
    });

    let renderer!: TestRenderer;
    await act(async () => {
      renderer = create(
        createElement(LongformAiSettingsPanel, {
          bridge,
          project,
          providers: [provider, { ...provider, id: 'disabled-model', credentialConfigured: false }],
          readOnly: false,
        }),
      );
      await flushPromises();
    });

    expect(textContent(renderer.root)).toContain('当前范围没有可整理的正文');
    await click(renderer, '根据定稿重建');
    expect(textContent(renderer.root)).toContain('长篇记忆重建失败');
    await click(renderer, '保存长篇创作设置');
    expect(textContent(renderer.root)).toContain('保存失败');
    await click(renderer, '检查最近定稿');
    expect(textContent(renderer.root)).toContain('1 项明显偏离');
    await click(renderer, '检查最近定稿');
    expect(textContent(renderer.root)).toContain('没有足够正文样本');
    await click(renderer, '检查最近定稿');
    expect(textContent(renderer.root)).toContain('文风检查失败');

    const removeButtons = renderer.root
      .findAllByType('button')
      .filter((candidate) => textContent(candidate) === '移除');
    await act(async () => {
      (removeButtons[1]!.props.onClick as () => void)();
    });
    expect(textContent(renderer.root)).toContain('正文学习');
    expect(textContent(renderer.root)).not.toContain('手动提醒');

    const name = renderer.root.findByProps({ placeholder: '例如：冷峻第三人称' });
    const instructions = renderer.root.findByProps({
      placeholder: '减少解释性心理描写\n冲突场景优先短句',
    });
    await change(name, '空说明');
    await change(instructions, '  \n  ');
    const form = renderer.root
      .findAllByType('form')
      .find((candidate) => candidate.props.className === 'longform-style-form')!;
    await act(async () => {
      (form.props.onSubmit as (event: { preventDefault(): void }) => void)({
        preventDefault: vi.fn(),
      });
    });
    expect(textContent(renderer.root)).toContain('请至少填写一条');

    const routeSelects = renderer.root.findAllByType('fieldset')[0]!.findAllByType('select');
    await change(routeSelects[1]!, provider.id);
    const updatedRouteSelects = renderer.root.findAllByType('fieldset')[0]!.findAllByType('select');
    await change(updatedRouteSelects[1]!, '');
    const styleSelect = renderer.root.findByProps({ 'data-active-style-profile': true });
    await change(styleSelect, '');
    await click(renderer, '检查最近定稿');
    expect(evaluateStyle).toHaveBeenCalledTimes(3);

    await act(async () => renderer.unmount());
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

async function click(renderer: TestRenderer, label: string): Promise<void> {
  const button = renderer.root
    .findAllByType('button')
    .find((candidate) => textContent(candidate).includes(label));
  expect(button, `button ${label}`).toBeDefined();
  await act(async () => {
    await (button!.props.onClick as () => void | Promise<void>)();
    await flushPromises();
  });
}

async function change(instance: TestInstance, value: string): Promise<void> {
  await act(async () => {
    (instance.props.onChange as (event: { readonly target: { readonly value: string } }) => void)({
      target: { value },
    });
  });
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
