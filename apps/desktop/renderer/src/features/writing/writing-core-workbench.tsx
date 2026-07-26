import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import type {
  CandidateConflictItem,
  CandidatePreview,
  CandidateSelection,
  CandidateSummary,
  CandidateUndoPreview,
  Chapter,
  DraftDocument,
  ProjectContinuationInput,
  ProjectContinuationSnapshot,
  ProjectWorkspaceSummary,
  VersionDocument,
  VersionSummary,
} from '@worldforge/contracts';
import {
  DraftAutosaveCoordinator,
  Editor,
  assertEditorNodeMetadata,
  buildDraftPatchOperations,
  calculateWritingStatistics,
  createWorldforgeEditorExtensions,
  documentToTiptapJson,
  findTextRanges,
  redoWorldforgeEditor,
  selectedWorldforgeBlockLocked,
  synchronizePersistedBlockMetadata,
  tiptapJsonToDraftSnapshot,
  toggleWorldforgeEditorBlockLock,
  undoWorldforgeEditor,
} from '@worldforge/editor-core';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { StructureNavigator } from '../planning/planning-workbench.js';

export type WritingPanel = 'editor' | 'versions' | 'candidates';

interface WritingWorkbenchProps {
  readonly bridge: RendererBridgeAdapter;
  readonly project: ProjectWorkspaceSummary;
  readonly initialContinuation: ProjectContinuationSnapshot | null;
  readonly panel: WritingPanel;
  readonly onPanelChange: (panel: WritingPanel) => void;
  readonly onStatus: (message: string) => void;
}

interface WritingStatistics {
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

interface PersistedEditorSelection {
  readonly from: number;
  readonly to: number;
  readonly anchorPath?: readonly number[];
  readonly anchorOffset?: number;
  readonly focusPath?: readonly number[];
  readonly focusOffset?: number;
}

const persistedSelectionByChapter = new Map<string, PersistedEditorSelection>();

function selectionKey(projectId: string, chapterId: string): string {
  return `${projectId}:${chapterId}`;
}

function pathFromEditorRoot(root: Node, node: Node): readonly number[] | null {
  const path: number[] = [];
  let current: Node | null = node;
  while (current && current !== root) {
    const parent: ParentNode | null = current.parentNode;
    if (!parent) return null;
    const index = Array.prototype.indexOf.call(parent.childNodes, current) as number;
    if (index < 0) return null;
    path.unshift(index);
    current = parent;
  }
  return current === root ? path : null;
}

function nodeFromEditorPath(root: Node, path: readonly number[]): Node | null {
  let current: Node = root;
  for (const index of path) {
    const next = current.childNodes.item(index);
    if (!next) return null;
    current = next;
  }
  return current;
}

function clampEditorSelectionOffset(node: Node, offset: number): number {
  const maximum = node.nodeType === 3 ? (node.textContent?.length ?? 0) : node.childNodes.length;
  return Math.min(Math.max(0, offset), maximum);
}

function captureEditorSelection(instance: Editor): PersistedEditorSelection {
  const persisted: PersistedEditorSelection = {
    from: instance.state.selection.from,
    to: instance.state.selection.to,
  };
  const root = instance.view.dom;
  const selection = root.ownerDocument.getSelection();
  if (!selection?.anchorNode || !selection.focusNode) return persisted;
  if (!root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return persisted;
  const anchorPath = pathFromEditorRoot(root, selection.anchorNode);
  const focusPath = pathFromEditorRoot(root, selection.focusNode);
  if (!anchorPath || !focusPath) return persisted;
  return {
    ...persisted,
    anchorPath,
    anchorOffset: selection.anchorOffset,
    focusPath,
    focusOffset: selection.focusOffset,
  };
}

function persistEditorSelection(projectId: string, chapterId: string, instance: Editor): void {
  const key = selectionKey(projectId, chapterId);
  const captured = captureEditorSelection(instance);
  const existing = persistedSelectionByChapter.get(key);
  if (
    !captured.anchorPath &&
    existing?.anchorPath &&
    existing.from === captured.from &&
    existing.to === captured.to
  ) {
    return;
  }
  persistedSelectionByChapter.set(key, captured);
}

function restoreEditorSelection(instance: Editor, remembered: PersistedEditorSelection): void {
  const maximum = Math.max(1, instance.state.doc.content.size);
  instance.commands.setTextSelection({
    from: Math.min(Math.max(1, remembered.from), maximum),
    to: Math.min(Math.max(1, remembered.to), maximum),
  });
  instance.view.focus();
  if (
    !remembered.anchorPath ||
    remembered.anchorOffset === undefined ||
    !remembered.focusPath ||
    remembered.focusOffset === undefined
  ) {
    return;
  }
  const root = instance.view.dom;
  const anchorNode = nodeFromEditorPath(root, remembered.anchorPath);
  const focusNode = nodeFromEditorPath(root, remembered.focusPath);
  if (!anchorNode || !focusNode) return;
  root.ownerDocument
    .getSelection()
    ?.setBaseAndExtent(
      anchorNode,
      clampEditorSelectionOffset(anchorNode, remembered.anchorOffset),
      focusNode,
      clampEditorSelectionOffset(focusNode, remembered.focusOffset),
    );
}

function captureContinuationAnchor(instance: Editor): {
  readonly logicalBlockId: string;
  readonly expectedBlockHash: string;
  readonly cursorOffset: number;
} | null {
  const position = instance.state.selection.$from;
  for (let depth = position.depth; depth >= 1; depth -= 1) {
    const node = position.node(depth);
    const attributes = node.attrs as Record<string, unknown>;
    if (
      typeof attributes.logicalBlockId === 'string' &&
      typeof attributes.contentHash === 'string'
    ) {
      return {
        logicalBlockId: attributes.logicalBlockId,
        expectedBlockHash: attributes.contentHash,
        cursorOffset: Math.max(0, position.pos - position.start(depth)),
      };
    }
  }
  return null;
}

function restoreContinuationAnchor(
  instance: Editor,
  continuation: ProjectContinuationSnapshot,
): void {
  if (continuation.status !== 'ready') return;
  let target: number | null = null;
  instance.state.doc.descendants((node, position) => {
    if (target !== null) return false;
    const attributes = node.attrs as Record<string, unknown>;
    if (attributes.logicalBlockId !== continuation.logicalBlockId) return true;
    target = position + 1 + Math.min(continuation.cursorOffset, node.content.size);
    return false;
  });
  if (target !== null) {
    instance.commands.setTextSelection(target);
    instance.commands.focus();
  }
}

export function WritingWorkbench({
  bridge,
  project,
  initialContinuation,
  panel,
  onPanelChange,
  onStatus,
}: WritingWorkbenchProps) {
  const readOnly = project.databaseMode !== 'read-write';
  const editorHost = useRef<HTMLDivElement>(null);
  const editor = useRef<Editor | null>(null);
  const autosave = useRef<DraftAutosaveCoordinator | null>(null);
  const activeDraft = useRef<DraftDocument | null>(null);
  const activeChapter = useRef<Chapter | null>(null);
  const composing = useRef(false);
  const synchronizing = useRef(false);
  const initialChapterRequested = useRef(false);
  const continuationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const continuationScrollCleanup = useRef<(() => void) | null>(null);
  const lastContinuationSignature = useRef<string | null>(null);
  const lastContinuationInput = useRef<ProjectContinuationInput | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [draft, setDraft] = useState<DraftDocument | null>(null);
  const [editorState, setEditorState] = useState('从左侧卷章目录选择章节。');
  const [editorFailure, setEditorFailure] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [statistics, setStatistics] = useState<WritingStatistics>(EMPTY_STATISTICS);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [findIndex, setFindIndex] = useState(0);
  const [findCount, setFindCount] = useState(0);
  const [selectedLocked, setSelectedLocked] = useState<boolean | null>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [outlineVisible, setOutlineVisible] = useState(true);
  const [contextVisible, setContextVisible] = useState(true);
  const [focusMode, setFocusMode] = useState(false);

  const setStatus = useCallback((message: string, failure = false): void => {
    setEditorState(message);
    setEditorFailure(failure);
  }, []);

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
  }, []);

