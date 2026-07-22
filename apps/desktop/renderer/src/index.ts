import {
  DraftAutosaveCoordinator,
  Editor,
  assertEditorNodeMetadata,
  buildDraftPatchOperations,
  calculateWritingStatistics,
  createWorldforgeEditorExtensions,
  findTextRanges,
  documentToTiptapJson,
  redoWorldforgeEditor,
  selectedWorldforgeBlockLocked,
  synchronizePersistedBlockMetadata,
  tiptapJsonToDraftSnapshot,
  undoWorldforgeEditor,
  toggleWorldforgeEditorBlockLock,
} from '@worldforge/editor-core';
import { contentWidthPixels, layoutPolicyForViewport } from './layout-model.js';
import type {
  AppearancePreferences,
  AppSettings,
  Chapter,
  DraftDocument,
  ProjectStructure,
  ProjectWorkspaceSummary,
} from './types.js';

const defaultAppearance: AppearancePreferences = {
  workspaceAlignment: 'center',
  uiScalePercent: 100,
  bodyFontSize: 18,
  contentWidth: 'normal',
};

const leftPanel = document.querySelector<HTMLElement>('[data-left-sidebar]');
const leftToggle = document.querySelector<HTMLButtonElement>('[data-toggle-left]');
const drawerScrim = document.querySelector<HTMLButtonElement>('[data-drawer-scrim]');
const popover = document.querySelector<HTMLElement>('[data-popover]');
const popoverTrigger = document.querySelector<HTMLButtonElement>('[data-boundary-popover]');
const boundaryDialog = document.querySelector<HTMLDialogElement>('[data-boundary-dialog]');
const workspaceTitle = document.querySelector<HTMLElement>('[data-workspace-title]');
const workspaceBadge = document.querySelector<HTMLElement>('[data-workspace-badge]');
const legacyProjectPlaceholder = document.querySelector<HTMLElement>(
  '[data-legacy-project-placeholder]',
);
const draftWorkspace = document.querySelector<HTMLElement>('[data-draft-workspace]');
const draftEditorHost = document.querySelector<HTMLElement>('[data-draft-editor-host]');
const draftState = document.querySelector<HTMLElement>('[data-draft-state]');
const draftChapterTitle = document.querySelector<HTMLElement>('[data-draft-chapter-title]');
const saveDraftButton = document.querySelector<HTMLButtonElement>('[data-save-draft]');
const copyDraftButton = document.querySelector<HTMLButtonElement>('[data-copy-draft]');
const backProjectButton = document.querySelector<HTMLButtonElement>('[data-back-project]');
const undoDraftButton = document.querySelector<HTMLButtonElement>('[data-undo-draft]');
const redoDraftButton = document.querySelector<HTMLButtonElement>('[data-redo-draft]');
const insertSeparatorButton = document.querySelector<HTMLButtonElement>('[data-insert-separator]');
const blockTypeButtons = document.querySelectorAll<HTMLButtonElement>('[data-set-block-type]');
const toggleBlockLockButton = document.querySelector<HTMLButtonElement>('[data-toggle-block-lock]');
const draftCharacterCount = document.querySelector<HTMLElement>('[data-draft-character-count]');
const draftTextCount = document.querySelector<HTMLElement>('[data-draft-text-count]');
const draftParagraphCount = document.querySelector<HTMLElement>('[data-draft-paragraph-count]');
const draftProgress = document.querySelector<HTMLElement>('[data-draft-progress]');
const draftFindInput = document.querySelector<HTMLInputElement>('[data-draft-find]');
const draftReplaceInput = document.querySelector<HTMLInputElement>('[data-draft-replace]');
const draftFindPrevious = document.querySelector<HTMLButtonElement>('[data-draft-find-previous]');
const draftFindNext = document.querySelector<HTMLButtonElement>('[data-draft-find-next]');
const draftReplaceCurrent = document.querySelector<HTMLButtonElement>(
  '[data-draft-replace-current]',
);
const draftReplaceAll = document.querySelector<HTMLButtonElement>('[data-draft-replace-all]');
const draftFindStatus = document.querySelector<HTMLElement>('[data-draft-find-status]');

let appearance = defaultAppearance;
let activeProject: ProjectWorkspaceSummary | null = null;
let activeStructure: ProjectStructure | null = null;
let activeChapter: Chapter | null = null;
let activeDraft: DraftDocument | null = null;
let draftEditor: Editor | null = null;
let draftDirty = false;
let draftComposing = false;
let synchronizingDraftMetadata = false;
let draftAutosave: DraftAutosaveCoordinator | null = null;
let lastSavedRevision = 0;
let currentFindIndex = -1;
let draftFindMatches: { readonly from: number; readonly to: number }[] = [];
const chapterSelections = new Map<string, { readonly from: number; readonly to: number }>();
let resizeFrame: number | null = null;
let drawerRestoreTarget: HTMLElement | null = null;

