import { createRequire } from 'node:module';

import type { ProjectStructure, SceneBeat } from '@worldforge/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { createElement as createReactElement, ReactElement, ReactNode } from 'react';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
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
const targetChapterId = '33333333-3333-4333-8333-333333333333';
const blockId = '44444444-4444-4444-8444-444444444444';
const blockId2 = '55555555-5555-4555-8555-555555555555';

const beat1 = contractInput<SceneBeat>({
  id: '66666666-6666-4666-8666-666666666666',
  chapterId,
  title: '潜入渡口',
  beatType: 'action',
  wordTargetPercent: 40,
  goal: '避开守卫',
  blockLinks: [{ logicalBlockId: blockId }],
});
const beat2 = contractInput<SceneBeat>({
  ...beat1,
  id: '77777777-7777-4777-8777-777777777777',
  title: '发现暗号',
  wordTargetPercent: 60,
  blockLinks: [],
});
const deletedBeat = contractInput<SceneBeat>({
  ...beat1,
  id: '88888888-8888-4888-8888-888888888888',
  title: '旧场景',
});
const structure = contractInput<ProjectStructure>({
  projectId,
  volumes: [
    {
      id: '99999999-9999-4999-8999-999999999999',
      projectId,
      title: '第一卷',
      chapters: [
        { id: chapterId, title: '第一章' },
        { id: targetChapterId, title: '第二章' },
      ],
    },
  ],
});