  const refreshLockState = useCallback((): void => {
    setSelectedLocked(editor.current ? selectedWorldforgeBlockLocked(editor.current) : null);
  }, []);

  const persistedBlocks = useCallback(
    (document: DraftDocument) =>
      document.blocks.map((block) => ({
        logicalBlockId: block.logicalBlockId,
        blockType: block.blockType,
        text: block.text,
        attributes: block.attributes,
        source: block.source,
        locked: block.locked,
        contentHash: block.contentHash,
      })),
    [],
  );

  const saveContinuation = useCallback(async (): Promise<boolean> => {
    const instance = editor.current;
    const currentDraft = activeDraft.current;
    const currentChapter = activeChapter.current;
    if (!instance || !currentDraft || !currentChapter || readOnly) return true;
    const anchor = captureContinuationAnchor(instance);
    if (!anchor) return true;
    const scrollContainer = editorHost.current?.closest<HTMLElement>('.react-main');
    const input = {
      projectId: project.projectId,
      chapterId: currentChapter.id,
      draftId: currentDraft.draftId,
      draftRevision: currentDraft.revision,
      ...anchor,
      scrollTop: Math.max(0, Math.round(scrollContainer?.scrollTop ?? 0)),
      panel,
    };
    const signature = JSON.stringify(input);
    if (lastContinuationSignature.current === signature) return true;
    const outcome = await bridge.project.saveContinuation(input, { mode: 'replace' });
    if (outcome.state !== 'success') return false;
    lastContinuationInput.current = input;
    lastContinuationSignature.current = signature;
    return true;
  }, [bridge, panel, project.projectId, readOnly]);

  const scheduleContinuationSave = useCallback((): void => {
    if (readOnly) return;
    if (continuationTimer.current) clearTimeout(continuationTimer.current);
    continuationTimer.current = setTimeout(() => {
      continuationTimer.current = null;
      void saveContinuation();
    }, 500);
  }, [readOnly, saveContinuation]);

  useEffect(() => {
    const previous = lastContinuationInput.current;
    if (!previous || previous.panel === panel || readOnly) return;
    const next = { ...previous, panel };
    lastContinuationInput.current = next;
    lastContinuationSignature.current = JSON.stringify(next);
    void bridge.project.saveContinuation(next, { mode: 'replace' });
  }, [bridge, panel, readOnly]);

  const persistDraft = useCallback(async (): Promise<boolean> => {
    const instance = editor.current;
    const currentDraft = activeDraft.current;
    const currentChapter = activeChapter.current;
    if (!instance || !currentDraft || !currentChapter || readOnly) return true;
    if (composing.current || instance.view.composing) return false;
    try {
      const json = instance.getJSON();
      const signature = JSON.stringify(json);
      assertEditorNodeMetadata(json);
      const nextBlocks = tiptapJsonToDraftSnapshot(json, temporaryClientBlockId);
      const operations = buildDraftPatchOperations(persistedBlocks(currentDraft), nextBlocks);
      if (operations.length === 0) return true;
      const result = await bridge.draft.applyPatch({
        projectId: project.projectId,
        chapterId: currentChapter.id,
        draftId: currentDraft.draftId,
        baseRevision: currentDraft.revision,
        operations,
      });
      if (result.state !== 'success') return false;
      if (
        activeChapter.current?.id !== currentChapter.id ||
        activeDraft.current?.draftId !== currentDraft.draftId ||
        editor.current !== instance
      ) {
        return true;
      }
      activeDraft.current = result.data;
      setDraft(result.data);
      synchronizing.current = true;
      const synchronized = synchronizePersistedBlockMetadata(
        instance,
        persistedBlocks(result.data),
      );
      if (!synchronized) {
        instance.commands.setContent(documentToTiptapJson(persistedBlocks(result.data)), {
          emitUpdate: false,
        });
      }
      synchronizing.current = false;
      refreshStatistics();
      await saveContinuation();
      setStatus(
        `已保存 · Revision ${result.data.revision}${JSON.stringify(instance.getJSON()) === signature ? '' : ' · 编辑器仍有新输入'}`,
      );
      return true;
    } catch {
      synchronizing.current = false;
      return false;
    }
  }, [
    bridge,
    persistedBlocks,
    project.projectId,
    readOnly,
    refreshStatistics,
    saveContinuation,
    setStatus,
  ]);

  const flush = useCallback(async (): Promise<boolean> => {
    const result = await (autosave.current?.flush() ?? Promise.resolve(true));
    const continuationSaved = result ? await saveContinuation() : false;
    setStatus(
      result && continuationSaved
        ? `已保存 · Revision ${activeDraft.current?.revision ?? 0}`
        : '保存失败；窗口内容仍保留。',
      !result || !continuationSaved,
    );
    return result && continuationSaved;
  }, [saveContinuation, setStatus]);

  useEffect(() => {
    Object.defineProperty(globalThis, 'worldforgeFlushDraft', {
      configurable: true,
      value: flush,
    });
    return () => {
      delete (
        globalThis as typeof globalThis & {
          worldforgeFlushDraft?: () => Promise<boolean>;
        }
      ).worldforgeFlushDraft;
    };
  }, [flush]);

  const rememberCurrentSelection = useCallback((): void => {
    const instance = editor.current;
    const currentChapter = activeChapter.current;
    if (!instance || !currentChapter) return;
    persistEditorSelection(project.projectId, currentChapter.id, instance);
  }, [project.projectId]);