function applyApplicationSettings(settings: AppSettings): void {
  document.body.dataset.authorMode = settings.defaultMode;
  document.body.dataset.visualThemeId = settings.themeId;
  document.body.dataset.visualThemeVariant = settings.themeVariant;
  document.body.dataset.motionPreference = settings.reduceMotion ? 'reduced' : 'standard';
}

function setDraftState(message: string, error = false): void {
  if (!draftState) return;
  draftState.textContent = message;
  draftState.classList.toggle('is-error', error);
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
      if (/^h[1-6]$/u.test(tag)) {
        appendTextBlock(tag as `h${number}`, child.textContent ?? '');
      } else if (tag === 'blockquote') {
        appendTextBlock('blockquote', child.textContent ?? '');
      } else if (tag === 'hr') {
        clean.append(document.createElement('hr'));
      } else if (tag === 'p' || tag === 'li' || tag === 'pre') {
        appendTextBlock('p', child.textContent ?? '');
      } else if (child.querySelector('p, li, blockquote, h1, h2, h3, h4, h5, h6, hr')) {
        visit(child);
      } else {
        const value = child.textContent ?? '';
        if (value.trim()) appendTextBlock('p', value);
      }
    }
  };
  visit(parsed.body);
  if (!clean.hasChildNodes()) clean.append(document.createElement('p'));
  return clean.innerHTML;
}

function updateDraftStatistics(): void {
  const editor = draftEditor;
  if (!editor) {
    if (draftCharacterCount) draftCharacterCount.textContent = '0';
    if (draftTextCount) draftTextCount.textContent = '0';
    if (draftParagraphCount) draftParagraphCount.textContent = '0';
    if (draftProgress) draftProgress.textContent = '未设置目标';
    return;
  }
  const statistics = calculateWritingStatistics(
    editor.getText({ blockSeparator: '\n' }),
    editor.state.doc.childCount,
    activeChapter?.targetWordMax,
  );
  if (draftCharacterCount) draftCharacterCount.textContent = String(statistics.characterCount);
  if (draftTextCount) draftTextCount.textContent = String(statistics.textCount);
  if (draftParagraphCount) draftParagraphCount.textContent = String(statistics.paragraphCount);
  if (draftProgress) {
    draftProgress.textContent =
      statistics.progressPercent === null
        ? '未设置目标'
        : `目标进度 ${statistics.progressPercent}%`;
  }
}

function refreshDraftFindMatches(selectCurrent = false): void {
  const editor = draftEditor;
  const query = draftFindInput?.value ?? '';
  draftFindMatches = [];
  if (editor && query) {
    editor.state.doc.descendants((node, position) => {
      if (!node.isText || !node.text) return;
      for (const range of findTextRanges(node.text, query)) {
        draftFindMatches.push({ from: position + range.from, to: position + range.to });
      }
    });
  }
  if (draftFindMatches.length === 0) currentFindIndex = -1;
  else if (currentFindIndex < 0 || currentFindIndex >= draftFindMatches.length)
    currentFindIndex = 0;
  if (draftFindStatus) {
    draftFindStatus.textContent =
      draftFindMatches.length === 0
        ? query
          ? '未找到'
          : ''
        : `${currentFindIndex + 1}/${draftFindMatches.length}`;
  }
  if (selectCurrent && editor && currentFindIndex >= 0) {
    editor.commands.setTextSelection(draftFindMatches[currentFindIndex]!);
    editor.commands.focus();
  }
}

function moveDraftFind(direction: 1 | -1): void {
  refreshDraftFindMatches();
  if (!draftEditor || draftFindMatches.length === 0) return;
  currentFindIndex =
    (currentFindIndex + direction + draftFindMatches.length) % draftFindMatches.length;
  refreshDraftFindMatches(true);
}

function replaceDraftFind(all: boolean): void {
  const editor = draftEditor;
  if (!editor || activeProject?.databaseMode !== 'read-write') return;
  refreshDraftFindMatches();
  if (draftFindMatches.length === 0) return;
  const replacement = draftReplaceInput?.value ?? '';
  const selected = all ? draftFindMatches : [draftFindMatches[currentFindIndex]!];
  let transaction = editor.state.tr;
  for (const match of [...selected].reverse()) {
    transaction = transaction.insertText(replacement, match.from, match.to);
  }
  editor.view.dispatch(transaction);
  currentFindIndex = 0;
  refreshDraftFindMatches(true);
}

function showProjectOverview(): void {
  if (legacyProjectPlaceholder) legacyProjectPlaceholder.hidden = activeProject === null;
  if (draftWorkspace) draftWorkspace.hidden = true;
  if (activeProject && workspaceTitle) workspaceTitle.textContent = activeProject.name;
  if (activeProject && workspaceBadge) {
    workspaceBadge.textContent =
      activeProject.databaseMode === 'read-only' ? '只读项目' : '本地项目';
  }
}

