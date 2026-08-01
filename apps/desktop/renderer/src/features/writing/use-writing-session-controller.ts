import {
  useCallback,
  useMemo,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';

import type { Chapter, DraftDocument, ProjectContinuationSnapshot } from '@worldforge/contracts';
import type { DraftAutosaveCoordinator, Editor } from '@worldforge/editor-core';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import type { AppDisclosureMode } from '../../shell/app-shell-model.js';
import { useChapterSession } from './use-chapter-session.js';
import { useDraftAutosave } from './use-draft-autosave.js';
import { useEditorLifecycle } from './use-editor-lifecycle.js';
import { useWritingEditorTools } from './use-writing-editor-tools.js';
import type { WritingPanel } from './writing-workbench-types.js';

interface UseWritingSessionControllerInput {
  readonly bridge: RendererBridgeAdapter;
  readonly disclosureMode: AppDisclosureMode;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly panel: WritingPanel;
  readonly initialContinuation: ProjectContinuationSnapshot | null;
  readonly navigationChapterId: string | null | undefined;
  readonly navigationLogicalBlockId: string | null | undefined;
  readonly navigationVersionId: string | null | undefined;
  readonly onStatus: (message: string) => void;
  readonly chapter: Chapter | null;
  readonly draft: DraftDocument | null;
  readonly isComposing: boolean;
  readonly findText: string;
  readonly replaceText: string;
  readonly findIndex: number;
  readonly editorHost: MutableRefObject<HTMLDivElement | null>;
  readonly editor: MutableRefObject<Editor | null>;
  readonly autosave: MutableRefObject<DraftAutosaveCoordinator | null>;
  readonly activeDraft: MutableRefObject<DraftDocument | null>;
  readonly activeChapter: MutableRefObject<Chapter | null>;
  readonly editorGeneration: MutableRefObject<number>;
  readonly composing: MutableRefObject<boolean>;
  readonly synchronizing: MutableRefObject<boolean>;
  readonly continuationTimer: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  readonly continuationScrollCleanup: MutableRefObject<(() => void) | null>;
  readonly setDraft: Dispatch<SetStateAction<DraftDocument | null>>;
  readonly setChapter: Dispatch<SetStateAction<Chapter | null>>;
  readonly setSelectedLocked: Dispatch<SetStateAction<boolean | null>>;
  readonly setEditorReady: Dispatch<SetStateAction<boolean>>;
  readonly setIsComposing: Dispatch<SetStateAction<boolean>>;
  readonly setFindCount: Dispatch<SetStateAction<number>>;
  readonly setFindIndex: Dispatch<SetStateAction<number>>;
  readonly setFocusMode: Dispatch<SetStateAction<boolean>>;
  readonly clearStatistics: () => void;
  readonly refreshStatistics: () => void;
  readonly refreshLockState: () => void;
  readonly saveContinuation: () => Promise<boolean>;
  readonly scheduleContinuationSave: () => void;
  readonly setStatus: (message: string, failure?: boolean) => void;
}

export function useWritingSessionController(input: UseWritingSessionControllerInput) {
  const formatSavedStatus = useCallback(
    (label: string, revision: number) =>
      input.disclosureMode === 'beginner' ? label : `${label} · 保存序号 ${revision}`,
    [input.disclosureMode],
  );
  const draftAutosaveInput = useMemo(
    () => ({
      bridge: input.bridge,
      projectId: input.projectId,
      readOnly: input.readOnly,
      editor: input.editor,
      autosave: input.autosave,
      activeDraft: input.activeDraft,
      activeChapter: input.activeChapter,
      composing: input.composing,
      synchronizing: input.synchronizing,
      editorGeneration: input.editorGeneration,
      setDraft: input.setDraft,
      refreshStatistics: input.refreshStatistics,
      saveContinuation: input.saveContinuation,
      setStatus: input.setStatus,
      savedStatus: formatSavedStatus,
      temporaryClientBlockId,
    }),
    [input, formatSavedStatus],
  );
  const { persistDraft, flush } = useDraftAutosave(draftAutosaveInput);

  const editorTools = useWritingEditorTools(
    useMemo(
      () => ({
        projectId: input.projectId,
        readOnly: input.readOnly,
        draft: input.draft,
        editor: input.editor,
        activeChapter: input.activeChapter,
        activeDraft: input.activeDraft,
        composing: input.composing,
        findText: input.findText,
        replaceText: input.replaceText,
        findIndex: input.findIndex,
        setFindCount: input.setFindCount,
        setFindIndex: input.setFindIndex,
        setFocusMode: input.setFocusMode,
        refreshLockState: input.refreshLockState,
        setStatus: input.setStatus,
        flush,
        savedStatus: formatSavedStatus,
        temporaryClientBlockId,
      }),
      [input, flush, formatSavedStatus],
    ),
  );

  const { destroyEditor, mountEditor } = useEditorLifecycle(
    useMemo(
      () => ({
        projectId: input.projectId,
        readOnly: input.readOnly,
        panel: input.panel,
        initialContinuation: input.initialContinuation,
        chapter: input.chapter,
        draft: input.draft,
        editorHost: input.editorHost,
        editor: input.editor,
        autosave: input.autosave,
        activeDraft: input.activeDraft,
        activeChapter: input.activeChapter,
        editorGeneration: input.editorGeneration,
        composing: input.composing,
        synchronizing: input.synchronizing,
        continuationTimer: input.continuationTimer,
        continuationScrollCleanup: input.continuationScrollCleanup,
        setDraft: input.setDraft,
        setChapter: input.setChapter,
        setSelectedLocked: input.setSelectedLocked,
        setEditorReady: input.setEditorReady,
        setIsComposing: input.setIsComposing,
        clearStatistics: input.clearStatistics,
        refreshStatistics: input.refreshStatistics,
        refreshLockState: input.refreshLockState,
        scheduleContinuationSave: input.scheduleContinuationSave,
        saveContinuation: input.saveContinuation,
        persistDraft,
        setStatus: input.setStatus,
        savedStatus: formatSavedStatus,
        temporaryClientBlockId,
      }),
      [input, persistDraft, formatSavedStatus],
    ),
  );

  const chapterSession = useChapterSession(
    useMemo(
      () => ({
        bridge: input.bridge,
        projectId: input.projectId,
        readOnly: input.readOnly,
        panel: input.panel,
        initialContinuation: input.initialContinuation,
        navigationChapterId: input.navigationChapterId,
        navigationLogicalBlockId: input.navigationLogicalBlockId,
        navigationVersionId: input.navigationVersionId,
        editor: input.editor,
        activeChapter: input.activeChapter,
        activeDraft: input.activeDraft,
        editorGeneration: input.editorGeneration,
        flush,
        mountEditor,
        onStatus: input.onStatus,
        setStatus: input.setStatus,
      }),
      [input, flush, mountEditor],
    ),
  );

  const replaceDraft = useCallback(
    (next: DraftDocument, message: string): void => {
      const currentChapter = input.activeChapter.current;
      if (!currentChapter) return;
      mountEditor(next, currentChapter);
      input.setStatus(message);
    },
    [input, mountEditor],
  );
  const backToProject = useCallback(async (): Promise<void> => {
    if (!(await flush())) {
      input.setStatus('自动保存失败，已阻止返回项目。', true);
      return;
    }
    destroyEditor();
    chapterSession.reset();
    input.setStatus('已返回项目结构；选择章节可继续写作。');
  }, [chapterSession, destroyEditor, flush, input]);

  return {
    flush,
    editorTools,
    chapterSession,
    replaceDraft,
    backToProject,
    editorUnavailable: !input.draft || input.readOnly || input.isComposing,
  };
}

function temporaryClientBlockId(): string {
  return `temporary-${globalThis.crypto.randomUUID()}`;
}