  const destroyEditor = useCallback(
    (clearSession = true): void => {
      const instance = editor.current;
      const currentChapter = activeChapter.current;
      if (instance && currentChapter) {
        persistEditorSelection(project.projectId, currentChapter.id, instance);
        void saveContinuation();
      }
      if (continuationTimer.current) clearTimeout(continuationTimer.current);
      continuationTimer.current = null;
      continuationScrollCleanup.current?.();
      continuationScrollCleanup.current = null;
      autosave.current?.destroy();
      autosave.current = null;
      instance?.destroy();
      editor.current = null;
      editorHost.current?.replaceChildren();
      setStatistics(EMPTY_STATISTICS);
      setSelectedLocked(null);
      setEditorReady(false);
      setIsComposing(false);
      composing.current = false;
      if (clearSession) {
        activeDraft.current = null;
        activeChapter.current = null;
        setDraft(null);
        setChapter(null);
      }
    },
    [project.projectId, saveContinuation],
  );

  const mountEditor = useCallback(
    (document: DraftDocument, nextChapter: Chapter): void => {
      destroyEditor(false);
      activeDraft.current = document;
      activeChapter.current = nextChapter;
      setDraft(document);
      setChapter(nextChapter);
      const host = editorHost.current;
      if (!host) {
        setStatus('Draft已更新；返回正文后重建编辑器。');
        return;
      }
      const remembered = persistedSelectionByChapter.get(
        selectionKey(project.projectId, nextChapter.id),
      );
      const instance = new Editor({
        element: host,
        extensions: createWorldforgeEditorExtensions(temporaryClientBlockId),
        content: documentToTiptapJson(persistedBlocks(document)),
        editable: !readOnly,
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
          refreshLockState();
          if (synchronizing.current) return;
          refreshStatistics();
          autosave.current?.markDirty();
          setStatus(composing.current ? '输入法组合中；自动保存与结构键已暂停。' : '等待自动保存…');
        },
        onSelectionUpdate: ({ editor: current }) => {
          persistedSelectionByChapter.set(selectionKey(project.projectId, nextChapter.id), {
            from: current.state.selection.from,
            to: current.state.selection.to,
          });
          refreshLockState();
          scheduleContinuationSave();
        },
      });
      editor.current = instance;
      autosave.current = new DraftAutosaveCoordinator({
        delayMs: 800,
        save: persistDraft,
        onState: (state) => {
          if (state === 'waiting') setStatus('等待自动保存…');
          else if (state === 'saving') setStatus('正在自动保存…');
          else if (state === 'saved')
            setStatus(`自动保存完成 · Revision ${activeDraft.current?.revision ?? 0}`);
          else if (state === 'failed') setStatus('自动保存失败；窗口内容仍保留。', true);
          else if (state === 'paused') setStatus('输入法组合中；自动保存已暂停。');
        },
      });
      if (remembered) {
        restoreEditorSelection(instance, remembered);
      } else if (
        initialContinuation?.status === 'ready' &&
        initialContinuation.chapterId === nextChapter.id
      ) {
        restoreContinuationAnchor(instance, initialContinuation);
      }
      const scrollContainer = host.closest<HTMLElement>('.react-main');
      if (scrollContainer) {
        const onScroll = (): void => scheduleContinuationSave();
        scrollContainer.addEventListener('scroll', onScroll, { passive: true });
        continuationScrollCleanup.current = () =>
          scrollContainer.removeEventListener('scroll', onScroll);
        if (
          initialContinuation?.status === 'ready' &&
          initialContinuation.chapterId === nextChapter.id
        ) {
          window.requestAnimationFrame(() => {
            scrollContainer.scrollTop = initialContinuation.scrollTop;
          });
        }
      }
      refreshStatistics();
      refreshLockState();
      setEditorReady(true);
      setStatus(readOnly ? '只读浏览：可以选择和复制，写入已禁用。' : '已从 DraftBlock 重建。');
    },
    [
      destroyEditor,
      persistDraft,
      persistedBlocks,
      readOnly,
      refreshLockState,
      refreshStatistics,
      initialContinuation,
      scheduleContinuationSave,
      setStatus,
    ],
  );

  useEffect(() => () => destroyEditor(), [destroyEditor]);

  useEffect(() => {
    if (panel !== 'editor' && editor.current) destroyEditor(false);
  }, [destroyEditor, panel]);

  useEffect(() => {
    if (panel === 'editor' && chapter && draft && !editor.current) mountEditor(draft, chapter);
  }, [chapter, draft, mountEditor, panel]);

  const openChapter = useCallback(
    async (nextChapter: Chapter): Promise<void> => {
      if (activeChapter.current?.id === nextChapter.id && activeDraft.current) {
        if (panel === 'editor' && !editor.current) mountEditor(activeDraft.current, nextChapter);
        return;
      }
      if (!(await flush())) {
        onStatus('自动保存失败，已阻止切换章节。');
        return;
      }
      setChapter(nextChapter);
      activeChapter.current = nextChapter;
      setStatus('正在从项目数据库读取DraftBlock…');
      const outcome = await bridge.draft.open(
        { projectId: project.projectId, chapterId: nextChapter.id },
        { mode: 'replace' },
      );
      if (activeChapter.current?.id !== nextChapter.id) return;
      if (outcome.state !== 'success') {
        setStatus(
          outcome.state === 'failure'
            ? `正文读取失败 · ${outcome.error.code}`
            : outcome.state === 'cancelled'
              ? '正文读取已取消。'
              : '正文读取已被更新请求替代。',
          outcome.state === 'failure',
        );
        return;
      }
      mountEditor(outcome.data, nextChapter);
    },
    [bridge, flush, mountEditor, onStatus, panel, project.projectId, setStatus],
  );

  useEffect(() => {
    if (initialChapterRequested.current) return;
    initialChapterRequested.current = true;
    let active = true;
    void bridge.planning.listStructure(project.projectId, { mode: 'replace' }).then((outcome) => {
      if (!active || outcome.state !== 'success') return;
      const chapters = outcome.data.volumes.flatMap((volume) => volume.chapters);
      const continuedChapter =
        initialContinuation?.status === 'ready'
          ? chapters.find((candidate) => candidate.id === initialContinuation.chapterId)
          : undefined;
      const nextChapter = continuedChapter ?? chapters[0];
      if (nextChapter) {
        if (initialContinuation?.status === 'stale') {
          onStatus('上次写作位置已经变化，已安全回到首个可用章节。');
        }
        void openChapter(nextChapter);
      }
    });
    return () => {
      active = false;
    };
  }, [bridge, initialContinuation, onStatus, openChapter, project.projectId]);

  const replaceDraft = useCallback(
    (next: DraftDocument, message: string): void => {
      const currentChapter = activeChapter.current;
      if (!currentChapter) return;
      mountEditor(next, currentChapter);
      setStatus(message);
    },
    [mountEditor, setStatus],
  );

  const backToProject = useCallback(async (): Promise<void> => {
    if (!(await flush())) {
      setStatus('自动保存失败，已阻止返回项目。', true);
      return;
    }
    destroyEditor();
    setStatus('已返回项目结构；选择章节可继续写作。');
  }, [destroyEditor, flush, setStatus]);

  const matches = useCallback(() => {
    const instance = editor.current;
    const result: Array<{ readonly from: number; readonly to: number }> = [];
    if (!instance || !findText) return result;
    instance.state.doc.descendants((node, position) => {
      if (!node.isText || !node.text) return;
      for (const range of findTextRanges(node.text, findText)) {
        result.push({ from: position + range.from, to: position + range.to });
      }
    });
    return result;
  }, [findText]);

  useEffect(() => {
    const next = matches();
    setFindCount(next.length);
    setFindIndex((current) => (next.length === 0 ? 0 : Math.min(current, next.length - 1)));
  }, [draft, findText, matches]);

  const selectMatch = useCallback(
    (direction: 1 | -1): void => {
      const instance = editor.current;
      const values = matches();
      if (!instance || values.length === 0) return;
      const next = (findIndex + direction + values.length) % values.length;
      setFindIndex(next);
      instance.commands.setTextSelection(values[next]!);
      instance.commands.focus();
    },
    [findIndex, matches],
  );

  const replaceMatches = useCallback(
    (all: boolean): void => {
      const instance = editor.current;
      const values = matches();
      if (!instance || readOnly || composing.current || values.length === 0) return;
      const selected = all ? values : [values[findIndex] ?? values[0]!];
      let transaction = instance.state.tr;
      for (const match of [...selected].reverse()) {
        transaction = transaction.insertText(replaceText, match.from, match.to);
      }
      instance.view.dispatch(transaction);
      setFindIndex(0);
    },
    [findIndex, matches, readOnly, replaceText],
  );

  const setBlockType = useCallback(
    (type: 'paragraph' | 'dialogue' | 'heading'): void => {
      const instance = editor.current;
      if (!instance || composing.current || readOnly) return;
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
    [readOnly],
  );

  const insertSeparator = useCallback((): void => {
    const instance = editor.current;
    if (!instance || composing.current || readOnly) return;
    instance
      .chain()
      .focus()
      .insertContent([
        {
          type: 'separator',
          attrs: {
            logicalBlockId: null,
            clientBlockId: temporaryClientBlockId(),
            source: 'manual',
            locked: false,
            contentHash: null,
          },
        },
        {
          type: 'paragraph',
          attrs: {
            logicalBlockId: null,
            clientBlockId: temporaryClientBlockId(),
            source: 'manual',
            locked: false,
            contentHash: null,
          },
        },
      ])
      .run();
  }, [readOnly]);

  const toggleLock = useCallback((): void => {
    const instance = editor.current;
    if (!instance || composing.current || readOnly) return;
    instance.commands.focus();
    if (!toggleWorldforgeEditorBlockLock(instance)) return;
    refreshLockState();
    setStatus(
      selectedWorldforgeBlockLocked(instance)
        ? '当前正文块已锁定；修改、删除和移动将被阻止。'
        : '当前正文块已解锁。',
    );
  }, [readOnly, refreshLockState, setStatus]);

  const manualSave = useCallback(async (): Promise<void> => {
    if (!(await flush())) return;
    setStatus(`已手动保存 · Revision ${activeDraft.current?.revision ?? 0}`);
  }, [flush, setStatus]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's' || !editor.current)
        return;
      event.preventDefault();
      if (!composing.current && !event.isComposing) void manualSave();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [manualSave]);

  const editorUnavailable = !draft || readOnly || isComposing;

  return (
    <section
      className="writing-workbench"
      data-focus-mode={focusMode}
      data-writing-workbench
      data-draft-workspace={editorReady ? '' : undefined}
    >
      <header className="feature-heading writing-heading">
        <div>
          <p className="eyebrow">本地写作 · 自动保存</p>
          <h1>{chapter ? `${project.name} · ${chapter.title}` : project.name}</h1>
          <p>正文、历史版本和候选稿都保存在当前项目中；采用前可预览，保存后可追溯。</p>
        </div>
        <div className="feature-heading__actions">
          <button
            data-back-project
            type="button"
            onPointerDownCapture={rememberCurrentSelection}
            onClick={() => void backToProject()}
          >
            返回项目
          </button>
          <button
            type="button"
            className={panel === 'editor' ? 'is-active' : ''}
            onClick={() => onPanelChange('editor')}
          >
            正文
          </button>
          <button
            data-open-versions
            data-create-version
            type="button"
            className={panel === 'versions' ? 'is-active' : ''}
            disabled={!chapter}
            onClick={() => onPanelChange('versions')}
          >
            历史版本
          </button>
          <button
            data-open-candidate-preview
            type="button"
            className={panel === 'candidates' ? 'is-active' : ''}
            disabled={!chapter}
            onClick={() => onPanelChange('candidates')}
          >
            候选稿
          </button>
          <button
            aria-pressed={outlineVisible}
            data-toggle-writing-outline
            type="button"
            onClick={() => setOutlineVisible((visible) => !visible)}
          >
            {outlineVisible ? '收起目录' : '展开目录'}
          </button>
          <button
            aria-pressed={contextVisible}
            data-toggle-writing-context
            type="button"
            onClick={() => setContextVisible((visible) => !visible)}
          >
            {contextVisible ? '收起上下文' : '展开上下文'}
          </button>
          <button
            aria-pressed={focusMode}
            data-toggle-focus-mode
            type="button"
            onClick={() => setFocusMode((enabled) => !enabled)}
          >
            {focusMode ? '退出沉浸' : '沉浸写作'}
          </button>
        </div>
      </header>

      <div
        className="writing-grid"
        data-context-visible={contextVisible && !focusMode}
        data-outline-visible={outlineVisible && !focusMode}
      >
        {outlineVisible && !focusMode ? (
          <StructureNavigator
            bridge={bridge}
            compact
            projectId={project.projectId}
            readOnly={readOnly}
            selectedChapterId={chapter?.id ?? null}
            onSelectChapter={() => undefined}
            onOpenChapter={(nextChapter) => void openChapter(nextChapter)}
            onBeforeWrite={flush}
            onStatus={onStatus}
          />
        ) : null}

        <main className="writing-editor-card">
          {panel === 'editor' ? (
            <>
              <div className="draft-toolbar" role="toolbar" aria-label="正文块工具">
                <button
                  data-set-block-type="paragraph"
                  type="button"
                  disabled={editorUnavailable}
                  onClick={() => setBlockType('paragraph')}
                >
                  正文
                </button>
                <button
                  data-set-block-type="dialogue"
                  type="button"
                  disabled={editorUnavailable}
                  onClick={() => setBlockType('dialogue')}
                >
                  对话
                </button>
                <button
                  data-set-block-type="heading"
                  type="button"
                  disabled={editorUnavailable}
                  onClick={() => setBlockType('heading')}
                >
                  小标题
                </button>
                <button
                  data-insert-separator
                  type="button"
                  disabled={editorUnavailable}
                  onClick={insertSeparator}
                >
                  分隔线
                </button>
                <button
                  data-toggle-block-lock
                  type="button"
                  aria-pressed={selectedLocked === true}
                  disabled={editorUnavailable || selectedLocked === null}
                  onClick={toggleLock}
                >
                  {selectedLocked ? '解锁当前块' : '锁定当前块'}
                </button>
                <button
                  data-undo-draft
                  type="button"
                  disabled={editorUnavailable}
                  onClick={() => editor.current && undoWorldforgeEditor(editor.current)}
                >
                  撤销
                </button>
                <button
                  data-redo-draft
                  type="button"
                  disabled={editorUnavailable}
                  onClick={() => editor.current && redoWorldforgeEditor(editor.current)}
                >
                  重做
                </button>
                <button
                  className="primary-button"
                  data-save-draft
                  type="button"
                  disabled={editorUnavailable}
                  onClick={() => void manualSave()}
                >
                  手动保存
                </button>
                <button
                  type="button"
                  disabled={!draft}
                  onClick={() =>
                    void navigator.clipboard.writeText(
                      editor.current?.getText({ blockSeparator: '\n\n' }) ??
                        draft?.blocks.map((block) => block.text).join('\n\n') ??
                        '',
                    )
                  }
                >
                  复制正文
                </button>
              </div>

              <div className="draft-metrics" aria-label="正文统计">
                <span>
                  字符 <strong data-draft-character-count>{statistics.characterCount}</strong>
                </span>
                <span>
                  纯文字 <strong data-draft-text-count>{statistics.textCount}</strong>
                </span>
                <span>
                  段落 <strong data-draft-paragraph-count>{statistics.paragraphCount}</strong>
                </span>
                <span>
                  {statistics.progressPercent === null
                    ? '未设置目标'
                    : `目标进度 ${statistics.progressPercent}%`}
                </span>
              </div>

              <div className="draft-find" aria-label="当前章节查找替换">
                <input
                  data-draft-find
                  type="search"
                  aria-label="查找文本"
                  placeholder="查找当前章节"
                  value={findText}
                  onChange={(event) => {
                    setFindText(event.target.value);
                    setFindIndex(0);
                  }}
                />
                <button type="button" disabled={!findCount} onClick={() => selectMatch(-1)}>
                  上一个
                </button>
                <button
                  data-draft-find-next
                  type="button"
                  disabled={!findCount}
                  onClick={() => selectMatch(1)}
                >
                  下一个
                </button>
                <span data-draft-find-status aria-live="polite">
                  {findCount ? `${findIndex + 1}/${findCount}` : findText ? '未找到' : ''}
                </span>
                <input
                  data-draft-replace
                  type="text"
                  aria-label="替换文本"
                  placeholder="替换为"
                  value={replaceText}
                  onChange={(event) => setReplaceText(event.target.value)}
                />
                <button
                  data-draft-replace-current
                  type="button"
                  disabled={!findCount || readOnly || isComposing}
                  onClick={() => replaceMatches(false)}
                >
                  替换
                </button>
                <button
                  type="button"
                  disabled={!findCount || readOnly || isComposing}
                  onClick={() => replaceMatches(true)}
                >
                  全部替换
                </button>
              </div>

              <p
                className={editorFailure ? 'draft-state is-error' : 'draft-state'}
                data-draft-state
                role="status"
                aria-live="polite"
              >
                {editorState}
              </p>
              {chapter ? (
                <div
                  className="draft-editor-host"
                  data-draft-editor-host
                  ref={editorHost}
                  onCompositionStart={() => {
                    composing.current = true;
                    setIsComposing(true);
                    autosave.current?.pause();
                    setStatus('输入法组合中；保存与结构键已暂停。');
                  }}
                  onCompositionEnd={() => {
                    composing.current = false;
                    setIsComposing(false);
                    autosave.current?.resume();
                    autosave.current?.markDirty();
                  }}
                />
              ) : (
                <section className="feature-card writing-empty">
                  <h2>选择章节开始写作</h2>
                  <p>正文编辑器只在章节打开后创建，切章前会强制刷新自动保存。</p>
                </section>
              )}
            </>
          ) : null}

          {panel === 'versions' && chapter && draft ? (
            <VersionPanel
              bridge={bridge}
              chapter={chapter}
              draft={draft}
              project={project}
              flush={flush}
              onClose={() => onPanelChange('editor')}
              onDraftReplace={replaceDraft}
            />
          ) : null}

          {panel === 'candidates' && chapter && draft ? (
            <CandidatePanel
              bridge={bridge}
              chapter={chapter}
              draft={draft}
              project={project}
              flush={flush}
              onDraftReplace={replaceDraft}
            />
          ) : null}
        </main>

        {contextVisible && !focusMode ? (
          <aside className="writing-context feature-card" aria-label="正文上下文">
            <h2>当前写作状态</h2>
            <p>{chapter?.title ?? '尚未选择章节'}</p>
            <p>{draft ? `已保存修订 ${draft.revision}` : '尚未打开正文'}</p>
            <p>
              {readOnly
                ? '只读保护：可以浏览和复制，写入已停用。'
                : '停止输入约1秒后自动保存，事务确认后才显示成功。'}
            </p>
            <p>切换章节、工作台或关闭项目之前会先完成当前保存。</p>
          </aside>
        ) : null}
      </div>
    </section>
  );
}