function showDraftWorkspace(): void {
  if (legacyProjectPlaceholder) legacyProjectPlaceholder.hidden = true;
  if (draftWorkspace) draftWorkspace.hidden = false;
}

function rememberDraftSelection(): void {
  if (!draftEditor || !activeChapter) return;
  const { from, to } = draftEditor.state.selection;
  chapterSelections.set(activeChapter.id, { from, to });
}

function refreshDraftLockButton(): void {
  if (!toggleBlockLockButton) return;
  const locked = draftEditor ? selectedWorldforgeBlockLocked(draftEditor) : null;
  const unavailable =
    locked === null || draftComposing || activeProject?.databaseMode !== 'read-write';
  toggleBlockLockButton.disabled = unavailable;
  toggleBlockLockButton.setAttribute('aria-pressed', locked === true ? 'true' : 'false');
  toggleBlockLockButton.textContent = locked === true ? '解锁当前块' : '锁定当前块';
  toggleBlockLockButton.title =
    locked === true ? '解锁当前正文块（Ctrl/Cmd+Shift+L）' : '锁定当前正文块（Ctrl/Cmd+Shift+L）';
}

function destroyDraftEditor(): void {
  rememberDraftSelection();
  draftAutosave?.destroy();
  draftAutosave = null;
  draftEditor?.destroy();
  draftEditor = null;
  draftEditorHost?.replaceChildren();
  activeDraft = null;
  activeChapter = null;
  draftDirty = false;
  draftComposing = false;
  synchronizingDraftMetadata = false;
  currentFindIndex = -1;
  draftFindMatches = [];
  updateDraftStatistics();
  refreshDraftLockButton();
  if (draftFindStatus) draftFindStatus.textContent = '';
  if (saveDraftButton) saveDraftButton.disabled = true;
}

function persistedBlocks(draft: DraftDocument) {
  return draft.blocks.map((block) => ({
    logicalBlockId: block.logicalBlockId,
    blockType: block.blockType,
    text: block.text,
    attributes: block.attributes,
    source: block.source,
    locked: block.locked,
    contentHash: block.contentHash,
  }));
}

function mountDraftEditor(draft: DraftDocument, chapter: Chapter): void {
  if (!draftEditorHost || !activeProject) return;
  draftEditor?.destroy();
  draftEditorHost.replaceChildren();
  activeChapter = chapter;
  activeDraft = draft;
  draftDirty = false;
  const readOnly = activeProject.databaseMode !== 'read-write';
  draftEditor = new Editor({
    element: draftEditorHost,
    extensions: createWorldforgeEditorExtensions(temporaryClientBlockId),
    content: documentToTiptapJson(persistedBlocks(draft)),
    editable: !readOnly,
    injectCSS: false,
    enableCoreExtensions: { keymap: false },
    editorProps: {
      attributes: {
        class: 'worldforge-editor',
        role: 'textbox',
        'aria-label': `${chapter.title}正文`,
        'data-draft-content': '',
      },
      transformPastedHTML: sanitizePastedHtml,
      transformPastedText: (text) => text.replaceAll('\r\n', '\n').replaceAll('\r', '\n'),
    },
    onUpdate: () => {
      refreshDraftLockButton();
      if (synchronizingDraftMetadata) return;
      draftDirty = true;
      updateDraftStatistics();
      refreshDraftFindMatches();
      draftAutosave?.markDirty();
      if (draftComposing) setDraftState('输入法组合中；自动保存与结构键已暂停。');
    },
    onSelectionUpdate: ({ editor }) => {
      chapterSelections.set(chapter.id, {
        from: editor.state.selection.from,
        to: editor.state.selection.to,
      });
      refreshDraftLockButton();
    },
  });
  lastSavedRevision = draft.revision;
  draftAutosave = new DraftAutosaveCoordinator({
    delayMs: 800,
    save: persistActiveDraft,
    onState: (state) => {
      if (state === 'waiting') setDraftState('等待自动保存…');
      else if (state === 'saving') setDraftState('正在自动保存…');
      else if (state === 'saved') setDraftState(`自动保存完成 · Revision ${lastSavedRevision}`);
      else if (state === 'failed') setDraftState('自动保存失败；窗口内容仍保留。', true);
      else if (state === 'paused') setDraftState('输入法组合中；自动保存与结构键已暂停。');
    },
  });
  updateDraftStatistics();
  refreshDraftFindMatches();
  const savedSelection = chapterSelections.get(chapter.id);
  if (savedSelection) {
    const maximum = Math.max(1, draftEditor.state.doc.content.size);
    draftEditor.commands.setTextSelection({
      from: Math.min(Math.max(1, savedSelection.from), maximum),
      to: Math.min(Math.max(1, savedSelection.to), maximum),
    });
  }
  if (draftChapterTitle) draftChapterTitle.textContent = chapter.title;
  if (workspaceTitle) workspaceTitle.textContent = `${activeProject.name} · ${chapter.title}`;
  if (workspaceBadge) workspaceBadge.textContent = readOnly ? '只读正文' : '活动 Draft';
  if (saveDraftButton) saveDraftButton.disabled = readOnly;
  for (const button of blockTypeButtons) button.disabled = readOnly;
  refreshDraftLockButton();
  if (insertSeparatorButton) insertSeparatorButton.disabled = readOnly;
  if (undoDraftButton) undoDraftButton.disabled = readOnly;
  if (redoDraftButton) redoDraftButton.disabled = readOnly;
  setDraftState(readOnly ? '只读浏览：可选择和复制，正文写入已禁用。' : '已从 DraftBlock 重建。');
  showDraftWorkspace();
}

