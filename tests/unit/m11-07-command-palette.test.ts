import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { createElement as createReactElement, ReactElement } from 'react';
import type { renderToStaticMarkup as renderReactToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { ProviderSummary } from '@worldforge/contracts';
import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import {
  COMMAND_CATALOG,
  commandPaletteShortcutLabel,
  filterCommandCatalog,
} from '../../apps/desktop/renderer/src/features/command-palette/command-catalog.js';
import { CommandPalette } from '../../apps/desktop/renderer/src/features/command-palette/command-palette.js';
import { LongformAiSettingsPanel } from '../../apps/desktop/renderer/src/features/settings/longform-ai-settings.js';
import {
  GenerationStudio,
  type GenerationMode,
} from '../../apps/desktop/renderer/src/features/writing/generation-studio.js';
import { resolveAuthorNavigationTarget } from '../../apps/desktop/renderer/src/shell/navigation-target.js';
import { projectCloneAction } from '../../packages/core-service/src/recovery/project-clone-policy.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const rendererRequire = createRequire(
  new URL('../../apps/desktop/renderer/package.json', import.meta.url),
);
const { createElement } = rendererRequire('react') as {
  readonly createElement: typeof createReactElement;
};
const { renderToStaticMarkup } = rendererRequire('react-dom/server') as {
  readonly renderToStaticMarkup: typeof renderReactToStaticMarkup;
};
interface TestInstance {
  readonly props: Record<string, unknown>;
  readonly children: readonly (TestInstance | string)[];
  findAllByType(type: string): TestInstance[];
  findByProps(props: Record<string, unknown>): TestInstance;
}
interface TestRenderer {
  readonly root: TestInstance;
  unmount(): void;
  update(element: ReactElement): void;
}
const { act, create: createRenderer } = rendererRequire('react-test-renderer') as {
  readonly act: (callback: () => void | Promise<void>) => Promise<void>;
  readonly create: (element: ReactElement) => TestRenderer;
};

