import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';

import type {
  AppSettings,
  ProjectContinuationSnapshot,
  ProjectWorkspaceSummary,
  RecentProject,
} from '@worldforge/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { createElement as createReactElement, ReactElement } from 'react';

import type { HomePageProps } from '../../apps/desktop/renderer/src/features/home/home-page.js';
import type { ProjectCapabilities } from '../../apps/desktop/renderer/src/runtime/capability-matrix.js';

const rendererRequire = createRequire(
  new URL('../../apps/desktop/renderer/package.json', import.meta.url),
);
const reactDomPath = rendererRequire.resolve('react-dom');
const reactDomRealPath = realpathSync(reactDomPath);
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
  unmount(): void;
}

const { act, create } = rendererRequire('react-test-renderer') as {
  readonly act: (callback: () => void | Promise<void>) => Promise<void>;
  readonly create: (
    element: ReactElement,
    options?: { readonly createNodeMock?: (element: TestInstance) => unknown },
  ) => TestRenderer;
};

const projectId = '11111111-1111-4111-8111-111111111111';
const chapterId = '22222222-2222-4222-8222-222222222222';

const settings: AppSettings = {
  schemaVersion: 1,
  language: 'zh-CN',
  startupBehavior: 'show-home',
  defaultMode: 'beginner',
  creativePath: 'autonomous',
  onboardingCompleted: false,
  onboardingTipsSeen: [],
  onboardingScaffoldDismissed: false,
  themeId: 'theme-a',
  themeVariant: 'light',
  reduceMotion: false,
};

const capabilities: ProjectCapabilities = {
  mode: 'normal',
  projectReadable: true,
  projectWritable: true,
  databaseReadable: true,
  structureReadable: true,
  draftReadable: true,
  draftWritable: true,
  canonReadable: true,
  canonWritable: true,
  exportAvailable: true,
  backupAvailable: true,
  restoreAvailable: true,
  moveAvailable: true,
};

const activeProject: ProjectWorkspaceSummary = {
  projectId,
  name: '长夜行舟',
  channel: '男频',
  workspacePath: '/works/long-night',
  schemaVersion: 1,
  databaseMode: 'read-write',
  compatibility: 'current',
  readOnlyReason: null,
  createdAt: '2026-08-17T00:00:00.000Z',
};

const continuation: ProjectContinuationSnapshot = {
  status: 'ready',
  projectId,
  chapterId,
  chapterTitle: '第二章',
  draftId: '33333333-3333-4333-8333-333333333333',
  draftRevision: 1,
  logicalBlockId: '44444444-4444-4444-8444-444444444444',
  expectedBlockHash: 'a'.repeat(64),
  cursorOffset: 0,
  scrollTop: 0,
  panel: 'editor',
  updatedAt: '2026-08-17T00:00:00.000Z',
};

const createTriggerNode = { focus: vi.fn() };
const firstControl = { tabIndex: 0, focus: vi.fn() };
const lastControl = { tabIndex: 0, focus: vi.fn() };
const dialogNode = {
  querySelectorAll: vi.fn(() => [firstControl, { tabIndex: -1 }, lastControl]),
};
const documentState: { body: object; activeElement: unknown } = { body: {}, activeElement: null };

class StubFormData {
  static values: Record<string, string> = {};

  constructor(_form?: unknown) {}

  get(name: string): string | null {
    return Object.hasOwn(StubFormData.values, name) ? StubFormData.values[name]! : null;
  }
}

function installPortalMock(): void {
  const factory = () => ({ createPortal: (children: unknown) => children });
  vi.doMock('react-dom', factory);
  vi.doMock(reactDomPath, factory);
  if (reactDomRealPath !== reactDomPath) vi.doMock(reactDomRealPath, factory);
}

async function loadHomePage() {
  return import('../../apps/desktop/renderer/src/features/home/home-page.js');
}

function recent(id: string, missing = false): RecentProject {
  return {
    projectId: id,
    workspacePath: `/works/${id}`,
    displayName: `作品-${id.slice(0, 4)}`,
    lastOpenedAt: '2026-08-17T00:00:00.000Z',
    missingSince: missing ? '2026-08-17T00:01:00.000Z' : null,
  };
}

function baseProps(overrides: Partial<HomePageProps> = {}): HomePageProps {
  return {
    disclosureMode: 'beginner',
    activeProject: null,
    continuation: null,
    recentProjects: [],
    healthSignals: [],
    activeTaskCount: 0,
    pendingKey: null,
    message: null,
    settings,
    providerAvailable: false,
    projectCapabilities: capabilities,
    onboardingRequest: 0,
    onNavigate: vi.fn(),
    onCreate: vi.fn(async () => true),
    onSaveSettings: vi.fn(async () => true),
    onContinue: vi.fn(),
    onOpenSelected: vi.fn(),
    onOpenRecent: vi.fn(),
    onRelocateRecent: vi.fn(),
    onRemoveRecent: vi.fn(),
    onCloseProject: vi.fn(),
    onMoveProject: vi.fn(),
    onOpenRecovery: vi.fn(),
    ...overrides,
  };
}