async function openChapterDraft(chapter: Chapter): Promise<void> {
  const project = activeProject;
  if (!project || activeChapter?.id === chapter.id) return;
  if (draftAutosave?.hasPendingWork && !(await draftAutosave.flush())) {
    setDraftState('自动保存失败，已阻止切换章节。', true);
    return;
  }
  showDraftWorkspace();
  if (draftChapterTitle) draftChapterTitle.textContent = chapter.title;
  setDraftState('正在从项目数据库读取 DraftBlock…');
  try {
    const result = await window.worldforge.draft.open({
      projectId: project.projectId,
      chapterId: chapter.id,
    });
    if (activeProject?.projectId !== project.projectId) return;
    if (result.ok) {
      mountDraftEditor(result.data, chapter);
      renderProjectStructure(activeStructure);
    } else {
      setDraftState(`正文读取失败 · ${result.error.code}`, true);
    }
  } catch {
    setDraftState('正文读取失败 · COMMON_INTERNAL_999', true);
  }
}

window.addEventListener('worldforge:legacy-open-chapter', (event) => {
  const chapterId = (event as CustomEvent<{ readonly chapterId?: string }>).detail?.chapterId;
  const chapter = activeStructure?.volumes
    .flatMap((volume) => volume.chapters)
    .find((candidate) => candidate.id === chapterId);
  if (chapter) void openChapterDraft(chapter);
});

async function persistActiveDraft(): Promise<boolean> {
  const project = activeProject;
  const chapter = activeChapter;
  const draft = activeDraft;
  const editor = draftEditor;
  if (!project || !chapter || !draft || !editor || project.databaseMode !== 'read-write')
    return true;
  if (draftComposing || editor.view.composing) return false;
  saveDraftButton?.setAttribute('disabled', '');
  try {
    const json = editor.getJSON();
    const signature = JSON.stringify(json);
    assertEditorNodeMetadata(json);
    const blocks = tiptapJsonToDraftSnapshot(json, temporaryClientBlockId);
    const operations = buildDraftPatchOperations(persistedBlocks(draft), blocks);
    if (operations.length === 0) {
      draftDirty = false;
      return true;
    }
    const result = await window.worldforge.draft.applyPatch({
      projectId: project.projectId,
      chapterId: chapter.id,
      draftId: draft.draftId,
      baseRevision: draft.revision,
      operations,
    });
    if (!result.ok) return false;
    if (
      activeProject?.projectId !== project.projectId ||
      activeChapter?.id !== chapter.id ||
      activeDraft?.draftId !== draft.draftId ||
      draftEditor !== editor
    ) {
      return true;
    }
    activeDraft = result.data;
    lastSavedRevision = result.data.revision;
    synchronizingDraftMetadata = true;
    const synchronized = synchronizePersistedBlockMetadata(editor, persistedBlocks(result.data));
    if (!synchronized) {
      editor.commands.setContent(documentToTiptapJson(persistedBlocks(result.data)), {
        emitUpdate: false,
      });
    }
    synchronizingDraftMetadata = false;
    draftDirty = JSON.stringify(editor.getJSON()) !== signature;
    updateDraftStatistics();
    void refreshProjectStructure();
    return true;
  } catch {
    synchronizingDraftMetadata = false;
    return false;
  } finally {
    if (saveDraftButton) {
      saveDraftButton.disabled = draftComposing || activeProject?.databaseMode !== 'read-write';
    }
  }
}

async function saveActiveDraft(): Promise<boolean> {
  const completed = await (draftAutosave?.flush() ?? Promise.resolve(true));
  if (completed) setDraftState(`已手动保存 · Revision ${lastSavedRevision}`);
  else setDraftState('手动保存失败；窗口内容仍保留。', true);
  return completed;
}