function VersionPanel({
  bridge,
  chapter,
  draft,
  project,
  flush,
  onClose,
  onDraftReplace,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly chapter: Chapter;
  readonly draft: DraftDocument;
  readonly project: ProjectWorkspaceSummary;
  readonly flush: () => Promise<boolean>;
  readonly onClose: () => void;
  readonly onDraftReplace: (draft: DraftDocument, message: string) => void;
}) {
  const readOnly = project.databaseMode !== 'read-write';
  const [versions, setVersions] = useState<readonly VersionSummary[]>([]);
  const [selected, setSelected] = useState<VersionDocument | null>(null);
  const [status, setStatus] = useState('Version只读不可变；恢复会创建新Draft。');
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    const outcome = await bridge.version.list(project.projectId, chapter.id, { mode: 'replace' });
    if (outcome.state === 'success') setVersions(outcome.data.versions);
    else if (outcome.state === 'failure') setStatus(`版本读取失败 · ${outcome.error.code}`);
  }, [bridge, chapter.id, project.projectId]);

  useEffect(() => void refresh(), [refresh]);

  const create = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    const form = event.currentTarget;
    event.preventDefault();
    if (readOnly || !(await flush())) {
      setStatus('自动保存失败，未创建Version。');
      return;
    }
    const values = new FormData(form);
    const title = String(values.get('title') ?? '').trim();
    if (!title) return;
    setPending(true);
    const outcome = await bridge.version.create({
      projectId: project.projectId,
      chapterId: chapter.id,
      draftId: draft.draftId,
      baseRevision: draft.revision,
      versionType: 'manual',
      parentVersionId: null,
      sourceCandidateId: null,
      title,
      label: nullableText(values.get('label')),
      description: String(values.get('description') ?? ''),
    });
    setPending(false);
    if (outcome.state !== 'success') {
      setStatus(outcome.state === 'failure' ? `创建失败 · ${outcome.error.code}` : '创建已取消。');
      return;
    }
    form.reset();
    setStatus(`Version“${outcome.data.title}”已创建，内容不可修改。`);
    await refresh();
  };

  const preview = async (versionId: string): Promise<void> => {
    const outcome = await bridge.version.get(
      { projectId: project.projectId, chapterId: chapter.id, versionId },
      { mode: 'replace' },
    );
    if (outcome.state === 'success') {
      setSelected(outcome.data);
      setStatus(`正在比较：${outcome.data.title}`);
    } else if (outcome.state === 'failure') setStatus(`预览失败 · ${outcome.error.code}`);
  };

  const finalize = async (versionId: string): Promise<void> => {
    if (readOnly) return;
    const outcome = await bridge.version.setFinal({
      projectId: project.projectId,
      chapterId: chapter.id,
      versionId,
    });
    if (outcome.state === 'success') {
      setStatus(`已将“${outcome.data.title}”设为定稿。`);
      await refresh();
    } else if (outcome.state === 'failure') setStatus(`定稿失败 · ${outcome.error.code}`);
  };

  const restore = async (versionId: string): Promise<void> => {
    if (readOnly || !(await flush())) return;
    const outcome = await bridge.version.restore({
      projectId: project.projectId,
      chapterId: chapter.id,
      versionId,
    });
    if (outcome.state === 'success') {
      onDraftReplace(outcome.data, '已从只读版本恢复为新草稿。');
      setStatus('恢复成功；原Version与原Draft记录保持不变。');
    } else if (outcome.state === 'failure') setStatus(`恢复失败 · ${outcome.error.code}`);
  };

  return (
    <section className="version-workbench" data-version-dialog>
      <header className="feature-card__heading">
        <div>
          <h2>Version历史与比较</h2>
          <p>Version不可变；左侧为当前已保存Draft，右侧为选中Version。</p>
        </div>
        <button data-close-versions type="button" onClick={onClose}>
          返回正文
        </button>
      </header>
      <form className="version-create-grid" onSubmit={(event) => void create(event)}>
        <input data-version-title name="title" maxLength={240} placeholder="版本标题" required />
        <input data-version-label name="label" maxLength={120} placeholder="标签（可选）" />
        <input
          data-version-description
          name="description"
          maxLength={2000}
          placeholder="说明（可选）"
        />
        <button
          className="primary-button"
          data-confirm-version
          disabled={readOnly || pending}
          type="submit"
        >
          创建Version
        </button>
      </form>
      <p className="feature-status" data-version-status role="status">
        {status}
      </p>
      <div className="version-history-layout">
        <div className="version-list">
          {versions.length === 0 ? (
            <p>还没有手动Version。</p>
          ) : (
            versions.map((version) => (
              <article
                className="version-row"
                data-version-id={version.versionId}
                data-version-row
                key={version.versionId}
              >
                <div>
                  <strong>{version.title}</strong>
                  <small>
                    {version.wordCount}字 · Revision {version.sourceRevision}
                    {version.label ? ` · ${version.label}` : ''}
                    {version.finalized ? ' · 定稿' : ''}
                  </small>
                </div>
                <div className="version-row__actions">
                  <button
                    data-version-action="compare"
                    type="button"
                    onClick={() => void preview(version.versionId)}
                  >
                    比较
                  </button>
                  <button
                    data-version-action="final"
                    type="button"
                    disabled={readOnly || version.finalized}
                    onClick={() => void finalize(version.versionId)}
                  >
                    设为定稿
                  </button>
                  <button
                    data-version-action="restore"
                    type="button"
                    disabled={readOnly}
                    onClick={() => void restore(version.versionId)}
                  >
                    恢复为新Draft
                  </button>
                  <button
                    data-version-action="export"
                    type="button"
                    onClick={() =>
                      void bridge.recovery.exportVersion({
                        projectId: project.projectId,
                        versionId: version.versionId,
                      })
                    }
                  >
                    导出TXT
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
        <div className="version-compare-grid">
          <pre>
            <strong>当前Draft</strong>
            {'\n\n'}
            {draft.blocks.map((block) => block.text).join('\n\n')}
          </pre>
          <pre>
            <strong>{selected?.title ?? '选择Version比较'}</strong>
            {'\n\n'}
            {selected?.blocks.map((block) => block.text).join('\n\n') ?? ''}
          </pre>
        </div>
      </div>
    </section>
  );
}

function CandidatePanel({
  bridge,
  chapter,
  draft,
  project,
  flush,
  onDraftReplace,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly chapter: Chapter;
  readonly draft: DraftDocument;
  readonly project: ProjectWorkspaceSummary;
  readonly flush: () => Promise<boolean>;
  readonly onDraftReplace: (draft: DraftDocument, message: string) => void;
}) {
  const readOnly = project.databaseMode !== 'read-write';
  const [candidates, setCandidates] = useState<readonly CandidateSummary[]>([]);
  const [candidateId, setCandidateId] = useState('');
  const [preview, setPreview] = useState<CandidatePreview | null>(null);
  const [undoPreview, setUndoPreview] = useState<CandidateUndoPreview | null>(null);
  const [selectionMode, setSelectionMode] = useState<'all' | 'blocks' | 'scene-beats'>('all');
  const [selectedBlocks, setSelectedBlocks] = useState<Set<string>>(new Set());
  const [selectedBeats, setSelectedBeats] = useState<Set<string>>(new Set());
  const [conflicts, setConflicts] = useState<readonly CandidateConflictItem[]>([]);
  const [status, setStatus] = useState(
    `预览只读取已持久化Draft Revision ${draft.revision}，不会写入项目数据库。`,
  );
  const [pending, setPending] = useState(false);
  const previewRequest = useRef<string | null>(null);

  const refreshList = useCallback(async (): Promise<readonly CandidateSummary[]> => {
    const outcome = await bridge.candidate.list(project.projectId, chapter.id, {
      mode: 'replace',
    });
    if (outcome.state !== 'success') {
      if (outcome.state === 'failure') setStatus(`候选列表读取失败 · ${outcome.error.code}`);
      return [];
    }
    setCandidates(outcome.data.candidates);
    return outcome.data.candidates;
  }, [bridge, chapter.id, project.projectId]);

  const loadUndo = useCallback(
    async (nextPreview: CandidatePreview): Promise<boolean> => {
      if (nextPreview.candidate.status !== 'accepted') {
        setUndoPreview(null);
        return false;
      }
      const lookup = await bridge.candidateAction.findUndoRecord({
        projectId: project.projectId,
        chapterId: chapter.id,
        candidateId: nextPreview.candidate.candidateId,
      });
      if (lookup.state !== 'success') return false;
      const outcome = await bridge.candidateAction.previewUndo({
        projectId: project.projectId,
        chapterId: chapter.id,
        applyRecordId: lookup.data.applyRecordId,
      });
      if (outcome.state !== 'success') return false;
      setUndoPreview(outcome.data);
      setConflicts(outcome.data.conflictSet?.conflicts ?? []);
      return outcome.data.canUndo;
    },
    [bridge, chapter.id, project.projectId],
  );

  const loadPreview = useCallback(
    async (nextCandidateId: string): Promise<void> => {
      if (!nextCandidateId) return;
      const requestId = crypto.randomUUID();
      previewRequest.current = requestId;
      setPending(true);
      setStatus('正在计算结构与中文字符差异…');
      setConflicts([]);
      const outcome = await bridge.candidateAction.preview(
        { projectId: project.projectId, chapterId: chapter.id, candidateId: nextCandidateId },
        requestId,
        { mode: 'replace' },
      );
      if (previewRequest.current !== requestId) return;
      previewRequest.current = null;
      setPending(false);
      if (outcome.state !== 'success') {
        setStatus(
          outcome.state === 'failure'
            ? outcome.error.code === 'COMMON_CANCELLED_004'
              ? '差异计算已取消。'
              : `预览失败 · ${outcome.error.code}`
            : outcome.state === 'cancelled'
              ? '差异计算已取消。'
              : '预览已被更新请求替代。',
        );
        return;
      }
      setPreview(outcome.data);
      setSelectionMode(outcome.data.candidate.completeness === 'partial' ? 'blocks' : 'all');
      setSelectedBlocks(
        new Set(outcome.data.candidate.blocks.map((block) => block.candidateBlockId)),
      );
      setSelectedBeats(
        new Set(
          outcome.data.candidate.blocks.flatMap((block) => (block.beatId ? [block.beatId] : [])),
        ),
      );
      const canUndo = await loadUndo(outcome.data);
      setStatus(
        canUndo
          ? `可整体撤销 · 基础 Revision ${outcome.data.candidate.baseDraftRevision}`
          : `已准备采用 · 基础 Revision ${outcome.data.candidate.baseDraftRevision} · ${outcome.data.execution.strategy}`,
      );
    },
    [bridge, chapter.id, loadUndo, project.projectId],
  );

  useEffect(() => {
    void refreshList().then((items) => {
      const first = items[0];
      if (!first) {
        setCandidateId('');
        setPreview(null);
        setStatus('当前章节没有Candidate。');
        return;
      }
      setCandidateId(first.candidateId);
      void loadPreview(first.candidateId);
    });
    return () => {
      const requestId = previewRequest.current;
      if (requestId) void bridge.candidateAction.cancelPreview(requestId);
    };
  }, [bridge, loadPreview, refreshList]);

  const selection = useMemo<CandidateSelection | null>(() => {
    if (!preview) return null;
    if (selectionMode === 'all')
      return preview.candidate.completeness === 'partial' ? null : { mode: 'all' };
    if (selectionMode === 'blocks') {
      return selectedBlocks.size
        ? {
            mode: 'blocks',
            candidateBlockIds: [...selectedBlocks],
            deleteLogicalBlockIds: [],
          }
        : null;
    }
    return selectedBeats.size
      ? { mode: 'scene-beats', beatIds: [...selectedBeats], deleteLogicalBlockIds: [] }
      : null;
  }, [preview, selectedBeats, selectedBlocks, selectionMode]);

  const cancel = async (): Promise<void> => {
    const requestId = previewRequest.current;
    if (!requestId) return;
    const outcome = await bridge.candidateAction.cancelPreview(requestId);
    if (outcome.state === 'success' && outcome.data.cancelled) setStatus('正在取消差异计算…');
  };

  const discard = async (): Promise<void> => {
    if (
      !preview ||
      preview.candidate.status !== 'pending' ||
      !window.confirm('丢弃后不能再采用，Draft不会改变。继续吗？')
    )
      return;
    const outcome = await bridge.candidate.discard({
      projectId: project.projectId,
      chapterId: chapter.id,
      candidateId: preview.candidate.candidateId,
    });
    if (outcome.state === 'success') {
      setPreview({
        ...preview,
        candidate: {
          ...preview.candidate,
          status: outcome.data.status,
          resolvedAt: outcome.data.resolvedAt,
        },
      });
      await refreshList();
      setStatus('候选已丢弃，Draft 未改变。');
    } else if (outcome.state === 'failure') setStatus(`丢弃失败 · ${outcome.error.code}`);
  };

  const apply = async (): Promise<void> => {
    if (!preview || !selection || readOnly || !(await flush())) return;
    setPending(true);
    setConflicts([]);
    const outcome = await bridge.candidateAction.apply({
      projectId: project.projectId,
      chapterId: chapter.id,
      candidateId: preview.candidate.candidateId,
      draftId: preview.draft.draftId,
      baseRevision: preview.draft.revision,
      selection,
    });
    setPending(false);
    if (outcome.state !== 'success') {
      if (outcome.state === 'failure') setStatus(`采用失败 · ${outcome.error.code}`);
      return;
    }
    if (outcome.data.outcome === 'conflict') {
      setConflicts(outcome.data.conflictSet.conflicts);
      setStatus(`发现${outcome.data.conflictSet.conflicts.length}项冲突，Draft未改变。`);
      return;
    }
    onDraftReplace(outcome.data.draft, `采用成功 · Revision ${outcome.data.draft.revision}`);
    const nextPreview: CandidatePreview = {
      ...preview,
      candidate: {
        ...preview.candidate,
        status: 'accepted',
        resolvedAt: outcome.data.record.appliedAt,
      },
      draft: outcome.data.draft,
    };
    setPreview(nextPreview);
    await loadUndo(nextPreview);
    await refreshList();
    setStatus(`采用成功 · ApplyRecord ${outcome.data.record.applyRecordId.slice(0, 8)}…`);
  };

  const undo = async (): Promise<void> => {
    if (!undoPreview || readOnly) return;
    const fresh = await bridge.candidateAction.previewUndo({
      projectId: project.projectId,
      chapterId: chapter.id,
      applyRecordId: undoPreview.record.applyRecordId,
    });
    if (fresh.state !== 'success') return;
    if (!fresh.data.canUndo) {
      setConflicts(fresh.data.conflictSet?.conflicts ?? []);
      setStatus('当前稿已变化，撤销进入冲突且未修改Draft。');
      return;
    }
    const outcome = await bridge.candidateAction.undo({
      projectId: project.projectId,
      chapterId: chapter.id,
      applyRecordId: fresh.data.record.applyRecordId,
      draftId: fresh.data.currentDraft.draftId,
      baseRevision: fresh.data.currentDraft.revision,
    });
    if (outcome.state !== 'success') return;
    if (outcome.data.outcome === 'conflict') {
      setConflicts(outcome.data.conflictSet.conflicts);
      setStatus('撤销冲突，Draft未改变。');
      return;
    }
    const restoredDraft = outcome.data.draft;
    onDraftReplace(restoredDraft, `已撤销本次应用 · Revision ${restoredDraft.revision}`);
    setPreview((current) => (current ? { ...current, draft: restoredDraft } : current));
    setUndoPreview(null);
    setConflicts([]);
    setStatus('已撤销本次应用。');
  };

  return (
    <section className="candidate-workbench" data-candidate-preview-dialog>
      <header className="feature-card__heading">
        <div>
          <h2>Candidate预览、采用与撤销</h2>
          <p>结构差异和中文字符差异基于已保存Draft计算。</p>
        </div>
      </header>
      <div className="filter-bar">
        <select
          aria-label="选择候选稿"
          data-candidate-preview-select
          value={candidateId}
          onChange={(event) => {
            setCandidateId(event.target.value);
            void loadPreview(event.target.value);
          }}
        >
          {candidates.map((candidate) => (
            <option
              data-status={candidate.status}
              key={candidate.candidateId}
              value={candidate.candidateId}
            >
              {candidate.title} · {candidate.status}
            </option>
          ))}
        </select>
        <button
          data-cancel-candidate-preview
          type="button"
          disabled={!previewRequest.current}
          onClick={() => void cancel()}
        >
          取消计算
        </button>
        <button
          data-discard-candidate
          type="button"
          disabled={!preview || preview.candidate.status !== 'pending'}
          onClick={() => void discard()}
        >
          丢弃候选
        </button>
      </div>
      <p
        className="feature-status"
        data-candidate-preview-status
        data-candidate-apply-status
        role="status"
      >
        {status}
      </p>
      {preview?.candidate.completeness === 'partial' ? (
        <p className="safety-inline" data-candidate-preview-warning>
          不完整建议稿只能按块或SceneBeat采用，不能整稿替换。
        </p>
      ) : null}
      {preview ? (
        <>
          <div className="candidate-summary">
            <span>结构差异 {preview.structure.length}</span>
            <span>字符差异块 {preview.characterDiffs.length}</span>
            <span>{preview.execution.chapterCharacters}字符</span>
          </div>
          <div className="candidate-compare-grid">
            <pre data-candidate-preview-current>
              <strong>当前已保存稿</strong>
              {'\n\n'}
              {preview.draft.blocks.map((block) => block.text).join('\n\n')}
            </pre>
            <pre data-candidate-preview-candidate>
              <strong>候选稿</strong>
              {'\n\n'}
              {preview.candidate.blocks.map((block) => block.text).join('\n\n')}
            </pre>
          </div>
          <div className="candidate-apply-panel" data-candidate-apply-panel>
            <label>
              采用范围
              <select
                data-candidate-apply-mode
                value={selectionMode}
                onChange={(event) => setSelectionMode(event.target.value as typeof selectionMode)}
              >
                <option value="all" disabled={preview.candidate.completeness === 'partial'}>
                  整稿
                </option>
                <option value="blocks">按块</option>
                <option value="scene-beats">按SceneBeat</option>
              </select>
            </label>
            {selectionMode === 'blocks' ? (
              <div className="candidate-choice-list">
                {preview.candidate.blocks.map((block, index) => (
                  <label key={block.candidateBlockId}>
                    <input
                      type="checkbox"
                      checked={selectedBlocks.has(block.candidateBlockId)}
                      onChange={(event) =>
                        setSelectedBlocks(
                          toggleSet(selectedBlocks, block.candidateBlockId, event.target.checked),
                        )
                      }
                    />
                    块 {index + 1} · {block.text.slice(0, 80)}
                  </label>
                ))}
              </div>
            ) : null}
            {selectionMode === 'scene-beats' ? (
              <div className="candidate-choice-list">
                {[
                  ...new Set(
                    preview.candidate.blocks.flatMap((block) =>
                      block.beatId ? [block.beatId] : [],
                    ),
                  ),
                ].map((beatId) => (
                  <label key={beatId}>
                    <input
                      type="checkbox"
                      checked={selectedBeats.has(beatId)}
                      onChange={(event) =>
                        setSelectedBeats(toggleSet(selectedBeats, beatId, event.target.checked))
                      }
                    />
                    {beatId}
                  </label>
                ))}
              </div>
            ) : null}
            <div className="inline-actions">
              <button
                className="primary-button"
                data-apply-candidate
                disabled={
                  !selection || pending || readOnly || preview.candidate.status !== 'pending'
                }
                type="button"
                onClick={() => void apply()}
              >
                采用所选内容
              </button>
              <button
                data-undo-candidate-apply
                disabled={!undoPreview?.canUndo || readOnly}
                type="button"
                onClick={() => void undo()}
              >
                撤销本次应用
              </button>
            </div>
          </div>
        </>
      ) : null}
      {conflicts.length ? (
        <ul className="candidate-conflicts" data-candidate-conflict-list aria-label="候选内容冲突">
          {conflicts.map((conflict, index) => (
            <li key={`${conflict.kind}-${index}`}>
              {conflict.kind} · {conflict.message}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function toggleSet(source: Set<string>, value: string, included: boolean): Set<string> {
  const next = new Set(source);
  if (included) next.add(value);
  else next.delete(value);
  return next;
}

function nullableText(value: FormDataEntryValue | null): string | null {
  const result = String(value ?? '').trim();
  return result || null;
}

function temporaryClientBlockId(): string {
  return `temporary-${globalThis.crypto.randomUUID()}`;
}

function sanitizePastedHtml(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  parsed
    .querySelectorAll(
      'script, style, noscript, template, iframe, object, embed, svg, canvas, [hidden], [aria-hidden="true"]',
    )
    .forEach((element) => element.remove());
  parsed.querySelectorAll<HTMLElement>('[style]').forEach((element) => {
    if (/\b(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/iu.test(element.style.cssText)) {
      element.remove();
    }
  });
  const clean = document.createElement('div');
  const appendTextBlock = (tag: 'p' | 'blockquote' | `h${number}`, value: string): void => {
    const element = document.createElement(tag);
    element.textContent = value;
    clean.append(element);
  };
  const visit = (root: ParentNode): void => {
    for (const child of root.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const value = child.textContent?.trim() ?? '';
        if (value) appendTextBlock('p', value);
        continue;
      }
      if (!(child instanceof HTMLElement)) continue;
      const tag = child.tagName.toLowerCase();
      if (/^h[1-6]$/u.test(tag)) appendTextBlock(tag as `h${number}`, child.textContent ?? '');
      else if (tag === 'blockquote') appendTextBlock('blockquote', child.textContent ?? '');
      else if (tag === 'hr') clean.append(document.createElement('hr'));
      else if (tag === 'p' || tag === 'li' || tag === 'pre')
        appendTextBlock('p', child.textContent ?? '');
      else if (child.querySelector('p, li, blockquote, h1, h2, h3, h4, h5, h6, hr')) visit(child);
      else if ((child.textContent ?? '').trim()) appendTextBlock('p', child.textContent ?? '');
    }
  };
  visit(parsed.body);
  if (!clean.hasChildNodes()) clean.append(document.createElement('p'));
  const serializer = new XMLSerializer();
  return Array.from(clean.childNodes, (node) => serializer.serializeToString(node)).join('');
}