describe('M11-07 Ctrl+K command palette', () => {
  it('registers stable Chinese command identities and scopes project-only actions', () => {
    expect(new Set(COMMAND_CATALOG.map((command) => command.id)).size).toBe(COMMAND_CATALOG.length);
    expect(filterCommandCatalog('', true).map((command) => command.label)).toEqual(
      expect.arrayContaining(['规划这一章', '生成这一章', '改写选中内容']),
    );
    expect(filterCommandCatalog('', false).every((command) => !command.requiresProject)).toBe(true);
    expect(filterCommandCatalog('伏笔', true).map((command) => command.id)).toContain(
      'navigation.canon',
    );
    expect(commandPaletteShortcutLabel('MacIntel')).toBe('⌘ K');
    expect(commandPaletteShortcutLabel('Win32')).toBe('Ctrl K');
  });

  it('renders one discoverable dialog and maps generation commands through Atomic Navigation', () => {
    const projectId = '5a198db8-5a43-45ea-b777-7dfb63742bb7';
    const markup = renderToStaticMarkup(
      createElement(CommandPalette, {
        availability: {
          home: true,
          planning: true,
          writing: true,
          canon: true,
          checks: true,
          settings: true,
        },
        bridge: contractInput<RendererBridgeAdapter>({}),
        open: true,
        projectId,
        onClose: vi.fn(),
        onNavigate: vi.fn(),
        onNavigateTarget: vi.fn(),
        onTransitionToRoute: vi.fn(async () => true),
        returnFocusRef: { current: null },
      }),
    );
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('搜索章节、人物、设定、伏笔、版本或命令');
    expect(markup).toContain('规划这一章');
    expect(markup).toContain('生成这一章');
    expect(markup).toContain('改写选中内容');

    expect(
      resolveAuthorNavigationTarget({
        type: 'writing-action',
        projectId,
        generationMode: 'rewrite',
      }),
    ).toMatchObject({
      route: 'candidates',
      filters: { 'navigation.generationMode': 'rewrite' },
    });
  });

  it('reuses SearchTools, structure, foreshadowing and latest-only request lanes', async () => {
    const source = await readFile(
      path.resolve('apps/desktop/renderer/src/features/command-palette/command-palette.tsx'),
      'utf8',
    );
    expect(source).toContain('bridge.searchTools');
    expect(source).toContain('searchResultNavigationTarget');
    expect(source).toContain('bridge.planning.listStructure');
    expect(source).toContain('bridge.narrativePlanning.list');
    expect(source).toContain("mode: 'replace'");
    expect(source).toContain('laneKey: `command-palette:search:${projectId}`');
    expect(source).not.toContain('new SearchIndex');
  });

  it('ignores a superseded search result after its request is aborted', async () => {
    const projectId = '5a198db8-5a43-45ea-b777-7dfb63742bb7';
    const chapterId = '481b7b8f-c7b4-4a87-88b6-1d27721a3bb8';
    type SearchOutcome = Awaited<ReturnType<RendererBridgeAdapter['searchTools']['search']>>;
    let resolveOld!: (outcome: SearchOutcome) => void;
    let resolveNew!: (outcome: SearchOutcome) => void;
    const search = vi.fn(
      (input: { readonly query: string }) =>
        new Promise<SearchOutcome>((resolve) => {
          if (input.query === '旧查询') resolveOld = resolve;
          else resolveNew = resolve;
        }),
    );
    vi.stubGlobal('window', {
      requestAnimationFrame: (callback: () => void) => {
        callback();
        return 1;
      },
      setTimeout: (callback: () => void) => {
        callback();
        return 1;
      },
      clearTimeout: vi.fn(),
    });
    vi.stubGlobal('document', { activeElement: null });
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const bridge = contractInput<RendererBridgeAdapter>({
      planning: {
        listStructure: vi.fn(async () => success({ projectId, volumes: [] })),
      },
      narrativePlanning: {
        list: vi.fn(async () => success({ projectId, foreshadowings: [], characterArcs: [] })),
      },
      searchTools: { search },
    });
    let renderer!: TestRenderer;
    await act(async () => {
      renderer = createRenderer(
        createElement(CommandPalette, {
          availability: {
            home: true,
            planning: true,
            writing: true,
            canon: false,
            checks: true,
            settings: true,
          },
          bridge,
          open: true,
          projectId,
          onClose: vi.fn(),
          onNavigate: vi.fn(),
          onNavigateTarget: vi.fn(),
          onTransitionToRoute: vi.fn(async () => true),
          returnFocusRef: { current: null },
        }),
      );
      await flushPromises();
    });
    const input = renderer.root.findAllByType('input')[0]!;
    await act(async () => {
      (input.props.onChange as (event: { target: { value: string } }) => void)({
        target: { value: '旧查询' },
      });
      await flushPromises();
    });
    await act(async () => {
      (input.props.onChange as (event: { target: { value: string } }) => void)({
        target: { value: '新查询' },
      });
      await flushPromises();
    });
    await act(async () => {
      resolveNew(
        success({
          projectId,
          query: '新查询',
          normalizedQuery: '新查询',
          strategy: 'fts' as const,
          indexStatus: 'ready' as const,
          items: [searchDraftResult('新结果', chapterId)],
        }),
      );
      await flushPromises();
    });
    await act(async () => {
      resolveOld(
        success({
          projectId,
          query: '旧查询',
          normalizedQuery: '旧查询',
          strategy: 'fts' as const,
          indexStatus: 'ready' as const,
          items: [searchDraftResult('旧结果', chapterId)],
        }),
      );
      await flushPromises();
    });
    expect(textContent(renderer.root)).toContain('新结果');
    expect(textContent(renderer.root)).not.toContain('旧结果');
    expect(search.mock.calls[0]![1]!.signal?.aborted).toBe(true);

    await act(async () => renderer.unmount());
    vi.unstubAllGlobals();
  });

  it('regenerates derived digests when cloning a project', () => {
    expect(projectCloneAction('story_digests')).toBe('regenerate');
  });

  it('owns async search, keyboard focus and all catalog execution paths', async () => {
    const projectId = '5a198db8-5a43-45ea-b777-7dfb63742bb7';
    const chapterId = '481b7b8f-c7b4-4a87-88b6-1d27721a3bb8';
    const onClose = vi.fn();
    const onNavigate = vi.fn();
    const onTransitionToRoute = vi.fn(async () => true);
    const onNavigateTarget = vi.fn();
    const focus = vi.fn();
    vi.stubGlobal('window', {
      requestAnimationFrame: (callback: () => void) => {
        callback();
        return 1;
      },
      setTimeout: (callback: () => void) => {
        callback();
        return 1;
      },
      clearTimeout: vi.fn(),
    });
    const documentState: { activeElement: object | null } = { activeElement: null };
    vi.stubGlobal('document', documentState);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const bridge = contractInput<RendererBridgeAdapter>({
      planning: {
        listStructure: vi.fn(async () =>
          success({
            projectId,
            volumes: [
              {
                id: '47ec1a73-cb73-454d-8133-b9574b8e6d91',
                projectId,
                title: '第一卷',
                orderKey: '1',
                status: 'writing',
                deletedAt: null,
                chapters: [
                  {
                    id: chapterId,
                    volumeId: '47ec1a73-cb73-454d-8133-b9574b8e6d91',
                    title: '铜铃暗号',
                    orderKey: '1',
                    status: 'writing',
                    targetWordMin: null,
                    targetWordMax: null,
                    activeDraftId: null,
                    finalVersionId: null,
                    deletedAt: null,
                  },
                ],
              },
            ],
          }),
        ),
      },
      narrativePlanning: {
        list: vi.fn(async () =>
          success({
            projectId,
            foreshadowings: [
              {
                id: '21c0a66f-22e9-40f8-a08b-ea56112f5994',
                projectId,
                title: '旧约伏笔',
                description: '铜铃将在后卷再次出现。',
                status: 'planted',
                revealFromChapterId: null,
                revealByChapterId: null,
                chapterLinks: [{ chapterId, role: 'plant' }],
                relations: [],
                attention: 'none',
                warnings: [],
                createdAt: '2026-08-13T00:00:00.000Z',
                updatedAt: '2026-08-13T00:00:00.000Z',
              },
            ],
            characterArcs: [],
          }),
        ),
      },
      searchTools: {
        search: vi.fn(async () =>
          success({
            projectId,
            query: '铜铃',
            normalizedQuery: '铜铃',
            strategy: 'fts',
            indexStatus: 'ready',
            items: [
              {
                sourceType: 'entity',
                targetId: 'f8032dbc-15c2-4caf-a15c-cbbfd8ee9674',
                anchorId: null,
                chapterId: null,
                title: '人物阿遥',
                excerpt: '她认得铜铃暗号。',
                score: 1,
              },
              {
                sourceType: 'draft',
                targetId: '5107e242-40a8-452a-9904-227678e5e3df',
                anchorId: 'b82f7a0f-963e-45ca-8505-cdd014b73691',
                chapterId,
                title: '当前稿铜铃',
                excerpt: '雨中响起铜铃。',
                score: 0.9,
              },
              {
                sourceType: 'version',
                targetId: '14c75ab9-cff0-4e04-8d10-2613247773ec',
                anchorId: null,
                chapterId,
                title: '历史定稿铜铃',
                excerpt: '铜铃曾在旧塔出现。',
                score: 0.8,
              },
              {
                sourceType: 'draft',
                targetId: '844c3d62-84ed-4514-b8b0-fc7704a001f5',
                anchorId: null,
                chapterId: null,
                title: '无法定位的旧稿',
                excerpt: '不应显示。',
                score: 0.1,
              },
            ],
          }),
        ),
      },
    });

    let renderer!: TestRenderer;
    await act(async () => {
      renderer = createRenderer(
        createElement(CommandPalette, {
          availability: {
            home: true,
            planning: true,
            writing: true,
            canon: true,
            checks: true,
            settings: true,
          },
          bridge,
          open: true,
          projectId,
          onClose,
          onNavigate,
          onNavigateTarget,
          onTransitionToRoute,
          returnFocusRef: { current: { focus } },
        }),
      );
      await flushPromises();
    });
    const input = renderer.root.findAllByType('input')[0]!;
    await act(async () => {
      (input.props.onChange as (event: { target: { value: string } }) => void)({
        target: { value: '铜铃' },
      });
      await flushPromises();
    });
    expect(textContent(renderer.root)).toContain('人物阿遥');
    expect(textContent(renderer.root)).toContain('当前稿铜铃');
    expect(textContent(renderer.root)).toContain('历史定稿铜铃');
    expect(textContent(renderer.root)).not.toContain('无法定位的旧稿');

    const entityButton = renderer.root
      .findAllByType('button')
      .find((candidate) => textContent(candidate).includes('人物阿遥'))!;
    await act(async () => {
      (entityButton.props.onMouseEnter as () => void)();
    });

    await click(renderer, '人物阿遥');
    expect(onNavigateTarget).toHaveBeenCalledWith(expect.objectContaining({ type: 'entity' }));
    await act(async () => {
      (input.props.onChange as (event: { target: { value: string } }) => void)({
        target: { value: '' },
      });
      await flushPromises();
    });
    await click(renderer, '规划这一章');
    expect(onNavigateTarget).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'writing-action', generationMode: 'skeleton' }),
    );
    await click(renderer, '打开历史版本');
    expect(onTransitionToRoute).toHaveBeenCalledWith('versions');
    await click(renderer, '打开人物与设定');
    expect(onNavigate).toHaveBeenCalledWith('canon');
    expect(onClose).toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();

    await act(async () => {
      (input.props.onChange as (event: { target: { value: string } }) => void)({
        target: { value: '旧约' },
      });
      await flushPromises();
    });
    expect(textContent(renderer.root)).toContain('伏笔 · 已埋设');
    await click(renderer, '旧约伏笔');
    expect(onNavigateTarget).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'foreshadowing' }),
    );

    const dialog = renderer.root.findAllByType('section')[0]!;
    const preventDefault = vi.fn();
    const keyDown = dialog.props.onKeyDown as (event: Record<string, unknown>) => void;
    await act(async () => keyDown(keyEvent('ArrowDown', preventDefault)));
    await act(async () => keyDown(keyEvent('ArrowUp', preventDefault)));
    keyDown(keyEvent('Escape', preventDefault));
    keyDown(keyEvent('Enter', preventDefault));
    keyDown({ ...keyEvent('x', preventDefault), nativeEvent: { isComposing: true } });
    const firstFocusable = { focus: vi.fn() };
    const lastFocusable = { focus: vi.fn() };
    documentState.activeElement = firstFocusable;
    keyDown({
      ...keyEvent('Tab', preventDefault),
      shiftKey: true,
      currentTarget: { querySelectorAll: () => [firstFocusable, lastFocusable] },
    });
    documentState.activeElement = lastFocusable;
    keyDown({
      ...keyEvent('Tab', preventDefault),
      currentTarget: { querySelectorAll: () => [firstFocusable, lastFocusable] },
    });
    expect(lastFocusable.focus).toHaveBeenCalledOnce();
    expect(firstFocusable.focus).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalled();

    const backdrop = renderer.root.findAllByType('div')[0]!;
    const target = {};
    (backdrop.props.onMouseDown as (event: { target: object; currentTarget: object }) => void)({
      target,
      currentTarget: target,
    });
    (backdrop.props.onMouseDown as (event: { target: object; currentTarget: object }) => void)({
      target: {},
      currentTarget: target,
    });
    await act(async () => renderer.unmount());
    vi.unstubAllGlobals();
  });

  it('handles closed, unavailable, failed-search and unmounted loading states', async () => {
    const projectId = '5a198db8-5a43-45ea-b777-7dfb63742bb7';
    const fullAvailability = {
      home: true,
      planning: true,
      writing: true,
      canon: true,
      checks: true,
      settings: true,
    };
    vi.stubGlobal('window', {
      requestAnimationFrame: (callback: () => void) => {
        callback();
        return 1;
      },
      setTimeout: (callback: () => void) => {
        callback();
        return 1;
      },
      clearTimeout: vi.fn(),
    });
    vi.stubGlobal('document', { activeElement: null });
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const props = {
      onClose: vi.fn(),
      onNavigate: vi.fn(),
      onNavigateTarget: vi.fn(),
      onTransitionToRoute: vi.fn(async () => true),
      returnFocusRef: { current: null },
    };

    let closed!: TestRenderer;
    await act(async () => {
      closed = createRenderer(
        createElement(CommandPalette, {
          ...props,
          availability: fullAvailability,
          bridge: contractInput<RendererBridgeAdapter>({}),
          open: false,
          projectId,
        }),
      );
    });
    expect(closed.root.findAllByType('section')).toHaveLength(0);
    await act(async () => closed.unmount());

    let unavailable!: TestRenderer;
    await act(async () => {
      unavailable = createRenderer(
        createElement(CommandPalette, {
          ...props,
          availability: {
            home: true,
            planning: false,
            writing: false,
            canon: false,
            checks: false,
            settings: true,
          },
          bridge: contractInput<RendererBridgeAdapter>({}),
          open: true,
          projectId,
        }),
      );
      await flushPromises();
    });
    await act(async () => unavailable.unmount());

    let projectless!: TestRenderer;
    await act(async () => {
      projectless = createRenderer(
        createElement(CommandPalette, {
          ...props,
          availability: fullAvailability,
          bridge: contractInput<RendererBridgeAdapter>({}),
          open: true,
          projectId: null,
        }),
      );
      await flushPromises();
    });
    expect(textContent(projectless.root)).toContain('打开设置');
    await act(async () => projectless.unmount());

    const failedBridge = contractInput<RendererBridgeAdapter>({
      planning: {
        listStructure: vi.fn(async () => success({ projectId, volumes: [] })),
      },
      narrativePlanning: {
        list: vi.fn(async () => success({ projectId, foreshadowings: [], characterArcs: [] })),
      },
      searchTools: { search: vi.fn(async () => failure('COMMON_INTERNAL_999')) },
    });
    let failed!: TestRenderer;
    await act(async () => {
      failed = createRenderer(
        createElement(CommandPalette, {
          ...props,
          availability: fullAvailability,
          bridge: failedBridge,
          open: true,
          projectId,
        }),
      );
      await flushPromises();
    });
    const failedInput = failed.root.findAllByType('input')[0]!;
    await act(async () => {
      changeValue(failedInput, '会失败');
      await flushPromises();
    });
    expect(textContent(failed.root)).toContain('本地服务遇到异常');
    await act(async () => failed.unmount());

    type StructureOutcome = Awaited<ReturnType<RendererBridgeAdapter['planning']['listStructure']>>;
    type NarrativeOutcome = Awaited<ReturnType<RendererBridgeAdapter['narrativePlanning']['list']>>;
    let resolveStructure!: (outcome: StructureOutcome) => void;
    let resolveNarrative!: (outcome: NarrativeOutcome) => void;
    const deferredBridge = contractInput<RendererBridgeAdapter>({
      planning: {
        listStructure: vi.fn(
          () => new Promise<StructureOutcome>((resolve) => (resolveStructure = resolve)),
        ),
      },
      narrativePlanning: {
        list: vi.fn(() => new Promise<NarrativeOutcome>((resolve) => (resolveNarrative = resolve))),
      },
    });
    let deferred!: TestRenderer;
    await act(async () => {
      deferred = createRenderer(
        createElement(CommandPalette, {
          ...props,
          availability: fullAvailability,
          bridge: deferredBridge,
          open: true,
          projectId,
        }),
      );
      await flushPromises();
    });
    await act(async () => deferred.unmount());
    await act(async () => {
      resolveStructure(success({ projectId, volumes: [] }));
      resolveNarrative(success({ projectId, foreshadowings: [], characterArcs: [] }));
      await flushPromises();
    });
    vi.unstubAllGlobals();
  });

  it('presents long-form memory, style and routing in author language', () => {
    const markup = renderToStaticMarkup(
      createElement(LongformAiSettingsPanel, {
        bridge: contractInput<RendererBridgeAdapter>({}),
        project: {
          projectId: '5a198db8-5a43-45ea-b777-7dfb63742bb7',
          name: '长夜行',
          channel: 'web-novel',
          workspacePath: '/safe/project',
          schemaVersion: 34,
          databaseMode: 'read-write',
          compatibility: 'current',
          readOnlyReason: null,
          createdAt: '2026-08-13T00:00:00.000Z',
        },
        providers: [],
        readOnly: false,
      }),
    );
    expect(markup).toContain('长篇记忆');
    expect(markup).toContain('文风档案');
    expect(markup).toContain('智能任务分配');
    expect(markup).toContain('规划这一章');
    expect(markup).toContain('根据定稿重建');
    expect(markup).not.toContain('sourceHash');
    expect(markup).not.toContain('semanticRevision');
  });

  it('keeps all primary generation paths and advanced source variants renderable', () => {
    const modes: readonly GenerationMode[] = ['skeleton', 'chapter', 'rewrite', 'merge'];
    for (const generationMode of modes) {
      for (const chapterSource of [
        'direct_chapter_goal',
        'skeleton_candidate',
        'canonical_scene_beats',
      ] as const) {
        const markup = renderToStaticMarkup(
          createElement(GenerationStudio, {
            activeRun: null,
            acknowledgeStaleSkeleton: false,
            candidateCount: 2,
            chapterGoal: '让主角找回铜铃',
            chapterSource,
            generationInstruction: '保持克制',
            generationMode,
            generationStatus: '尚未开始',
            lastGenerationIntent: null,
            mergeBeatSources: {},
            mergeCandidateIds: new Set<string>(),
            mergeMappingMode: generationMode === 'merge' ? 'segment' : 'beat',
            pending: false,
            proseCandidates: [],
            providers: [],
            providerId: '',
            readOnly: false,
            sceneBeats: [],
            selectedSkeletonId: '',
            skeletonCandidates: [],
            targetCharacters: 3000,
            tendency: '',
            onAcknowledgeStaleSkeletonChange: vi.fn(),
            onCancelGeneration: vi.fn(),
            onCandidateCountChange: vi.fn(),
            onChapterGoalChange: vi.fn(),
            onChapterSourceChange: vi.fn(),
            onDecidePartial: vi.fn(),
            onGenerationInstructionChange: vi.fn(),
            onGenerationModeChange: vi.fn(),
            onMergeBeatSourceChange: vi.fn(),
            onMergeCandidateChange: vi.fn(),
            onMergeMappingModeChange: vi.fn(),
            onProviderIdChange: vi.fn(),
            onRetryRewrite: vi.fn(),
            onSelectedSkeletonChange: vi.fn(),
            onStartGeneration: vi.fn(),
            onTargetCharactersChange: vi.fn(),
            onTendencyChange: vi.fn(),
          }),
        );
        expect(markup).toContain('规划这一章');
        expect(markup).toContain('生成这一章');
        expect(markup).toContain('改写选中内容');
        expect(markup).toContain('高级设置与来源');
        expect(markup).toContain('按任务自动选择');
      }
    }
  });

  it('wires generation controls to the single generation command surface', async () => {
    const onGenerationModeChange = vi.fn();
    const onProviderIdChange = vi.fn();
    const onCandidateCountChange = vi.fn();
    const onTendencyChange = vi.fn();
    const onChapterGoalChange = vi.fn();
    const onChapterSourceChange = vi.fn();
    const onGenerationInstructionChange = vi.fn();
    const onStartGeneration = vi.fn();
    const onTargetCharactersChange = vi.fn();
    const onCancelGeneration = vi.fn();
    const studioProps = {
      activeRun: null,
      acknowledgeStaleSkeleton: false,
      candidateCount: 2,
      chapterGoal: '',
      chapterSource: 'direct_chapter_goal' as const,
      generationInstruction: '',
      generationMode: 'skeleton' as GenerationMode,
      generationStatus: '尚未开始',
      lastGenerationIntent: null,
      mergeBeatSources: {},
      mergeCandidateIds: new Set<string>(),
      mergeMappingMode: 'beat' as const,
      pending: false,
      proseCandidates: [],
      providers: [generationProvider],
      providerId: '',
      readOnly: false,
      sceneBeats: [],
      selectedSkeletonId: '',
      skeletonCandidates: [],
      targetCharacters: 3000,
      tendency: '',
      onAcknowledgeStaleSkeletonChange: vi.fn(),
      onCancelGeneration,
      onCandidateCountChange,
      onChapterGoalChange,
      onChapterSourceChange,
      onDecidePartial: vi.fn(),
      onGenerationInstructionChange,
      onGenerationModeChange,
      onMergeBeatSourceChange: vi.fn(),
      onMergeCandidateChange: vi.fn(),
      onMergeMappingModeChange: vi.fn(),
      onProviderIdChange,
      onRetryRewrite: vi.fn(),
      onSelectedSkeletonChange: vi.fn(),
      onStartGeneration,
      onTargetCharactersChange,
      onTendencyChange,
    };
    let renderer!: TestRenderer;
    await act(async () => {
      renderer = createRenderer(createElement(GenerationStudio, studioProps));
    });
    const primaryActions = renderer.root.findByProps({ 'data-generation-primary-actions': true });
    for (const button of primaryActions.findAllByType('button')) {
      (button.props.onClick as () => void)();
    }
    changeValue(renderer.root.findByProps({ 'data-generation-mode': true }), 'chapter');
    changeValue(renderer.root.findByProps({ 'data-generation-provider': true }), 'local-model');
    changeValue(renderer.root.findByProps({ 'data-skeleton-candidate-count': true }), '9');
    changeValue(renderer.root.findByProps({ 'data-skeleton-tendency': true }), '悬疑');
    changeValue(renderer.root.findByProps({ 'data-generation-chapter-goal': true }), '推进旧约');
    (renderer.root.findByProps({ 'data-start-generation': true }).props.onClick as () => void)();
    (renderer.root.findByProps({ 'data-cancel-generation': true }).props.onClick as () => void)();
    expect(onGenerationModeChange).toHaveBeenCalledTimes(4);
    expect(onProviderIdChange).toHaveBeenCalledWith('local-model');
    expect(onCandidateCountChange).toHaveBeenCalledWith(5);
    expect(onTendencyChange).toHaveBeenCalledWith('悬疑');
    expect(onChapterGoalChange).toHaveBeenCalledWith('推进旧约');
    expect(onStartGeneration).toHaveBeenCalledOnce();
    expect(onCancelGeneration).toHaveBeenCalledOnce();
    await act(async () => {
      renderer.update(
        createElement(GenerationStudio, { ...studioProps, generationMode: 'chapter' }),
      );
    });
    changeValue(
      renderer.root.findByProps({ 'data-chapter-generation-source': true }),
      'canonical_scene_beats',
    );
    changeValue(renderer.root.findByProps({ 'data-generation-target-characters': true }), '0');
    changeValue(renderer.root.findByProps({ 'data-generation-target-characters': true }), '250000');
    changeValue(renderer.root.findByProps({ 'data-generation-instruction': true }), '更克制');
    expect(onChapterSourceChange).toHaveBeenCalledWith('canonical_scene_beats');
    expect(onTargetCharactersChange).toHaveBeenNthCalledWith(1, 100);
    expect(onTargetCharactersChange).toHaveBeenNthCalledWith(2, 200_000);
    expect(onGenerationInstructionChange).toHaveBeenCalledWith('更克制');
    await act(async () => renderer.unmount());
  });

  it('renders stale skeleton acknowledgement, merge mappings and partial retry actions', () => {
    const common = {
      acknowledgeStaleSkeleton: true,
      candidateCount: 2,
      chapterGoal: '推进旧约',
      generationInstruction: '保持克制',
      generationStatus: '生成完成',
      mergeBeatSources: {},
      mergeCandidateIds: new Set(['a6053285-f999-4c67-9ae0-107ea06e21c9']),
      pending: false,
      providers: [],
      providerId: '',
      readOnly: false,
      targetCharacters: 3000,
      tendency: '悬疑',
      onAcknowledgeStaleSkeletonChange: vi.fn(),
      onCancelGeneration: vi.fn(),
      onCandidateCountChange: vi.fn(),
      onChapterGoalChange: vi.fn(),
      onChapterSourceChange: vi.fn(),
      onDecidePartial: vi.fn(),
      onGenerationInstructionChange: vi.fn(),
      onGenerationModeChange: vi.fn(),
      onMergeBeatSourceChange: vi.fn(),
      onMergeCandidateChange: vi.fn(),
      onMergeMappingModeChange: vi.fn(),
      onProviderIdChange: vi.fn(),
      onRetryRewrite: vi.fn(),
      onSelectedSkeletonChange: vi.fn(),
      onStartGeneration: vi.fn(),
      onTargetCharactersChange: vi.fn(),
      onTendencyChange: vi.fn(),
    };
    const proseCandidate = {
      candidateId: 'a6053285-f999-4c67-9ae0-107ea06e21c9',
      projectId: '5a198db8-5a43-45ea-b777-7dfb63742bb7',
      chapterId: '481b7b8f-c7b4-4a87-88b6-1d27721a3bb8',
      generationRunId: null,
      baseDraftId: '5107e242-40a8-452a-9904-227678e5e3df',
      baseDraftRevision: 1,
      completeness: 'complete' as const,
      status: 'pending' as const,
      title: '铜铃建议稿',
      sourceVersionId: null,
      contentHash: 'a'.repeat(64),
      createdAt: '2026-08-13T00:00:00.000Z',
      resolvedAt: null,
      candidateType: 'full' as const,
      blockCount: 1,
    };
    const skeletonCandidate = {
      ...proseCandidate,
      candidateId: '990273d8-c500-4304-8be2-763f8faef1ae',
      candidateType: 'skeleton' as const,
      blockCount: 0 as const,
      skeletonRevisionId: '94de58eb-2f8a-41d1-880f-cbe1e8147c79',
      skeletonRevision: 2,
      payloadSchemaVersion: 1,
      payloadHash: 'b'.repeat(64),
      sourceState: 'stale' as const,
      parentSkeletonRevisionId: null,
      editedBy: 'ai' as const,
    };
    const sceneBeat = {
      id: 'c7e8f726-373a-425b-b7a1-ac272f920d08',
      projectId: proseCandidate.projectId,
      chapterId: proseCandidate.chapterId,
      plotNodeId: null,
      title: '铜铃重现',
      goal: '主角辨认暗号',
      coreConflict: '追兵逼近',
      expectedResult: '主角决定赴约',
      beatType: 'turn' as const,
      wordTargetPercent: 40,
      required: true,
      orderKey: '1',
      characterIds: [],
      locationIds: [],
      blockLinks: [],
      deletedAt: null,
      updatedAt: '2026-08-13T00:00:00.000Z',
    };
    const activeRun = {
      runId: '4efb6313-ce75-49b8-8d94-881da4804db9',
      requestId: '26870719-cb61-4eb8-bda3-d5710a9f80c9',
      taskId: '1e8ac756-5306-4c42-82b3-2ecb14635fa1',
      projectId: proseCandidate.projectId,
      scopeType: 'chapter' as const,
      scopeId: proseCandidate.chapterId,
      chapterId: proseCandidate.chapterId,
      baseDraftId: proseCandidate.baseDraftId,
      baseDraftRevision: 1,
      runType: 'rewrite' as const,
      promptId: 'rewrite.v1',
      promptVersion: 1,
      outputMode: 'text' as const,
      providerId: 'local-model',
      actualModel: 'writer-7b',
      supportStatus: 'verified' as const,
      status: 'succeeded' as const,
      stage: 'completed' as const,
      retryCount: 0,
      inputTokens: 100,
      outputTokens: 200,
      errorCode: null,
      retryable: null,
      partialStatus: 'available' as const,
      resultRefs: [],
      createdAt: '2026-08-13T00:00:00.000Z',
      startedAt: '2026-08-13T00:00:01.000Z',
      finishedAt: '2026-08-13T00:00:02.000Z',
    };
    const rewriteMarkup = renderToStaticMarkup(
      createElement(GenerationStudio, {
        ...common,
        activeRun,
        chapterSource: 'direct_chapter_goal',
        generationMode: 'rewrite',
        lastGenerationIntent: {
          runType: 'rewrite',
          scope: {
            scopeType: 'blocks',
            logicalBlockIds: ['b82f7a0f-963e-45ca-8505-cdd014b73691'],
            expectedBlockHashes: ['c'.repeat(64)],
          },
          instruction: '压缩句子',
          targetLanguage: 'zh-CN',
        },
        mergeMappingMode: 'segment',
        proseCandidates: [proseCandidate],
        sceneBeats: [sceneBeat],
        selectedSkeletonId: '',
        skeletonCandidates: [skeletonCandidate],
      }),
    );
    expect(rewriteMarkup).toContain('保存部分结果');
    expect(rewriteMarkup).toContain('丢弃部分结果');
    expect(rewriteMarkup).toContain('换一个');
    expect(rewriteMarkup).toContain('生成指令版本');

    const staleMarkup = renderToStaticMarkup(
      createElement(GenerationStudio, {
        ...common,
        activeRun: null,
        chapterSource: 'skeleton_candidate',
        generationMode: 'chapter',
        lastGenerationIntent: null,
        mergeMappingMode: 'beat',
        proseCandidates: [proseCandidate],
        sceneBeats: [sceneBeat],
        selectedSkeletonId: skeletonCandidate.candidateId,
        skeletonCandidates: [skeletonCandidate],
      }),
    );
    expect(staleMarkup).toContain('来源已变化');
    expect(staleMarkup).toContain('我已知晓');

    const mergeMarkup = renderToStaticMarkup(
      createElement(GenerationStudio, {
        ...common,
        activeRun: null,
        chapterSource: 'direct_chapter_goal',
        generationMode: 'merge',
        lastGenerationIntent: null,
        mergeMappingMode: 'beat',
        proseCandidates: [proseCandidate],
        sceneBeats: [sceneBeat],
        selectedSkeletonId: '',
        skeletonCandidates: [skeletonCandidate],
      }),
    );
    expect(mergeMarkup).toContain('按已确认场景');
    expect(mergeMarkup).toContain('铜铃建议稿');
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

const generationProvider: ProviderSummary = {
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

function searchDraftResult(title: string, chapterId: string) {
  return {
    sourceType: 'draft' as const,
    targetId: '5107e242-40a8-452a-9904-227678e5e3df',
    anchorId: 'b82f7a0f-963e-45ca-8505-cdd014b73691',
    chapterId,
    title,
    excerpt: `${title}正文`,
    score: 1,
  };
}

async function click(renderer: TestRenderer, label: string): Promise<void> {
  const button = renderer.root
    .findAllByType('button')
    .find((candidate) => textContent(candidate).includes(label));
  expect(button, `button ${label}`).toBeDefined();
  await act(async () => {
    (button!.props.onClick as () => void)();
    await flushPromises();
  });
}

function textContent(instance: TestInstance): string {
  return instance.children
    .map((child) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

function keyEvent(key: string, preventDefault: () => void) {
  return {
    key,
    shiftKey: false,
    preventDefault,
    nativeEvent: { isComposing: false },
    currentTarget: { querySelectorAll: () => [] },
  };
}

function changeValue(instance: TestInstance, value: string): void {
  (instance.props.onChange as (event: { target: { value: string } }) => void)({
    target: { value },
  });
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