function renderProjectStructure(structure: ProjectStructure | null): void {
  activeStructure = structure;
  const refreshedChapter = activeChapter
    ? structure?.volumes
        .flatMap((volume) => volume.chapters)
        .find((chapter) => chapter.id === activeChapter?.id)
    : undefined;
  if (activeChapter && structure && !refreshedChapter) {
    destroyDraftEditor();
    showProjectOverview();
  } else if (refreshedChapter && activeProject) {
    activeChapter = refreshedChapter;
    if (draftChapterTitle) draftChapterTitle.textContent = refreshedChapter.title;
    if (workspaceTitle)
      workspaceTitle.textContent = `${activeProject.name} · ${refreshedChapter.title}`;
  }
}

async function refreshProjectStructure(): Promise<void> {
  const project = activeProject;
  if (!project) {
    renderProjectStructure(null);
    return;
  }
  const result = await window.worldforge.planning.listStructure(project.projectId);
  if (activeProject?.projectId !== project.projectId) return;
  if (result.ok) renderProjectStructure(result.data);
}

function renderActiveProject(project: ProjectWorkspaceSummary | null): void {
  activeProject = project;
  document.body.dataset.projectState = project
    ? project.databaseMode === 'read-only'
      ? 'read-only'
      : 'open'
    : 'closed';
  if (!project) {
    destroyDraftEditor();
    if (legacyProjectPlaceholder) legacyProjectPlaceholder.hidden = true;
    if (draftWorkspace) draftWorkspace.hidden = true;
    if (workspaceTitle) workspaceTitle.textContent = '未打开项目';
    if (workspaceBadge) workspaceBadge.textContent = 'React项目上下文';
    renderProjectStructure(null);
    return;
  }
  showProjectOverview();
  if (workspaceTitle) workspaceTitle.textContent = project.name;
  if (workspaceBadge) {
    workspaceBadge.textContent = project.databaseMode === 'read-only' ? '只读项目' : '本地项目';
  }
  void refreshProjectStructure();
}

async function refreshActiveProject(): Promise<void> {
  try {
    const result = await window.worldforge.project.getActive();
    if (result.ok) renderActiveProject(result.data);
    else if (workspaceBadge) workspaceBadge.textContent = `项目读取失败 · ${result.error.code}`;
  } catch {
    if (workspaceBadge) workspaceBadge.textContent = '项目读取失败 · COMMON_INTERNAL_999';
  }
}

function applyLayout(): void {
  const uiScale = appearance.uiScalePercent / 100;
  const effectiveViewportWidth = window.innerWidth / uiScale;
  const policy = layoutPolicyForViewport(effectiveViewportWidth);
  const contentWidth = contentWidthPixels(appearance.contentWidth, effectiveViewportWidth);

  document.documentElement.style.setProperty('--ui-scale', String(uiScale));
  document.documentElement.style.setProperty('--body-font-size', `${appearance.bodyFontSize}px`);
  document.documentElement.style.setProperty('--content-width', `${contentWidth}px`);
  document.body.dataset.layoutMode = policy.mode;
  document.body.dataset.leftPanel = policy.leftPanel;
  document.body.dataset.workspaceAlignment = appearance.workspaceAlignment;
  leftPanel?.setAttribute('data-panel-mode', policy.leftPanel);
  leftToggle?.setAttribute('aria-hidden', String(policy.leftPanel !== 'drawer'));
  if (policy.leftPanel !== 'drawer') closeDrawer(leftPanel, leftToggle, false);
  positionPopover();
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('button, select, input, [tabindex]')].filter(
    (element) => !element.hasAttribute('disabled') && element.tabIndex >= 0,
  );
}

function openDrawer(panel: HTMLElement | null, toggle: HTMLButtonElement | null): void {
  if (!panel || panel.dataset.panelMode !== 'drawer') return;
  closeAllDrawers(false);
  drawerRestoreTarget =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  panel.classList.add('is-open');
  panel.setAttribute('aria-modal', 'true');
  toggle?.setAttribute('aria-expanded', 'true');
  document.body.classList.add('has-open-drawer');
  focusableElements(panel)[0]?.focus();
}

function closeDrawer(
  panel: HTMLElement | null,
  toggle: HTMLButtonElement | null,
  restoreFocus = true,
): void {
  if (!panel?.classList.contains('is-open')) return;
  panel.classList.remove('is-open');
  panel.removeAttribute('aria-modal');
  toggle?.setAttribute('aria-expanded', 'false');
  if (!leftPanel?.classList.contains('is-open')) {
    document.body.classList.remove('has-open-drawer');
  }
  if (restoreFocus) drawerRestoreTarget?.focus();
  drawerRestoreTarget = null;
}

function closeAllDrawers(restoreFocus = true): void {
  const target = drawerRestoreTarget;
  closeDrawer(leftPanel, leftToggle, false);
  if (restoreFocus) target?.focus();
  drawerRestoreTarget = null;
}