function textContent(instance: TestInstance): string {
  return instance.children
    .map((child) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

function buttonContaining(root: TestInstance, text: string, index = 0): TestInstance {
  const matches = root.findAll(
    (node) => node.type === 'button' && textContent(node).includes(text),
  );
  const match = matches[index];
  if (!match) throw new Error(`Missing button containing: ${text}#${index}`);
  return match;
}

function control(root: TestInstance, type: string, predicate: (node: TestInstance) => boolean) {
  const match = root.findAll((node) => node.type === type && predicate(node))[0];
  if (!match) throw new Error(`Missing ${type} control.`);
  return match;
}

async function invoke(
  node: TestInstance,
  prop: 'onClick' | 'onChange' | 'onSubmit' | 'onKeyDown',
  argument?: unknown,
): Promise<void> {
  const handler = node.props[prop];
  if (typeof handler !== 'function') throw new Error(`Missing ${prop} handler.`);
  await act(async () => {
    (handler as (value?: unknown) => unknown)(argument);
    await Promise.resolve();
    await Promise.resolve();
  });
}

function nodeMock(element: TestInstance): unknown {
  if (element.type === 'button' && element.props['data-create-project']) return createTriggerNode;
  if (element.type === 'section' && element.props.role === 'dialog') return dialogNode;
  return {};
}

async function mount(props: HomePageProps): Promise<TestRenderer> {
  const { HomePage } = await loadHomePage();
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(createElement(HomePage, props), { createNodeMock: nodeMock });
    await Promise.resolve();
  });
  return renderer;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.resetModules();
  installPortalMock();
  createTriggerNode.focus.mockClear();
  firstControl.focus.mockClear();
  lastControl.focus.mockClear();
  dialogNode.querySelectorAll.mockClear();
  documentState.activeElement = null;
  StubFormData.values = {};
  vi.stubGlobal('document', documentState);
  vi.stubGlobal('FormData', StubFormData);
  vi.stubGlobal('window', {
    requestAnimationFrame: vi.fn((callback: () => void) => {
      callback();
      return 1;
    }),
  });
});

afterEach(() => {
  vi.doUnmock('react-dom');
  vi.doUnmock(reactDomPath);
  if (reactDomRealPath !== reactDomPath) vi.doUnmock(reactDomRealPath);
  vi.unstubAllGlobals();
});

