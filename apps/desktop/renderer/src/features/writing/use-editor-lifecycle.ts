import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';

import type { Chapter, DraftDocument, ProjectContinuationSnapshot } from '@worldforge/contracts';
import {
  DraftAutosaveCoordinator,
  Editor,
  createWorldforgeEditorExtensions,
  documentToTiptapJson,
} from '@worldforge/editor-core';

import { persistedEditorBlocks } from './draft-blocks.js';
import { restoreContinuationAnchor } from './continuation-anchor.js';
import {
  getPersistedEditorSelection,
  persistEditorSelection,
  persistEditorSelectionRange,
  restoreEditorSelection,
} from './editor-selection.js';
import { sanitizePastedHtml } from './paste-sanitizer.js';
import type { WritingPanel } from './writing-workbench-types.js';

interface UseEditorLifecycleInput {
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly panel: WritingPanel;
  readonly initialContinuation: ProjectContinuationSnapshot | null;
  readonly chapter: Chapter | null;
  readonly draft: DraftDocument | null;
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
  readonly clearStatistics: () => void;
  readonly refreshStatistics: () => void;
  readonly refreshLockState: () => void;
  readonly scheduleContinuationSave: () => void;
  readonly saveContinuation: () => Promise<boolean>;
  readonly persistDraft: () => Promise<boolean>;
  readonly setStatus: (message: string, failure?: boolean) => void;
  readonly savedStatus: (label: string, revision: number) => string;
  readonly temporaryClientBlockId: () => string;
}

export function useEditorLifecycle(input: UseEditorLifecycleInput) {
  const inputRef = useRef(input);
  inputRef.current = input;
  const destroyEditor = useCallback((clearSession = true): void => {
    const current = inputRef.current;
    const instance = current.editor.current;
    const currentChapter = current.activeChapter.current;
    if (instance && currentChapter) {
      persistEditorSelection(current.projectId, currentChapter.id, instance);
      void current.saveContinuation();
    }
    if (current.continuationTimer.current) clearTimeout(current.continuationTimer.current);
    current.continuationTimer.current = null;
    current.continuationScrollCleanup.current?.();
    current.continuationScrollCleanup.current = null;
    current.autosave.current?.destroy();
    current.autosave.current = null;
    current.editorGeneration.current += 1;
    instance?.destroy();
    current.editor.current = null;
    current.editorHost.current?.replaceChildren();
    current.clearStatistics();
    current.setSelectedLocked(null);
    current.setEditorReady(false);
    current.setIsComposing(false);
    current.composing.current = false;
    if (clearSession) {
      current.activeDraft.current = null;
      current.activeChapter.current = null;
      current.setDraft(null);
      current.setChapter(null);
    }
  }, []);

  const mountEditor = useCallback(
    (document: DraftDocument, nextChapter: Chapter): void => {
      const current = inputRef.current;
      destroyEditor(false);
      current.activeDraft.current = document;
      current.activeChapter.current = nextChapter;
      current.setDraft(document);
      current.setChapter(nextChapter);
      const host = current.editorHost.current;
      if (!host) {
        current.setStatus('当前稿已更新；返回正文后重建编辑器。');
        return;
      }
      const remembered = getPersistedEditorSelection(current.projectId, nextChapter.id);
      const instance = new Editor({
        element: host,
        extensions: createWorldforgeEditorExtensions(current.temporaryClientBlockId),
        content: documentToTiptapJson(persistedEditorBlocks(document)),
        editable: !current.readOnly,
        injectCSS: false,
        enableCoreExtensions: { keymap: false },
        editorProps: {
          attributes: {
            class: 'worldforge-editor',
            role: 'textbox',
            'aria-label': `${nextChapter.title}正文`,
            'data-draft-content': '',
          },
          transformPastedHTML: sanitizePastedHtml,
          transformPastedText: (text) => text.replaceAll('\r\n', '\n').replaceAll('\r', '\n'),
        },
        onUpdate: () => {
          current.refreshLockState();
          if (current.synchronizing.current) return;
          current.refreshStatistics();
          current.autosave.current?.markDirty();
          current.setStatus(
            current.composing.current ? '输入法组合中；自动保存与结构键已暂停。' : '等待自动保存…',
          );
        },
        onSelectionUpdate: ({ editor: currentEditor }) => {
          persistEditorSelectionRange(
            current.projectId,
            nextChapter.id,
            currentEditor.state.selection.from,
            currentEditor.state.selection.to,
          );
          current.refreshLockState();
          current.scheduleContinuationSave();
        },
      });
      current.editor.current = instance;
      current.autosave.current = new DraftAutosaveCoordinator({
        delayMs: 800,
        save: current.persistDraft,
        onState: (state) => {
          if (state === 'waiting') current.setStatus('等待自动保存…');
          else if (state === 'saving') current.setStatus('正在自动保存…');
          else if (state === 'saved')
            current.setStatus(
              current.savedStatus('自动保存完成', current.activeDraft.current?.revision ?? 0),
            );
          else if (state === 'failed') current.setStatus('自动保存失败；窗口内容仍保留。', true);
          else if (state === 'paused') current.setStatus('输入法组合中；自动保存已暂停。');
        },
      });
      if (remembered) {
        restoreEditorSelection(instance, remembered);
      } else if (
        current.initialContinuation?.status === 'ready' &&
        current.initialContinuation.chapterId === nextChapter.id
      ) {
        restoreContinuationAnchor(instance, current.initialContinuation);
      }
      const scrollContainer = host.closest<HTMLElement>('.react-main');
      if (scrollContainer) {
        const onScroll = (): void => current.scheduleContinuationSave();
        scrollContainer.addEventListener('scroll', onScroll, { passive: true });
        current.continuationScrollCleanup.current = () =>
          scrollContainer.removeEventListener('scroll', onScroll);
        if (
          current.initialContinuation?.status === 'ready' &&
          current.initialContinuation.chapterId === nextChapter.id
        ) {
          window.requestAnimationFrame(() => {
            scrollContainer.scrollTop = current.initialContinuation?.scrollTop ?? 0;
          });
        }
      }
      current.refreshStatistics();
      current.refreshLockState();
      current.setEditorReady(true);
      current.setStatus(
        current.readOnly ? '只读浏览：可以选择和复制，写入已禁用。' : '已从正文段落重建。',
      );
    },
    [destroyEditor],
  );

  useEffect(() => () => destroyEditor(), [destroyEditor]);
  useEffect(() => {
    if (input.panel !== 'editor' && input.editor.current) destroyEditor(false);
  }, [destroyEditor, input]);
  useEffect(() => {
    if (input.panel === 'editor' && input.chapter && input.draft && !input.editor.current)
      mountEditor(input.draft, input.chapter);
  }, [input, mountEditor]);

  return { destroyEditor, mountEditor };
}
