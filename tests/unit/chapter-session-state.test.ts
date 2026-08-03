import { describe, expect, it } from 'vitest';

import {
  INITIAL_CHAPTER_SESSION_STATE,
  chapterOpenIsTemporarilyBlocked,
  chapterOpenRequiresFlush,
  chapterRequestIsCurrent,
  reduceChapterSession,
  type ChapterSessionPhase,
} from '../../apps/desktop/renderer/src/features/writing/chapter-session-state.js';

describe('Writing章节会话状态机', () => {
  it('按idle到loading、ready、flushing、switching推进', () => {
    const loading = reduceChapterSession(INITIAL_CHAPTER_SESSION_STATE, {
      type: 'load',
      chapterId: 'chapter-a',
      requestGeneration: 1,
    });
    expect(chapterRequestIsCurrent(loading, 'chapter-a', 1)).toBe(true);
    const ready = reduceChapterSession(loading, {
      type: 'ready',
      chapterId: 'chapter-a',
      draftId: 'draft-a',
      editorGeneration: 2,
    });
    expect(reduceChapterSession(ready, { type: 'flush' }).phase).toBe('flushing');
    expect(reduceChapterSession(ready, { type: 'switch' }).phase).toBe('switching');
  });

  it('拒绝旧请求代次并保留失败前的权威章节', () => {
    const loading = reduceChapterSession(
      {
        ...INITIAL_CHAPTER_SESSION_STATE,
        phase: 'ready',
        activeChapterId: 'chapter-a',
        activeDraftId: 'draft-a',
      },
      { type: 'load', chapterId: 'chapter-c', requestGeneration: 3 },
    );
    expect(chapterRequestIsCurrent(loading, 'chapter-b', 2)).toBe(false);
    expect(reduceChapterSession(loading, { type: 'fail', message: '读取失败' })).toMatchObject({
      phase: 'failed',
      activeChapterId: 'chapter-a',
      activeDraftId: 'draft-a',
      failure: '读取失败',
    });
  });

  it('保存和挂载阶段阻止重复切换，加载阶段允许最新请求替代且不重复保存', () => {
    const state = (phase: ChapterSessionPhase) => ({ ...INITIAL_CHAPTER_SESSION_STATE, phase });
    expect(chapterOpenIsTemporarilyBlocked(state('flushing'))).toBe(true);
    expect(chapterOpenIsTemporarilyBlocked(state('switching'))).toBe(true);
    expect(chapterOpenIsTemporarilyBlocked(state('loading'))).toBe(false);
    expect(chapterOpenIsTemporarilyBlocked(state('ready'))).toBe(false);
    expect(chapterOpenRequiresFlush(state('loading'))).toBe(false);
    for (const phase of ['idle', 'ready', 'flushing', 'switching', 'failed'] as const) {
      expect(chapterOpenRequiresFlush(state(phase))).toBe(true);
    }
  });
});
