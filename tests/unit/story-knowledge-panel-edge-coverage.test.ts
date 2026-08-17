import { createRequire } from 'node:module';

import type { StoryKnowledgeProjection } from '@worldforge/contracts';
import type { createElement as createReactElement, ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { StoryKnowledgePanel } from '../../apps/desktop/renderer/src/features/canon/story-knowledge-panel.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const controls = vi.hoisted(() => ({
  load: null as null | (() => Promise<unknown>),
  state: 'success' as 'loading' | 'success' | 'failure' | 'cancelled',
  data: null as unknown,
  error: null as unknown,
  refresh: vi.fn(),
}));

vi.mock('../../apps/desktop/renderer/src/bridge/use-bridge-resource.js', () => ({
  useBridgeQuery: (_key: string, load: () => Promise<unknown>) => {
    controls.load = load;
    return {
      state: controls.state,
      data: controls.data,
      error: controls.error,
      refresh: controls.refresh,
    };
  },
}));

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
const chapterId = '22222222-2222-4222-8222-222222222222';
const entityId = '33333333-3333-4333-8333-333333333333';
const secondEntityId = '44444444-4444-4444-8444-444444444444';
const versionId = '55555555-5555-4555-8555-555555555555';
const onNavigate = vi.fn();
const project = vi.fn(async () => ({ state: 'success', data: controls.data }));
const bridge = contractInput<RendererBridgeAdapter>({ storyKnowledge: { project } });
const active: TestRenderer[] = [];

function panel(options: { entity?: string | null; chapter?: string | null; readOnly?: boolean } = {}) {
  return createElement(StoryKnowledgePanel, {
    bridge,
    projectId,
    readOnly: options.readOnly ?? false,
    selectedEntityId: options.entity === undefined ? entityId : options.entity,
    selectedChapterId: options.chapter === undefined ? chapterId : options.chapter,
    onNavigate,
  });
}

