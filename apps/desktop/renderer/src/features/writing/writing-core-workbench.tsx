import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  Chapter,
  DraftDocument,
  ProjectContinuationInput,
  ProjectContinuationSnapshot,
  ProjectWorkspaceSummary,
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
import { StructureNavigator } from '../structure/structure-navigator.js';
import { CandidateReviewPanel } from './candidate-review-panel.js';
import { captureContinuationAnchor, restoreContinuationAnchor } from './continuation-anchor.js';
import {
  captureRewriteSelectionAnchor,
  getPersistedEditorSelection,
  persistEditorSelection,
  persistEditorSelectionRange,
  restoreEditorSelection,
} from './editor-selection.js';
import { FindReplaceToolbar } from './find-replace-toolbar.js';
import { sanitizePastedHtml } from './paste-sanitizer.js';
import { WritingAssistancePanel } from './writing-assistance-panel.js';
import { VersionPanel } from './version-panel.js';
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
  const openingChapter = useRef<string | null>(null);
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
      const remembered = getPersistedEditorSelection(project.projectId, currentChapter.id);
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
      const remembered = getPersistedEditorSelection(project.projectId, nextChapter.id);
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
          persistEditorSelectionRange(
            project.projectId,
            nextChapter.id,
            current.state.selection.from,
            current.state.selection.to,
          );
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
      if (openingChapter.current === nextChapter.id) return;
      if (activeChapter.current?.id === nextChapter.id && activeDraft.current) {
        if (openingChapter.current) {
          openingChapter.current = null;
          editor.current?.setEditable(!readOnly);
          setStatus('已保留当前章节。');
        }
        if (panel === 'editor' && !editor.current) mountEditor(activeDraft.current, nextChapter);
        return;
      }
      if (!(await flush())) {
        onStatus('自动保存失败，已阻止切换章节。');
        return;
      }
      openingChapter.current = nextChapter.id;
      editor.current?.setEditable(false);
      setStatus('正在从作品数据库读取正文…');
      const outcome = await bridge.draft.open(
        { projectId: project.projectId, chapterId: nextChapter.id },
        { mode: 'replace' },
      );
      if (openingChapter.current !== nextChapter.id) return;
      if (outcome.state !== 'success') {
        openingChapter.current = null;
        editor.current?.setEditable(!readOnly);
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
      openingChapter.current = null;
      mountEditor(outcome.data, nextChapter);
    },
    [bridge, flush, mountEditor, onStatus, panel, project.projectId, readOnly, setStatus],
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

              <FindReplaceToolbar
                findText={findText}
                replaceText={replaceText}
                findIndex={findIndex}
                findCount={findCount}
                readOnly={readOnly}
                isComposing={isComposing}
                onFindTextChange={(value) => {
                  setFindText(value);
                  setFindIndex(0);
                }}
                onReplaceTextChange={setReplaceText}
                onSelectMatch={selectMatch}
                onReplaceMatches={replaceMatches}
              />

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
            <CandidateReviewPanel
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

function navigationKey(
  panel: WritingPanel,
  chapterId: string | null | undefined,
  logicalBlockId: string | null | undefined,
  versionId: string | null | undefined,
): string {
  return [panel, chapterId ?? '', logicalBlockId ?? '', versionId ?? ''].join(':');
}

function temporaryClientBlockId(): string {
  return `temporary-${globalThis.crypto.randomUUID()}`;
}
