import { createRequire } from 'node:module';

import type { NarrativePlanningCatalog } from '@worldforge/contracts';
import type { createElement as createReactElement, ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import type { CanonAuthorReferences } from '../../apps/desktop/renderer/src/features/canon/canon-author-fields.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const commandState = vi.hoisted(() => ({
  pending: false,
  error: null as null | { code: string; message: string; retryable: boolean },
  run: vi.fn(),
  promptChapterId: vi.fn(),
}));

vi.mock('../../apps/desktop/renderer/src/bridge/use-bridge-resource.js', () => ({
  useBridgeCommand: () => ({
    pending: commandState.pending,
    error: commandState.error,
    run: commandState.run,
    clearError: vi.fn(),
  }),
}));
vi.mock('../../apps/desktop/renderer/src/features/canon/canon-author-fields.js', () => ({
  arcTypeLabel: (value: string) => `类型:${value}`,
  ChapterNameSelect: () => null,
  EntityNameSelect: () => null,
  promptChapterId: commandState.promptChapterId,
}));

import { NarrativePlanningEditors } from '../../apps/desktop/renderer/src/features/canon/narrative-planning-editors.js';

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
  update(element: ReactElement): void;
  unmount(): void;
}

const projectId = '11111111-1111-4111-8111-111111111111';
const arcId = '22222222-2222-4222-8222-222222222222';
const hitMilestoneId = '33333333-3333-4333-8333-333333333333';
const skippedMilestoneId = '44444444-4444-4444-8444-444444444444';
const pendingMilestoneId = '55555555-5555-4555-8555-555555555555';
const actualChapterId = '66666666-6666-4666-8666-666666666666';
const onRefresh = vi.fn(async () => undefined);
const references = contractInput<CanonAuthorReferences>({
  chapters: [{ id: actualChapterId, title: '第十章', order: 10 }],
  entities: [],
});

const bridge = contractInput<RendererBridgeAdapter>({
  narrativePlanning: {
    saveForeshadowing: vi.fn(async () => ({ state: 'success', data: {} })),
    transitionForeshadowing: vi.fn(async () => ({ state: 'success', data: {} })),
    saveCharacterArc: vi.fn(async () => ({ state: 'success', data: {} })),
    saveArcMilestone: vi.fn(async () => ({ state: 'success', data: {} })),
    transitionArcMilestone: vi.fn(async () => ({ state: 'success', data: {} })),
  },
});

const catalog = contractInput<NarrativePlanningCatalog>({
  foreshadowings: [
    {
      id: '77777777-7777-4777-8777-777777777777',
      title: '旧约',
      status: 'planned',
    },
  ],
  characterArcs: [
    {
      id: arcId,
      title: '阿灯成长线',
      milestones: [
        { id: hitMilestoneId, title: '已命中节点', status: 'hit' },
        { id: skippedMilestoneId, title: '已跳过节点', status: 'skipped' },
        { id: pendingMilestoneId, title: '待命中节点', status: 'planned' },
      ],
    },
  ],
});

function view(options: { catalog?: NarrativePlanningCatalog | null; readOnly?: boolean } = {}) {
  return createElement(NarrativePlanningEditors, {
    bridge,
    catalog: options.catalog === undefined ? catalog : options.catalog,
    projectId,
    readOnly: options.readOnly ?? false,
    references,
    onRefresh,
  });
}