function trapDrawerFocus(event: KeyboardEvent): void {
  const openPanel = leftPanel?.classList.contains('is-open') ? leftPanel : null;
  if (!openPanel) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeAllDrawers();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = focusableElements(openPanel);
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function positionPopover(): void {
  if (!popover || popover.hidden || !popoverTrigger) return;
  const margin = 12;
  const trigger = popoverTrigger.getBoundingClientRect();
  const bounds = popover.getBoundingClientRect();
  let left = trigger.right - bounds.width;
  let top = trigger.bottom + 8;
  left = Math.max(margin, Math.min(left, window.innerWidth - bounds.width - margin));
  if (top + bounds.height > window.innerHeight - margin) top = trigger.top - bounds.height - 8;
  top = Math.max(margin, Math.min(top, window.innerHeight - bounds.height - margin));
  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
}

function closePopover(): void {
  if (!popover || popover.hidden) return;
  popover.hidden = true;
  popoverTrigger?.setAttribute('aria-expanded', 'false');
  popoverTrigger?.focus();
}

async function refreshApplicationSettings(): Promise<void> {
  try {
    const result = await window.worldforge.settings.get();
    if (result.ok) applyApplicationSettings(result.data.settings);
  } catch {
    // React owns the visible settings failure state; legacy keeps its last safe disclosure mode.
  }
}

async function refreshAppearancePreferences(): Promise<void> {
  const result = await window.worldforge.app.getWindowPreferences();
  if (!result.ok) return;
  appearance = {
    workspaceAlignment: result.data.workspaceAlignment,
    uiScalePercent: result.data.uiScalePercent,
    bodyFontSize: result.data.bodyFontSize,
    contentWidth: result.data.contentWidth,
  };
  applyLayout();
}

async function refresh(): Promise<void> {
  try {
    const preferences = await window.worldforge.app.getWindowPreferences();
    if (preferences.ok) {
      appearance = {
        workspaceAlignment: preferences.data.workspaceAlignment,
        uiScalePercent: preferences.data.uiScalePercent,
        bodyFontSize: preferences.data.bodyFontSize,
        contentWidth: preferences.data.contentWidth,
      };
    }
    await Promise.all([refreshActiveProject(), refreshApplicationSettings()]);
  } catch {
    if (workspaceBadge) workspaceBadge.textContent = '兼容工作区初始化失败';
  } finally {
    applyLayout();
  }
}

window.addEventListener('worldforge:project-context-changed', () => {
  void Promise.all([refreshActiveProject(), refreshApplicationSettings()]);
});
window.addEventListener('worldforge:presentation-changed', () => {
  void refreshAppearancePreferences();
});

leftToggle?.addEventListener('click', () => openDrawer(leftPanel, leftToggle));
document.querySelector('[data-close-left]')?.addEventListener('click', () => closeAllDrawers());
drawerScrim?.addEventListener('click', () => closeAllDrawers());
document.addEventListener('keydown', trapDrawerFocus);

saveDraftButton?.addEventListener('click', () => {
  void saveActiveDraft();
});

backProjectButton?.addEventListener('click', () => {
  void (async () => {
    if (draftAutosave?.hasPendingWork && !(await draftAutosave.flush())) {
      setDraftState('自动保存失败，已阻止返回项目。', true);
      return;
    }
    destroyDraftEditor();
    showProjectOverview();
    renderProjectStructure(activeStructure);
  })();
});

copyDraftButton?.addEventListener('click', async () => {
  if (!draftEditor) return;
  try {
    await navigator.clipboard.writeText(draftEditor.getText({ blockSeparator: '\n' }));
    setDraftState('正文已复制到剪贴板。');
  } catch {
    setDraftState('复制失败；请在编辑器内全选后复制。', true);
  }
});

for (const button of blockTypeButtons) {
  button.addEventListener('click', () => {
    const type = button.dataset.setBlockType;
    if (
      !draftEditor ||
      draftComposing ||
      activeProject?.databaseMode !== 'read-write' ||
      !type ||
      !['paragraph', 'dialogue', 'heading'].includes(type)
    ) {
      return;
    }
    const current = draftEditor.state.selection.$from.parent;
    const preserved = {
      logicalBlockId: current.attrs.logicalBlockId,
      clientBlockId: current.attrs.clientBlockId,
      source: current.attrs.source,
      locked: current.attrs.locked,
      contentHash: current.attrs.contentHash,
    };
    draftEditor
      .chain()
      .focus()
      .setNode(type, type === 'heading' ? { ...preserved, headingLevel: 2 } : preserved)
      .run();
  });
}

insertSeparatorButton?.addEventListener('click', () => {
  if (!draftEditor || draftComposing || activeProject?.databaseMode !== 'read-write') return;
  draftEditor
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
});

toggleBlockLockButton?.addEventListener('click', () => {
  if (!draftEditor || draftComposing || activeProject?.databaseMode !== 'read-write') return;
  draftEditor.commands.focus();
  if (!toggleWorldforgeEditorBlockLock(draftEditor)) return;
  refreshDraftLockButton();
  const locked = selectedWorldforgeBlockLocked(draftEditor) === true;
  setDraftState(
    locked ? '当前正文块已锁定；修改、删除和移动将被阻止。' : '当前正文块已解锁，可以继续编辑。',
  );
});

draftFindInput?.addEventListener('input', () => {
  currentFindIndex = 0;
  refreshDraftFindMatches(true);
});
draftFindPrevious?.addEventListener('click', () => moveDraftFind(-1));
draftFindNext?.addEventListener('click', () => moveDraftFind(1));
draftReplaceCurrent?.addEventListener('click', () => replaceDraftFind(false));
draftReplaceAll?.addEventListener('click', () => replaceDraftFind(true));

undoDraftButton?.addEventListener('click', () => {
  if (draftEditor && !draftComposing) undoWorldforgeEditor(draftEditor);
});

redoDraftButton?.addEventListener('click', () => {
  if (draftEditor && !draftComposing) redoWorldforgeEditor(draftEditor);
});

draftEditorHost?.addEventListener('compositionstart', () => {
  draftComposing = true;
  draftAutosave?.pause();
  if (saveDraftButton) saveDraftButton.disabled = true;
  refreshDraftLockButton();
  setDraftState('输入法组合中；保存与结构键已暂停。');
});

draftEditorHost?.addEventListener('compositionend', () => {
  draftComposing = false;
  draftDirty = true;
  if (saveDraftButton) saveDraftButton.disabled = activeProject?.databaseMode !== 'read-write';
  draftAutosave?.resume();
  if (draftDirty) draftAutosave?.markDirty();
  refreshDraftLockButton();
});

document.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's' || !draftEditor) return;
  event.preventDefault();
  if (!draftComposing && !event.isComposing) void saveActiveDraft();
});

