import { createRequire } from 'node:module';

import type {
  Chapter,
  ProjectWorkspaceSummary,
  SkeletonCandidateDocument,
  TaskSnapshot,
} from '@worldforge/contracts';
import type {
  ChangeEvent,
  createElement as createReactElement,
  isValidElement as isValidReactElement,
} from 'react';
import type { renderToStaticMarkup as renderReactToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AuthorErrorNotice } from '../../apps/desktop/renderer/src/components/author-error-notice.js';
import { ContextHelp } from '../../apps/desktop/renderer/src/components/context-help.js';
import { SafetyBanner } from '../../apps/desktop/renderer/src/components/safety-banner.js';
import { TaskBar } from '../../apps/desktop/renderer/src/components/task-bar.js';
import { PlanningInlineError } from '../../apps/desktop/renderer/src/features/planning/planning-inline-error.js';
import { CandidateSkeletonReview } from '../../apps/desktop/renderer/src/features/writing/candidate-skeleton-review.js';
import { FindReplaceToolbar } from '../../apps/desktop/renderer/src/features/writing/find-replace-toolbar.js';
import { WritingWorkbenchHeader } from '../../apps/desktop/renderer/src/features/writing/writing-workbench-header.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const rendererRequire = createRequire(
  new URL('../../apps/desktop/renderer/package.json', import.meta.url),
);
const { createElement, isValidElement } = rendererRequire('react') as {
  readonly createElement: typeof createReactElement;
  readonly isValidElement: typeof isValidReactElement;
};
const { renderToStaticMarkup } = rendererRequire('react-dom/server') as {
  readonly renderToStaticMarkup: typeof renderReactToStaticMarkup;
};

interface ElementNode {
  readonly type: unknown;
  readonly props: Readonly<Record<string, unknown>>;
}

function elementNodes(value: unknown): ElementNode[] {
  if (Array.isArray(value)) return value.flatMap(elementNodes);
  if (!isValidElement(value)) return [];
  const node = value as unknown as ElementNode;
  return [node, ...elementNodes(node.props.children)];
}

function textContent(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(textContent).join('');
  if (!isValidElement(value)) return '';
  return textContent((value as unknown as ElementNode).props.children);
}

function nodeByText(nodes: readonly ElementNode[], type: string, text: string): ElementNode {
  const node = nodes.find((item) => item.type === type && textContent(item).includes(text));
  if (!node) throw new Error(`ELEMENT_NOT_FOUND:${type}:${text}`);
  return node;
}

function nodeByData(nodes: readonly ElementNode[], property: string): ElementNode {
  const node = nodes.find((item) => Object.hasOwn(item.props, property));
  if (!node) throw new Error(`ELEMENT_NOT_FOUND:${property}`);
  return node;
}

function callback<T extends (...argumentsList: never[]) => unknown>(
  node: ElementNode,
  property = 'onClick',
): T {
  const value = node.props[property];
  if (typeof value !== 'function') throw new Error(`CALLBACK_NOT_FOUND:${property}`);
  return value as T;
}

