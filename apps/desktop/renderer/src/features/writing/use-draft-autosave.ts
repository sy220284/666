import {
  useCallback,
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';

import type { Chapter, DraftDocument } from '@worldforge/contracts';
import {
  assertEditorNodeMetadata,
  buildDraftPatchOperations,
  synchronizePersistedBlockMetadata,
  tiptapJsonToDraftSnapshot,
  type DraftAutosaveCoordinator,
  type Editor,
} from '@worldforge/editor-core';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import { registerDraftFlushHandler } from '../../runtime/draft-flush-registry.js';
import { persistedEditorBlocks } from './draft-blocks.js';
import { createDraftSaveContext, draftSaveContextIsCurrent } from './draft-save-context.js';

interface UseDraftAutosaveInput {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly editor: MutableRefObject<Editor | null>;
  readonly autosave: MutableRefObject<DraftAutosaveCoordinator | null>;
  readonly activeDraft: MutableRefObject<DraftDocument | null>;
  readonly activeChapter: MutableRefObject<Chapter | null>;
  readonly composing: MutableRefObject<boolean>;
  readonly synchronizing: MutableRefObject<boolean>;
  readonly editorGeneration: MutableRefObject<number>;
  readonly setDraft: Dispatch<SetStateAction<DraftDocument | null>>;
  readonly refreshStatistics: () => void;
  readonly saveContinuation: () => Promise<boolean>;
  readonly setStatus: (message: string, failure?: boolean) => void;
  readonly savedStatus: (label: string, revision: number) => string;
  readonly temporaryClientBlockId: () => string;
}

interface PersistedDraftFeedbackInput {
  readonly revision: number;
  readonly editorChanged: boolean;
  readonly saveContinuation: () => Promise<boolean>;
  readonly setStatus: (message: string, failure?: boolean) => void;
  readonly savedStatus: (label: string, revision: number) => string;
}

export async function reportPersistedDraft(input: PersistedDraftFeedbackInput): Promise<boolean> {
  const continuationSaved = await input.saveContinuation();
  const base = input.savedStatus('已保存', input.revision);
  const changed = input.editorChanged ? ' · 编辑器仍有新输入' : '';
  input.setStatus(
    continuationSaved ? `${base}${changed}` : `${base}${changed} · 续写位置待重试`,
    !continuationSaved,
  );
  return continuationSaved;
}

export function useDraftAutosave(input: UseDraftAutosaveInput) {
  const persistDraft = useCallback(async (): Promise<boolean> => {
    const instance = input.editor.current;
    const currentDraft = input.activeDraft.current;
    const currentChapter = input.activeChapter.current;
    if (!instance || !currentDraft || !currentChapter || input.readOnly) return true;
    if (input.composing.current || instance.view.composing) return false;
    try {
      const json = instance.getJSON();
      const signature = JSON.stringify(json);
      assertEditorNodeMetadata(json);
      const nextBlocks = tiptapJsonToDraftSnapshot(json, input.temporaryClientBlockId);
      const saveContext = createDraftSaveContext({
        projectId: input.projectId,
        chapterId: currentChapter.id,
        draftId: currentDraft.draftId,
        baseRevision: currentDraft.revision,
        editor: instance,
        editorGeneration: input.editorGeneration.current,
        documentFingerprint: signature,
        requestSnapshot: nextBlocks,
      });
      const operations = buildDraftPatchOperations(persistedEditorBlocks(currentDraft), nextBlocks);
      if (operations.length === 0) return true;
      const result = await input.bridge.draft.applyPatch({
        projectId: saveContext.projectId,
        chapterId: saveContext.chapterId,
        draftId: saveContext.draftId,
        baseRevision: saveContext.baseRevision,
        operations,
      });
      if (result.state !== 'success') {
        input.setStatus(
          result.state === 'failure'
            ? authorErrorSummary(result.error)
            : '保存请求已取消；当前窗口内容仍保留。',
          true,
        );
        return false;
      }
      if (
        !draftSaveContextIsCurrent(saveContext, {
          chapterId: input.activeChapter.current?.id ?? null,
          draftId: input.activeDraft.current?.draftId ?? null,
          editor: input.editor.current,
          editorGeneration: input.editorGeneration.current,
        })
      ) {
        return true;
      }
      input.activeDraft.current = result.data;
      input.setDraft(result.data);
      input.synchronizing.current = true;
      synchronizePersistedBlockMetadata(
        instance,
        persistedEditorBlocks(result.data),
        saveContext.requestSnapshot,
      );
      input.synchronizing.current = false;
      input.refreshStatistics();
      return reportPersistedDraft({
        revision: result.data.revision,
        editorChanged: JSON.stringify(instance.getJSON()) !== saveContext.documentFingerprint,
        saveContinuation: input.saveContinuation,
        setStatus: input.setStatus,
        savedStatus: input.savedStatus,
      });
    } catch {
      input.synchronizing.current = false;
      return false;
    }
  }, [input]);

  const flush = useCallback(async (): Promise<boolean> => {
    const draftSaved = await (input.autosave.current?.flush() ?? Promise.resolve(true));
    const continuationSaved = await input.saveContinuation();
    input.setStatus(
      !draftSaved
        ? '正文保存失败；窗口内容仍保留。'
        : continuationSaved
          ? input.savedStatus('已保存', input.activeDraft.current?.revision ?? 0)
          : `${input.savedStatus('正文已保存', input.activeDraft.current?.revision ?? 0)} · 续写位置待重试`,
      !draftSaved || !continuationSaved,
    );
    return draftSaved && continuationSaved;
  }, [input]);

  useEffect(() => registerDraftFlushHandler(flush), [flush]);

  return { persistDraft, flush };
}
