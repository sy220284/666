import { useCallback, useEffect, useReducer, useRef, type MutableRefObject } from 'react';

import type { Chapter, DraftDocument, ProjectContinuationSnapshot } from '@worldforge/contracts';
import type { Editor } from '@worldforge/editor-core';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import {
  INITIAL_CHAPTER_SESSION_STATE,
  chapterOpenIsTemporarilyBlocked,
  chapterOpenRequiresFlush,
  chapterRequestIsCurrent,
  reduceChapterSession,
  type ChapterSessionAction,
  type ChapterSessionState,
} from './chapter-session-state.js';
import type { WritingPanel } from './writing-workbench-types.js';

interface UseChapterSessionInput {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly panel: WritingPanel;
  readonly initialContinuation: ProjectContinuationSnapshot | null;
  readonly navigationChapterId: string | null | undefined;
  readonly navigationLogicalBlockId: string | null | undefined;
  readonly navigationVersionId: string | null | undefined;
  readonly editor: MutableRefObject<Editor | null>;
  readonly activeChapter: MutableRefObject<Chapter | null>;
  readonly activeDraft: MutableRefObject<DraftDocument | null>;
  readonly editorGeneration: MutableRefObject<number>;
  readonly flush: () => Promise<boolean>;
  readonly mountEditor: (draft: DraftDocument, chapter: Chapter) => void;
  readonly onStatus: (message: string) => void;
  readonly setStatus: (message: string, failure?: boolean) => void;
}

export interface ChapterSessionController {
  readonly state: ChapterSessionState;
  readonly openChapter: (chapter: Chapter) => Promise<void>;
  readonly reset: () => void;
}

