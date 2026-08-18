import { createRequire } from 'node:module';

import type { ContinuityCatalog } from '@worldforge/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { createElement as createReactElement, ReactElement } from 'react';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import type { CanonAuthorReferences } from '../../apps/desktop/renderer/src/features/canon/canon-author-fields.js';
import type { ContinuityEditors } from '../../apps/desktop/renderer/src/features/canon/continuity-editors.js';
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
const chapterId = '22222222-2222-4222-8222-222222222222';
const versionId = '33333333-3333-4333-8333-333333333333';
const characterId = '44444444-4444-4444-8444-444444444444';
const secondCharacterId = '55555555-5555-4555-8555-555555555555';
const locationId = '66666666-6666-4666-8666-666666666666';
const blockId = '77777777-7777-4777-8777-777777777777';

const references = contractInput<CanonAuthorReferences>({
  state: 'ready',
  entities: [
    { id: characterId, entityType: 'character', name: '赵二' },
    { id: secondCharacterId, entityType: 'character', name: '少东家' },
    { id: locationId, entityType: 'location', name: '清河' },
  ],
  chapters: [{ id: chapterId, title: '第三章 夜渡清河' }],
  versions: [{ id: versionId, chapterId, label: '第三章 · 定稿 1' }],
});

const catalog = contractInput<ContinuityCatalog>({
  projectId,
  entityStates: [
    {
      id: '88888888-8888-4888-8888-888888888888',
      entityId: characterId,
      stateKey: 'location',
      recordStatus: 'current',
    },
  ],
  relationships: [
    {
      id: '99999999-9999-4999-8999-999999999999',
      fromCharacterId: characterId,
      toCharacterId: secondCharacterId,
      label: '同伴',
      recordStatus: 'current',
    },
  ],
  timelineEvents: [
    { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', title: '夜渡清河', status: 'active' },
  ],
  knowledgeStates: [
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      characterId,
      informationKey: '暗号',
      recordStatus: 'current',
    },
  ],
});

class StubFormData {
  static values: Record<string, unknown> = {};
  static lists: Record<string, unknown[]> = {};

  constructor(_form?: unknown) {}

  get(name: string): unknown {
    return Object.hasOwn(StubFormData.values, name) ? StubFormData.values[name] : null;
  }

  getAll(name: string): unknown[] {
    return StubFormData.lists[name] ?? [];
  }
}

function success<T>(data: T) {
  return {
    state: 'success' as const,
    generation: 1,
    requestId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    data,
  };
}

function textContent(node: TestInstance): string {
  return node.children
    .map((child) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

function control(root: TestInstance, type: string, predicate: (node: TestInstance) => boolean) {
  const result = root.findAll((node) => node.type === type && predicate(node))[0];
  if (!result) throw new Error(`Missing ${type} control.`);
  return result;
}

function button(root: TestInstance, label: string): TestInstance {
  return control(root, 'button', (node) => textContent(node).includes(label));
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

function formValues(values: Record<string, unknown>, lists: Record<string, unknown[]> = {}): void {
  StubFormData.values = values;
  StubFormData.lists = lists;
}

function bridge() {
  return contractInput<RendererBridgeAdapter>({
    continuity: {
      setEntityState: vi.fn(async () => success({})),
      invalidateEntityState: vi.fn(async () => success({})),
      setCharacterRelationship: vi.fn(async () => success({})),
      invalidateCharacterRelationship: vi.fn(async () => success({})),
      saveTimelineEvent: vi.fn(async () => success({})),
      archiveTimelineEvent: vi.fn(async () => success({})),
      setKnowledgeState: vi.fn(async () => success({})),
      invalidateKnowledgeState: vi.fn(async () => success({})),
    },
    version: {
      get: vi.fn(async () =>
        success({
          versionId,
          chapterId,
          blocks: [
            {
              logicalBlockId: blockId,
              blockType: 'paragraph',
              text: '他在渡口听见暗号。',
              attributes: {},
            },
          ],
        }),
      ),
    },
  });
}

async function mount(input: {
  bridge: RendererBridgeAdapter;
  readOnly?: boolean;
  onRefresh?: () => Promise<void>;
}): Promise<TestRenderer> {
  const module =
    await import('../../apps/desktop/renderer/src/features/canon/continuity-editors.js');
  const Component = module.ContinuityEditors as typeof ContinuityEditors;
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(
      createElement(Component, {
        bridge: input.bridge,
        catalog,
        projectId,
        readOnly: input.readOnly ?? false,
        references,
        onRefresh: input.onRefresh ?? (async () => undefined),
      }),
    );
    await Promise.resolve();
  });
  return renderer;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('FormData', StubFormData);
  StubFormData.values = {};
  StubFormData.lists = {};
});

