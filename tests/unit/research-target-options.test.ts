import { createRequire } from 'node:module';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { createElement as createReactElement, ReactElement } from 'react';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import {
  type ResearchTargetOption,
  useResearchTargetOptions,
} from '../../apps/desktop/renderer/src/features/research/research-target-options.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const rendererRequire = createRequire(
  new URL('../../apps/desktop/renderer/package.json', import.meta.url),
);
const { createElement } = rendererRequire('react') as {
  readonly createElement: typeof createReactElement;
};
const { act, create } = rendererRequire('react-test-renderer') as {
  readonly act: (callback: () => void | Promise<void>) => Promise<void>;
  readonly create: (element: ReactElement) => {
    readonly root: { readonly props: Record<string, unknown> };
    unmount(): void;
  };
};

const projectId = '11111111-1111-4111-8111-111111111111';
const ids = {
  volume: '22222222-2222-4222-8222-222222222222',
  chapter: '33333333-3333-4333-8333-333333333333',
  from: '44444444-4444-4444-8444-444444444444',
  to: '55555555-5555-4555-8555-555555555555',
  relationship: '66666666-6666-4666-8666-666666666666',
  timeline: '77777777-7777-4777-8777-777777777777',
  foreshadowing: '88888888-8888-4888-8888-888888888888',
  arc: '99999999-9999-4999-8999-999999999999',
  milestone: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  idea: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
} as const;

function Probe({
  bridge,
  onOptions,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly onOptions: (options: readonly ResearchTargetOption[]) => void;
}) {
  const options = useResearchTargetOptions(bridge, projectId);
  onOptions(options);
  return createElement('div', { 'data-count': options.length });
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function success<T>(data: T) {
  return { state: 'success' as const, generation: 1, requestId: ids.idea, data };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('research target author options', () => {
  it('resolves stable story objects into author-facing labels without raw ids', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('window', {
      worldforgeIdeaCapsule: {
        operate: vi.fn().mockResolvedValue({
          ok: true,
          requestId: ids.idea,
          data: {
            ideas: [{ id: ids.idea, projectId, title: '雨夜灵感' }],
            nextCursor: null,
          },
        }),
      },
    });
    const bridge = contractInput<RendererBridgeAdapter>({
      planning: {
        listStructure: vi.fn().mockResolvedValue(
          success({
            projectId,
            volumes: [
              {
                id: ids.volume,
                title: '第一卷',
                chapters: [{ id: ids.chapter, title: '第一章' }],
              },
            ],
          }),
        ),
      },
      canon: {
        list: vi.fn().mockResolvedValue(
          success({
            projectId,
            entities: [
              { id: ids.from, name: '赵二' },
              { id: ids.to, name: '少东家' },
            ],
          }),
        ),
      },
      continuity: {
        list: vi.fn().mockResolvedValue(
          success({
            projectId,
            entityStates: [],
            knowledgeStates: [],
            timelineEvents: [{ id: ids.timeline, title: '雨夜相逢' }],
            relationships: [
              {
                id: ids.relationship,
                fromCharacterId: ids.from,
                toCharacterId: ids.to,
                label: '同行',
              },
            ],
          }),
        ),
      },
      narrativePlanning: {
        list: vi.fn().mockResolvedValue(
          success({
            projectId,
            foreshadowings: [{ id: ids.foreshadowing, title: '旧伞伏笔' }],
            characterArcs: [
              {
                id: ids.arc,
                title: '赵二成长线',
                milestones: [{ id: ids.milestone, title: '第一次回头' }],
              },
            ],
          }),
        ),
      },
    });
    let latest: readonly ResearchTargetOption[] = [];
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        createElement(Probe, {
          bridge,
          onOptions: (options: readonly ResearchTargetOption[]) => {
            latest = options;
          },
        }),
      );
      await flush();
    });

    expect(latest).toEqual(
      expect.arrayContaining([
        { type: 'volume', id: ids.volume, label: '第一卷' },
        { type: 'chapter', id: ids.chapter, label: '第一卷 / 第一章' },
        { type: 'entity', id: ids.from, label: '赵二' },
        { type: 'timeline', id: ids.timeline, label: '雨夜相逢' },
        { type: 'relationship', id: ids.relationship, label: '赵二 → 少东家 · 同行' },
        { type: 'foreshadowing', id: ids.foreshadowing, label: '旧伞伏笔' },
        { type: 'arc', id: ids.arc, label: '赵二成长线' },
        { type: 'milestone', id: ids.milestone, label: '赵二成长线 / 第一次回头' },
        { type: 'idea', id: ids.idea, label: '雨夜灵感' },
      ]),
    );
    await act(async () => renderer.unmount());
  });
});