export function useChapterSession(input: UseChapterSessionInput): ChapterSessionController {
  const [state, dispatch] = useReducer(reduceChapterSession, INITIAL_CHAPTER_SESSION_STATE);
  const stateRef = useRef(state);
  const requestGeneration = useRef(0);
  const sessionGeneration = useRef(0);
  const initialChapterRequested = useRef(false);
  const handledNavigationKey = useRef<string | null>(null);
  const queuedChapter = useRef<Chapter | null>(null);

  const transition = useCallback((action: ChapterSessionAction): void => {
    stateRef.current = reduceChapterSession(stateRef.current, action);
    dispatch(action);
  }, []);

  useEffect(
    () => () => {
      sessionGeneration.current += 1;
      requestGeneration.current += 1;
      queuedChapter.current = null;
    },
    [],
  );

  const openChapter = useCallback(
    async (nextChapter: Chapter): Promise<void> => {
      const session = sessionGeneration.current;
      const isCurrentSession = (): boolean => sessionGeneration.current === session;
      const drainQueuedChapter = (): void => {
        const queued = queuedChapter.current;
        queuedChapter.current = null;
        if (!queued || !isCurrentSession() || queued.id === input.activeChapter.current?.id) return;
        void openChapter(queued);
      };

      if (
        stateRef.current.phase === 'loading' &&
        stateRef.current.requestedChapterId === nextChapter.id
      )
        return;
      const currentDraft = input.activeDraft.current;
      if (input.activeChapter.current?.id === nextChapter.id && currentDraft) {
        queuedChapter.current = null;
        if (stateRef.current.requestedChapterId) {
          requestGeneration.current += 1;
          if (!isCurrentSession()) return;
          input.editor.current?.setEditable(!input.readOnly);
          input.setStatus('已保留当前章节。');
          transition({
            type: 'ready',
            chapterId: nextChapter.id,
            draftId: currentDraft.draftId,
            editorGeneration: input.editorGeneration.current,
          });
        }
        if (isCurrentSession() && input.panel === 'editor' && !input.editor.current)
          input.mountEditor(currentDraft, nextChapter);
        return;
      }
      if (chapterOpenIsTemporarilyBlocked(stateRef.current)) {
        queuedChapter.current = nextChapter;
        input.setStatus(`正在完成当前章节切换，随后打开“${nextChapter.title}”。`);
        return;
      }
      if (chapterOpenRequiresFlush(stateRef.current)) {
        transition({ type: 'flush' });
        const flushed = await input.flush();
        if (!isCurrentSession()) return;
        if (!flushed) {
          queuedChapter.current = null;
          requestGeneration.current += 1;
          input.editor.current?.setEditable(!input.readOnly);
          const message = '自动保存失败，已阻止切换章节。';
          transition({ type: 'fail', message });
          input.onStatus(message);
          return;
        }
      }
      if (!isCurrentSession()) return;
      const generation = ++requestGeneration.current;
      transition({ type: 'load', chapterId: nextChapter.id, requestGeneration: generation });
      input.editor.current?.setEditable(false);
      input.setStatus('正在从作品数据库读取正文…');
      const outcome = await input.bridge.draft.open(
        { projectId: input.projectId, chapterId: nextChapter.id },
        { mode: 'replace' },
      );
      if (
        !isCurrentSession() ||
        !chapterRequestIsCurrent(stateRef.current, nextChapter.id, generation)
      )
        return;
      if (outcome.state !== 'success') {
        input.editor.current?.setEditable(!input.readOnly);
        const message =
          outcome.state === 'failure'
            ? `正文读取失败 · ${authorErrorSummary(outcome.error)}`
            : outcome.state === 'cancelled'
              ? '正文读取已取消。'
              : '正文读取已被更新请求替代。';
        transition({ type: 'fail', message });
        input.setStatus(message, outcome.state === 'failure');
        drainQueuedChapter();
        return;
      }
      transition({ type: 'switch' });
      if (!isCurrentSession()) return;
      input.mountEditor(outcome.data, nextChapter);
      if (!isCurrentSession()) return;
      transition({
        type: 'ready',
        chapterId: nextChapter.id,
        draftId: outcome.data.draftId,
        editorGeneration: input.editorGeneration.current,
      });
      drainQueuedChapter();
    },
    [input, transition],
  );

  useEffect(() => {
    if (initialChapterRequested.current) return;
    let active = true;
    void input.bridge.planning
      .listStructure(input.projectId, { mode: 'replace' })
      .then((outcome) => {
        if (!active || outcome.state !== 'success' || initialChapterRequested.current) return;
        initialChapterRequested.current = true;
        const chapters = outcome.data.volumes.flatMap((volume) => volume.chapters);
        const requestedChapter = input.navigationChapterId
          ? chapters.find((candidate) => candidate.id === input.navigationChapterId)
          : undefined;
        const continuedChapter =
          input.initialContinuation?.status === 'ready'
            ? chapters.find((candidate) => candidate.id === input.initialContinuation?.chapterId)
            : undefined;
        const nextChapter = requestedChapter ?? continuedChapter ?? chapters[0];
        if (requestedChapter) handledNavigationKey.current = navigationKey(input);
        if (nextChapter) {
          if (input.initialContinuation?.status === 'stale')
            input.onStatus('上次写作位置已经变化，已安全回到首个可用章节。');
          void openChapter(nextChapter);
        }
      });
    return () => {
      active = false;
    };
  }, [input, openChapter]);

  useEffect(() => {
    if (!input.navigationChapterId || !initialChapterRequested.current) return;
    const key = navigationKey(input);
    if (handledNavigationKey.current === key) return;
    handledNavigationKey.current = key;
    if (input.activeChapter.current?.id === input.navigationChapterId) return;
    let active = true;
    void input.bridge.planning
      .listStructure(input.projectId, { mode: 'replace' })
      .then((outcome) => {
        if (!active || outcome.state !== 'success') return;
        const requested = outcome.data.volumes
          .flatMap((volume) => volume.chapters)
          .find((candidate) => candidate.id === input.navigationChapterId);
        if (!requested) {
          input.setStatus('目标章节已经变化，系统没有跳转到可能错误的位置。');
          return;
        }
        void openChapter(requested);
      });
    return () => {
      active = false;
    };
  }, [input, openChapter]);

  const reset = useCallback((): void => {
    sessionGeneration.current += 1;
    requestGeneration.current += 1;
    queuedChapter.current = null;
    transition({ type: 'idle', editorGeneration: input.editorGeneration.current });
  }, [input.editorGeneration, transition]);

  return { state, openChapter, reset };
}

function navigationKey(input: UseChapterSessionInput): string {
  return [
    input.panel,
    input.navigationChapterId ?? '',
    input.navigationLogicalBlockId ?? '',
    input.navigationVersionId ?? '',
  ].join(':');
}