describe('M11 连续性作者编辑交互覆盖', () => {
  it('提交四类连续性记录并执行失效与归档动作', async () => {
    const api = bridge();
    const onRefresh = vi.fn(async () => undefined);
    const renderer = await mount({ bridge: api, onRefresh });
    const forms = renderer.root.findAll((node) => node.type === 'form');
    expect(forms).toHaveLength(4);

    formValues({
      stateKey: 'custom',
      customStateKey: '情绪',
      valueType: 'list',
      value: '紧张\n警觉',
      entityId: characterId,
      validFromChapterId: chapterId,
      validUntilChapterId: '',
      sourceVersionId: versionId,
    });
    await invoke(forms[0]!, 'onSubmit', { preventDefault: vi.fn(), currentTarget: {} });
    expect(api.continuity.setEntityState).toHaveBeenCalledWith(
      expect.objectContaining({
        stateKey: '情绪',
        semanticKind: 'custom',
        value: ['紧张', '警觉'],
      }),
    );

    const semantic = control(renderer.root, 'select', (node) => node.props.name === 'semanticKind');
    await invoke(semantic, 'onChange', { target: { value: 'location' } });
    formValues({
      stateKey: 'location',
      semanticEntityId: locationId,
      entityId: characterId,
      validFromChapterId: chapterId,
      validUntilChapterId: '',
      sourceVersionId: versionId,
    });
    await invoke(forms[0]!, 'onSubmit', { preventDefault: vi.fn(), currentTarget: {} });
    expect(api.continuity.setEntityState).toHaveBeenLastCalledWith(
      expect.objectContaining({ semanticKind: 'location', value: locationId }),
    );

    await invoke(semantic, 'onChange', { target: { value: 'life_status' } });
    formValues({
      stateKey: 'life_status',
      lifeStatus: 'dead',
      entityId: characterId,
      validFromChapterId: chapterId,
      sourceVersionId: versionId,
    });
    await invoke(forms[0]!, 'onSubmit', { preventDefault: vi.fn(), currentTarget: {} });
    expect(api.continuity.setEntityState).toHaveBeenLastCalledWith(
      expect.objectContaining({ semanticKind: 'life_status', value: 'dead' }),
    );

    formValues({
      fromCharacterId: characterId,
      toCharacterId: secondCharacterId,
      category: 'friendship',
      label: '并肩同行',
      validFromChapterId: chapterId,
      validUntilChapterId: '',
      sourceVersionId: versionId,
    });
    await invoke(forms[1]!, 'onSubmit', { preventDefault: vi.fn(), currentTarget: {} });
    expect(api.continuity.setCharacterRelationship).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'friendship', label: '并肩同行' }),
    );

    formValues(
      {
        title: '夜渡',
        startValue: '三更',
        endValue: '',
        precision: 'approximate',
        chapterId,
        locationId,
        description: '避开追兵',
      },
      { participantIds: [characterId, '', secondCharacterId] },
    );
    await invoke(forms[2]!, 'onSubmit', { preventDefault: vi.fn(), currentTarget: {} });
    expect(api.continuity.saveTimelineEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '夜渡',
        participantIds: [characterId, secondCharacterId],
        endValue: null,
      }),
    );

    formValues({
      informationKey: '暗号',
      characterId,
      knowledgeStatus: 'suspects',
      validFromChapterId: chapterId,
      validUntilChapterId: '',
      sourceVersionId: versionId,
      notes: '只听见半句',
    });
    await invoke(forms[3]!, 'onSubmit', { preventDefault: vi.fn(), currentTarget: {} });
    expect(api.continuity.setKnowledgeState).toHaveBeenCalledWith(
      expect.objectContaining({ knowledgeStatus: 'suspects', sourceLogicalBlockId: null }),
    );

    for (const label of ['失效：location', '失效：同伴', '归档：夜渡清河', '失效：暗号']) {
      await invoke(button(renderer.root, label), 'onClick');
    }
    expect(api.continuity.invalidateEntityState).toHaveBeenCalled();
    expect(api.continuity.invalidateCharacterRelationship).toHaveBeenCalled();
    expect(api.continuity.archiveTimelineEvent).toHaveBeenCalled();
    expect(api.continuity.invalidateKnowledgeState).toHaveBeenCalled();
    expect(onRefresh).toHaveBeenCalled();
    renderer.unmount();
  });

  it('覆盖动态状态校验边界与来源正文选择/清除', async () => {
    const api = bridge();
    const renderer = await mount({ bridge: api });
    const forms = renderer.root.findAll((node) => node.type === 'form');
    const semantic = control(renderer.root, 'select', (node) => node.props.name === 'semanticKind');

    formValues({ stateKey: 'custom', customStateKey: '   ' });
    await invoke(forms[0]!, 'onSubmit', { preventDefault: vi.fn(), currentTarget: {} });
    expect(api.continuity.setEntityState).not.toHaveBeenCalled();

    await invoke(semantic, 'onChange', { target: { value: 'holder' } });
    formValues({
      stateKey: 'holder',
      semanticEntityId: '',
      entityId: characterId,
      validFromChapterId: chapterId,
      sourceVersionId: versionId,
    });
    await invoke(forms[0]!, 'onSubmit', { preventDefault: vi.fn(), currentTarget: {} });
    expect(api.continuity.setEntityState).not.toHaveBeenCalled();

    await invoke(semantic, 'onChange', { target: { value: 'age' } });
    formValues({
      stateKey: 'age',
      value: 'not-a-number',
      entityId: characterId,
      validFromChapterId: chapterId,
      sourceVersionId: versionId,
    });
    await invoke(forms[0]!, 'onSubmit', { preventDefault: vi.fn(), currentTarget: {} });
    expect(api.continuity.setEntityState).not.toHaveBeenCalled();

    formValues({
      stateKey: 'age',
      value: '23',
      entityId: characterId,
      validFromChapterId: chapterId,
      sourceVersionId: versionId,
    });
    await invoke(forms[0]!, 'onSubmit', { preventDefault: vi.fn(), currentTarget: {} });
    expect(api.continuity.setEntityState).toHaveBeenCalledWith(
      expect.objectContaining({ semanticKind: 'age', value: 23 }),
    );

    formValues({ sourceVersionId: versionId });
    await invoke(
      control(renderer.root, 'button', (node) =>
        Boolean(node.props['data-select-knowledge-source-block']),
      ),
      'onClick',
      { currentTarget: { form: {} } },
    );
    expect(api.version.get).toHaveBeenCalled();

    const choice = control(
      renderer.root,
      'input',
      (node) => node.props.name === 'draft-block-anchor',
    );
    await invoke(choice, 'onChange', { target: { checked: true } });
    await invoke(
      control(renderer.root, 'button', (node) =>
        Boolean(node.props['data-confirm-draft-block-picker']),
      ),
      'onClick',
    );
    expect(textContent(renderer.root)).toContain('第 1 段');

    const knowledgeVersion = control(
      renderer.root,
      'select',
      (node) => node.props.name === 'sourceVersionId' && typeof node.props.onChange === 'function',
    );
    await invoke(knowledgeVersion, 'onChange', { target: { value: versionId } });
    expect(textContent(renderer.root)).toContain('尚未指定原文段落');

    await invoke(
      control(renderer.root, 'button', (node) =>
        Boolean(node.props['data-select-knowledge-source-block']),
      ),
      'onClick',
      { currentTarget: { form: null } },
    );
    renderer.unmount();
  });
});
