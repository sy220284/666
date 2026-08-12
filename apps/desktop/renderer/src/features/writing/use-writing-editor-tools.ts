import {
  useCallback,
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';

import type { Chapter, DraftDocument } from '@worldforge/contracts';
import {
  findTextRanges,
  selectedWorldforgeBlockLocked,
  toggleWorldforgeEditorBlockLock,
  type Editor,
} from '@worldforge/editor-core';

import {
  getPersistedEditorSelection,
  persistEditorSelection,
  restoreEditorSelection,
} from './editor-selection.js';

interface UseWritingEditorToolsInput {
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly draft: DraftDocument | null;
  readonly editor: MutableRefObject<Editor | null>;
  readonly activeChapter: MutableRefObject<Chapter | null>;
  readonly activeDraft: MutableRefObject<DraftDocument | null>;
  readonly composing: MutableRefObject<boolean>;
  readonly findText: string;
  readonly replaceText: string;
  readonly findIndex: number;
  readonly setFindCount: Dispatch<SetStateAction<number>>;
  readonly setFindIndex: Dispatch<SetStateAction<number>>;
  readonly setFocusMode: Dispatch<SetStateAction<boolean>>;
  readonly refreshLockState: () => void;
  readonly setStatus: (message: string, failure?: boolean) => void;
  readonly flush: () => Promise<boolean>;
  readonly savedStatus: (label: string, revision: number) => string;
  readonly temporaryClientBlockId: () => string;
}

export function useWritingEditorTools(input: UseWritingEditorToolsInput) {
  const rememberCurrentSelection = useCallback((): void => {
    const instance = input.editor.current;
    const currentChapter = input.activeChapter.current;
    if (!instance || !currentChapter) return;
    persistEditorSelection(input.projectId, currentChapter.id, instance);
  }, [input]);

  const toggleFocusMode = useCallback((): void => {
    input.setFocusMode((enabled) => !enabled);
    window.requestAnimationFrame(() => {
      const instance = input.editor.current;
      const currentChapter = input.activeChapter.current;
      if (!instance || !currentChapter) return;
      const remembered = getPersistedEditorSelection(input.projectId, currentChapter.id);
      if (remembered) restoreEditorSelection(instance, remembered);
    });
  }, [input]);

  const matches = useCallback(() => {
    const instance = input.editor.current;
    const result: Array<{ readonly from: number; readonly to: number }> = [];
    if (!instance || !input.findText) return result;
    instance.state.doc.descendants((node, position) => {
      if (!node.isText || !node.text) return;
      for (const range of findTextRanges(node.text, input.findText))
        result.push({ from: position + range.from, to: position + range.to });
    });
    return result;
  }, [input]);

  useEffect(() => {
    const next = matches();
    input.setFindCount(next.length);
    input.setFindIndex((current) => (next.length === 0 ? 0 : Math.min(current, next.length - 1)));
  }, [input, matches]);

  const selectMatch = useCallback(
    (direction: 1 | -1): void => {
      const instance = input.editor.current;
      const values = matches();
      if (!instance || values.length === 0) return;
      const next = (input.findIndex + direction + values.length) % values.length;
      input.setFindIndex(next);
      instance.commands.setTextSelection(values[next]!);
      instance.commands.focus();
    },
    [input, matches],
  );

  const replaceMatches = useCallback(
    (all: boolean): void => {
      const instance = input.editor.current;
      const values = matches();
      if (!instance || input.readOnly || input.composing.current || values.length === 0) return;
      const selected = all ? values : [values[input.findIndex] ?? values[0]!];
      const editable = selected.filter((match) => {
        const position = instance.state.doc.resolve(match.from);
        return position.depth < 1 || position.node(1).attrs.locked !== true;
      });
      const skipped = selected.length - editable.length;
      if (editable.length === 0) {
        input.setStatus('匹配内容位于锁定段落，未执行替换。');
        return;
      }
      let transaction = instance.state.tr;
      for (const match of [...editable].reverse())
        transaction = transaction.insertText(input.replaceText, match.from, match.to);
      instance.view.dispatch(transaction);
      input.setFindIndex(0);
      input.setStatus(
        skipped > 0
          ? `已替换 ${editable.length} 处，跳过 ${skipped} 处锁定内容。`
          : `已替换 ${editable.length} 处。`,
      );
    },
    [input, matches],
  );

  const setBlockType = useCallback(
    (type: 'paragraph' | 'dialogue' | 'heading'): void => {
      const instance = input.editor.current;
      if (!instance || input.composing.current || input.readOnly) return;
      const current = instance.state.selection.$from.parent;
      const preserved = {
        logicalBlockId: current.attrs.logicalBlockId,
        clientBlockId: current.attrs.clientBlockId,
        source: current.attrs.source,
        locked: current.attrs.locked,
        contentHash: current.attrs.contentHash,
      };
      instance
        .chain()
        .focus()
        .setNode(type, type === 'heading' ? { ...preserved, headingLevel: 2 } : preserved)
        .run();
    },
    [input],
  );

  const insertSeparator = useCallback((): void => {
    const instance = input.editor.current;
    if (!instance || input.composing.current || input.readOnly) return;
    instance
      .chain()
      .focus()
      .insertContent([
        separatorBlock(input.temporaryClientBlockId()),
        paragraphBlock(input.temporaryClientBlockId()),
      ])
      .run();
  }, [input]);

  const toggleLock = useCallback((): void => {
    const instance = input.editor.current;
    if (!instance || input.composing.current || input.readOnly) return;
    instance.commands.focus();
    if (!toggleWorldforgeEditorBlockLock(instance)) return;
    input.refreshLockState();
    input.setStatus(
      selectedWorldforgeBlockLocked(instance)
        ? '当前正文段落已锁定；修改、删除和移动将被阻止。'
        : '当前正文段落已解锁。',
    );
  }, [input]);

  const manualSave = useCallback(async (): Promise<void> => {
    if (!(await input.flush())) return;
    input.setStatus(input.savedStatus('已手动保存', input.activeDraft.current?.revision ?? 0));
  }, [input]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== 's' ||
        !input.editor.current
      )
        return;
      event.preventDefault();
      if (!input.composing.current && !event.isComposing) void manualSave();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [input, manualSave]);

  return {
    rememberCurrentSelection,
    toggleFocusMode,
    selectMatch,
    replaceMatches,
    setBlockType,
    insertSeparator,
    toggleLock,
    manualSave,
  };
}

function separatorBlock(clientBlockId: string) {
  return {
    type: 'separator',
    attrs: {
      logicalBlockId: null,
      clientBlockId,
      source: 'manual',
      locked: false,
      contentHash: null,
    },
  };
}

function paragraphBlock(clientBlockId: string) {
  return {
    type: 'paragraph',
    attrs: {
      logicalBlockId: null,
      clientBlockId,
      source: 'manual',
      locked: false,
      contentHash: null,
    },
  };
}