function textContent(node: TestInstance): string {
  return node.children
    .map((child) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

async function invoke(node: TestInstance, prop: string, value: unknown): Promise<void> {
  const handler = node.props[prop];
  if (typeof handler !== 'function') throw new Error(`Missing ${prop}.`);
  await act(async () => {
    await handler(value);
    await Promise.resolve();
  });
}

function formEvent(values: Record<string, unknown>) {
  return contractInput({ preventDefault: vi.fn(), currentTarget: values });
}

class TestFormData {
  readonly #values: Record<string, unknown>;
  constructor(target: unknown) {
    this.#values = contractInput<Record<string, unknown>>(target);
  }
  get(name: string): unknown {
    return Object.hasOwn(this.#values, name) ? this.#values[name] : null;
  }
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('FormData', TestFormData);
  vi.clearAllMocks();
  commandState.pending = false;
  commandState.error = null;
  commandState.promptChapterId.mockReset();
  commandState.run.mockImplementation(async (operation: () => Promise<unknown>) => operation());
});

describe('NarrativePlanningEditors edge coverage', () => {
  it('submits foreshadowing, custom/standard arcs and milestone sort branches', async () => {
    let renderer!: TestRenderer;
    await act(async () => {
      renderer = create(view());
      await Promise.resolve();
    });
    const forms = renderer.root.findAll((node) => node.type === 'form');
    expect(forms).toHaveLength(3);

    await invoke(
      forms[0]!,
      'onSubmit',
      formEvent({
        title: '新伏笔',
        revealFromChapterId: '',
        revealByChapterId: actualChapterId,
      }),
    );
    expect(bridge.narrativePlanning.saveForeshadowing).toHaveBeenCalledWith({
      projectId,
      authority: 'author',
      foreshadowingId: null,
      title: '新伏笔',
      description: '',
      revealFromChapterId: null,
      revealByChapterId: actualChapterId,
      chapterLinks: [],
      relations: [],
    });

    await invoke(
      forms[1]!,
      'onSubmit',
      formEvent({
        characterId: 'character-1',
        title: '自定义弧光',
        arcType: 'custom',
        customType: '回乡',
        status: 'active',
      }),
    );
    expect(bridge.narrativePlanning.saveCharacterArc).toHaveBeenLastCalledWith(
      expect.objectContaining({
        arcType: 'custom',
        customType: '回乡',
        authorIntent: '',
      }),
    );

    await invoke(
      forms[1]!,
      'onSubmit',
      formEvent({
        characterId: 'character-1',
        title: '成长弧光',
        arcType: 'growth',
        customType: '应被忽略',
        status: 'planned',
        authorIntent: '从逃避到承担',
      }),
    );
    expect(bridge.narrativePlanning.saveCharacterArc).toHaveBeenLastCalledWith(
      expect.objectContaining({
        arcType: 'growth',
        customType: null,
        authorIntent: '从逃避到承担',
      }),
    );

    await invoke(
      forms[2]!,
      'onSubmit',
      formEvent({
        arcId,
        title: '新节点',
        plannedChapterId: '',
      }),
    );
    expect(bridge.narrativePlanning.saveArcMilestone).toHaveBeenLastCalledWith(
      expect.objectContaining({
        arcId,
        title: '新节点',
        description: '',
        sortIndex: 3,
        plannedChapterId: null,
      }),
    );

    await invoke(
      forms[2]!,
      'onSubmit',
      formEvent({
        arcId: 'missing-arc',
        title: '孤立节点',
        description: '说明',
        plannedChapterId: actualChapterId,
      }),
    );
    expect(bridge.narrativePlanning.saveArcMilestone).toHaveBeenLastCalledWith(
      expect.objectContaining({ sortIndex: 0, plannedChapterId: actualChapterId }),
    );
    await act(async () => renderer.unmount());
  });

  it('transitions foreshadowing and all milestone status branches', async () => {
    let renderer!: TestRenderer;
    await act(async () => {
      renderer = create(view());
      await Promise.resolve();
    });
    const statusSelect = renderer.root.findAll(
      (node) => node.type === 'select' && node.props.value === 'planned',
    )[0];
    if (!statusSelect) throw new Error('Missing foreshadowing status select.');
    await invoke(statusSelect, 'onChange', { target: { value: 'revealed' } });
    expect(bridge.narrativePlanning.transitionForeshadowing).toHaveBeenCalledWith({
      projectId,
      authority: 'author',
      foreshadowingId: '77777777-7777-4777-8777-777777777777',
      status: 'revealed',
    });

    const hitButtons = renderer.root.findAll(
      (node) => node.type === 'button' && textContent(node) === '确认命中',
    );
    commandState.promptChapterId.mockReturnValueOnce(null).mockReturnValueOnce(actualChapterId);
    await invoke(hitButtons[2]!, 'onClick', undefined);
    expect(bridge.narrativePlanning.transitionArcMilestone).not.toHaveBeenCalled();
    await invoke(hitButtons[2]!, 'onClick', undefined);
    expect(bridge.narrativePlanning.transitionArcMilestone).toHaveBeenCalledWith({
      projectId,
      authority: 'author',
      milestoneId: pendingMilestoneId,
      status: 'hit',
      actualChapterId,
    });

    const skipButtons = renderer.root.findAll(
      (node) => node.type === 'button' && textContent(node) === '标记跳过',
    );
    await invoke(skipButtons[2]!, 'onClick', undefined);
    expect(bridge.narrativePlanning.transitionArcMilestone).toHaveBeenLastCalledWith({
      projectId,
      authority: 'author',
      milestoneId: pendingMilestoneId,
      status: 'skipped',
      actualChapterId: null,
    });
    expect(textContent(renderer.root)).toContain('已命中');
    expect(textContent(renderer.root)).toContain('已跳过');
    expect(textContent(renderer.root)).toContain('待命中');
    await act(async () => renderer.unmount());
  });

  it('covers empty catalog, readonly/pending disablement and command error rendering', async () => {
    commandState.pending = true;
    commandState.error = {
      code: 'COMMON_INTERNAL_999',
      message: '保存失败',
      retryable: true,
    };
    let renderer!: TestRenderer;
    await act(async () => {
      renderer = create(view({ catalog: null, readOnly: true }));
      await Promise.resolve();
    });
    const buttons = renderer.root.findAll((node) => node.type === 'button');
    expect(buttons.every((button) => button.props.disabled === true)).toBe(true);
    expect(textContent(renderer.root)).toContain('本地服务遇到异常');

    commandState.pending = false;
    commandState.error = null;
    await act(async () => {
      renderer.update(
        view({
          catalog: contractInput<NarrativePlanningCatalog>({
            foreshadowings: [],
            characterArcs: [],
          }),
        }),
      );
      await Promise.resolve();
    });
    const milestoneSubmit = renderer.root.findAll(
      (node) => node.type === 'button' && textContent(node) === '保存里程碑',
    )[0];
    expect(milestoneSubmit?.props.disabled).toBe(true);
    await act(async () => renderer.unmount());
  });
});