function success<T>(data: T) {
  return {
    state: 'success' as const,
    generation: 1,
    requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    data,
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

function buttons(root: TestInstance, label: string): TestInstance[] {
  return root.findAll((node) => node.type === 'button' && textContent(node).includes(label));
}

async function invoke(node: TestInstance, prop: 'onClick' | 'onChange', argument?: unknown) {
  const handler = node.props[prop];
  if (typeof handler !== 'function') throw new Error(`Missing ${prop}.`);
  await act(async () => {
    (handler as (value?: unknown) => unknown)(argument);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function bridge(structureValue: ProjectStructure = structure) {
  const previewMoveSceneBeat = vi
    .fn()
    .mockResolvedValueOnce(
      success({
        canExecute: false,
        linkedBlockCount: 1,
        linkedCharacterCount: 1,
        warnings: ['目标章节只读'],
        planHash: 'a'.repeat(64),
      }),
    )
    .mockResolvedValue(
      success({
        canExecute: true,
        linkedBlockCount: 1,
        linkedCharacterCount: 1,
        warnings: [],
        planHash: 'b'.repeat(64),
      }),
    );
  return contractInput<RendererBridgeAdapter>({
    planning: {
      listSceneBeats: vi.fn(async () =>
        success({ beats: [beat1, beat2], deletedBeats: [deletedBeat] }),
      ),
      listStructure: vi.fn(async () => success(structureValue)),
      deleteSceneBeat: vi.fn(async () => success({ sceneBeatId: beat1.id, deleted: true })),
      setSceneBeatBlockLinks: vi.fn(async () => success({})),
      moveSceneBeat: vi.fn(async () => success({})),
      previewMoveSceneBeat,
      moveSceneBeatAcrossChapters: vi.fn(async () => success({})),
      restoreSceneBeat: vi.fn(async () => success({})),
    },
    draft: {
      open: vi.fn(async () =>
        success({
          blocks: [
            { logicalBlockId: blockId, blockType: 'paragraph', text: '渡口风急。', locked: false },
            { logicalBlockId: blockId2, blockType: 'paragraph', text: '暗号响起。', locked: false },
          ],
        }),
      ),
    },
  });
}

async function mount(api: RendererBridgeAdapter, onStatus = vi.fn()): Promise<TestRenderer> {
  vi.doMock(
    '../../apps/desktop/renderer/src/features/planning/scenes/scene-beat-dialog.js',
    () => ({
      SceneBeatDialog: (props: {
        readonly beat: SceneBeat | null;
        readonly onClose: () => void;
        readonly onSaved: () => Promise<void>;
      }): ReactNode =>
        createElement(
          'div',
          { 'data-mock-scene-dialog': props.beat?.id ?? 'new' },
          createElement('button', { onClick: props.onClose }, '关闭模拟场景'),
          createElement('button', { onClick: () => void props.onSaved() }, '保存模拟场景'),
        ),
    }),
  );
  const { SceneBeatPanel } =
    await import('../../apps/desktop/renderer/src/features/planning/scenes/scene-beat-panel.js');
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(
      createElement(SceneBeatPanel, {
        bridge: api,
        chapterId,
        entities: [],
        plotNodes: [],
        projectId,
        readOnly: false,
        onStatus,
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return renderer;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    confirm: vi.fn(() => true),
    prompt: vi.fn(() => '1'),
  });
});

describe('M11 场景规划交互覆盖', () => {
  it('覆盖新建/编辑、删除/恢复和章内移动', async () => {
    const api = bridge();
    const onStatus = vi.fn();
    const renderer = await mount(api, onStatus);
    expect(textContent(renderer.root)).toContain('潜入渡口');
    expect(textContent(renderer.root)).toContain('旧场景');

    await invoke(
      control(renderer.root, 'button', (node) => Boolean(node.props['data-create-scene-beat'])),
      'onClick',
    );
    expect(
      renderer.root.findAll((node) => Boolean(node.props['data-mock-scene-dialog'])),
    ).toHaveLength(1);
    await invoke(buttons(renderer.root, '关闭模拟场景')[0]!, 'onClick');

    await invoke(buttons(renderer.root, '编辑')[0]!, 'onClick');
    expect(
      control(renderer.root, 'div', (node) => node.props['data-mock-scene-dialog'] === beat1.id),
    ).toBeTruthy();
    await invoke(buttons(renderer.root, '保存模拟场景')[0]!, 'onClick');
    expect(onStatus).toHaveBeenCalledWith('场景已保存；正文未发生变化。');

    await invoke(
      control(renderer.root, 'button', (node) => node.props['aria-label'] === `上移${beat1.title}`),
      'onClick',
    );
    await invoke(
      control(renderer.root, 'button', (node) => node.props['aria-label'] === `下移${beat1.title}`),
      'onClick',
    );
    expect(api.planning.moveSceneBeat).toHaveBeenCalledWith(
      expect.objectContaining({ placement: { kind: 'after', siblingId: beat2.id } }),
    );
    expect(onStatus).toHaveBeenCalledWith('场景顺序已更新；正文未变化。');

    (window.confirm as ReturnType<typeof vi.fn>).mockReturnValueOnce(false).mockReturnValue(true);
    await invoke(buttons(renderer.root, '删除')[0]!, 'onClick');
    expect(api.planning.deleteSceneBeat).not.toHaveBeenCalled();
    await invoke(buttons(renderer.root, '删除')[0]!, 'onClick');
    expect(api.planning.deleteSceneBeat).toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith('场景已移入已删除列表；正文未变化。');

    await invoke(buttons(renderer.root, '恢复')[0]!, 'onClick');
    expect(api.planning.restoreSceneBeat).toHaveBeenCalledWith({
      projectId,
      sceneBeatId: deletedBeat.id,
    });
    renderer.unmount();
  });

  it('覆盖正文段落转换和重新关联正文', async () => {
    const api = bridge();
    const onStatus = vi.fn();
    const renderer = await mount(api, onStatus);

    await invoke(
      control(renderer.root, 'button', (node) => Boolean(node.props['data-convert-scene-beat'])),
      'onClick',
    );
    const convertChoices = renderer.root.findAll(
      (node) => node.type === 'input' && node.props.type === 'checkbox',
    );
    await invoke(convertChoices[0]!, 'onChange', { target: { checked: true } });
    await invoke(
      control(renderer.root, 'button', (node) =>
        Boolean(node.props['data-confirm-draft-block-picker']),
      ),
      'onClick',
    );
    expect(
      control(renderer.root, 'div', (node) => node.props['data-mock-scene-dialog'] === 'new'),
    ).toBeTruthy();
    await invoke(buttons(renderer.root, '关闭模拟场景')[0]!, 'onClick');

    await invoke(buttons(renderer.root, '关联正文段落')[0]!, 'onClick');
    const linkChoices = renderer.root.findAll(
      (node) => node.type === 'input' && node.props.type === 'checkbox',
    );
    await invoke(linkChoices[1]!, 'onChange', { target: { checked: true } });
    await invoke(
      control(renderer.root, 'button', (node) =>
        Boolean(node.props['data-confirm-draft-block-picker']),
      ),
      'onClick',
    );
    expect(api.planning.setSceneBeatBlockLinks).toHaveBeenCalledWith(
      expect.objectContaining({ sceneBeatId: beat1.id, logicalBlockIds: [blockId, blockId2] }),
    );
    expect(onStatus).toHaveBeenCalledWith('场景的正文段落引用已更新；正文内容和顺序未变化。');
    renderer.unmount();
  });

  it('覆盖跨章移动无目标、无效选择、预览阻断、取消确认和执行', async () => {
    const oneChapter = contractInput<ProjectStructure>({
      projectId,
      volumes: [{ id: 'volume', title: '第一卷', chapters: [{ id: chapterId, title: '第一章' }] }],
    });
    const noTargetApi = bridge(oneChapter);
    const noTargetStatus = vi.fn();
    const noTarget = await mount(noTargetApi, noTargetStatus);
    await invoke(buttons(noTarget.root, '跨章移动')[0]!, 'onClick');
    expect(noTargetStatus).toHaveBeenCalledWith('需要至少两个章节才能跨章移动场景。');
    noTarget.unmount();

    const api = bridge();
    const onStatus = vi.fn();
    const renderer = await mount(api, onStatus);
    const cross = () => buttons(renderer.root, '跨章移动')[0]!;
    const prompt = window.prompt as ReturnType<typeof vi.fn>;
    const confirm = window.confirm as ReturnType<typeof vi.fn>;

    prompt.mockReturnValueOnce('99');
    await invoke(cross(), 'onClick');
    expect(api.planning.previewMoveSceneBeat).not.toHaveBeenCalled();

    prompt.mockReturnValueOnce('1');
    await invoke(cross(), 'onClick');
    expect(onStatus).toHaveBeenCalledWith(expect.stringContaining('目标章节只读'));
    expect(api.planning.moveSceneBeatAcrossChapters).not.toHaveBeenCalled();

    prompt.mockReturnValueOnce('1');
    confirm.mockReturnValueOnce(false);
    await invoke(cross(), 'onClick');
    expect(api.planning.moveSceneBeatAcrossChapters).not.toHaveBeenCalled();

    prompt.mockReturnValueOnce('1');
    confirm.mockReturnValueOnce(true);
    await invoke(cross(), 'onClick');
    expect(api.planning.moveSceneBeatAcrossChapters).toHaveBeenCalledWith(
      expect.objectContaining({ targetChapterId, planHash: 'b'.repeat(64) }),
    );
    expect(onStatus).toHaveBeenCalledWith('场景已跨章移动；正文段落未自动移动。');
    renderer.unmount();
  });
});
