import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import type {
  CandidateConflictItem,
  CandidateDocument,
  CandidatePreview,
  CandidateSelection,
  CandidateSummary,
  GenerationIntent,
  GenerationRun,
  MergeSourceMapping,
  ProviderSummary,
  RewriteSelectionAnchor,
  SceneBeat,
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
import { registerDraftFlushHandler } from '../../runtime/draft-flush-registry.js';
import type { AppDisclosureMode } from '../../shell/app-shell-model.js';
import type { AuthorNavigationTarget } from '../../shell/navigation-target.js';
import { StructureNavigator } from '../planning/planning-workbench.js';
import { WritingAssistancePanel } from './writing-assistance-panel.js';
import { ReviewDiffPanel } from './review-diff-panel.js';
import {
  candidateCompletenessLabel,
  candidateStatusLabel,
  candidateTypeLabel,
  groupCandidatesForReview,
  sceneBeatReviewLabel,
} from './review-diff.js';
import {
  ContinuationPersistenceTracker,
  derivePanelSwitchInput,
} from './continuation-persistence.js';

import { authorErrorSummary } from '../../presentation/author-error-message.js';
export type WritingPanel = 'editor' | 'versions' | 'candidates';

interface WritingWorkbenchProps {
  readonly bridge: RendererBridgeAdapter;
  readonly disclosureMode: AppDisclosureMode;
  readonly project: ProjectWorkspaceSummary;
  readonly initialContinuation: ProjectContinuationSnapshot | null;
  readonly panel: WritingPanel;
  readonly navigationChapterId?: string | null;
  readonly navigationLogicalBlockId?: string | null;
  readonly navigationVersionId?: string | null;
  readonly navigationQuery?: string | null;
  readonly onNavigate: (target: AuthorNavigationTarget) => void;
  readonly onPanelChange: (panel: WritingPanel) => void;
  readonly onStatus: (message: string) => void;
  readonly statusNotice?: string | null;
  readonly onStatusNoticeConsumed?: () => void;
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

function savedStatus(label: string, revision: number, disclosureMode: AppDisclosureMode): string {
  return disclosureMode === 'beginner' ? label : `${label} · 保存序号 ${revision}`;
}

interface PersistedEditorSelection {
  readonly from: number;
  readonly to: number;
  readonly anchorPath?: readonly number[];
  readonly anchorOffset?: number;
  readonly focusPath?: readonly number[];
  readonly focusOffset?: number;
}

const persistedSelectionByChapter = new Map<string, PersistedEditorSelection>();

async function sha256Text(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function captureRewriteSelectionAnchor(
  instance: Editor,
  projectId: string,
  chapter: Chapter,
  draft: DraftDocument,
): Promise<RewriteSelectionAnchor | null> {
  const selection = instance.state.selection;
  if (selection.empty) return null;
  const blockAt = (position: typeof selection.$from) => {
    for (let depth = position.depth; depth >= 1; depth -= 1) {
      const node = position.node(depth);
      const attributes = node.attrs as Record<string, unknown>;
      if (
        typeof attributes.logicalBlockId === 'string' &&
        typeof attributes.contentHash === 'string'
      ) {
        return { depth, node, attributes };
      }
    }
    return null;
  };
  const start = blockAt(selection.$from);
  const end = blockAt(selection.$to);
  if (
    !start ||
    !end ||
    start.attributes.logicalBlockId !== end.attributes.logicalBlockId ||
    start.attributes.locked === true
  ) {
    return null;
  }
  const selectionStart = selection.from - selection.$from.start(start.depth);
  const selectionEnd = selection.to - selection.$to.start(end.depth);
  const selectedText = start.node.textContent.slice(selectionStart, selectionEnd);
  if (!selectedText) return null;
  return {
    projectId,
    chapterId: chapter.id,
    draftId: draft.draftId,
    baseRevision: draft.revision,
    logicalBlockId: String(start.attributes.logicalBlockId),
    expectedBlockHash: String(start.attributes.contentHash),
    selectionStart,
    selectionEnd,
    selectedTextHash: await sha256Text(selectedText),
  };
}

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
  disclosureMode,
  project,
  initialContinuation,
  panel,
  navigationChapterId,
  navigationLogicalBlockId,
  navigationVersionId,
  navigationQuery,
  onNavigate,
  onPanelChange,
  onStatus,
  statusNotice,
  onStatusNoticeConsumed,
}: WritingWorkbenchProps) {
  const readOnly = project.databaseMode !== 'read-write';
  const editorHost = useRef<HTMLDivElement>(null);
  const editor = useRef<Editor | null>(null);
  const autosave = useRef<DraftAutosaveCoordinator | null>(null);
  const activeDraft = useRef<DraftDocument | null>(null);
  const activeChapter = useRef<Chapter | null>(null);
  const editorGeneration = useRef(0);
  const composing = useRef(false);
  const synchronizing = useRef(false);
  const initialChapterRequested = useRef(false);
  const handledNavigationKey = useRef<string | null>(null);
  const continuationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const continuationScrollCleanup = useRef<(() => void) | null>(null);
  const [continuationPersistence] = useState(
    () => new ContinuationPersistenceTracker<ProjectContinuationInput>(),
  );
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

  useEffect(() => {
    if (!statusNotice || panel !== 'editor' || !editorReady) return;
    setStatus(statusNotice);
    onStatusNoticeConsumed?.();
  }, [editorReady, onStatusNoticeConsumed, panel, setStatus, statusNotice]);

  useEffect(() => {
    if (panel !== 'editor' || !editorReady || !navigationLogicalBlockId) return;
    const target = Array.from(
      editorHost.current?.querySelectorAll<HTMLElement>('[data-logical-block-id]') ?? [],
    ).find((element) => element.dataset.logicalBlockId === navigationLogicalBlockId);
    if (!target) {
      setStatus('目标段落已经变化，系统没有跳转到可能错误的位置。请在当前章节重新搜索。');
      return;
    }
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target.dataset.navigationHighlight = 'true';
    if (navigationQuery) setFindText(navigationQuery);
    const timer = window.setTimeout(() => {
      delete target.dataset.navigationHighlight;
    }, 2_400);
    return () => window.clearTimeout(timer);
  }, [editorReady, navigationLogicalBlockId, navigationQuery, panel, setStatus]);

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
        clientBlockId: block.clientBlockId ?? null,
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
    if (continuationPersistence.isCommitted(input)) return true;
    const outcome = await bridge.project.saveContinuation(input, { mode: 'replace' });
    if (outcome.state !== 'success') return false;
    continuationPersistence.commit(input);
    return true;
  }, [bridge, continuationPersistence, panel, project.projectId, readOnly]);

  const scheduleContinuationSave = useCallback((): void => {
    if (readOnly) return;
    if (continuationTimer.current) clearTimeout(continuationTimer.current);
    continuationTimer.current = setTimeout(() => {
      continuationTimer.current = null;
      void saveContinuation();
    }, 500);
  }, [readOnly, saveContinuation]);

  useEffect(() => {
    if (readOnly) return;
    const next = derivePanelSwitchInput(continuationPersistence.committedInput(), panel);
    if (!next) return;
    void bridge.project.saveContinuation(next, { mode: 'replace' }).then((outcome) => {
      if (outcome.state === 'success') {
        continuationPersistence.commit(next);
        return;
      }
      // A genuine failure leaves the tracker uncommitted, so the same panel
      // state stays eligible for re-submission; schedule one bounded retry
      // through the canonical debounced save instead of dropping it.
      if (outcome.state === 'failure') scheduleContinuationSave();
    });
  }, [bridge, continuationPersistence, panel, readOnly, scheduleContinuationSave]);

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
      const saveContext = {
        projectId: project.projectId,
        chapterId: currentChapter.id,
        draftId: currentDraft.draftId,
        baseRevision: currentDraft.revision,
        editorGeneration: editorGeneration.current,
        documentFingerprint: signature,
        blockIdentityMap: new Map(
          nextBlocks.map((block) => [block.clientBlockId, block.logicalBlockId]),
        ),
        requestSnapshot: nextBlocks,
        requestedAt: Date.now(),
      };
      const operations = buildDraftPatchOperations(persistedBlocks(currentDraft), nextBlocks);
      if (operations.length === 0) return true;
      const result = await bridge.draft.applyPatch({
        projectId: saveContext.projectId,
        chapterId: saveContext.chapterId,
        draftId: saveContext.draftId,
        baseRevision: saveContext.baseRevision,
        operations,
      });
      if (result.state !== 'success') {
        setStatus(
          result.state === 'failure'
            ? authorErrorSummary(result.error)
            : '保存请求已取消；当前窗口内容仍保留。',
          true,
        );
        return false;
      }
      if (
        activeChapter.current?.id !== saveContext.chapterId ||
        activeDraft.current?.draftId !== saveContext.draftId ||
        editor.current !== instance ||
        editorGeneration.current !== saveContext.editorGeneration
      ) {
        return true;
      }
      activeDraft.current = result.data;
      setDraft(result.data);
      synchronizing.current = true;
      synchronizePersistedBlockMetadata(
        instance,
        persistedBlocks(result.data),
        saveContext.requestSnapshot,
      );
      synchronizing.current = false;
      refreshStatistics();
      await saveContinuation();
      setStatus(
        `${savedStatus('已保存', result.data.revision, disclosureMode)}${JSON.stringify(instance.getJSON()) === saveContext.documentFingerprint ? '' : ' · 编辑器仍有新输入'}`,
      );
      return true;
    } catch {
      synchronizing.current = false;
      return false;
    }
  }, [
    bridge,
    disclosureMode,
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
        ? savedStatus('已保存', activeDraft.current?.revision ?? 0, disclosureMode)
        : '保存失败；窗口内容仍保留。',
      !result || !continuationSaved,
    );
    return result && continuationSaved;
  }, [disclosureMode, saveContinuation, setStatus]);

  useEffect(() => {
    return registerDraftFlushHandler(flush);
  }, [flush]);

  const rememberCurrentSelection = useCallback((): void => {
    const instance = editor.current;
    const currentChapter = activeChapter.current;
    if (!instance || !currentChapter) return;
    persistEditorSelection(project.projectId, currentChapter.id, instance);
  }, [project.projectId]);

  const toggleFocusMode = useCallback((): void => {
    setFocusMode((enabled) => !enabled);
    window.requestAnimationFrame(() => {
      const instance = editor.current;
      const currentChapter = activeChapter.current;
      if (!instance || !currentChapter) return;
      const remembered = persistedSelectionByChapter.get(
        selectionKey(project.projectId, currentChapter.id),
      );
      if (remembered) restoreEditorSelection(instance, remembered);
    });
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
      editorGeneration.current += 1;
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
        setStatus('当前稿已更新；返回正文后重建编辑器。');
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
            setStatus(
              savedStatus('自动保存完成', activeDraft.current?.revision ?? 0, disclosureMode),
            );
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
      setStatus(readOnly ? '只读浏览：可以选择和复制，写入已禁用。' : '已从正文块重建。');
    },
    [
      destroyEditor,
      disclosureMode,
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
      setStatus('正在从作品数据库读取正文…');
      const outcome = await bridge.draft.open(
        { projectId: project.projectId, chapterId: nextChapter.id },
        { mode: 'replace' },
      );
      if (activeChapter.current?.id !== nextChapter.id) return;
      if (outcome.state !== 'success') {
        setStatus(
          outcome.state === 'failure'
            ? `正文读取失败 · ${authorErrorSummary(outcome.error)}`
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
    let active = true;
    void bridge.planning.listStructure(project.projectId, { mode: 'replace' }).then((outcome) => {
      if (!active || outcome.state !== 'success' || initialChapterRequested.current) return;
      initialChapterRequested.current = true;
      const chapters = outcome.data.volumes.flatMap((volume) => volume.chapters);
      const requestedChapter = navigationChapterId
        ? chapters.find((candidate) => candidate.id === navigationChapterId)
        : undefined;
      const continuedChapter =
        initialContinuation?.status === 'ready'
          ? chapters.find((candidate) => candidate.id === initialContinuation.chapterId)
          : undefined;
      const nextChapter = requestedChapter ?? continuedChapter ?? chapters[0];
      if (requestedChapter) {
        handledNavigationKey.current = navigationKey(
          panel,
          navigationChapterId,
          navigationLogicalBlockId,
          navigationVersionId,
        );
      }
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
  }, [
    bridge,
    initialContinuation,
    navigationChapterId,
    navigationLogicalBlockId,
    navigationVersionId,
    onStatus,
    openChapter,
    panel,
    project.projectId,
  ]);

  useEffect(() => {
    if (!navigationChapterId || !initialChapterRequested.current) return;
    const key = navigationKey(
      panel,
      navigationChapterId,
      navigationLogicalBlockId,
      navigationVersionId,
    );
    if (handledNavigationKey.current === key) return;
    handledNavigationKey.current = key;
    if (activeChapter.current?.id === navigationChapterId) return;
    let active = true;
    void bridge.planning.listStructure(project.projectId, { mode: 'replace' }).then((outcome) => {
      if (!active || outcome.state !== 'success') return;
      const requested = outcome.data.volumes
        .flatMap((volume) => volume.chapters)
        .find((candidate) => candidate.id === navigationChapterId);
      if (!requested) {
        setStatus('目标章节已经变化，系统没有跳转到可能错误的位置。');
        return;
      }
      void openChapter(requested);
    });
    return () => {
      active = false;
    };
  }, [
    bridge,
    navigationChapterId,
    navigationLogicalBlockId,
    navigationVersionId,
    openChapter,
    panel,
    project.projectId,
    setStatus,
  ]);

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
    setStatus(savedStatus('已手动保存', activeDraft.current?.revision ?? 0, disclosureMode));
  }, [disclosureMode, flush, setStatus]);

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
          <p>正文、历史版本和建议稿都保存在当前作品中；采用前可预览，保存后可追溯。</p>
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
            建议稿
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
            {contextVisible ? '收起写作辅助' : '展开写作辅助'}
          </button>
          <button
            aria-pressed={focusMode}
            data-toggle-focus-mode
            type="button"
            onPointerDownCapture={rememberCurrentSelection}
            onClick={toggleFocusMode}
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
              navigationVersionId={navigationVersionId ?? null}
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
              onClose={() => onPanelChange('editor')}
              getRewriteSelectionAnchor={() => {
                const instance = editor.current;
                return instance
                  ? captureRewriteSelectionAnchor(instance, project.projectId, chapter, draft)
                  : Promise.resolve(null);
              }}
            />
          ) : null}
        </main>

        {contextVisible && !focusMode && chapter ? (
          <WritingAssistancePanel
            bridge={bridge}
            projectId={project.projectId}
            chapterId={chapter.id}
            savedRevision={draft?.revision ?? null}
            readOnly={readOnly}
            onNavigate={onNavigate}
          />
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
  navigationVersionId,
  flush,
  onClose,
  onDraftReplace,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly chapter: Chapter;
  readonly draft: DraftDocument;
  readonly project: ProjectWorkspaceSummary;
  readonly navigationVersionId?: string | null;
  readonly flush: () => Promise<boolean>;
  readonly onClose: () => void;
  readonly onDraftReplace: (draft: DraftDocument, message: string) => void;
}) {
  const readOnly = project.databaseMode !== 'read-write';
  const [versions, setVersions] = useState<readonly VersionSummary[]>([]);
  const [selected, setSelected] = useState<VersionDocument | null>(null);
  const [status, setStatus] = useState('历史版本只读不可变；恢复会创建新的当前稿。');
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    const outcome = await bridge.version.list(project.projectId, chapter.id, { mode: 'replace' });
    if (outcome.state === 'success') setVersions(outcome.data.versions);
    else if (outcome.state === 'failure')
      setStatus(`版本读取失败 · ${authorErrorSummary(outcome.error)}`);
  }, [bridge, chapter.id, project.projectId]);

  useEffect(() => void refresh(), [refresh]);

  useEffect(() => {
    if (!navigationVersionId) return;
    void bridge.version
      .get(
        {
          projectId: project.projectId,
          chapterId: chapter.id,
          versionId: navigationVersionId,
        },
        { mode: 'replace' },
      )
      .then((outcome) => {
        if (outcome.state === 'success') {
          setSelected(outcome.data);
          setStatus(`正在比较：${outcome.data.title}`);
        } else if (outcome.state === 'failure') {
          setStatus('目标历史版本已经变化，请重新搜索。');
        }
      });
  }, [bridge, chapter.id, navigationVersionId, project.projectId]);

  const create = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    const form = event.currentTarget;
    event.preventDefault();
    if (readOnly || !(await flush())) {
      setStatus('自动保存失败，未创建历史版本。');
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
      setStatus(
        outcome.state === 'failure'
          ? `创建失败 · ${authorErrorSummary(outcome.error)}`
          : '创建已取消。',
      );
      return;
    }
    form.reset();
    setStatus(`历史版本“${outcome.data.title}”已创建，内容不可修改。`);
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
    } else if (outcome.state === 'failure')
      setStatus(`预览失败 · ${authorErrorSummary(outcome.error)}`);
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
    } else if (outcome.state === 'failure')
      setStatus(`定稿失败 · ${authorErrorSummary(outcome.error)}`);
  };

  const restore = async (versionId: string): Promise<void> => {
    if (readOnly || !(await flush())) return;
    const outcome = await bridge.version.restore({
      projectId: project.projectId,
      chapterId: chapter.id,
      versionId,
    });
    if (outcome.state === 'success') {
      onDraftReplace(outcome.data, '已从只读历史版本恢复为新当前稿。');
      setStatus('恢复成功；原历史版本与原当前稿记录保持不变。');
    } else if (outcome.state === 'failure')
      setStatus(`恢复失败 · ${authorErrorSummary(outcome.error)}`);
  };

  return (
    <section className="version-workbench" data-version-dialog>
      <header className="feature-card__heading">
        <div>
          <h2>历史版本与比较</h2>
          <p>历史版本不可变；左侧为当前已保存正文，右侧为选中的历史版本。</p>
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
          创建历史版本
        </button>
      </form>
      <p className="feature-status" data-version-status role="status">
        {status}
      </p>
      <div className="version-history-layout">
        <div className="version-list">
          {versions.length === 0 ? (
            <p>还没有手动保存的历史版本。</p>
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
                    {version.wordCount}字 · 保存序号 {version.sourceRevision}
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
                    恢复为新当前稿
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
        <ReviewDiffPanel
          comparisonText={selected?.blocks.map((block) => block.text).join('\n\n') ?? ''}
          comparisonTitle={selected?.title ?? '选择历史版本比较'}
          currentText={draft.blocks.map((block) => block.text).join('\n\n')}
          currentTitle="当前已保存稿"
          marker="version"
        />
      </div>
    </section>
  );
}

function navigationKey(
  panel: WritingPanel,
  chapterId: string | null | undefined,
  logicalBlockId: string | null | undefined,
  versionId: string | null | undefined,
): string {
  return [panel, chapterId ?? '', logicalBlockId ?? '', versionId ?? ''].join(':');
}

function CandidatePanel({
  bridge,
  chapter,
  draft,
  project,
  flush,
  onDraftReplace,
  onClose,
  getRewriteSelectionAnchor,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly chapter: Chapter;
  readonly draft: DraftDocument;
  readonly project: ProjectWorkspaceSummary;
  readonly flush: () => Promise<boolean>;
  readonly onDraftReplace: (draft: DraftDocument, message: string) => void;
  readonly onClose: () => void;
  readonly getRewriteSelectionAnchor: () => Promise<RewriteSelectionAnchor | null>;
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
    `预览只读取已保存的当前稿（保存序号 ${draft.revision}），不会写入作品数据库。`,
  );
  const [pending, setPending] = useState(false);
  const previewRequest = useRef<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<CandidateDocument | null>(null);
  const [providers, setProviders] = useState<readonly ProviderSummary[]>([]);
  const [providerId, setProviderId] = useState('');
  const [sceneBeats, setSceneBeats] = useState<readonly SceneBeat[]>([]);
  const [generationMode, setGenerationMode] = useState<
    'skeleton' | 'chapter' | 'rewrite' | 'merge'
  >('chapter');
  const [chapterSource, setChapterSource] = useState<
    'direct_chapter_goal' | 'skeleton_candidate' | 'canonical_scene_beats'
  >('direct_chapter_goal');
  const [chapterGoal, setChapterGoal] = useState('');
  const [tendency, setTendency] = useState('悬疑推进');
  const [generationInstruction, setGenerationInstruction] = useState('');
  const [targetCharacters, setTargetCharacters] = useState(3_000);
  const [candidateCount, setCandidateCount] = useState(3);
  const [selectedSkeletonId, setSelectedSkeletonId] = useState('');
  const [acknowledgeStaleSkeleton, setAcknowledgeStaleSkeleton] = useState(false);
  const [mergeCandidateIds, setMergeCandidateIds] = useState<Set<string>>(new Set());
  const [mergeMappingMode, setMergeMappingMode] = useState<'beat' | 'segment'>(
    sceneBeats.length ? 'beat' : 'segment',
  );
  const [mergeBeatSources, setMergeBeatSources] = useState<Record<string, string>>({});
  const [activeRun, setActiveRun] = useState<GenerationRun | null>(null);
  const [selectedRun, setSelectedRun] = useState<GenerationRun | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [generationStatus, setGenerationStatus] = useState('选择AI连接后可生成建议稿。');
  const [skeletonEndingHook, setSkeletonEndingHook] = useState('');
  const [skeletonTendency, setSkeletonTendency] = useState('');
  const [lastGenerationIntent, setLastGenerationIntent] = useState<GenerationIntent | null>(null);

  const refreshList = useCallback(async (): Promise<readonly CandidateSummary[]> => {
    const outcome = await bridge.candidate.list(project.projectId, chapter.id, {
      mode: 'replace',
    });
    if (outcome.state !== 'success') {
      if (outcome.state === 'failure')
        setStatus(`建议稿列表读取失败 · ${authorErrorSummary(outcome.error)}`);
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
              : `预览失败 · ${authorErrorSummary(outcome.error)}`
            : outcome.state === 'cancelled'
              ? '差异计算已取消。'
              : '预览已被更新请求替代。',
        );
        return;
      }
      setPreview(outcome.data);
      setSelectedDocument(outcome.data.candidate);
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
          ? `可整体撤销 · 基础保存序号 ${outcome.data.candidate.baseDraftRevision}`
          : `已准备采用 · 基础保存序号 ${outcome.data.candidate.baseDraftRevision}`,
      );
    },
    [bridge, chapter.id, loadUndo, project.projectId],
  );

  const loadCandidate = useCallback(
    async (nextCandidateId: string): Promise<void> => {
      if (!nextCandidateId) return;
      const outcome = await bridge.candidate.get({
        projectId: project.projectId,
        chapterId: chapter.id,
        candidateId: nextCandidateId,
      });
      if (outcome.state !== 'success') {
        if (outcome.state === 'failure')
          setStatus(`建议稿读取失败 · ${authorErrorSummary(outcome.error)}`);
        return;
      }
      setSelectedDocument(outcome.data);
      if (outcome.data.generationRunId) {
        const runOutcome = await bridge.generation.getRun(
          project.projectId,
          outcome.data.generationRunId,
        );
        setSelectedRun(runOutcome.state === 'success' ? runOutcome.data : null);
      } else {
        setSelectedRun(null);
      }
      if (outcome.data.candidateType === 'skeleton') {
        setPreview(null);
        setUndoPreview(null);
        setConflicts([]);
        setSelectedSkeletonId(outcome.data.candidateId);
        setSkeletonEndingHook(outcome.data.structuredPayload.endingHook);
        setSkeletonTendency(outcome.data.structuredPayload.tendency);
        setStatus(
          outcome.data.sourceState === 'stale'
            ? '骨架来源已变化；进入T1前需要明确确认或重新生成。'
            : `骨架修订 ${outcome.data.skeletonRevision} · 可编辑或作为T1来源。`,
        );
        return;
      }
      await loadPreview(nextCandidateId);
    },
    [bridge, chapter.id, loadPreview, project.projectId],
  );

  useEffect(() => {
    void refreshList().then((items) => {
      const first = items[0];
      if (!first) {
        setCandidateId('');
        setPreview(null);
        setStatus('当前章节没有建议稿。');
        return;
      }
      setCandidateId(first.candidateId);
      void loadCandidate(first.candidateId);
    });
    return () => {
      const requestId = previewRequest.current;
      if (requestId) void bridge.candidateAction.cancelPreview(requestId);
    };
  }, [bridge, loadCandidate, refreshList]);

  useEffect(() => {
    void Promise.all([
      bridge.providers.list(),
      bridge.planning.listSceneBeats({
        projectId: project.projectId,
        chapterId: chapter.id,
      }),
    ]).then(([providerOutcome, beatOutcome]) => {
      if (providerOutcome.state === 'success') {
        setProviders(providerOutcome.data.providers);
        setProviderId((current) => current || providerOutcome.data.providers[0]?.id || '');
      }
      if (beatOutcome.state === 'success') {
        setSceneBeats(beatOutcome.data.beats);
        setMergeMappingMode(beatOutcome.data.beats.length ? 'beat' : 'segment');
      }
    });
  }, [bridge, chapter.id, project.projectId]);

  const refreshActiveRun = useCallback(async (): Promise<void> => {
    if (!activeRun) return;
    const outcome = await bridge.generation.getRun(project.projectId, activeRun.runId);
    if (outcome.state !== 'success') return;
    setActiveRun(outcome.data);
    setGenerationStatus(
      `${outcome.data.stage} · ${outcome.data.status}${
        outcome.data.outputTokens === null ? '' : ` · 输出 ${outcome.data.outputTokens} tokens`
      }`,
    );
    if (
      outcome.data.status === 'succeeded' ||
      outcome.data.status === 'failed' ||
      outcome.data.status === 'cancelled'
    ) {
      setActiveTaskId(null);
      const items = await refreshList();
      const firstResult = outcome.data.resultRefs.find(
        (result) => result.resultType === 'candidate',
      );
      const candidate = firstResult
        ? items.find((item) => item.candidateId === firstResult.resultId)
        : undefined;
      if (candidate) {
        setCandidateId(candidate.candidateId);
        await loadCandidate(candidate.candidateId);
      }
    }
  }, [activeRun, bridge, loadCandidate, project.projectId, refreshList]);

  useEffect(() => {
    if (!activeTaskId) return;
    const unsubscribe = bridge.task.subscribe((update) => {
      const taskId = update.kind === 'event' ? update.event.taskId : update.snapshot.taskId;
      if (taskId !== activeTaskId) return;
      if (update.kind === 'event') {
        if (update.event.type === 'ai.stage') {
          setGenerationStatus(`${update.event.payload.message} · ${update.event.payload.stage}`);
        } else if (update.event.type === 'ai.delta') {
          setGenerationStatus(`正在接收建议稿 · ${update.event.payload.receivedChars} 字符`);
        } else if (
          update.event.type === 'ai.completed' ||
          update.event.type === 'ai.failed' ||
          update.event.type === 'ai.cancelled'
        ) {
          void refreshActiveRun();
        }
      } else {
        setGenerationStatus(
          `${update.snapshot.stage} · ${update.snapshot.status} · ${update.snapshot.receivedChars} 字符`,
        );
        if (
          update.snapshot.status === 'succeeded' ||
          update.snapshot.status === 'failed' ||
          update.snapshot.status === 'cancelled'
        ) {
          void refreshActiveRun();
        }
      }
    }, project.projectId);
    const timer = setInterval(() => void refreshActiveRun(), 1_000);
    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [activeTaskId, bridge, project.projectId, refreshActiveRun]);

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
      !selectedDocument ||
      selectedDocument.status !== 'pending' ||
      !window.confirm('丢弃后不能再采用，当前稿不会改变。继续吗？')
    )
      return;
    const outcome = await bridge.candidate.discard({
      projectId: project.projectId,
      chapterId: chapter.id,
      candidateId: selectedDocument.candidateId,
    });
    if (outcome.state === 'success') {
      setSelectedDocument((current) =>
        current
          ? { ...current, status: outcome.data.status, resolvedAt: outcome.data.resolvedAt }
          : current,
      );
      setPreview((current) =>
        current
          ? {
              ...current,
              candidate: {
                ...current.candidate,
                status: outcome.data.status,
                resolvedAt: outcome.data.resolvedAt,
              },
            }
          : current,
      );
      await refreshList();
      setStatus('建议稿已丢弃，当前稿未改变。');
    } else if (outcome.state === 'failure')
      setStatus(`丢弃失败 · ${authorErrorSummary(outcome.error)}`);
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
      if (outcome.state === 'failure') setStatus(`采用失败 · ${authorErrorSummary(outcome.error)}`);
      return;
    }
    if (outcome.data.outcome === 'conflict') {
      setConflicts(outcome.data.conflictSet.conflicts);
      setStatus(`发现${outcome.data.conflictSet.conflicts.length}项冲突，当前稿未改变。`);
      return;
    }
    onDraftReplace(outcome.data.draft, `采用成功 · 保存序号 ${outcome.data.draft.revision}`);
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
    setStatus(`采用成功 · 采用记录 ${outcome.data.record.applyRecordId.slice(0, 8)}…`);
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
      setStatus('当前稿已变化，撤销进入冲突且未修改正文。');
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
      setStatus('撤销冲突，当前稿未改变。');
      return;
    }
    const restoredDraft = outcome.data.draft;
    onDraftReplace(restoredDraft, `已撤销本次应用 · 保存序号 ${restoredDraft.revision}`);
    setPreview((current) => (current ? { ...current, draft: restoredDraft } : current));
    setUndoPreview(null);
    setConflicts([]);
    setStatus('已撤销本次应用。');
  };

  const skeletonCandidates = candidates.filter(
    (candidate): candidate is Extract<CandidateSummary, { candidateType: 'skeleton' }> =>
      candidate.candidateType === 'skeleton' && candidate.status !== 'discarded',
  );
  const proseCandidates = candidates.filter(
    (candidate) => candidate.candidateType !== 'skeleton' && candidate.status !== 'discarded',
  );
  const reviewGroups = useMemo(() => groupCandidatesForReview(candidates), [candidates]);

  const startGeneration = async (
    continuationOfRunId: string | null = null,
    intentOverride: GenerationIntent | null = null,
  ): Promise<void> => {
    if (!providerId || readOnly || !(await flush())) return;
    if (
      !continuationOfRunId &&
      !intentOverride &&
      generationMode === 'skeleton' &&
      !chapterGoal.trim()
    ) {
      setGenerationStatus('请先填写本章目标。');
      return;
    }
    if (
      !continuationOfRunId &&
      !intentOverride &&
      generationMode === 'chapter' &&
      chapterSource === 'direct_chapter_goal' &&
      !chapterGoal.trim()
    ) {
      setGenerationStatus('直接生成正文需要本章目标。');
      return;
    }
    if (
      !continuationOfRunId &&
      !intentOverride &&
      generationMode === 'chapter' &&
      chapterSource === 'skeleton_candidate' &&
      !selectedSkeletonId
    ) {
      setGenerationStatus('请选择一个骨架候选。');
      return;
    }
    if (
      !continuationOfRunId &&
      !intentOverride &&
      generationMode === 'chapter' &&
      chapterSource === 'canonical_scene_beats' &&
      sceneBeats.length === 0
    ) {
      setGenerationStatus('当前章节没有可用于生成的场景节拍。');
      return;
    }
    if (
      !continuationOfRunId &&
      !intentOverride &&
      generationMode === 'rewrite' &&
      !generationInstruction.trim()
    ) {
      setGenerationStatus('请填写改写指令。');
      return;
    }
    setPending(true);
    setGenerationStatus('正在校验权威输入并组装约束…');
    let intent: GenerationIntent;
    if (intentOverride) {
      intent = intentOverride;
    } else if (continuationOfRunId) {
      intent = {
        runType: 'chapter',
        source: {
          sourceType: 'direct_chapter_goal',
          chapterGoal: chapterGoal.trim() || '从已保存的部分结果继续本章，不重复已有正文。',
        },
        targetLanguage: 'zh-CN',
        targetCharacters,
        styleInstructions: generationInstruction.trim() ? [generationInstruction.trim()] : [],
      };
    } else if (generationMode === 'skeleton') {
      intent = {
        runType: 'skeleton',
        chapterGoal: chapterGoal.trim(),
        tendency: tendency.trim(),
        targetLanguage: 'zh-CN',
        candidateCount,
        requiredSceneBeatIds: sceneBeats.filter((beat) => beat.required).map((beat) => beat.id),
      };
    } else if (generationMode === 'chapter') {
      intent = {
        runType: 'chapter',
        source:
          chapterSource === 'skeleton_candidate'
            ? {
                sourceType: 'skeleton_candidate',
                selectedSkeletonCandidateId: selectedSkeletonId,
                acknowledgeStaleSource: acknowledgeStaleSkeleton,
              }
            : chapterSource === 'canonical_scene_beats'
              ? {
                  sourceType: 'canonical_scene_beats',
                  sceneBeatIds: sceneBeats.map((beat) => beat.id),
                }
              : {
                  sourceType: 'direct_chapter_goal',
                  chapterGoal: chapterGoal.trim(),
                },
        targetLanguage: 'zh-CN',
        targetCharacters,
        styleInstructions: generationInstruction.trim() ? [generationInstruction.trim()] : [],
      };
    } else if (generationMode === 'rewrite') {
      const anchor = await getRewriteSelectionAnchor();
      const eligible = draft.blocks.filter((block) => !block.locked && block.contentHash);
      if (!anchor && eligible.length === 0) {
        setGenerationStatus('没有可改写的未锁定正文块。');
        setPending(false);
        return;
      }
      intent = {
        runType: 'rewrite',
        scope: anchor
          ? { scopeType: 'selection', anchor }
          : {
              scopeType: 'blocks',
              logicalBlockIds: eligible.map((block) => block.logicalBlockId),
              expectedBlockHashes: eligible.map((block) => block.contentHash!),
            },
        instruction: generationInstruction.trim(),
        targetLanguage: 'zh-CN',
      };
    } else {
      const chosenBeatSources = Object.entries(mergeBeatSources).filter(([, source]) => source);
      if (
        (mergeMappingMode === 'segment' && mergeCandidateIds.size < 2) ||
        (mergeMappingMode === 'beat' && chosenBeatSources.length < 2)
      ) {
        setGenerationStatus('融合至少需要两个明确的来源单元。');
        setPending(false);
        return;
      }
      const requestedCandidateIds =
        mergeMappingMode === 'beat'
          ? [
              ...new Set(
                chosenBeatSources.flatMap(([, source]) =>
                  source === 'current_draft' ? [] : [source],
                ),
              ),
            ]
          : [...mergeCandidateIds];
      const documents = await Promise.all(
        requestedCandidateIds.map((id) =>
          bridge.candidate.get({
            projectId: project.projectId,
            chapterId: chapter.id,
            candidateId: id,
          }),
        ),
      );
      if (
        documents.some(
          (outcome) => outcome.state !== 'success' || outcome.data.candidateType === 'skeleton',
        )
      ) {
        setGenerationStatus('融合来源读取失败或包含骨架。');
        setPending(false);
        return;
      }
      const documentsById = new Map(
        documents.flatMap((outcome) =>
          outcome.state === 'success' && outcome.data.candidateType !== 'skeleton'
            ? [[outcome.data.candidateId, outcome.data] as const]
            : [],
        ),
      );
      const mapping: MergeSourceMapping =
        mergeMappingMode === 'beat'
          ? {
              mappingType: 'beat',
              units: chosenBeatSources.map(([sceneBeatId, source]) =>
                source === 'current_draft'
                  ? {
                      sceneBeatId,
                      sourceCandidateId: null,
                      sourceBlockIds: [],
                      keepCurrentDraft: true,
                    }
                  : {
                      sceneBeatId,
                      sourceCandidateId: source,
                      sourceBlockIds:
                        documentsById
                          .get(source)
                          ?.blocks.filter((block) => block.beatId === sceneBeatId)
                          .map((block) => block.candidateBlockId) ?? [],
                      keepCurrentDraft: false,
                    },
              ),
            }
          : {
              mappingType: 'segment',
              units: documents.map((outcome, index) => {
                if (outcome.state !== 'success' || outcome.data.candidateType === 'skeleton') {
                  throw new Error('MERGE_SOURCE_INVALID');
                }
                return {
                  segmentId: crypto.randomUUID(),
                  sourceType: 'candidate' as const,
                  candidateId: outcome.data.candidateId,
                  sourceBlockIds: outcome.data.blocks.map((block) => block.candidateBlockId),
                  order: index + 1,
                };
              }),
            };
      if (
        mapping.mappingType === 'beat' &&
        mapping.units.some((unit) => !unit.keepCurrentDraft && unit.sourceBlockIds.length === 0)
      ) {
        setGenerationStatus('所选建议稿没有关联到对应场景节拍的正文块，请改用分段融合。');
        setPending(false);
        return;
      }
      intent = {
        runType: 'merge',
        mapping,
        ...(generationInstruction.trim() ? { instruction: generationInstruction.trim() } : {}),
        targetLanguage: 'zh-CN',
      };
    }
    setLastGenerationIntent(intent);
    const outcome = await bridge.generation.start({
      projectId: project.projectId,
      chapterId: chapter.id,
      baseDraftId: draft.draftId,
      baseDraftRevision: draft.revision,
      providerId,
      continuationOfRunId,
      intent,
    });
    setPending(false);
    if (outcome.state !== 'success') {
      setGenerationStatus(
        outcome.state === 'failure'
          ? `生成未启动 · ${authorErrorSummary(outcome.error)}`
          : '生成请求已取消或被新请求替代。',
      );
      return;
    }
    setActiveRun(outcome.data.run);
    setActiveTaskId(outcome.data.taskId);
    setGenerationStatus(`任务已启动 · ${outcome.data.run.stage}`);
  };

  const cancelGeneration = async (): Promise<void> => {
    if (!activeRun) return;
    const outcome = await bridge.generation.cancel({
      projectId: project.projectId,
      runId: activeRun.runId,
    });
    if (outcome.state === 'success') {
      setActiveRun(outcome.data);
      setGenerationStatus(
        outcome.data.partialStatus === 'available'
          ? '生成已取消；可保存或丢弃已收到的部分。'
          : '生成已取消。',
      );
    }
  };

  const decidePartial = async (decision: 'save' | 'discard'): Promise<void> => {
    if (!activeRun) return;
    const input = { projectId: project.projectId, runId: activeRun.runId };
    const outcome =
      decision === 'save'
        ? await bridge.generation.savePartial(input)
        : await bridge.generation.discardPartial(input);
    if (outcome.state !== 'success') return;
    setActiveRun(outcome.data.run);
    setGenerationStatus(decision === 'save' ? '部分结果已保存为受限候选。' : '部分结果已丢弃。');
    await refreshList();
  };

  const saveSkeletonEdit = async (): Promise<void> => {
    if (!selectedDocument || selectedDocument.candidateType !== 'skeleton' || readOnly) return;
    const outcome = await bridge.candidate.editSkeleton({
      projectId: project.projectId,
      chapterId: chapter.id,
      candidateId: selectedDocument.candidateId,
      expectedSkeletonRevisionId: selectedDocument.skeletonRevisionId,
      structuredPayload: {
        ...selectedDocument.structuredPayload,
        tendency: skeletonTendency.trim(),
        endingHook: skeletonEndingHook.trim(),
      },
    });
    if (outcome.state !== 'success' || outcome.data.candidateType !== 'skeleton') {
      if (outcome.state === 'failure')
        setStatus(`骨架修订保存失败 · ${authorErrorSummary(outcome.error)}`);
      return;
    }
    setSelectedDocument(outcome.data);
    setSkeletonEndingHook(outcome.data.structuredPayload.endingHook);
    setSkeletonTendency(outcome.data.structuredPayload.tendency);
    await refreshList();
    setStatus(`骨架修订 ${outcome.data.skeletonRevision} 已保存。`);
  };

  return (
    <section className="candidate-workbench" data-candidate-preview-dialog>
      <header className="feature-card__heading">
        <div>
          <h2>AI创作与建议稿工作台</h2>
          <p>生成只读取已保存的权威数据；骨架与正文候选使用独立的审阅、采用规则。</p>
        </div>
      </header>
      <section className="generation-studio" data-generation-studio>
        <header>
          <div>
            <h3>生成任务</h3>
            <p>进度来自持久化生成记录与任务事件，不使用模拟百分比。</p>
          </div>
          <span
            className="generation-run-state"
            data-generation-run-status
            data-status={activeRun?.status ?? 'idle'}
          >
            {generationStatus}
          </span>
        </header>
        <div className="generation-grid">
          <label>
            任务
            <select
              data-generation-mode
              value={generationMode}
              onChange={(event) => setGenerationMode(event.target.value as typeof generationMode)}
            >
              <option value="skeleton">T0 · 生成骨架</option>
              <option value="chapter">T1 · 生成正文</option>
              <option value="rewrite">快速改写</option>
              <option value="merge">融合候选</option>
            </select>
          </label>
          <label>
            AI连接
            <select
              data-generation-provider
              value={providerId}
              onChange={(event) => setProviderId(event.target.value)}
            >
              <option value="">请选择</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name} · {provider.model}
                </option>
              ))}
            </select>
          </label>
          {generationMode === 'chapter' ? (
            <label>
              正文来源
              <select
                data-chapter-generation-source
                value={chapterSource}
                onChange={(event) => setChapterSource(event.target.value as typeof chapterSource)}
              >
                <option value="direct_chapter_goal">直接章节目标</option>
                <option value="skeleton_candidate">已选骨架</option>
                <option value="canonical_scene_beats">正式场景节拍</option>
              </select>
            </label>
          ) : null}
          {generationMode === 'skeleton' ? (
            <>
              <label>
                候选数
                <input
                  data-skeleton-candidate-count
                  type="number"
                  min={1}
                  max={5}
                  value={candidateCount}
                  onChange={(event) =>
                    setCandidateCount(Math.max(1, Math.min(5, Number(event.target.value) || 1)))
                  }
                />
              </label>
              <label>
                叙事倾向
                <input
                  data-skeleton-tendency
                  value={tendency}
                  onChange={(event) => setTendency(event.target.value)}
                />
              </label>
            </>
          ) : null}
          {generationMode === 'chapter' && chapterSource === 'skeleton_candidate' ? (
            <label>
              骨架
              <select
                data-selected-skeleton
                value={selectedSkeletonId}
                onChange={(event) => {
                  setSelectedSkeletonId(event.target.value);
                  setAcknowledgeStaleSkeleton(false);
                }}
              >
                <option value="">请选择</option>
                {skeletonCandidates.map((candidate) => (
                  <option key={candidate.candidateId} value={candidate.candidateId}>
                    {candidate.title} · 修订 {candidate.skeletonRevision}
                    {candidate.sourceState === 'stale' ? ' · 来源已变化' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {generationMode === 'chapter' ? (
            <label>
              目标字数
              <input
                data-generation-target-characters
                type="number"
                min={100}
                max={200_000}
                step={100}
                value={targetCharacters}
                onChange={(event) =>
                  setTargetCharacters(
                    Math.max(100, Math.min(200_000, Number(event.target.value) || 100)),
                  )
                }
              />
            </label>
          ) : null}
        </div>
        {(generationMode === 'skeleton' ||
          (generationMode === 'chapter' && chapterSource === 'direct_chapter_goal')) && (
          <label className="generation-wide-field">
            本章目标
            <textarea
              data-generation-chapter-goal
              rows={3}
              value={chapterGoal}
              onChange={(event) => setChapterGoal(event.target.value)}
              placeholder="描述这一章必须推进的事件、冲突与结果。"
            />
          </label>
        )}
        {generationMode === 'rewrite' ||
        generationMode === 'merge' ||
        generationMode === 'chapter' ? (
          <label className="generation-wide-field">
            {generationMode === 'rewrite'
              ? '改写指令'
              : generationMode === 'merge'
                ? '融合偏好（可选）'
                : '风格补充（可选）'}
            <textarea
              data-generation-instruction
              rows={2}
              value={generationInstruction}
              onChange={(event) => setGenerationInstruction(event.target.value)}
              placeholder={
                generationMode === 'rewrite'
                  ? '优先改写编辑器中的单块选区；没有选区时改写全部未锁定块。'
                  : '只填写本次任务需要的额外要求。'
              }
            />
          </label>
        ) : null}
        {generationMode === 'chapter' &&
        chapterSource === 'skeleton_candidate' &&
        skeletonCandidates.some(
          (candidate) =>
            candidate.candidateId === selectedSkeletonId && candidate.sourceState === 'stale',
        ) ? (
          <label className="safety-inline generation-acknowledgement">
            <input
              type="checkbox"
              checked={acknowledgeStaleSkeleton}
              onChange={(event) => setAcknowledgeStaleSkeleton(event.target.checked)}
            />
            我已知晓正式场景节拍或基础稿已变化，仍使用此骨架生成正文
          </label>
        ) : null}
        {generationMode === 'merge' ? (
          <fieldset className="candidate-choice-list" data-merge-candidate-picker>
            <legend>融合来源映射</legend>
            {sceneBeats.length ? (
              <label>
                映射方式
                <select
                  data-merge-mapping-mode
                  value={mergeMappingMode}
                  onChange={(event) =>
                    setMergeMappingMode(event.target.value as typeof mergeMappingMode)
                  }
                >
                  <option value="beat">按正式场景节拍</option>
                  <option value="segment">按候选片段</option>
                </select>
              </label>
            ) : null}
            {mergeMappingMode === 'beat' && sceneBeats.length ? (
              sceneBeats.map((beat) => (
                <label key={beat.id}>
                  {beat.title}
                  <select
                    value={mergeBeatSources[beat.id] ?? ''}
                    onChange={(event) =>
                      setMergeBeatSources((current) => ({
                        ...current,
                        [beat.id]: event.target.value,
                      }))
                    }
                  >
                    <option value="">不参与本次融合</option>
                    <option value="current_draft">保留当前稿</option>
                    {proseCandidates.map((candidate) => (
                      <option key={candidate.candidateId} value={candidate.candidateId}>
                        {candidate.title} · {candidateTypeLabel(candidate.candidateType)}
                      </option>
                    ))}
                  </select>
                </label>
              ))
            ) : (
              <>
                <p>选择至少两个正文建议稿；建议稿没有场景节拍关联时使用此模式。</p>
                {proseCandidates.map((candidate) => (
                  <label key={candidate.candidateId}>
                    <input
                      type="checkbox"
                      checked={mergeCandidateIds.has(candidate.candidateId)}
                      onChange={(event) =>
                        setMergeCandidateIds(
                          toggleSet(mergeCandidateIds, candidate.candidateId, event.target.checked),
                        )
                      }
                    />
                    {candidate.title} · {candidateTypeLabel(candidate.candidateType)} ·{' '}
                    {candidate.completeness}
                  </label>
                ))}
              </>
            )}
          </fieldset>
        ) : null}
        {generationMode === 'rewrite' ? (
          <p className="feature-status">
            选择同一正文块内的文字可精确改写；跨块、空选区或锁定块不会作为选区来源。
          </p>
        ) : null}
        <div className="inline-actions">
          <button
            className="primary-button"
            data-start-generation
            type="button"
            disabled={
              pending ||
              readOnly ||
              !providerId ||
              activeRun?.status === 'queued' ||
              activeRun?.status === 'running'
            }
            onClick={() => void startGeneration()}
          >
            开始生成
          </button>
          <button
            data-cancel-generation
            type="button"
            disabled={
              !activeRun || (activeRun.status !== 'queued' && activeRun.status !== 'running')
            }
            onClick={() => void cancelGeneration()}
          >
            取消生成
          </button>
          {activeRun?.partialStatus === 'available' ? (
            <>
              <button
                data-save-partial-candidate
                type="button"
                onClick={() => void decidePartial('save')}
              >
                保存部分结果
              </button>
              <button
                data-discard-partial-candidate
                type="button"
                onClick={() => void decidePartial('discard')}
              >
                丢弃部分结果
              </button>
            </>
          ) : null}
          {lastGenerationIntent?.runType === 'rewrite' &&
          activeRun?.runType === 'rewrite' &&
          activeRun.status !== 'queued' &&
          activeRun.status !== 'running' ? (
            <button
              data-retry-rewrite
              type="button"
              disabled={pending || readOnly || !providerId}
              onClick={() => void startGeneration(null, lastGenerationIntent)}
            >
              换一个
            </button>
          ) : null}
        </div>
        {activeRun ? (
          <dl className="generation-provenance" data-active-generation-run>
            <div>
              <dt>生成记录</dt>
              <dd>{activeRun.runId}</dd>
            </div>
            <div>
              <dt>提示词版本</dt>
              <dd>
                {activeRun.promptId} v{activeRun.promptVersion}
              </dd>
            </div>
            <div>
              <dt>模型</dt>
              <dd>{activeRun.actualModel}</dd>
            </div>
            <div>
              <dt>兼容状态</dt>
              <dd>{activeRun.supportStatus}</dd>
            </div>
          </dl>
        ) : null}
      </section>
      <div className="filter-bar">
        <select
          aria-label="选择建议稿"
          data-candidate-preview-select
          value={candidateId}
          onChange={(event) => {
            setCandidateId(event.target.value);
            void loadCandidate(event.target.value);
          }}
        >
          {reviewGroups.map((group) => (
            <optgroup key={group.id} label={group.label}>
              {group.candidates.map((candidate) => (
                <option
                  data-status={candidate.status}
                  key={candidate.candidateId}
                  value={candidate.candidateId}
                >
                  {candidate.title} · {candidateTypeLabel(candidate.candidateType)} ·{' '}
                  {candidateCompletenessLabel(candidate.completeness)} ·{' '}
                  {candidateStatusLabel(candidate.status)}
                </option>
              ))}
            </optgroup>
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
          disabled={!selectedDocument || selectedDocument.status !== 'pending'}
          onClick={() => void discard()}
        >
          丢弃建议稿
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
      {selectedRun ? (
        <dl className="generation-provenance" data-selected-candidate-provenance>
          <div>
            <dt>来源任务</dt>
            <dd>{selectedRun.runId}</dd>
          </div>
          <div>
            <dt>AI连接 / 模型</dt>
            <dd>
              {providers.find((provider) => provider.id === selectedRun.providerId)?.name ??
                selectedRun.providerId}{' '}
              / {selectedRun.actualModel}
            </dd>
          </div>
          <div>
            <dt>提示词版本</dt>
            <dd>
              {selectedRun.promptId} v{selectedRun.promptVersion}
            </dd>
          </div>
          <div>
            <dt>输出方式</dt>
            <dd>
              {selectedRun.outputMode} · {selectedRun.supportStatus}
            </dd>
          </div>
        </dl>
      ) : null}
      {selectedDocument?.candidateType === 'skeleton' ? (
        <section className="skeleton-review" data-skeleton-review>
          <header>
            <div>
              <h3>{selectedDocument.title}</h3>
              <p>
                修订 {selectedDocument.skeletonRevision} ·{' '}
                {selectedDocument.editedBy === 'author' ? '作者修订' : 'AI 初稿'} · 来源
                {selectedDocument.sourceState === 'stale' ? '已变化' : '有效'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setGenerationMode('chapter');
                setChapterSource('skeleton_candidate');
                setSelectedSkeletonId(selectedDocument.candidateId);
                setAcknowledgeStaleSkeleton(false);
              }}
            >
              用于生成正文
            </button>
          </header>
          <div className="generation-grid">
            <label>
              叙事倾向
              <input
                data-edit-skeleton-tendency
                value={skeletonTendency}
                onChange={(event) => setSkeletonTendency(event.target.value)}
              />
            </label>
            <label>
              收尾钩子
              <textarea
                data-edit-skeleton-ending-hook
                rows={3}
                value={skeletonEndingHook}
                onChange={(event) => setSkeletonEndingHook(event.target.value)}
              />
            </label>
          </div>
          <ol className="skeleton-beat-list">
            {[...selectedDocument.structuredPayload.beats]
              .sort((left, right) => left.order - right.order)
              .map((beat) => (
                <li key={beat.beatId}>
                  <strong>
                    {beat.order}. {beat.event}
                  </strong>
                  <span>因：{beat.cause}</span>
                  <span>果：{beat.consequence}</span>
                </li>
              ))}
          </ol>
          {selectedDocument.structuredPayload.risks.length ? (
            <ul className="candidate-conflicts">
              {selectedDocument.structuredPayload.risks.map((risk) => (
                <li key={risk}>{risk}</li>
              ))}
            </ul>
          ) : null}
          <div className="inline-actions">
            <button
              className="primary-button"
              data-save-skeleton-revision
              type="button"
              disabled={readOnly || !skeletonTendency.trim() || !skeletonEndingHook.trim()}
              onClick={() => void saveSkeletonEdit()}
            >
              保存作者修订
            </button>
            <button
              data-discard-candidate
              type="button"
              disabled={selectedDocument.status !== 'pending'}
              onClick={() => void discard()}
            >
              丢弃骨架
            </button>
          </div>
          <p className="safety-inline">
            情节骨架不会直接进入正文差异、采用、历史版本或定稿；请先用它生成正文建议稿。
          </p>
        </section>
      ) : null}
      {preview?.candidate.completeness === 'partial' ? (
        <div className="safety-inline partial-candidate-actions" data-candidate-preview-warning>
          <span>不完整建议稿只能按正文块或场景节拍采用，不能整稿替换。</span>
          {preview.candidate.generationRunId ? (
            <button
              data-continue-partial-candidate
              type="button"
              disabled={pending || readOnly || !providerId}
              onClick={() => void startGeneration(preview.candidate.generationRunId)}
            >
              继续生成
            </button>
          ) : null}
          <button type="button" onClick={onClose}>
            返回编辑器手动补全
          </button>
        </div>
      ) : null}
      {preview ? (
        <>
          <div className="candidate-summary">
            <span>结构差异 {preview.structure.length}</span>
            <span>字符差异块 {preview.characterDiffs.length}</span>
            <span>{preview.execution.chapterCharacters}字符</span>
          </div>
          <ReviewDiffPanel
            comparisonText={preview.candidate.blocks.map((block) => block.text).join('\n\n')}
            comparisonTitle={preview.candidate.title}
            currentText={preview.draft.blocks.map((block) => block.text).join('\n\n')}
            currentTitle="当前已保存稿"
            marker="candidate"
          />
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
                <option value="scene-beats">按场景节拍</option>
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
                    {sceneBeatReviewLabel(sceneBeats, beatId)}
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
              {candidateConflictLabel(conflict.kind)}
              <details>
                <summary>技术详情</summary>
                <p>
                  {conflict.kind} · {conflict.message}
                </p>
              </details>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function candidateConflictLabel(kind: CandidateConflictItem['kind']): string {
  const labels: Readonly<Record<CandidateConflictItem['kind'], string>> = {
    project: '建议稿不属于当前作品',
    'candidate-status': '建议稿已经处理',
    'partial-restricted': '未完成建议稿不能替换整章',
    revision: '建议稿生成后当前稿已经变化',
    hash: '正文内容与生成时不一致',
    locked: '建议稿涉及已锁定的正文',
    'missing-block': '建议稿引用的正文位置已经不存在',
    structure: '建议稿与当前正文结构不一致',
    'duplicate-apply': '建议稿已经采用过',
    'undo-stale': '采用后当前稿已经变化，无法整体撤销',
  };
  return labels[kind];
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
