import { useCallback, useEffect, useRef, useState } from 'react';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import {
  authorAttentionLabel,
  authorForeshadowingStatusLabel,
  authorJsonValue,
} from '../../presentation/author-value-format.js';
import { RequestGeneration } from '../../runtime/request-generation.js';
import type { AuthorNavigationTarget } from '../../shell/navigation-target.js';
import { loadWritingAssistance, type WritingAssistanceView } from './writing-assistance.js';

interface WritingAssistancePanelProps {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly chapterId: string;
  readonly savedRevision: number | null;
  readonly readOnly: boolean;
  readonly onNavigate: (target: AuthorNavigationTarget) => void;
  readonly onOpenAssistant: () => void;
}

export function WritingAssistancePanel({
  bridge,
  projectId,
  chapterId,
  savedRevision,
  readOnly,
  onNavigate,
  onOpenAssistant,
}: WritingAssistancePanelProps) {
  const [view, setView] = useState<WritingAssistanceView | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const requestGeneration = useRef(new RequestGeneration());

  const refresh = useCallback(async (): Promise<void> => {
    const generation = requestGeneration.current.begin();
    setState('loading');
    try {
      const next = await loadWritingAssistance(bridge, projectId, chapterId);
      if (!requestGeneration.current.isCurrent(generation)) return;
      setView(next);
      setState('ready');
    } catch {
      if (!requestGeneration.current.isCurrent(generation)) return;
      setState('failed');
    }
  }, [bridge, chapterId, projectId]);

  useEffect(() => {
    void refresh();
    return () => {
      requestGeneration.current.invalidate();
    };
  }, [refresh]);

  return (
    <aside className="writing-context writing-assistance feature-card" data-writing-assistance>
      <header className="feature-card__heading">
        <div>
          <h2>本章写作辅助</h2>
          <p>{view?.chapterTitle ?? '正在读取章节信息'}</p>
        </div>
        <div className="inline-actions">
          <button type="button" onClick={onOpenAssistant}>
            智能助手
          </button>
          <button type="button" disabled={state === 'loading'} onClick={() => void refresh()}>
            刷新
          </button>
        </div>
      </header>

      <p className="feature-status" role="status" data-writing-assistance-status>
        {state === 'loading'
          ? '正在汇总本章规划与前后文…'
          : state === 'failed'
            ? '写作辅助暂时无法读取，正文编辑和保存不受影响。'
            : readOnly
              ? '只读浏览 · 写作辅助来自已保存数据'
              : `当前稿已保存 · 保存序号 ${savedRevision ?? 0}`}
      </p>

      {view ? (
        <div className="writing-assistance__sections">
          <section>
            <h3>本章目标</h3>
            {view.goal ? (
              <dl className="compact-details">
                <dt>目标</dt>
                <dd>{view.goal.goal || view.goal.title}</dd>
                <dt>核心冲突</dt>
                <dd>{view.goal.coreConflict || '尚未填写'}</dd>
                <dt>预期结果</dt>
                <dd>{view.goal.expectedResult || '尚未填写'}</dd>
              </dl>
            ) : (
              <p>尚未关联章节大纲，可继续自由写作。</p>
            )}
          </section>

          <section>
            <h3>当前场景</h3>
            {view.sceneBeats.length ? (
              <ol className="compact-list">
                {view.sceneBeats.map((beat) => (
                  <li key={beat.id}>
                    <strong>
                      {beat.title}
                      {beat.required ? ' · 必须完成' : ''}
                    </strong>
                    <span>
                      {beat.wordTargetPercent}% · {beat.goal || '尚未填写目标'}
                    </span>
                    <button
                      type="button"
                      data-author-return-key={`writing-assistance:scene-beat:${beat.id}`}
                      onClick={() =>
                        onNavigate({
                          type: 'scene-beat',
                          projectId,
                          chapterId,
                          sceneBeatId: beat.id,
                        })
                      }
                    >
                      查看场景
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p>当前章节尚无场景。</p>
            )}
          </section>

          <details className="writing-assistance__disclosure">
            <summary>人物状态（{view.characters.length}）</summary>
            {view.characters.length ? (
              <div className="writing-assistance__cards">
                {view.characters.map((character) => (
                  <article key={character.id}>
                    <strong>{character.name}</strong>
                    {character.summary ? <p>{character.summary}</p> : null}
                    {character.states.map((item) => (
                      <p key={item.key}>
                        {item.key}：{authorJsonValue(item.value)}
                      </p>
                    ))}
                    {character.knowledge.map((item) => (
                      <p key={`${item.information}:${item.status}`}>
                        {item.information}：{knowledgeStatusLabel(item.status)}
                      </p>
                    ))}
                    {!character.states.length && !character.knowledge.length ? (
                      <p>当前章节没有已记录的动态状态。</p>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <p>场景尚未关联人物。</p>
            )}
          </details>

          <details className="writing-assistance__disclosure">
            <summary>伏笔与修改任务（{view.foreshadowings.length + view.todos.length}）</summary>
            {view.foreshadowings.map((item) => (
              <article className="writing-assistance__item" key={item.id}>
                <strong>{item.title}</strong>
                <span>
                  {authorForeshadowingStatusLabel(item.status)} ·{' '}
                  {authorAttentionLabel(item.attention)}
                </span>
                {item.description ? <p>{item.description}</p> : null}
                <button
                  type="button"
                  data-author-return-key={`writing-assistance:foreshadowing:${item.id}`}
                  onClick={() =>
                    onNavigate({
                      type: 'foreshadowing',
                      projectId,
                      foreshadowingId: item.id,
                      chapterId,
                      query: item.title,
                    })
                  }
                >
                  查看伏笔
                </button>
              </article>
            ))}
            {view.todos.map((todo) => (
              <article className="writing-assistance__item" key={todo.todoId}>
                <strong>修改任务：{todo.title}</strong>
                <button
                  type="button"
                  data-author-return-key={`writing-assistance:todo:${todo.todoId}`}
                  onClick={() =>
                    onNavigate({
                      type: 'story-todo',
                      projectId,
                      todoId: todo.todoId,
                      chapterId: todo.chapterId,
                      sceneBeatId: todo.sceneBeatId,
                      logicalBlockId: todo.logicalBlockId,
                    })
                  }
                >
                  查看任务位置
                </button>
              </article>
            ))}
            {!view.foreshadowings.length && !view.todos.length ? <p>当前没有待处理事项。</p> : null}
          </details>

          <details className="writing-assistance__disclosure">
            <summary>上一章结尾</summary>
            {view.previousEnding?.text ? (
              <>
                <p>
                  {view.previousEnding.chapterTitle} ·{' '}
                  {view.previousEnding.source === 'final-version' ? '定稿' : '当前稿'}
                </p>
                <blockquote>{view.previousEnding.text}</blockquote>
              </>
            ) : (
              <p>没有可用的上一章内容。</p>
            )}
          </details>

          {view.warnings.length ? (
            <details className="writing-assistance__disclosure">
              <summary>部分信息暂不可用</summary>
              <ul>
                {view.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}

function knowledgeStatusLabel(status: string): string {
  const labels: Readonly<Record<string, string>> = {
    knows: '已经知晓',
    believes: '相信如此',
    suspects: '有所怀疑',
    misunderstands: '存在误解',
    unknown: '尚不知情',
  };
  return labels[status] ?? '状态未知';
}
