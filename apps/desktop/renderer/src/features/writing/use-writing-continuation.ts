import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';

import type { Chapter, DraftDocument, ProjectContinuationInput } from '@worldforge/contracts';
import type { Editor } from '@worldforge/editor-core';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { captureContinuationAnchor } from './continuation-anchor.js';
import {
  ContinuationPersistenceTracker,
  derivePanelSwitchInput,
} from './continuation-persistence.js';
import type { WritingPanel } from './writing-workbench-types.js';

interface UseWritingContinuationInput {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly panel: WritingPanel;
  readonly editorHost: MutableRefObject<HTMLDivElement | null>;
  readonly editor: MutableRefObject<Editor | null>;
  readonly activeDraft: MutableRefObject<DraftDocument | null>;
  readonly activeChapter: MutableRefObject<Chapter | null>;
}

function continuationIsCurrent(
  input: UseWritingContinuationInput,
  continuation: ProjectContinuationInput,
): boolean {
  const draft = input.activeDraft.current;
  return (
    input.projectId === continuation.projectId &&
    input.activeChapter.current?.id === continuation.chapterId &&
    draft?.draftId === continuation.draftId &&
    draft.revision === continuation.draftRevision
  );
}

export function useWritingContinuation(input: UseWritingContinuationInput) {
  const continuationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const continuationScrollCleanup = useRef<(() => void) | null>(null);
  const [persistence] = useState(
    () => new ContinuationPersistenceTracker<ProjectContinuationInput>(),
  );

  const saveContinuation = useCallback(async (): Promise<boolean> => {
    const instance = input.editor.current;
    const currentDraft = input.activeDraft.current;
    const currentChapter = input.activeChapter.current;
    if (!instance || !currentDraft || !currentChapter || input.readOnly) return true;
    const anchor = captureContinuationAnchor(instance);
    if (!anchor) return true;
    const scrollContainer = input.editorHost.current?.closest<HTMLElement>('.react-main');
    const continuation: ProjectContinuationInput = {
      projectId: input.projectId,
      chapterId: currentChapter.id,
      draftId: currentDraft.draftId,
      draftRevision: currentDraft.revision,
      ...anchor,
      scrollTop: Math.max(0, Math.round(scrollContainer?.scrollTop ?? 0)),
      panel: input.panel,
    };
    if (persistence.isCommitted(continuation)) return true;
    const outcome = await input.bridge.project.saveContinuation(continuation, {
      mode: 'replace',
    });
    if (!continuationIsCurrent(input, continuation)) return true;
    if (outcome.state !== 'success') return false;
    persistence.commit(continuation);
    return true;
  }, [input, persistence]);

  const scheduleContinuationSave = useCallback((): void => {
    if (input.readOnly) return;
    if (continuationTimer.current) clearTimeout(continuationTimer.current);
    continuationTimer.current = setTimeout(() => {
      continuationTimer.current = null;
      void saveContinuation();
    }, 500);
  }, [input.readOnly, saveContinuation]);

  useEffect(() => {
    if (input.readOnly) return;
    let active = true;
    const committed = persistence.committedInput();
    if (!committed || !continuationIsCurrent(input, committed)) return;
    const next = derivePanelSwitchInput(committed, input.panel);
    if (!next) return;
    void input.bridge.project.saveContinuation(next, { mode: 'replace' }).then((outcome) => {
      if (!active || !continuationIsCurrent(input, next)) return;
      if (outcome.state === 'success') {
        persistence.commit(next);
        return;
      }
      if (outcome.state === 'failure') scheduleContinuationSave();
    });
    return () => {
      active = false;
    };
  }, [input, persistence, scheduleContinuationSave]);

  return {
    continuationTimer,
    continuationScrollCleanup,
    saveContinuation,
    scheduleContinuationSave,
  };
}
