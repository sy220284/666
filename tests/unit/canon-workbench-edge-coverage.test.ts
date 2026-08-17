import { createRequire } from 'node:module';

import type { NarrativePlanningCatalog } from '@worldforge/contracts';
import type { createElement as createReactElement, ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const controls = vi.hoisted(() => ({
  filters: {} as Record<string, string | undefined>,
  returnLocation: null as unknown,
  healthLoad: null as null | (() => Promise<unknown>),
  health: {
    state: 'success' as 'loading' | 'success' | 'failure' | 'cancelled',
    data: null as unknown,
    error: null as unknown,
    refresh: vi.fn(),
  },
  core: vi.fn(),
  continuity: vi.fn(),
  narrative: vi.fn(),
}));

vi.mock('../../apps/desktop/renderer/src/state/ui-store.js', () => ({
  useRendererUiStore: (selector: (state: unknown) => unknown) =>
    selector({ filters: controls.filters, returnLocation: controls.returnLocation }),
}));
vi.mock('../../apps/desktop/renderer/src/bridge/use-bridge-resource.js', () => ({
  useBridgeQuery: (_key: string, load: () => Promise<unknown>) => {
    controls.healthLoad = load;
    return controls.health;
  },
}));
vi.mock('../../apps/desktop/renderer/src/features/canon/canon-core-workbench.js', () => ({
  CanonWorkbench: (props: Record<string, unknown>) => {
    controls.core(props);
    return null;
  },
}));
vi.mock('../../apps/desktop/renderer/src/features/canon/continuity-relationship-editor.js', () => ({
  ContinuityRelationshipEditor: (props: Record<string, unknown>) => {
    controls.continuity(props);
    return null;
  },
}));
vi.mock('../../apps/desktop/renderer/src/features/canon/narrative-relationship-editor.js', () => ({
  NarrativeRelationshipEditor: (props: Record<string, unknown>) => {
    controls.narrative(props);
    return null;
  },
}));

import { CanonWorkbench } from '../../apps/desktop/renderer/src/features/canon/canon-workbench.js';

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
const foreshadowingId = '22222222-2222-4222-8222-222222222222';
const onSectionChange = vi.fn();
const onNavigate = vi.fn();
const onReturn = vi.fn();
const canonList = vi.fn(async () => ({ state: 'success', data: { entities: [] } }));
const narrativeList = vi.fn();
const bridge = contractInput<RendererBridgeAdapter>({
  canon: { list: canonList },
  narrativePlanning: { list: narrativeList },
});
const active: TestRenderer[] = [];

function element(section: 'entities' | 'continuity' | 'knowledge' | 'narrative' = 'entities') {
  return createElement(CanonWorkbench, {
    bridge,
    projectId,
    projectName: '作者项目',
    readOnly: false,
    section,
    selectedEntityId: null,
    selectedChapterId: null,
    onSectionChange,
    onNavigate,
    onReturn,
  });
}

async function render(section: 'entities' | 'continuity' | 'knowledge' | 'narrative' = 'entities') {
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(element(section));
    await Promise.resolve();
    await Promise.resolve();
  });
  active.push(renderer);
  return renderer;
}

