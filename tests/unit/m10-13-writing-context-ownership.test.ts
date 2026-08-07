import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { ContinuationPersistenceTracker } from '../../apps/desktop/renderer/src/features/writing/continuation-persistence.js';
import {
  reportFlushedDraft,
  reportPersistedDraft,
} from '../../apps/desktop/renderer/src/features/writing/draft-persistence-feedback.js';

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

const continuationSource = readFileSync(
  'apps/desktop/renderer/src/features/writing/use-writing-continuation.ts',
  'utf8',
);
const autosaveSource = readFileSync(
  'apps/desktop/renderer/src/features/writing/use-draft-autosave.ts',
  'utf8',
);
const chapterSessionSource = readFileSync(
  'apps/desktop/renderer/src/features/writing/use-chapter-session.ts',
  'utf8',
);
const pagesSource = readFileSync('apps/desktop/renderer/src/app/app-shell-pages.tsx', 'utf8');

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

  it('续写位置只在项目章节Draft和revision仍匹配时提交Tracker', () => {
    expect(continuationSource).toContain('function continuationIsCurrent');
    const commitIndex = continuationSource.indexOf('persistence.commit(continuation)');
    const guardIndex = continuationSource.lastIndexOf(
      'if (!continuationIsCurrent(input, continuation)) return true;',
      commitIndex,
    );
    expect(guardIndex).toBeGreaterThan(-1);
    expect(commitIndex).toBeGreaterThan(guardIndex);
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

  it('Autosave在成功、失败和异常反馈前复核Draft上下文与revision', () => {
    expect(autosaveSource).toContain('if (!saveContextIsCurrent(saveContext)) return true;');
    expect(autosaveSource).toContain(
      'if (saveContext && !saveContextIsCurrent(saveContext)) return true;',
    );
    expect(autosaveSource).toContain('input.activeDraft.current?.revision === persistedRevision');
    expect(autosaveSource).toContain('input.activeDraft.current?.revision === flushedRevision');
  });

  it('章节会话在卸载和重置时失效flush与正文读取', () => {
    expect(chapterSessionSource).toContain('const sessionGeneration = useRef(0);');
    expect(chapterSessionSource).toContain('sessionGeneration.current += 1;');
    expect(chapterSessionSource).toContain('if (!isCurrentSession()) return;');
    const mountIndex = chapterSessionSource.indexOf(
      'input.mountEditor(outcome.data, nextChapter);',
    );
    const guardIndex = chapterSessionSource.lastIndexOf(
      'if (!isCurrentSession()) return;',
      mountIndex,
    );
    expect(guardIndex).toBeGreaterThan(-1);
    expect(mountIndex).toBeGreaterThan(guardIndex);
  });

  it('不同项目使用独立WritingWorkbench生命周期', () => {
    expect(pagesSource).toContain('key={props.activeProject.projectId}');
  });
});
