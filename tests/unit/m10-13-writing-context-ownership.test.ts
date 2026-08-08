import { describe, expect, it, vi } from 'vitest';

import type { Editor } from '@worldforge/editor-core';

import {
  INITIAL_CHAPTER_SESSION_STATE,
  chapterRequestIsCurrent,
  reduceChapterSession,
} from '../../apps/desktop/renderer/src/features/writing/chapter-session-state.js';
import { ContinuationPersistenceTracker } from '../../apps/desktop/renderer/src/features/writing/continuation-persistence.js';
import {
  createDraftSaveContext,
  draftSaveContextIsCurrent,
} from '../../apps/desktop/renderer/src/features/writing/draft-save-context.js';
import {
  reportFlushedDraft,
  reportPersistedDraft,
} from '../../apps/desktop/renderer/src/features/writing/draft-persistence-feedback.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

interface ContinuationFixture {
  readonly projectId: string;
  readonly chapterId: string;
  readonly draftId: string;
  readonly draftRevision: number;
  readonly panel: 'editor' | 'candidates';
}

function continuation(overrides: Partial<ContinuationFixture> = {}): ContinuationFixture {
  return {
    projectId: 'project-a',
    chapterId: 'chapter-a',
    draftId: 'draft-a',
    draftRevision: 1,
    panel: 'editor',
    ...overrides,
  };
}

describe('M10-13 Writing上下文所有权', () => {
  it('同项目的新章节或新Draft不会被误判为旧面板重试', () => {
    const tracker = new ContinuationPersistenceTracker<ContinuationFixture>();
    const old = continuation({ panel: 'candidates' });
    tracker.noteIntent(old);
    tracker.commit(old);

    expect(
      tracker.isCommitted(
        continuation({ chapterId: 'chapter-b', draftId: 'draft-b', panel: 'editor' }),
      ),
    ).toBe(false);
    expect(tracker.isCommitted(continuation({ draftId: 'draft-c', panel: 'editor' }))).toBe(false);
  });

  it('旧上下文不触发续写保存，也不写成功或失败状态', async () => {
    const setStatus = vi.fn();
    const saveContinuation = vi.fn(async () => false);
    await expect(
      reportPersistedDraft({
        revision: 2,
        editorChanged: false,
        saveContinuation,
        canCommit: () => false,
        setStatus,
        savedStatus: (label, revision) => `${label}:${revision}`,
      }),
    ).resolves.toBe(true);
    expect(saveContinuation).not.toHaveBeenCalled();
    expect(setStatus).not.toHaveBeenCalled();
  });

  it('旧上下文flush失败也不覆盖新页面状态', async () => {
    const setStatus = vi.fn();
    const saveContinuation = vi.fn();
    await expect(
      reportFlushedDraft({
        draftSaved: false,
        revision: 2,
        saveContinuation,
        canCommit: () => false,
        setStatus,
        savedStatus: (label, revision) => `${label}:${revision}`,
      }),
    ).resolves.toBe(true);
    expect(saveContinuation).not.toHaveBeenCalled();
    expect(setStatus).not.toHaveBeenCalled();
  });

  it('旧上下文flush成功也不触发新上下文续写保存', async () => {
    const setStatus = vi.fn();
    const saveContinuation = vi.fn(async () => true);
    await expect(
      reportFlushedDraft({
        draftSaved: true,
        revision: 2,
        saveContinuation,
        canCommit: () => false,
        setStatus,
        savedStatus: (label, revision) => `${label}:${revision}`,
      }),
    ).resolves.toBe(true);
    expect(saveContinuation).not.toHaveBeenCalled();
    expect(setStatus).not.toHaveBeenCalled();
  });

  it('Autosave上下文只在章节、Draft、Editor与generation全部相同时有效', () => {
    const editor = contractInput<Editor>({});
    const context = createDraftSaveContext({
      projectId: 'project-a',
      chapterId: 'chapter-a',
      draftId: 'draft-a',
      baseRevision: 1,
      editor,
      editorGeneration: 3,
      documentFingerprint: '{}',
      requestSnapshot: [],
      requestedAt: 1,
    });
    const current = {
      chapterId: 'chapter-a',
      draftId: 'draft-a',
      editor,
      editorGeneration: 3,
    };

    expect(draftSaveContextIsCurrent(context, current)).toBe(true);
    expect(draftSaveContextIsCurrent(context, { ...current, draftId: 'draft-b' })).toBe(false);
    expect(draftSaveContextIsCurrent(context, { ...current, editorGeneration: 4 })).toBe(false);
  });

  it('章节请求只在当前loading目标与generation匹配时可提交', () => {
    const loading = reduceChapterSession(INITIAL_CHAPTER_SESSION_STATE, {
      type: 'load',
      chapterId: 'chapter-a',
      requestGeneration: 7,
    });
    expect(chapterRequestIsCurrent(loading, 'chapter-a', 7)).toBe(true);
    expect(chapterRequestIsCurrent(loading, 'chapter-b', 7)).toBe(false);
    expect(chapterRequestIsCurrent(loading, 'chapter-a', 8)).toBe(false);
    expect(
      chapterRequestIsCurrent(
        reduceChapterSession(loading, { type: 'idle', editorGeneration: 2 }),
        'chapter-a',
        7,
      ),
    ).toBe(false);
  });
});