function textContent(node: TestInstance): string {
  return node.children
    .map((child) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}
function button(root: TestInstance, label: string): TestInstance {
  const node = root.findAll(
    (candidate) => candidate.type === 'button' && textContent(candidate) === label,
  )[0];
  if (!node) throw new Error(`Missing button ${label}`);
  return node;
}
async function click(node: TestInstance): Promise<void> {
  const handler = node.props.onClick;
  if (typeof handler !== 'function') throw new Error('Missing onClick');
  await act(async () => {
    handler();
    await Promise.resolve();
  });
}
function catalog(description = ''): NarrativePlanningCatalog {
  return contractInput<NarrativePlanningCatalog>({
    foreshadowings: [
      {
        id: foreshadowingId,
        title: '铜铃伏笔',
        description,
        status: 'planted',
      },
    ],
    characterArcs: [],
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  controls.filters = {};
  controls.returnLocation = null;
  controls.health.state = 'success';
  controls.health.data = null;
  controls.health.error = null;
  controls.health.refresh.mockResolvedValue(undefined);
  narrativeList.mockResolvedValue({ state: 'success', data: catalog('伏笔说明') });
});

afterEach(async () => {
  await act(async () => {
    for (const renderer of active.splice(0)) renderer.unmount();
  });
  vi.unstubAllGlobals();
});

describe('CanonWorkbench edge coverage', () => {
  it('executes the health query, renders return context and continuity relationship editor', async () => {
    controls.returnLocation = { route: 'home' };
    const renderer = await render('continuity');
    expect(controls.continuity).toHaveBeenCalledWith(
      expect.objectContaining({ bridge, projectId, readOnly: false }),
    );
    expect(controls.narrative).not.toHaveBeenCalled();
    expect(controls.core).toHaveBeenCalledWith(expect.objectContaining({ section: 'continuity' }));
    await click(button(renderer.root, '返回来源页面'));
    expect(onReturn).toHaveBeenCalledOnce();
    const load = controls.healthLoad;
    if (!load) throw new Error('Missing health load callback');
    await load();
    expect(canonList).toHaveBeenCalledWith({ projectId, includeArchived: true }, { mode: 'share' });
  });

  it('auto-switches to narrative and renders target loading then ready with description fallback', async () => {
    controls.filters = { 'navigation.foreshadowingId': foreshadowingId };
    const pending = deferred<{ state: 'success'; data: NarrativePlanningCatalog }>();
    narrativeList.mockReturnValueOnce(pending.promise);
    const renderer = await render('entities');
    expect(onSectionChange).toHaveBeenCalledWith('narrative');
    expect(textContent(renderer.root)).toContain('正在读取目标伏笔');
    expect(narrativeList).toHaveBeenCalledWith(
      {
        projectId,
        query: '',
        includeResolved: true,
        referenceChapterId: null,
      },
      expect.objectContaining({ mode: 'share', signal: expect.any(AbortSignal) }),
    );
    pending.resolve({ state: 'success', data: catalog('') });
    await act(async () => {
      await pending.promise;
      await Promise.resolve();
    });
    expect(textContent(renderer.root)).toContain('铜铃伏笔');
    expect(textContent(renderer.root)).toContain('尚未填写说明');
  });

  it('covers target failure, non-success, successful-missing and narrative editor branches', async () => {
    controls.filters = { 'navigation.foreshadowingId': foreshadowingId };
    narrativeList.mockResolvedValueOnce({
      state: 'failure',
      error: { code: 'COMMON_INTERNAL_999', message: '读取失败', retryable: true },
    });
    const renderer = await render('narrative');
    expect(textContent(renderer.root)).toContain('本地服务遇到异常');
    expect(controls.narrative).toHaveBeenCalledWith(
      expect.objectContaining({ bridge, projectId, readOnly: false }),
    );
    expect(onSectionChange).not.toHaveBeenCalled();

    narrativeList.mockResolvedValueOnce({ state: 'cancelled' });
    controls.filters = {};
    await act(async () => renderer.update(element('narrative')));
    controls.filters = { 'navigation.foreshadowingId': foreshadowingId };
    await act(async () => {
      renderer.update(element('narrative'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(textContent(renderer.root)).toContain('目标伏笔已经变化或被删除');

    narrativeList.mockResolvedValueOnce({
      state: 'success',
      data: contractInput<NarrativePlanningCatalog>({ foreshadowings: [], characterArcs: [] }),
    });
    controls.filters = {};
    await act(async () => renderer.update(element('narrative')));
    controls.filters = { 'navigation.foreshadowingId': foreshadowingId };
    await act(async () => {
      renderer.update(element('narrative'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(textContent(renderer.root)).toContain('目标伏笔已经变化或被删除');
  });

  it('covers aborted target result and clears target when navigation filter disappears', async () => {
    controls.filters = { 'navigation.foreshadowingId': foreshadowingId };
    const pending = deferred<{ state: 'success'; data: NarrativePlanningCatalog }>();
    narrativeList.mockReturnValueOnce(pending.promise);
    const renderer = await render('narrative');
    controls.filters = {};
    await act(async () => renderer.update(element('narrative')));
    pending.resolve({ state: 'success', data: catalog('late') });
    await act(async () => {
      await pending.promise;
      await Promise.resolve();
    });
    expect(
      renderer.root.findAll((node) => 'data-foreshadowing-navigation' in node.props),
    ).toHaveLength(0);
  });

  it('renders health failure with retry and cancelled health status', async () => {
    controls.health.error = {
      code: 'COMMON_INTERNAL_999',
      message: '设定读取失败',
      retryable: true,
    };
    const renderer = await render();
    expect(textContent(renderer.root)).toContain('本地服务遇到异常');
    await click(button(renderer.root, '重试'));
    expect(controls.health.refresh).toHaveBeenCalledOnce();

    controls.health.error = null;
    controls.health.state = 'cancelled';
    await act(async () => renderer.update(element()));
    expect(textContent(renderer.root)).toContain('人物与设定读取已取消');
  });
});
