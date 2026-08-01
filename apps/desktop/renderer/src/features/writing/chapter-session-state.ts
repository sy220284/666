export type ChapterSessionPhase =
  'idle' | 'loading' | 'ready' | 'flushing' | 'switching' | 'failed';

export interface ChapterSessionState {
  readonly phase: ChapterSessionPhase;
  readonly activeChapterId: string | null;
  readonly activeDraftId: string | null;
  readonly requestedChapterId: string | null;
  readonly requestGeneration: number;
  readonly editorGeneration: number;
  readonly failure: string | null;
}

export type ChapterSessionAction =
  | { readonly type: 'flush' }
  | { readonly type: 'load'; readonly chapterId: string; readonly requestGeneration: number }
  | { readonly type: 'switch' }
  | {
      readonly type: 'ready';
      readonly chapterId: string;
      readonly draftId: string;
      readonly editorGeneration: number;
    }
  | { readonly type: 'fail'; readonly message: string }
  | { readonly type: 'idle'; readonly editorGeneration: number };

export const INITIAL_CHAPTER_SESSION_STATE: ChapterSessionState = Object.freeze({
  phase: 'idle',
  activeChapterId: null,
  activeDraftId: null,
  requestedChapterId: null,
  requestGeneration: 0,
  editorGeneration: 0,
  failure: null,
});

export function reduceChapterSession(
  state: ChapterSessionState,
  action: ChapterSessionAction,
): ChapterSessionState {
  switch (action.type) {
    case 'flush':
      return { ...state, phase: 'flushing', failure: null };
    case 'load':
      return {
        ...state,
        phase: 'loading',
        requestedChapterId: action.chapterId,
        requestGeneration: action.requestGeneration,
        failure: null,
      };
    case 'switch':
      return { ...state, phase: 'switching', failure: null };
    case 'ready':
      return {
        phase: 'ready',
        activeChapterId: action.chapterId,
        activeDraftId: action.draftId,
        requestedChapterId: null,
        requestGeneration: state.requestGeneration,
        editorGeneration: action.editorGeneration,
        failure: null,
      };
    case 'fail':
      return { ...state, phase: 'failed', requestedChapterId: null, failure: action.message };
    case 'idle':
      return {
        ...INITIAL_CHAPTER_SESSION_STATE,
        requestGeneration: state.requestGeneration,
        editorGeneration: action.editorGeneration,
      };
  }
}

export function chapterRequestIsCurrent(
  state: ChapterSessionState,
  chapterId: string,
  requestGeneration: number,
): boolean {
  return (
    state.phase === 'loading' &&
    state.requestedChapterId === chapterId &&
    state.requestGeneration === requestGeneration
  );
}