popoverTrigger?.addEventListener('click', () => {
  if (!popover) return;
  popover.hidden = !popover.hidden;
  popoverTrigger.setAttribute('aria-expanded', String(!popover.hidden));
  positionPopover();
});
document.querySelector('[data-close-popover]')?.addEventListener('click', closePopover);
document.querySelector('[data-open-dialog]')?.addEventListener('click', () => {
  boundaryDialog?.showModal();
});

window.addEventListener('resize', () => {
  if (resizeFrame !== null) return;
  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = null;
    applyLayout();
  });
});

void refresh();

export const rendererLayer = {
  name: '@worldforge/renderer',
  responsibility: 'sandboxed-user-interface',
} as const;

Object.defineProperty(globalThis, 'worldforgeFlushDraft', {
  configurable: true,
  value: () => draftAutosave?.flush() ?? Promise.resolve(true),
});

const createVersionButton = document.querySelector<HTMLButtonElement>('[data-create-version]');
const openVersionsButton = document.querySelector<HTMLButtonElement>('[data-open-versions]');
const versionDialog = document.querySelector<HTMLDialogElement>('[data-version-dialog]');
const versionTitleInput = document.querySelector<HTMLInputElement>('[data-version-title]');
const versionLabelInput = document.querySelector<HTMLInputElement>('[data-version-label]');
const versionDescriptionInput = document.querySelector<HTMLInputElement>(
  '[data-version-description]',
);
const confirmVersionButton = document.querySelector<HTMLButtonElement>('[data-confirm-version]');
const closeVersionsButton = document.querySelector<HTMLButtonElement>('[data-close-versions]');
const versionStatus = document.querySelector<HTMLElement>('[data-version-status]');
const versionList = document.querySelector<HTMLElement>('[data-version-list]');
const versionPreview = document.querySelector<HTMLElement>('[data-version-preview]');

function setVersionStatus(message: string, error = false): void {
  if (!versionStatus) return;
  versionStatus.textContent = message;
  versionStatus.classList.toggle('is-error', error);
}

async function flushVersionDraft(): Promise<boolean> {
  const flush = (globalThis as unknown as { worldforgeFlushDraft?: () => Promise<boolean> })
    .worldforgeFlushDraft;
  return flush ? flush() : true;
}