async function render(
  options: { entity?: string | null; chapter?: string | null; readOnly?: boolean } = {},
): Promise<TestRenderer> {
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(panel(options));
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

function buttonByText(root: TestInstance, label: string): TestInstance {
  const node = root.findAll(
    (candidate) => candidate.type === 'button' && textContent(candidate) === label,
  )[0];
  if (!node) throw new Error(`Missing button ${label}`);
  return node;
}

function buttonContaining(root: TestInstance, label: string): TestInstance {
  const node = root.findAll(
    (candidate) => candidate.type === 'button' && textContent(candidate).includes(label),
  )[0];
  if (!node) throw new Error(`Missing button containing ${label}`);
  return node;
}

function tab(root: TestInstance, view: string): TestInstance {
  const node = root.findAll((candidate) => candidate.props['data-story-knowledge-view'] === view)[0];
  if (!node) throw new Error(`Missing tab ${view}`);
  return node;
}

async function click(node: TestInstance): Promise<void> {
  const handler = node.props.onClick;
  if (typeof handler !== 'function') throw new Error('Missing click handler');
  await act(async () => {
    handler();
    await Promise.resolve();
  });
}

async function update(renderer: TestRenderer, element: ReactElement): Promise<void> {
  await act(async () => {
    renderer.update(element);
    await Promise.resolve();
  });
}

function characterCard(): StoryKnowledgeProjection {
  return contractInput({
    view: 'character_card',
    projectId,
    bounded: true,
    character: { id: entityId, name: '阿灯', summary: '守着旧桥。' },
    facts: [{ id: 'fact-1', key: '年龄', value: 18, description: '成年' }],
    states: [{ id: 'state-1', key: '存活', value: true, semanticKind: 'life' }],
    relationships: [],
  });
}

function relationships(): StoryKnowledgeProjection {
  return contractInput({
    view: 'relationships',
    projectId,
    bounded: true,
    center: { id: entityId, name: '阿灯', summary: '' },
    relationships: [
      {
        id: 'relation-1',
        fromCharacterId: secondEntityId,
        fromCharacterName: '守灯人',
        toCharacterId: entityId,
        toCharacterName: '阿灯',
        category: 'ally',
        label: '同伴',
      },
    ],
    truncated: true,
  });
}

function timeline(): StoryKnowledgeProjection {
  return contractInput({
    view: 'timeline',
    projectId,
    bounded: true,
    anchorChapterId: chapterId,
    items: [
      {
        id: 'timeline-1',
        chapterId,
        chapterTitle: '第一章',
        title: '雨夜相逢',
        startValue: '子时',
        endValue: '丑时',
      },
    ],
    truncatedBefore: true,
    truncatedAfter: false,
  });
}

function foreshadowing(): StoryKnowledgeProjection {
  return contractInput({
    view: 'foreshadowing',
    projectId,
    bounded: true,
    anchorChapterId: chapterId,
    items: [
      {
        id: 'foreshadow-1',
        title: '铜铃',
        description: '',
        status: 'planted',
        attention: 'due',
      },
    ],
    truncated: true,
  });
}

function arc(): StoryKnowledgeProjection {
  return contractInput({
    view: 'arc',
    projectId,
    bounded: true,
    character: { id: entityId, name: '阿灯', summary: '逐渐承担责任。' },
    milestones: [
      {
        id: 'milestone-1',
        arcId: 'arc-1',
        arcTitle: '成长线',
        title: '第一次承担',
        description: '',
        status: 'planned',
        actualChapterId: null,
        plannedChapterId: chapterId,
      },
    ],
    truncated: true,
  });
}

function history(): StoryKnowledgeProjection {
  return contractInput({
    view: 'history',
    projectId,
    bounded: true,
    chapterId,
    items: [
      {
        versionId,
        chapterId,
        title: '第一版',
        createdAt: '2026-08-17T00:00:00.000Z',
        finalized: true,
        versionType: 'manual',
      },
    ],
    nextBeforeCreatedAt: '2026-08-16T00:00:00.000Z',
    nextBeforeVersionId: '66666666-6666-4666-8666-666666666666',
    candidates: [],
    candidatesTruncated: false,
    recovery: {
      checkpoints: [],
      checkpointsTruncated: false,
      backupFailures: [],
      backupFailuresTruncated: false,
    },
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  controls.state = 'success';
  controls.data = characterCard();
  controls.error = null;
  controls.refresh.mockResolvedValue(undefined);
  controls.load = null;
  project.mockImplementation(async () => ({ state: 'success', data: controls.data }));
});

afterEach(async () => {
  await act(async () => {
    for (const renderer of active.splice(0)) renderer.unmount();
  });
  vi.unstubAllGlobals();
});

describe('StoryKnowledgePanel interaction edge coverage', () => {
  it('covers query loading/failure/cancelled/empty states and retry callbacks', async () => {
    controls.state = 'loading';
    const renderer = await render();
    expect(textContent(renderer.root)).toContain('正在读取故事知识');

    controls.state = 'failure';
    controls.error = null;
    await update(renderer, panel());
    expect(textContent(renderer.root)).toContain('故事知识暂时无法读取');
    await click(buttonByText(renderer.root, '重试'));
    expect(controls.refresh).toHaveBeenCalledOnce();

    controls.error = { code: 'COMMON_INTERNAL_999', message: '读取失败', retryable: true };
    await update(renderer, panel());
    expect(textContent(renderer.root)).toContain('本地服务遇到异常');

    controls.state = 'cancelled';
    controls.error = null;
    await update(renderer, panel());
    expect(textContent(renderer.root)).toContain('读取已取消');
    await click(buttonByText(renderer.root, '重新读取'));
    expect(controls.refresh).toHaveBeenCalledTimes(2);

    controls.state = 'success';
    controls.data = null;
    await update(renderer, panel());
    expect(textContent(renderer.root)).toContain('暂无可显示的故事知识');

    const load = controls.load;
    if (!load) throw new Error('Missing projection load');
    controls.data = characterCard();
    await load();
    expect(project).toHaveBeenCalledWith(
      expect.objectContaining({ view: 'character_card', characterId: entityId }),
      expect.objectContaining({
        mode: 'replace',
        laneKey: `story-knowledge:${projectId}:character-card`,
      }),
    );
  });

  it('covers all missing-selection prompts and every projection input branch', async () => {
    controls.data = null;
    const renderer = await render({ entity: null, chapter: null });
    expect(textContent(renderer.root)).toContain('请先选择人物');

    for (const [view, expected] of [
      ['relationships', '人物和章节'],
      ['story-timeline', '章节'],
      ['character-timeline', '人物和章节'],
      ['foreshadowing', '章节'],
      ['arc', '人物'],
      ['history', '章节'],
    ] as const) {
      await click(tab(renderer.root, view));
      expect(textContent(renderer.root)).toContain(expected);
    }

    controls.data = characterCard();
    await update(renderer, panel({ entity: entityId, chapter: chapterId }));
    for (const view of [
      'character-card',
      'relationships',
      'story-timeline',
      'character-timeline',
      'foreshadowing',
      'arc',
      'history',
    ] as const) {
      await click(tab(renderer.root, view));
      expect(controls.load).toBeTypeOf('function');
    }
  });

  it('executes character, relationship, timeline, foreshadowing and arc navigation callbacks', async () => {
    const renderer = await render({ readOnly: true });
    expect(textContent(renderer.root)).toContain('只读模式');
    await click(buttonByText(renderer.root, '打开人物编辑'));
    expect(onNavigate).toHaveBeenLastCalledWith({
      type: 'entity',
      projectId,
      entityId,
      query: null,
    });

    controls.data = relationships();
    await click(tab(renderer.root, 'relationships'));
    const graphButtons = renderer.root.findAll(
      (node) => node.type === 'button' && node.props.className === 'story-graph-center',
    );
    await click(graphButtons[0]!);
    expect(onNavigate).toHaveBeenLastCalledWith({ type: 'entity', projectId, entityId, query: null });
    await click(buttonByText(renderer.root, '守灯人同伴ally'));
    expect(onNavigate).toHaveBeenLastCalledWith({
      type: 'entity',
      projectId,
      entityId: secondEntityId,
      query: null,
    });

    controls.data = timeline();
    await click(tab(renderer.root, 'story-timeline'));
    await click(buttonByText(renderer.root, '第一章雨夜相逢子时 — 丑时'));
    expect(onNavigate).toHaveBeenLastCalledWith({
      type: 'draft-block',
      projectId,
      chapterId,
      logicalBlockId: null,
      query: null,
    });

    controls.data = foreshadowing();
    await click(tab(renderer.root, 'foreshadowing'));
    await click(buttonByText(renderer.root, '铜铃当前可推进尚未填写说明。'));
    expect(onNavigate).toHaveBeenLastCalledWith({
      type: 'foreshadowing',
      projectId,
      foreshadowingId: 'foreshadow-1',
      chapterId,
      query: null,
    });

    controls.data = arc();
    await click(tab(renderer.root, 'arc'));
    await click(buttonByText(renderer.root, '打开对应章节'));
    expect(onNavigate).toHaveBeenLastCalledWith({
      type: 'draft-block',
      projectId,
      chapterId,
      logicalBlockId: null,
      query: null,
    });
  });

  it('covers history paging, return-to-latest, version navigation and cursor reset on chapter change', async () => {
    controls.data = history();
    const renderer = await render();
    await click(tab(renderer.root, 'history'));
    await click(buttonContaining(renderer.root, '第一版'));
    expect(onNavigate).toHaveBeenLastCalledWith({
      type: 'version',
      projectId,
      chapterId,
      versionId,
      query: null,
    });

    await click(buttonByText(renderer.root, '查看更早版本'));
    expect(buttonByText(renderer.root, '回到最新')).toBeDefined();
    const pagedLoad = controls.load;
    if (!pagedLoad) throw new Error('Missing paged load');
    await pagedLoad();
    expect(project).toHaveBeenLastCalledWith(
      expect.objectContaining({
        view: 'history',
        beforeCreatedAt: '2026-08-16T00:00:00.000Z',
        beforeVersionId: '66666666-6666-4666-8666-666666666666',
      }),
      expect.any(Object),
    );

    await click(buttonByText(renderer.root, '回到最新'));
    await update(
      renderer,
      createElement(StoryKnowledgePanel, {
        bridge,
        projectId,
        readOnly: false,
        selectedEntityId: entityId,
        selectedChapterId: '77777777-7777-4777-8777-777777777777',
        onNavigate,
      }),
    );
    expect(renderer.root.findAll((node) => textContent(node) === '回到最新')).toHaveLength(0);
  });

  it('covers chapter-assist projection dispatch defensively', async () => {
    controls.data = contractInput<StoryKnowledgeProjection>({
      view: 'chapter_assist',
      projectId,
      bounded: true,
      chapterId,
      characterCards: [],
      foreshadowings: [],
      previousEnding: null,
    });
    const renderer = await render();
    expect(
      renderer.root.findAll((node) => node.props['data-story-knowledge-panel'] !== undefined),
    ).toHaveLength(1);
  });
});
