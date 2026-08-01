import { useCallback, useEffect, useState, type MutableRefObject } from 'react';

import type { WritingPanel } from './writing-workbench-types.js';

interface UseWritingStatusInput {
  readonly panel: WritingPanel;
  readonly editorReady: boolean;
  readonly editorHost: MutableRefObject<HTMLDivElement | null>;
  readonly navigationLogicalBlockId: string | null | undefined;
  readonly navigationQuery: string | null | undefined;
  readonly statusNotice: string | null | undefined;
  readonly onStatusNoticeConsumed: (() => void) | undefined;
  readonly setFindText: (value: string) => void;
}

export function useWritingStatus(input: UseWritingStatusInput) {
  const [editorState, setEditorState] = useState('从左侧卷章目录选择章节。');
  const [editorFailure, setEditorFailure] = useState(false);

  const setStatus = useCallback((message: string, failure = false): void => {
    setEditorState(message);
    setEditorFailure(failure);
  }, []);

  useEffect(() => {
    if (!input.statusNotice || input.panel !== 'editor' || !input.editorReady) return;
    setStatus(input.statusNotice);
    input.onStatusNoticeConsumed?.();
  }, [input, setStatus]);

  useEffect(() => {
    if (input.panel !== 'editor' || !input.editorReady || !input.navigationLogicalBlockId) return;
    const target = Array.from(
      input.editorHost.current?.querySelectorAll<HTMLElement>('[data-logical-block-id]') ?? [],
    ).find((element) => element.dataset.logicalBlockId === input.navigationLogicalBlockId);
    if (!target) {
      setStatus('目标段落已经变化，系统没有跳转到可能错误的位置。请在当前章节重新搜索。');
      return;
    }
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target.dataset.navigationHighlight = 'true';
    if (input.navigationQuery) input.setFindText(input.navigationQuery);
    const timer = window.setTimeout(() => {
      delete target.dataset.navigationHighlight;
    }, 2_400);
    return () => window.clearTimeout(timer);
  }, [input, setStatus]);

  return { editorState, editorFailure, setStatus };
}