describe('Renderer关键展示与交互边界', () => {
  it('展示安全错误与上下文帮助，并把作者操作交给唯一回调', () => {
    const dangerAction = vi.fn();
    const dangerMarkup = renderToStaticMarkup(
      createElement(SafetyBanner, {
        kind: 'danger',
        title: '正文尚未保存',
        message: '操作已经停止。',
        diagnosticId: 'diag-1',
        action: { label: '重新保存', run: dangerAction },
      }),
    );
    expect(dangerMarkup).toContain('role="alert"');
    expect(dangerMarkup).toContain('诊断ID：diag-1');
    expect(dangerMarkup).toContain('重新保存');

    const noticeMarkup = renderToStaticMarkup(
      createElement(AuthorErrorNotice, {
        error: { code: 'REVISION_CONFLICT', message: 'internal detail' },
        className: 'save-error',
      }),
    );
    expect(noticeMarkup).toContain('当前稿已经发生变化');
    expect(noticeMarkup).toContain('请重新比较内容后再采用');
    expect(noticeMarkup).toContain('REVISION_CONFLICT');

    const onClose = vi.fn();
    const onDismissTip = vi.fn();
    const onOpenOnboarding = vi.fn();
    const help = ContextHelp({
      route: 'writing',
      disclosureMode: 'beginner',
      seenTips: [],
      onClose,
      onDismissTip,
      onOpenOnboarding,
    });
    const helpNodes = elementNodes(help);
    callback(nodeByText(helpNodes, 'button', '关闭'))();
    callback(nodeByText(helpNodes, 'button', '查看作品引导'))();
    callback(nodeByText(helpNodes, 'button', '标记本页提示已读'))();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onOpenOnboarding).toHaveBeenCalledOnce();
    expect(onDismissTip).toHaveBeenCalledWith('locked-blocks');

    const fallbackMarkup = renderToStaticMarkup(
      createElement(ContextHelp, {
        route: 'settings',
        disclosureMode: 'professional',
        seenTips: ['focus-mode'],
        onClose,
        onDismissTip,
        onOpenOnboarding,
      }),
    );
    expect(fallbackMarkup).toContain('当前工作台');
    expect(fallbackMarkup).toContain('本页提示已读');
    expect(fallbackMarkup).toContain('disabled');
  });

  it('只展示活动任务，并保持返回、面板和布局切换回调语义', () => {
    const onCancel = vi.fn();
    const tasks = contractInput<TaskSnapshot[]>([
      {
        taskId: 'task-running',
        taskType: 'draft.generate',
        projectId: 'project-a',
        status: 'running',
        stage: 'streaming',
        lastSequence: 2,
        startedAt: '2026-08-08T00:00:00.000Z',
        elapsedMs: 65_000,
      },
      {
        taskId: 'task-queued',
        taskType: 'validation.run',
        status: 'queued',
        stage: 'queued',
        lastSequence: 0,
        startedAt: '2026-08-08T00:01:00.000Z',
        elapsedMs: 4_000,
      },
      {
        taskId: 'task-completed',
        taskType: 'export.create',
        status: 'completed',
        stage: 'finalizing',
        lastSequence: 4,
        startedAt: '2026-08-08T00:02:00.000Z',
        elapsedMs: 2_000,
      },
    ]);

    expect(TaskBar({ tasks: [], foregroundTaskId: null, onCancel })).toBeNull();
    const taskTree = TaskBar({ tasks, foregroundTaskId: 'task-running', onCancel });
    const taskNodes = elementNodes(taskTree);
    expect(textContent(taskTree)).toContain('进行中 1 · 等待开始 1');
    expect(textContent(taskTree)).toContain('1分5秒');
    expect(textContent(taskTree)).toContain('4秒');
    const cancelButtons = taskNodes.filter(
      (node) => node.type === 'button' && textContent(node).includes('取消任务'),
    );
    expect(cancelButtons).toHaveLength(2);
    callback(cancelButtons[0]!)();
    expect(onCancel).toHaveBeenCalledWith('task-running', 'project-a');

    const setOutlineVisible = vi.fn();
    const setContextVisible = vi.fn();
    const onPanelChange = vi.fn();
    const rememberCurrentSelection = vi.fn();
    const backToProject = vi.fn(async () => undefined);
    const toggleFocusMode = vi.fn();
    const header = WritingWorkbenchHeader({
      project: contractInput<ProjectWorkspaceSummary>({ name: '长夜行舟' }),
      chapter: contractInput<Chapter>({ title: '渡口' }),
      panel: 'editor',
      outlineVisible: false,
      contextVisible: true,
      focusMode: false,
      setOutlineVisible,
      setContextVisible,
      onPanelChange,
      rememberCurrentSelection,
      backToProject,
      toggleFocusMode,
    });
    const headerNodes = elementNodes(header);
    callback(nodeByText(headerNodes, 'button', '正文'))();
    callback(nodeByText(headerNodes, 'button', '历史版本'))();
    callback(nodeByText(headerNodes, 'button', '建议稿'))();
    callback(nodeByText(headerNodes, 'button', '展开目录'))();
    callback(nodeByText(headerNodes, 'button', '收起写作辅助'))();
    callback(nodeByText(headerNodes, 'button', '沉浸写作'))();
    callback(nodeByText(headerNodes, 'button', '返回项目'), 'onPointerDownCapture')();
    callback(nodeByText(headerNodes, 'button', '返回项目'))();
    expect(onPanelChange.mock.calls.map(([panel]) => panel)).toEqual([
      'editor',
      'versions',
      'candidates',
    ]);
    expect((setOutlineVisible.mock.calls[0]?.[0] as (value: boolean) => boolean)(false)).toBe(true);
    expect((setContextVisible.mock.calls[0]?.[0] as (value: boolean) => boolean)(true)).toBe(false);
    expect(toggleFocusMode).toHaveBeenCalledOnce();
    expect(rememberCurrentSelection).toHaveBeenCalledOnce();
    expect(backToProject).toHaveBeenCalledOnce();
  });

  it('查找替换和规划重试保持输入、方向与写入范围', () => {
    const onFindTextChange = vi.fn();
    const onReplaceTextChange = vi.fn();
    const onSelectMatch = vi.fn();
    const onReplaceMatches = vi.fn();
    const toolbar = FindReplaceToolbar({
      findText: '旧称',
      replaceText: '新称',
      findIndex: 1,
      findCount: 3,
      readOnly: false,
      isComposing: false,
      onFindTextChange,
      onReplaceTextChange,
      onSelectMatch,
      onReplaceMatches,
    });
    const toolbarNodes = elementNodes(toolbar);
    callback<(event: ChangeEvent<HTMLInputElement>) => void>(
      nodeByData(toolbarNodes, 'data-draft-find'),
      'onChange',
    )({ target: { value: '线索' } } as ChangeEvent<HTMLInputElement>);
    callback<(event: ChangeEvent<HTMLInputElement>) => void>(
      nodeByData(toolbarNodes, 'data-draft-replace'),
      'onChange',
    )({ target: { value: '伏笔' } } as ChangeEvent<HTMLInputElement>);
    callback(nodeByText(toolbarNodes, 'button', '上一个'))();
    callback(nodeByText(toolbarNodes, 'button', '下一个'))();
    callback(nodeByText(toolbarNodes, 'button', '替换'))();
    callback(nodeByText(toolbarNodes, 'button', '全部替换'))();
    expect(onFindTextChange).toHaveBeenCalledWith('线索');
    expect(onReplaceTextChange).toHaveBeenCalledWith('伏笔');
    expect(onSelectMatch.mock.calls.map(([direction]) => direction)).toEqual([-1, 1]);
    expect(onReplaceMatches.mock.calls.map(([all]) => all)).toEqual([false, true]);
    expect(textContent(toolbar)).toContain('2/3');

    const onRetry = vi.fn(async () => undefined);
    const errorTree = PlanningInlineError({
      error: { code: 'COMMON_CONFLICT_003', message: 'stale' },
      onRetry,
    });
    expect(textContent(errorTree)).toContain('内容状态已经变化');
    callback(nodeByText(elementNodes(errorTree), 'button', '重试'))();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('骨架建议稿只通过明确操作进入编辑、生成或丢弃流程', () => {
    const save = vi.fn(async () => undefined);
    const discard = vi.fn(async () => undefined);
    const setAcknowledgeStaleSkeleton = vi.fn();
    const setChapterSource = vi.fn();
    const setGenerationMode = vi.fn();
    const setSelectedSkeletonId = vi.fn();
    const setEndingHook = vi.fn();
    const setTendency = vi.fn();
    const candidate = contractInput<SkeletonCandidateDocument>({
      candidateId: 'candidate-a',
      candidateType: 'skeleton',
      title: '渡口抉择',
      skeletonRevision: 2,
      editedBy: 'author',
      sourceState: 'stale',
      status: 'pending',
      structuredPayload: {
        beats: [
          {
            beatId: 'beat-b',
            order: 2,
            event: '做出选择',
            cause: '追兵逼近',
            consequence: '暴露身份',
            informationReleased: [],
            characterIntentions: [],
          },
          {
            beatId: 'beat-a',
            order: 1,
            event: '抵达渡口',
            cause: '寻找船只',
            consequence: '遇见船夫',
            informationReleased: [],
            characterIntentions: [],
          },
        ],
        risks: ['地点连续性'],
      },
    });

    const tree = CandidateSkeletonReview({
      candidate,
      readOnly: false,
      tendency: '压迫',
      endingHook: '远处亮起第二盏灯',
      save,
      discard,
      setAcknowledgeStaleSkeleton,
      setChapterSource,
      setGenerationMode,
      setSelectedSkeletonId,
      setEndingHook,
      setTendency,
    });
    const nodes = elementNodes(tree);
    expect(textContent(tree)).toContain('修订 2 · 作者修订 · 来源已变化');
    expect(textContent(tree).indexOf('1. 抵达渡口')).toBeLessThan(
      textContent(tree).indexOf('2. 做出选择'),
    );
    expect(textContent(tree)).toContain('地点连续性');

    callback(nodeByText(nodes, 'button', '用于生成正文'))();
    expect(setGenerationMode).toHaveBeenCalledWith('chapter');
    expect(setChapterSource).toHaveBeenCalledWith('skeleton_candidate');
    expect(setSelectedSkeletonId).toHaveBeenCalledWith('candidate-a');
    expect(setAcknowledgeStaleSkeleton).toHaveBeenCalledWith(false);

    callback<(event: ChangeEvent<HTMLInputElement>) => void>(
      nodeByData(nodes, 'data-edit-skeleton-tendency'),
      'onChange',
    )({ target: { value: '悬疑' } } as ChangeEvent<HTMLInputElement>);
    callback<(event: ChangeEvent<HTMLTextAreaElement>) => void>(
      nodeByData(nodes, 'data-edit-skeleton-ending-hook'),
      'onChange',
    )({ target: { value: '门后有人' } } as ChangeEvent<HTMLTextAreaElement>);
    callback(nodeByText(nodes, 'button', '保存作者修订'))();
    callback(nodeByText(nodes, 'button', '丢弃骨架'))();
    expect(setTendency).toHaveBeenCalledWith('悬疑');
    expect(setEndingHook).toHaveBeenCalledWith('门后有人');
    expect(save).toHaveBeenCalledOnce();
    expect(discard).toHaveBeenCalledOnce();
  });
});