async function refreshVersions(): Promise<void> {
  const project = activeProject;
  const chapter = activeChapter;
  if (!project || !chapter || !versionList) return;
  const result = await window.worldforge.version.list(project.projectId, chapter.id);
  versionList.replaceChildren();
  if (!result.ok) {
    setVersionStatus(`读取版本失败 · ${result.error.code}`, true);
    return;
  }
  if (result.data.versions.length === 0) {
    versionList.textContent = '还没有手动版本。';
    return;
  }
  for (const version of result.data.versions) {
    const row = document.createElement('article');
    row.className = 'version-row';
    row.dataset.versionRow = '';
    row.dataset.versionId = version.versionId;
    row.innerHTML = `<div><strong></strong><small></small></div><div class="version-row__actions"></div>`;
    row.querySelector('strong')!.textContent = version.title;
    row.querySelector('small')!.textContent =
      `${version.wordCount}字 · Revision ${version.sourceRevision}${version.label ? ` · ${version.label}` : ''}${version.finalized ? ' · 定稿' : ''}`;
    const actions = row.querySelector<HTMLElement>('.version-row__actions')!;
    for (const [label, action] of [
      ['预览', 'preview'],
      ['设为定稿', 'final'],
      ['恢复为新草稿', 'restore'],
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.dataset.versionAction = action;
      button.dataset.versionId = version.versionId;
      button.disabled = activeProject?.databaseMode !== 'read-write' && action !== 'preview';
      actions.append(button);
    }
    versionList.append(row);
  }
}

async function handleVersionAction(action: string, versionId: string): Promise<void> {
  const project = activeProject;
  const chapter = activeChapter;
  if (!project || !chapter) return;
  const input = { projectId: project.projectId, chapterId: chapter.id, versionId };
  if (action === 'preview') {
    const result = await window.worldforge.version.get(input);
    if (!result.ok) return setVersionStatus(`预览失败 · ${result.error.code}`, true);
    if (versionPreview) {
      versionPreview.textContent = result.data.blocks.map((block) => block.text).join('\n');
    }
    setVersionStatus(`正在预览：${result.data.title}`);
    return;
  }
  if (project.databaseMode !== 'read-write') return;
  if (action === 'final') {
    const result = await window.worldforge.version.setFinal(input);
    if (!result.ok) return setVersionStatus(`定稿失败 · ${result.error.code}`, true);
    setVersionStatus(`已将“${result.data.title}”设为定稿。`);
    await refreshVersions();
    await refreshProjectStructure();
    return;
  }
  if (action === 'restore') {
    if (!(await flushVersionDraft())) return setVersionStatus('自动保存失败，已阻止恢复。', true);
    const result = await window.worldforge.version.restore(input);
    if (!result.ok) return setVersionStatus(`恢复失败 · ${result.error.code}`, true);
    activeDraft = result.data;
    lastSavedRevision = result.data.revision;
    synchronizingDraftMetadata = true;
    draftEditor?.commands.setContent(documentToTiptapJson(persistedBlocks(result.data)), {
      emitUpdate: false,
    });
    synchronizingDraftMetadata = false;
    draftDirty = false;
    updateDraftStatistics();
    setVersionStatus(`已从版本恢复为新 Draft · Revision ${result.data.revision}`);
    setDraftState('已从只读版本恢复为新草稿。');
    await refreshProjectStructure();
  }
}

createVersionButton?.addEventListener('click', () => {
  versionDialog?.showModal();
  versionTitleInput?.focus();
  void refreshVersions();
});
openVersionsButton?.addEventListener('click', () => {
  versionDialog?.showModal();
  void refreshVersions();
});
closeVersionsButton?.addEventListener('click', () => versionDialog?.close());
confirmVersionButton?.addEventListener('click', () => {
  void (async () => {
    const project = activeProject;
    const chapter = activeChapter;
    if (!project || !chapter || !activeDraft || project.databaseMode !== 'read-write') return;
    const title = versionTitleInput?.value.trim() ?? '';
    if (!title) return setVersionStatus('请输入版本标题。', true);
    if (!(await flushVersionDraft())) return setVersionStatus('自动保存失败，未创建版本。', true);
    if (!activeDraft) return;
    confirmVersionButton.disabled = true;
    const result = await window.worldforge.version.create({
      projectId: project.projectId,
      chapterId: chapter.id,
      draftId: activeDraft.draftId,
      baseRevision: activeDraft.revision,
      title,
      label: versionLabelInput?.value.trim() || null,
      description: versionDescriptionInput?.value.trim() ?? '',
    });
    confirmVersionButton.disabled = false;
    if (!result.ok) return setVersionStatus(`创建版本失败 · ${result.error.code}`, true);
    if (versionTitleInput) versionTitleInput.value = '';
    if (versionLabelInput) versionLabelInput.value = '';
    if (versionDescriptionInput) versionDescriptionInput.value = '';
    setVersionStatus(`版本“${result.data.title}”已创建，内容不可修改。`);
    await refreshVersions();
  })();
});
versionList?.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-version-action]');
  const action = button?.dataset.versionAction;
  const versionId = button?.dataset.versionId;
  if (action && versionId) void handleVersionAction(action, versionId);
});
