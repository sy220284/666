import { useCallback, useState, type MutableRefObject } from 'react';

import type { Chapter } from '@worldforge/contracts';
import {
  calculateWritingStatistics,
  selectedWorldforgeBlockLocked,
  type Editor,
} from '@worldforge/editor-core';

export interface WritingStatistics {
  readonly characterCount: number;
  readonly textCount: number;
  readonly paragraphCount: number;
  readonly progressPercent: number | null;
}

const EMPTY_STATISTICS: WritingStatistics = {
  characterCount: 0,
  textCount: 0,
  paragraphCount: 0,
  progressPercent: null,
};

export function useWritingMetrics(
  editor: MutableRefObject<Editor | null>,
  activeChapter: MutableRefObject<Chapter | null>,
) {
  const [statistics, setStatistics] = useState<WritingStatistics>(EMPTY_STATISTICS);
  const [selectedLocked, setSelectedLocked] = useState<boolean | null>(null);

  const refreshStatistics = useCallback((): void => {
    const instance = editor.current;
    if (!instance) {
      setStatistics(EMPTY_STATISTICS);
      return;
    }
    setStatistics(
      calculateWritingStatistics(
        instance.getText({ blockSeparator: '\n' }),
        instance.state.doc.childCount,
        activeChapter.current?.targetWordMax,
      ),
    );
  }, [activeChapter, editor]);
  const clearStatistics = useCallback(() => setStatistics(EMPTY_STATISTICS), []);
  const refreshLockState = useCallback((): void => {
    setSelectedLocked(editor.current ? selectedWorldforgeBlockLocked(editor.current) : null);
  }, [editor]);

  return {
    statistics,
    selectedLocked,
    setSelectedLocked,
    refreshStatistics,
    clearStatistics,
    refreshLockState,
  };
}