describe('M11 首页交互与创建边界覆盖', () => {
  it('让三条创作路径分别进入正文、章节骨架协作和章节建议稿', async () => {
    const scenarios = [
      { path: 'autonomous', primary: '继续写作', mode: null, order: ['planning', 'canon'] },
      { path: 'hybrid', primary: '规划本章并协作', mode: 'skeleton', order: ['planning', 'canon'] },
      {
        path: 'ai-first',
        primary: '生成本章建议稿',
        mode: 'chapter',
        order: ['canon', 'planning'],
      },
    ] as const;

    for (const scenario of scenarios) {
      const onWritingAction = vi.fn();
      const props = baseProps({
        activeProject,
        continuation,
        providerAvailable: true,
        settings: { ...settings, creativePath: scenario.path },
        onWritingAction,
      });
      const renderer = await mount(props);
      const primary = control(
        renderer.root,
        'button',
        (node) => node.props['data-creative-path-primary'] === scenario.path,
      );
      expect(textContent(primary)).toBe(scenario.primary);
      const recommendations = renderer.root
        .findAll((node) => Boolean(node.props['data-creative-path-recommendation']))
        .map((node) => node.props['data-creative-path-recommendation']);
      expect(recommendations).toEqual(scenario.order);

      await invoke(primary, 'onClick');
      if (scenario.mode === null) expect(props.onContinue).toHaveBeenCalledOnce();
      else
        expect(onWritingAction).toHaveBeenCalledWith({
          type: 'writing-action',
          projectId,
          generationMode: scenario.mode,
        });
      renderer.unmount();
    }
  });

  it('执行首页、最近作品与活动作品动作', async () => {
    const props = baseProps({
      recentProjects: [
        recent('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
        recent('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
        recent('cccccccc-cccc-4ccc-8ccc-cccccccccccc', true),
      ],
    });
    const renderer = await mount(props);

    await invoke(buttonContaining(renderer.root, '打开作品'), 'onClick');
    await invoke(buttonContaining(renderer.root, '恢复受损作品'), 'onClick');
    await invoke(buttonContaining(renderer.root, '继续写作'), 'onClick');
    await invoke(
      control(
        renderer.root,
        'button',
        (node) => Boolean(node.props['data-open-recent']) && textContent(node) === '打开',
      ),
      'onClick',
    );
    await invoke(buttonContaining(renderer.root, '重新定位'), 'onClick');
    for (const remove of renderer.root.findAll(
      (node) => node.type === 'button' && textContent(node).includes('移除记录'),
    )) {
      await invoke(remove, 'onClick');
    }
    for (const label of ['快速开始', '完整流程', '导入已有作品', '空白作品']) {
      await invoke(buttonContaining(renderer.root, label), 'onClick');
      await invoke(buttonContaining(renderer.root, '取消'), 'onClick');
    }
    await invoke(buttonContaining(renderer.root, '新建作品'), 'onClick');
    await invoke(buttonContaining(renderer.root, '取消'), 'onClick');

    expect(props.onOpenSelected).toHaveBeenNthCalledWith(1, false);
    expect(props.onOpenSelected).toHaveBeenNthCalledWith(2, true);
    expect(props.onContinue).toHaveBeenCalled();
    expect(props.onOpenRecent).toHaveBeenCalledWith('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect(props.onRelocateRecent).toHaveBeenCalledWith('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    expect(props.onRemoveRecent).toHaveBeenCalledTimes(3);
    expect(createTriggerNode.focus).toHaveBeenCalled();
    renderer.unmount();

    const activeProps = baseProps({
      activeProject,
      continuation,
      settings: { ...settings, onboardingCompleted: true, creativePath: 'hybrid' },
      providerAvailable: true,
    });
    const active = await mount(activeProps);
    await invoke(buttonContaining(active.root, '知道了'), 'onClick');
    const creativePath = control(
      active.root,
      'select',
      (node) => node.props['aria-describedby'] === 'creative-path-note',
    );
    await invoke(creativePath, 'onChange', { target: { value: 'ai-first' } });
    await invoke(buttonContaining(active.root, '继续写作'), 'onClick');
    await invoke(buttonContaining(active.root, '作品规划'), 'onClick');
    await invoke(buttonContaining(active.root, '人物与设定'), 'onClick');
    await invoke(buttonContaining(active.root, '恢复中心'), 'onClick');
    await invoke(buttonContaining(active.root, '移动作品目录'), 'onClick');
    await invoke(buttonContaining(active.root, '关闭作品'), 'onClick');

    expect(activeProps.onSaveSettings).toHaveBeenCalledWith({ onboardingScaffoldDismissed: true });
    expect(activeProps.onSaveSettings).toHaveBeenCalledWith({ creativePath: 'ai-first' });
    expect(activeProps.onNavigate).toHaveBeenCalledWith('planning');
    expect(activeProps.onNavigate).toHaveBeenCalledWith('canon');
    expect(activeProps.onOpenRecovery).toHaveBeenCalled();
    expect(activeProps.onMoveProject).toHaveBeenCalledWith(projectId);
    expect(activeProps.onCloseProject).toHaveBeenCalledWith(projectId);
    active.unmount();
  });

  it('处理外部新建请求、创建成功与失败关闭语义', async () => {
    const requested = baseProps({ onboardingRequest: 1 });
    const renderer = await mount(requested);
    expect(textContent(renderer.root)).toContain('完整流程');
    expect(renderer.root.findAll((node) => node.props.role === 'dialog')).toHaveLength(1);

    StubFormData.values = {
      name: '完整作品',
      channel: '男频',
      initialStructure: 'starter',
      creativePath: 'autonomous',
    };
    await invoke(
      control(renderer.root, 'form', () => true),
      'onSubmit',
      {
        preventDefault: vi.fn(),
        currentTarget: {},
      },
    );
    expect(requested.onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ destination: 'planning' }),
    );
    expect(renderer.root.findAll((node) => node.props.role === 'dialog')).toHaveLength(0);
    renderer.unmount();

    const failedCreate = vi.fn(async () => false);
    const failedProps = baseProps({ onCreate: failedCreate });
    const failed = await mount(failedProps);
    await invoke(buttonContaining(failed.root, '空白作品'), 'onClick');
    StubFormData.values = { name: '纯空白', channel: '未指定' };
    await invoke(
      control(failed.root, 'form', () => true),
      'onSubmit',
      {
        preventDefault: vi.fn(),
        currentTarget: {},
      },
    );
    expect(failedCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: 'writing',
        project: expect.objectContaining({ initialStructure: 'blank', onboarding: undefined }),
      }),
    );
    expect(failed.root.findAll((node) => node.props.role === 'dialog')).toHaveLength(1);
    failed.unmount();

    const ignored = await mount(baseProps({ onboardingRequest: 0 }));
    expect(ignored.root.findAll((node) => node.props.role === 'dialog')).toHaveLength(0);
    ignored.unmount();
  });

  it('覆盖创建校验、完整计划、导入计划和数字/列表边界', async () => {
    const invalidProps = baseProps({ onboardingRequest: 1, providerAvailable: false });
    const invalid = await mount(invalidProps);
    StubFormData.values = { name: '   ', channel: '未指定' };
    await invoke(
      control(invalid.root, 'form', () => true),
      'onSubmit',
      {
        preventDefault: vi.fn(),
        currentTarget: {},
      },
    );
    expect(textContent(invalid.root)).toContain('请填写作品名称。');

    StubFormData.values = {
      name: '智能作品',
      channel: '女频',
      initialStructure: 'starter',
      creativePath: 'ai-first',
    };
    await invoke(
      control(invalid.root, 'form', () => true),
      'onSubmit',
      {
        preventDefault: vi.fn(),
        currentTarget: {},
      },
    );
    expect(textContent(invalid.root)).toContain('智能优先需要先配置智能连接');
    invalid.unmount();

    const completeProps = baseProps({ onboardingRequest: 1, providerAvailable: true });
    const complete = await mount(completeProps);
    StubFormData.values = {
      name: '完整作品',
      channel: '男频',
      initialStructure: 'starter',
      creativePath: 'ai-first',
      concept: '少年入京',
      readingPromise: '层层破局',
      protagonistGoal: '找到真相',
      coreConflict: '旧案与新局',
      endingIntent: '归乡',
      required: '伏笔一\n\n伏笔二',
      forbidden: '机械降神',
      protagonistName: '沈砚',
      protagonistIdentity: '书生',
      protagonistBoundary: '不伤无辜',
      chapterTitle: '雨夜',
      targetWordMin: '3000',
      targetWordMax: '1000001',
      sceneGoals: Array.from({ length: 25 }, (_, index) => `场景${index + 1}`).join('\n'),
    };
    await invoke(
      control(complete.root, 'form', () => true),
      'onSubmit',
      {
        preventDefault: vi.fn(),
        currentTarget: {},
      },
    );
    expect(completeProps.onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: 'planning',
        creativePath: 'ai-first',
        project: expect.objectContaining({
          onboarding: expect.objectContaining({
            brief: expect.objectContaining({ required: ['伏笔一', '伏笔二'] }),
            protagonist: expect.objectContaining({ name: '沈砚' }),
            firstChapter: expect.objectContaining({
              title: '雨夜',
              targetWordMin: 3000,
              targetWordMax: null,
            }),
            sceneGoals: expect.arrayContaining(['场景1', '场景20']),
          }),
        }),
      }),
    );
    complete.unmount();

    const importProps = baseProps();
    const imported = await mount(importProps);
    await invoke(buttonContaining(imported.root, '导入已有作品'), 'onClick');
    StubFormData.values = { name: '旧稿', channel: '', initialStructure: 'blank' };
    await invoke(
      control(imported.root, 'form', () => true),
      'onSubmit',
      {
        preventDefault: vi.fn(),
        currentTarget: {},
      },
    );
    expect(importProps.onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ destination: 'import-export' }),
    );
    imported.unmount();
  });

  it('覆盖对话框 Escape、Tab 焦点循环和无可聚焦控件边界', async () => {
    const props = baseProps({ onboardingRequest: 1 });
    const renderer = await mount(props);
    const dialog = control(renderer.root, 'section', (node) => node.props.role === 'dialog');

    const escape = { key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() };
    await invoke(dialog, 'onKeyDown', escape);
    expect(escape.preventDefault).toHaveBeenCalled();
    expect(escape.stopPropagation).toHaveBeenCalled();
    expect(createTriggerNode.focus).toHaveBeenCalled();

    await act(async () => {
      renderer.unmount();
    });

    const tabRenderer = await mount(baseProps({ onboardingRequest: 1 }));
    const tabDialog = control(tabRenderer.root, 'section', (node) => node.props.role === 'dialog');
    documentState.activeElement = firstControl;
    const shiftTab = {
      key: 'Tab',
      shiftKey: true,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    await invoke(tabDialog, 'onKeyDown', shiftTab);
    expect(lastControl.focus).toHaveBeenCalled();

    documentState.activeElement = lastControl;
    const tab = { key: 'Tab', shiftKey: false, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    await invoke(tabDialog, 'onKeyDown', tab);
    expect(firstControl.focus).toHaveBeenCalled();

    await invoke(tabDialog, 'onKeyDown', {
      key: 'Enter',
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    tabRenderer.unmount();

    dialogNode.querySelectorAll.mockReturnValueOnce([]);
    const emptyRenderer = await mount(baseProps({ onboardingRequest: 1 }));
    const emptyDialog = control(
      emptyRenderer.root,
      'section',
      (node) => node.props.role === 'dialog',
    );
    await invoke(emptyDialog, 'onKeyDown', {
      key: 'Tab',
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    emptyRenderer.unmount();
  });
});
