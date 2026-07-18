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
import type {
  ExportVersionChoice,
  ImportPlan,
  ImportPlanChapter,
  StructureOperationPreview,
  StructureOperationResult,
} from '@worldforge/contracts';

import { contentWidthPixels, layoutPolicyForViewport } from './layout-model.js';
import type {
  AppearancePreferences,
  AppSettings,
  AppSettingsSnapshot,
  AppSettingsUpdate,
  Chapter,
  DraftDocument,
  LifecycleStatus,
  ProjectStructure,
  ProjectWorkspaceSummary,
  RecentProject,
  TrashEntry,
  Volume,
} from './types.js';

const defaultAppearance: AppearancePreferences = {
  workspaceAlignment: 'center',
  uiScalePercent: 100,
  bodyFontSize: 18,
  contentWidth: 'normal',
};

const defaultSettings: AppSettings = {
  schemaVersion: 1,
  language: 'zh-CN',
  startupBehavior: 'show-home',
  defaultMode: 'beginner',
  themeId: 'theme-a',
  themeVariant: 'light',
  reduceMotion: false,
};

const statusElement = document.querySelector<HTMLElement>('[data-core-status]');
const diagnosticElement = document.querySelector<HTMLElement>('[data-diagnostic-id]');
const versionElement = document.querySelector<HTMLElement>('[data-app-version]');
const restartButton = document.querySelector<HTMLButtonElement>('[data-restart-core]');
const leftPanel = document.querySelector<HTMLElement>('[data-left-sidebar]');
const rightPanel = document.querySelector<HTMLElement>('[data-right-sidebar]');
const leftToggle = document.querySelector<HTMLButtonElement>('[data-toggle-left]');
const rightToggle = document.querySelector<HTMLButtonElement>('[data-toggle-right]');
const drawerScrim = document.querySelector<HTMLButtonElement>('[data-drawer-scrim]');
const appearanceForm = document.querySelector<HTMLFormElement>('[data-appearance-form]');
const preferenceStatus = document.querySelector<HTMLElement>('[data-preference-status]');
const layoutReadout = document.querySelector<HTMLElement>('[data-layout-readout]');
const viewportReadout = document.querySelector<HTMLElement>('[data-viewport-readout]');
const contentReadout = document.querySelector<HTMLElement>('[data-content-readout]');
const popover = document.querySelector<HTMLElement>('[data-popover]');
const popoverTrigger = document.querySelector<HTMLButtonElement>('[data-boundary-popover]');
const boundaryDialog = document.querySelector<HTMLDialogElement>('[data-boundary-dialog]');
const recentLoading = document.querySelector<HTMLElement>('[data-recent-loading]');
const recentEmpty = document.querySelector<HTMLElement>('[data-recent-empty]');
const recentError = document.querySelector<HTMLElement>('[data-recent-error]');
const recentList = document.querySelector<HTMLElement>('[data-recent-list]');
const refreshRecentButton = document.querySelector<HTMLButtonElement>('[data-refresh-recent]');
const settingsDialog = document.querySelector<HTMLDialogElement>('[data-settings-dialog]');
const settingsForm = document.querySelector<HTMLFormElement>('[data-settings-form]');
const settingsStatus = document.querySelector<HTMLElement>('[data-settings-status]');
const openSettingsButton = document.querySelector<HTMLButtonElement>('[data-open-settings]');
const saveSettingsButton = document.querySelector<HTMLButtonElement>('[data-save-settings]');
const resetSettingsButton = document.querySelector<HTMLButtonElement>('[data-reset-settings]');
const closeSettingsButton = document.querySelector<HTMLButtonElement>('[data-close-settings]');
const workspaceTitle = document.querySelector<HTMLElement>('[data-workspace-title]');
const workspaceBadge = document.querySelector<HTMLElement>('[data-workspace-badge]');
const activeProjectPanel = document.querySelector<HTMLElement>('[data-active-project]');
const activeProjectName = document.querySelector<HTMLElement>('[data-active-project-name]');
const activeProjectPath = document.querySelector<HTMLElement>('[data-active-project-path]');
const activeProjectMode = document.querySelector<HTMLElement>('[data-active-project-mode]');
const activeProjectReadOnly = document.querySelector<HTMLElement>('[data-active-project-readonly]');
const projectOperationStatus = document.querySelector<HTMLElement>(
  '[data-project-operation-status]',
);
const moveProjectButton = document.querySelector<HTMLButtonElement>('[data-move-project]');
const openTextIoButton = document.querySelector<HTMLButtonElement>('[data-open-text-io]');
const textIoDialog = document.querySelector<HTMLDialogElement>('[data-text-io-dialog]');
const textIoStatus = document.querySelector<HTMLElement>('[data-text-io-status]');
const importEncoding = document.querySelector<HTMLSelectElement>('[data-import-encoding]');
const previewImportButton = document.querySelector<HTMLButtonElement>('[data-preview-import]');
const commitImportButton = document.querySelector<HTMLButtonElement>('[data-commit-import]');
const importVolumeTitle = document.querySelector<HTMLInputElement>('[data-import-volume-title]');
const importPlanList = document.querySelector<HTMLElement>('[data-import-plan-list]');
const refreshExportVersionsButton = document.querySelector<HTMLButtonElement>(
  '[data-refresh-export-versions]',
);
const exportVersionList = document.querySelector<HTMLElement>('[data-export-version-list]');
const exportFormat = document.querySelector<HTMLSelectElement>('[data-export-format]');
const exportFileName = document.querySelector<HTMLInputElement>('[data-export-file-name]');
const exportVersionsButton = document.querySelector<HTMLButtonElement>('[data-export-versions]');
const closeTextIoButton = document.querySelector<HTMLButtonElement>('[data-close-text-io]');
const closeProjectButton = document.querySelector<HTMLButtonElement>('[data-close-project]');
const createProjectButtons = document.querySelectorAll<HTMLButtonElement>(
  '[data-open-create-project], [data-create-project]',
);
const openProjectButtons = document.querySelectorAll<HTMLButtonElement>(
  '[data-open-project], [data-select-project]',
);
const createProjectDialog = document.querySelector<HTMLDialogElement>(
  '[data-create-project-dialog]',
);
const createProjectForm = document.querySelector<HTMLFormElement>('[data-create-project-form]');
const createProjectStatus = document.querySelector<HTMLElement>('[data-create-project-status]');
const confirmCreateProjectButton = document.querySelector<HTMLButtonElement>(
  '[data-confirm-create-project]',
);
const cancelCreateProjectButton = document.querySelector<HTMLButtonElement>(
  '[data-cancel-create-project]',
);
const projectInitialStructure = document.querySelector<HTMLSelectElement>(
  '[data-project-initial-structure]',
);
const homeNavigation = document.querySelector<HTMLElement>('[data-home-navigation]');
const homePanelNote = document.querySelector<HTMLElement>('[data-home-panel-note]');
const structurePanel = document.querySelector<HTMLElement>('[data-structure-panel]');
const structureTree = document.querySelector<HTMLElement>('[data-structure-tree]');
const structureState = document.querySelector<HTMLElement>('[data-structure-state]');
const createVolumeButton = document.querySelector<HTMLButtonElement>('[data-create-volume]');
const openTrashButton = document.querySelector<HTMLButtonElement>('[data-open-trash]');
const structureDialog = document.querySelector<HTMLDialogElement>('[data-structure-dialog]');
const structureForm = document.querySelector<HTMLFormElement>('[data-structure-form]');
const structureDialogTitle = document.querySelector<HTMLElement>('[data-structure-dialog-title]');
const structureTitleInput = document.querySelector<HTMLInputElement>('[data-structure-title]');
const structureStatusSelect = document.querySelector<HTMLSelectElement>('[data-structure-status]');
const structureStatusField = document.querySelector<HTMLElement>('[data-structure-status-field]');
const structureVolumeField = document.querySelector<HTMLElement>('[data-structure-volume-field]');
const structureVolumeSelect = document.querySelector<HTMLSelectElement>('[data-structure-volume]');
const structureWordFields = document.querySelector<HTMLElement>('[data-structure-word-fields]');
const structureFormStatus = document.querySelector<HTMLElement>('[data-structure-form-status]');
const saveStructureButton = document.querySelector<HTMLButtonElement>('[data-save-structure]');
const cancelStructureButton = document.querySelector<HTMLButtonElement>('[data-cancel-structure]');
const trashDialog = document.querySelector<HTMLDialogElement>('[data-trash-dialog]');
const trashList = document.querySelector<HTMLElement>('[data-trash-list]');
const trashStatus = document.querySelector<HTMLElement>('[data-trash-status]');
const closeTrashButton = document.querySelector<HTMLButtonElement>('[data-close-trash]');
const homeIntro = document.querySelector<HTMLElement>('[data-home-intro]');
const recentProjectsPanel = document.querySelector<HTMLElement>('[data-recent-projects]');
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
let applicationSettings = defaultSettings;
let activeProject: ProjectWorkspaceSummary | null = null;
let activeStructure: ProjectStructure | null = null;
let structureRefreshVersion = 0;
let activeChapter: Chapter | null = null;
let activeDraft: DraftDocument | null = null;
let draftEditor: Editor | null = null;
let draftDirty = false;
let draftComposing = false;
let synchronizingDraftMetadata = false;
let draftAutosave: DraftAutosaveCoordinator | null = null;
let lastSavedRevision = 0;
let currentFindIndex = -1;
let activeImportPlan: ImportPlan | null = null;
let exportVersionChoices: ExportVersionChoice[] = [];
let draftFindMatches: { readonly from: number; readonly to: number }[] = [];
const chapterSelections = new Map<string, { readonly from: number; readonly to: number }>();
let resizeFrame: number | null = null;
let drawerRestoreTarget: HTMLElement | null = null;

function setStatus(status: string, diagnosticId: string | null): void {
  if (statusElement) statusElement.textContent = status;
  if (diagnosticElement) {
    diagnosticElement.textContent = diagnosticId ? `诊断：${diagnosticId}` : '';
  }
}

function setFormValues(value: AppearancePreferences): void {
  if (!appearanceForm) return;
  const uiScale = appearanceForm.elements.namedItem('uiScalePercent');
  const bodyFontSize = appearanceForm.elements.namedItem('bodyFontSize');
  const contentWidth = appearanceForm.elements.namedItem('contentWidth');
  if (uiScale instanceof HTMLSelectElement) uiScale.value = String(value.uiScalePercent);
  if (bodyFontSize instanceof HTMLSelectElement) bodyFontSize.value = String(value.bodyFontSize);
  if (contentWidth instanceof HTMLSelectElement) contentWidth.value = value.contentWidth;
  for (const input of appearanceForm.querySelectorAll<HTMLInputElement>(
    'input[name="workspaceAlignment"]',
  )) {
    input.checked = input.value === value.workspaceAlignment;
  }
}

function settingsControl(name: string): HTMLSelectElement | HTMLInputElement | null {
  if (!settingsForm) return null;
  const control = settingsForm.elements.namedItem(name);
  return control instanceof HTMLSelectElement || control instanceof HTMLInputElement
    ? control
    : null;
}

function updateThemeVariantAvailability(): void {
  const themeId = settingsControl('themeId');
  const themeVariant = settingsControl('themeVariant');
  if (!(themeId instanceof HTMLSelectElement) || !(themeVariant instanceof HTMLSelectElement)) {
    return;
  }
  const themeB = themeId.value === 'theme-b';
  for (const option of themeVariant.options) {
    option.disabled = themeB && ['eye-care', 'high-contrast'].includes(option.value);
  }
  if (themeB && ['eye-care', 'high-contrast'].includes(themeVariant.value)) {
    themeVariant.value = 'light';
  }
}

function applyApplicationSettings(settings: AppSettings): void {
  applicationSettings = settings;
  document.body.dataset.authorMode = settings.defaultMode;
  document.body.dataset.visualThemeId = settings.themeId;
  document.body.dataset.visualThemeVariant = settings.themeVariant;
  document.body.dataset.motionPreference = settings.reduceMotion ? 'reduced' : 'standard';
}

function setSettingsFormValues(settings: AppSettings): void {
  if (!settingsForm) return;
  for (const [name, value] of [
    ['language', settings.language],
    ['startupBehavior', settings.startupBehavior],
    ['defaultMode', settings.defaultMode],
    ['themeId', settings.themeId],
    ['themeVariant', settings.themeVariant],
  ] as const) {
    const control = settingsControl(name);
    if (control instanceof HTMLSelectElement) control.value = value;
  }
  const reduceMotion = settingsControl('reduceMotion');
  if (reduceMotion instanceof HTMLInputElement) reduceMotion.checked = settings.reduceMotion;
  updateThemeVariantAvailability();
}

function readSettingsForm(): AppSettingsUpdate | null {
  const language = settingsControl('language');
  const startupBehavior = settingsControl('startupBehavior');
  const defaultMode = settingsControl('defaultMode');
  const themeId = settingsControl('themeId');
  const themeVariant = settingsControl('themeVariant');
  const reduceMotion = settingsControl('reduceMotion');
  if (
    !(language instanceof HTMLSelectElement) ||
    !(startupBehavior instanceof HTMLSelectElement) ||
    !(defaultMode instanceof HTMLSelectElement) ||
    !(themeId instanceof HTMLSelectElement) ||
    !(themeVariant instanceof HTMLSelectElement) ||
    !(reduceMotion instanceof HTMLInputElement) ||
    language.value !== 'zh-CN' ||
    !['show-home', 'reopen-last'].includes(startupBehavior.value) ||
    !['beginner', 'professional'].includes(defaultMode.value) ||
    !['theme-a', 'theme-b'].includes(themeId.value) ||
    !['light', 'dark', 'eye-care', 'high-contrast'].includes(themeVariant.value) ||
    (themeId.value === 'theme-b' && !['light', 'dark'].includes(themeVariant.value))
  ) {
    return null;
  }
  return {
    language: language.value,
    startupBehavior: startupBehavior.value as AppSettings['startupBehavior'],
    defaultMode: defaultMode.value as AppSettings['defaultMode'],
    themeId: themeId.value as AppSettings['themeId'],
    themeVariant: themeVariant.value as AppSettings['themeVariant'],
    reduceMotion: reduceMotion.checked,
  };
}

function showSettingsSnapshot(snapshot: AppSettingsSnapshot): void {
  applyApplicationSettings(snapshot.settings);
  setSettingsFormValues(snapshot.settings);
  if (!settingsStatus) return;
  settingsStatus.classList.remove('is-error');
  settingsStatus.textContent =
    snapshot.source === 'recovered' ? '检测到不兼容或损坏的设置，已安全恢复默认值' : '';
}

function setProjectOperationStatus(message: string, error = false): void {
  if (!projectOperationStatus) return;
  projectOperationStatus.textContent = message;
  projectOperationStatus.classList.toggle('is-error', error);
}

const lifecycleLabels: Record<LifecycleStatus, string> = {
  pending: '待规划',
  outlined: '已规划',
  writing: '写作中',
  reviewing: '审阅中',
  finalized: '已定稿',
};

function setStructureState(message: string, error = false): void {
  if (!structureState) return;
  structureState.textContent = message;
  structureState.classList.toggle('is-error', error);
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
  if (homeIntro) homeIntro.hidden = false;
  if (recentProjectsPanel) recentProjectsPanel.hidden = false;
  if (activeProjectPanel) activeProjectPanel.hidden = activeProject === null;
  if (draftWorkspace) draftWorkspace.hidden = true;
  if (activeProject && workspaceTitle) workspaceTitle.textContent = activeProject.name;
  if (activeProject && workspaceBadge) {
    workspaceBadge.textContent =
      activeProject.databaseMode === 'read-only' ? '只读项目' : '本地项目';
  }
}

function showDraftWorkspace(): void {
  if (homeIntro) homeIntro.hidden = true;
  if (recentProjectsPanel) recentProjectsPanel.hidden = true;
  if (activeProjectPanel) activeProjectPanel.hidden = true;
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

function treeAction(label: string, title: string, attribute: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tree-action';
  button.textContent = label;
  button.title = title;
  button.setAttribute(attribute, '');
  button.disabled = activeProject?.databaseMode !== 'read-write';
  return button;
}

async function runStructureMutation(
  operation: Promise<{
    readonly ok: boolean;
    readonly data?: ProjectStructure;
    readonly error?: { readonly code: string };
  }>,
  progress: string,
): Promise<ProjectStructure | null> {
  setStructureState(progress);
  try {
    const result = await operation;
    if (result.ok && result.data) {
      structureRefreshVersion += 1;
      renderProjectStructure(result.data);
      setStructureState('卷章结构已保存到项目数据库。');
      return result.data;
    }
    setStructureState(`操作失败 · ${result.error?.code ?? 'COMMON_INTERNAL_999'}`, true);
  } catch {
    setStructureState('操作失败 · COMMON_INTERNAL_999', true);
  }
  return null;
}

async function operationDraft(chapter: Chapter): Promise<DraftDocument | null> {
  const project = activeProject;
  if (!project) return null;
  if (draftAutosave?.hasPendingWork && !(await draftAutosave.flush())) {
    setStructureState('自动保存失败，已阻止结构操作。', true);
    return null;
  }
  if (activeChapter?.id === chapter.id && activeDraft) return activeDraft;
  const result = await window.worldforge.draft.open({
    projectId: project.projectId,
    chapterId: chapter.id,
  });
  if (!result.ok) {
    setStructureState(`正文读取失败 · ${result.error.code}`, true);
    return null;
  }
  return result.data;
}

function confirmStructurePreview(preview: StructureOperationPreview): boolean {
  const warning = preview.warnings.length ? `\n\n${preview.warnings.join('\n')}` : '';
  return window.confirm(
    `影响预览：移动 ${preview.movedLogicalBlockIds.length} 个正文块（${preview.movedCharacterCount} 字符）。\n` +
      `源 Draft：${preview.sourceBlockCount} → ${preview.resultingSourceBlockCount} 块\n` +
      `目标 Draft：${preview.targetBlockCount} → ${preview.resultingTargetBlockCount} 块\n` +
      `执行前将创建已验证恢复点。${warning}\n\n继续执行？`,
  );
}

function showStructureOperationResult(
  result: StructureOperationResult,
  preferredChapterId: string,
): void {
  structureRefreshVersion += 1;
  renderProjectStructure(result.structure);
  setStructureState(`结构操作完成 · 恢复点 ${result.backupId.slice(0, 8)}`);
  const chapter = result.structure.volumes
    .flatMap((volume) => volume.chapters)
    .find((candidate) => candidate.id === preferredChapterId);
  const draft = result.drafts.find((candidate) => candidate.chapterId === preferredChapterId);
  if (chapter && draft) mountDraftEditor(draft, chapter);
}

async function splitChapterWithPreview(chapter: Chapter): Promise<void> {
  const project = activeProject;
  if (!project || project.databaseMode !== 'read-write') return;
  const draft = await operationDraft(chapter);
  if (!draft || draft.blocks.length < 2) {
    setStructureState('拆章至少需要两个正文块。', true);
    return;
  }
  const title = window.prompt('新章节标题', `${chapter.title}（下）`)?.trim();
  if (!title) return;
  const requested = window.prompt(
    `在第几个正文块后拆分？请输入 1—${draft.blocks.length - 1}`,
    String(Math.max(1, Math.floor(draft.blocks.length / 2))),
  );
  const blockNumber = Number(requested);
  if (!Number.isInteger(blockNumber) || blockNumber < 1 || blockNumber >= draft.blocks.length) {
    setStructureState('拆分位置无效。', true);
    return;
  }
  const input = {
    projectId: project.projectId,
    chapterId: chapter.id,
    draftId: draft.draftId,
    baseRevision: draft.revision,
    splitAfterLogicalBlockId: draft.blocks[blockNumber - 1]!.logicalBlockId,
    newChapterTitle: title,
  };
  setStructureState('正在生成拆章影响预览…');
  const preview = await window.worldforge.planning.previewSplitChapter(input);
  if (!preview.ok) return setStructureState(`拆章预览失败 · ${preview.error.code}`, true);
  if (!preview.data.canExecute || !confirmStructurePreview(preview.data)) return;
  setStructureState('正在创建恢复点并拆章…');
  const result = await window.worldforge.planning.splitChapter({
    ...input,
    planHash: preview.data.planHash,
  });
  if (!result.ok) return setStructureState(`拆章失败 · ${result.error.code}`, true);
  showStructureOperationResult(result.data, chapter.id);
}

async function mergeChapterWithPreview(
  volume: Volume,
  chapter: Chapter,
  chapterIndex: number,
): Promise<void> {
  const project = activeProject;
  const target = volume.chapters[chapterIndex - 1] ?? volume.chapters[chapterIndex + 1] ?? null;
  if (!project || !target || project.databaseMode !== 'read-write') {
    setStructureState('合章需要同卷中的另一章节。', true);
    return;
  }
  const sourceDraft = await operationDraft(chapter);
  const targetDraft = await operationDraft(target);
  if (!sourceDraft || !targetDraft) return;
  const input = {
    projectId: project.projectId,
    sourceChapterId: chapter.id,
    sourceDraftId: sourceDraft.draftId,
    sourceBaseRevision: sourceDraft.revision,
    targetChapterId: target.id,
    targetDraftId: targetDraft.draftId,
    targetBaseRevision: targetDraft.revision,
  };
  setStructureState('正在生成合章影响预览…');
  const preview = await window.worldforge.planning.previewMergeChapters(input);
  if (!preview.ok) return setStructureState(`合章预览失败 · ${preview.error.code}`, true);
  if (!preview.data.canExecute || !confirmStructurePreview(preview.data)) return;
  setStructureState('正在创建恢复点并合章…');
  const result = await window.worldforge.planning.mergeChapters({
    ...input,
    planHash: preview.data.planHash,
  });
  if (!result.ok) return setStructureState(`合章失败 · ${result.error.code}`, true);
  showStructureOperationResult(result.data, target.id);
}

async function moveBlocksWithPreview(
  volume: Volume,
  chapter: Chapter,
  chapterIndex: number,
): Promise<void> {
  const project = activeProject;
  const target = volume.chapters[chapterIndex + 1] ?? volume.chapters[chapterIndex - 1] ?? null;
  if (!project || !target || project.databaseMode !== 'read-write') {
    setStructureState('跨章移动需要同卷中的另一章节。', true);
    return;
  }
  const sourceDraft = await operationDraft(chapter);
  const targetDraft = await operationDraft(target);
  if (!sourceDraft || !targetDraft) return;
  const raw = window.prompt(
    `移动到“${target.title}”。请输入正文块编号（1—${sourceDraft.blocks.length}，可用逗号分隔）`,
    String(sourceDraft.blocks.length),
  );
  if (!raw) return;
  const indexes = [...new Set(raw.split(/[,，\s]+/u).map(Number))];
  if (
    indexes.length === 0 ||
    indexes.some(
      (index) => !Number.isInteger(index) || index < 1 || index > sourceDraft.blocks.length,
    )
  ) {
    setStructureState('正文块编号无效。', true);
    return;
  }
  const input = {
    projectId: project.projectId,
    sourceChapterId: chapter.id,
    sourceDraftId: sourceDraft.draftId,
    sourceBaseRevision: sourceDraft.revision,
    targetChapterId: target.id,
    targetDraftId: targetDraft.draftId,
    targetBaseRevision: targetDraft.revision,
    logicalBlockIds: indexes.map((index) => sourceDraft.blocks[index - 1]!.logicalBlockId),
    afterTargetLogicalBlockId: targetDraft.blocks.at(-1)?.logicalBlockId ?? null,
  };
  setStructureState('正在生成跨章移动影响预览…');
  const preview = await window.worldforge.planning.previewMoveBlocks(input);
  if (!preview.ok) return setStructureState(`移动预览失败 · ${preview.error.code}`, true);
  if (!preview.data.canExecute || !confirmStructurePreview(preview.data)) return;
  setStructureState('正在创建恢复点并移动正文块…');
  const result = await window.worldforge.planning.moveBlocks({
    ...input,
    planHash: preview.data.planHash,
  });
  if (!result.ok) return setStructureState(`跨章移动失败 · ${result.error.code}`, true);
  showStructureOperationResult(result.data, chapter.id);
}

function openVolumeEditor(volume?: Volume): void {
  if (!structureForm || !structureDialog || activeProject?.databaseMode !== 'read-write') return;
  structureForm.reset();
  structureForm.dataset.entityType = 'volume';
  structureForm.dataset.mode = volume ? 'edit' : 'create';
  structureForm.dataset.entityId = volume?.id ?? '';
  if (structureDialogTitle) structureDialogTitle.textContent = volume ? '编辑卷' : '新建卷';
  if (structureTitleInput) structureTitleInput.value = volume?.title ?? '';
  if (structureStatusSelect) structureStatusSelect.value = volume?.status ?? 'pending';
  if (structureStatusField) structureStatusField.hidden = !volume;
  if (structureVolumeField) structureVolumeField.hidden = true;
  if (structureWordFields) structureWordFields.hidden = true;
  if (structureFormStatus) {
    structureFormStatus.textContent = '';
    structureFormStatus.classList.remove('is-error');
  }
  structureDialog.showModal();
  structureTitleInput?.focus();
}

function fillVolumeChoices(selectedVolumeId: string): void {
  if (!structureVolumeSelect) return;
  structureVolumeSelect.replaceChildren();
  for (const volume of activeStructure?.volumes ?? []) {
    const option = document.createElement('option');
    option.value = volume.id;
    option.textContent = volume.title;
    option.selected = volume.id === selectedVolumeId;
    structureVolumeSelect.append(option);
  }
}

function openChapterEditor(volume: Volume, chapter?: Chapter): void {
  if (!structureForm || !structureDialog || activeProject?.databaseMode !== 'read-write') return;
  structureForm.reset();
  structureForm.dataset.entityType = 'chapter';
  structureForm.dataset.mode = chapter ? 'edit' : 'create';
  structureForm.dataset.entityId = chapter?.id ?? '';
  structureForm.dataset.originalVolumeId = volume.id;
  if (structureDialogTitle) structureDialogTitle.textContent = chapter ? '编辑章节' : '新建章节';
  if (structureTitleInput) structureTitleInput.value = chapter?.title ?? '';
  if (structureStatusSelect) structureStatusSelect.value = chapter?.status ?? 'pending';
  if (structureStatusField) structureStatusField.hidden = !chapter;
  if (structureVolumeField) structureVolumeField.hidden = false;
  if (structureWordFields) structureWordFields.hidden = !chapter;
  fillVolumeChoices(volume.id);
  const minimum = structureForm.elements.namedItem('targetWordMin');
  const maximum = structureForm.elements.namedItem('targetWordMax');
  if (minimum instanceof HTMLInputElement) {
    minimum.value =
      chapter?.targetWordMin === null || !chapter ? '' : String(chapter.targetWordMin);
  }
  if (maximum instanceof HTMLInputElement) {
    maximum.value =
      chapter?.targetWordMax === null || !chapter ? '' : String(chapter.targetWordMax);
  }
  if (structureFormStatus) {
    structureFormStatus.textContent = '';
    structureFormStatus.classList.remove('is-error');
  }
  structureDialog.showModal();
  structureTitleInput?.focus();
}

function renderProjectStructure(structure: ProjectStructure | null): void {
  activeStructure = structure;
  const refreshedActiveChapter = activeChapter
    ? structure?.volumes
        .flatMap((volume) => volume.chapters)
        .find((chapter) => chapter.id === activeChapter?.id)
    : undefined;
  if (activeChapter && structure && !refreshedActiveChapter) {
    destroyDraftEditor();
    showProjectOverview();
    setStructureState('当前章节已不在活动目录中，正文编辑已安全停止。');
  } else if (refreshedActiveChapter && activeProject) {
    activeChapter = refreshedActiveChapter;
    if (draftChapterTitle) draftChapterTitle.textContent = refreshedActiveChapter.title;
    if (workspaceTitle) {
      workspaceTitle.textContent = `${activeProject.name} · ${refreshedActiveChapter.title}`;
    }
  }
  structureTree?.replaceChildren();
  if (!structureTree || !structure) return;
  if (structure.volumes.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'structure-empty';
    empty.textContent = '这是一个专业空白项目。点击“新建卷”开始建立目录。';
    empty.setAttribute('data-structure-empty', '');
    structureTree.append(empty);
    return;
  }

  structure.volumes.forEach((volume, volumeIndex) => {
    const node = document.createElement('section');
    node.className = 'volume-node';
    node.dataset.volumeId = volume.id;
    node.dataset.volumeTitle = volume.title;
    const row = document.createElement('div');
    row.className = 'volume-node__row';
    const label = document.createElement('div');
    label.className = 'volume-node__label';
    const title = document.createElement('strong');
    title.textContent = volume.title;
    const metadata = document.createElement('small');
    metadata.textContent = `${lifecycleLabels[volume.status]} · ${volume.chapters.length} 章`;
    label.append(title, metadata);
    const actions = document.createElement('div');
    actions.className = 'tree-actions';
    const addChapter = treeAction('+章', '在本卷新建章节', 'data-add-chapter');
    addChapter.addEventListener('click', () => openChapterEditor(volume));
    const edit = treeAction('编', '编辑卷', 'data-edit-volume');
    edit.addEventListener('click', () => openVolumeEditor(volume));
    const up = treeAction('↑', '上移卷', 'data-move-volume-up');
    up.disabled ||= volumeIndex === 0;
    up.addEventListener('click', () => {
      const previous = structure.volumes[volumeIndex - 1];
      const project = activeProject;
      if (!previous || !project) return;
      void runStructureMutation(
        window.worldforge.planning.moveVolume({
          projectId: project.projectId,
          volumeId: volume.id,
          placement: { kind: 'before', siblingId: previous.id },
        }),
        '正在调整卷顺序…',
      );
    });
    const down = treeAction('↓', '下移卷', 'data-move-volume-down');
    down.disabled ||= volumeIndex === structure.volumes.length - 1;
    down.addEventListener('click', () => {
      const next = structure.volumes[volumeIndex + 1];
      const project = activeProject;
      if (!next || !project) return;
      void runStructureMutation(
        window.worldforge.planning.moveVolume({
          projectId: project.projectId,
          volumeId: volume.id,
          placement: { kind: 'after', siblingId: next.id },
        }),
        '正在调整卷顺序…',
      );
    });
    const remove = treeAction('删', '移入废纸篓', 'data-delete-volume');
    remove.addEventListener('click', () => {
      const project = activeProject;
      const includesDirtyChapter =
        draftDirty && volume.chapters.some((chapter) => chapter.id === activeChapter?.id);
      const warning = includesDirtyChapter
        ? `“${volume.title}”包含当前编辑章节。移入废纸篓会丢弃窗口内尚未保存的正文，是否继续？`
        : `将“${volume.title}”移入废纸篓？`;
      if (!project || !window.confirm(warning)) return;
      void runStructureMutation(
        window.worldforge.planning.deleteVolume({
          projectId: project.projectId,
          volumeId: volume.id,
        }),
        '正在移入废纸篓…',
      );
    });
    actions.append(addChapter, edit, up, down, remove);
    row.append(label, actions);
    node.append(row);

    const chapterList = document.createElement('ol');
    chapterList.className = 'chapter-list';
    for (const [chapterIndex, chapter] of volume.chapters.entries()) {
      const chapterNode = document.createElement('li');
      chapterNode.className = 'chapter-node';
      chapterNode.classList.toggle('is-active', activeChapter?.id === chapter.id);
      chapterNode.dataset.chapterId = chapter.id;
      chapterNode.dataset.chapterTitle = chapter.title;
      const chapterLabel = document.createElement('div');
      chapterLabel.className = 'chapter-node__label';
      const chapterTitle = document.createElement('button');
      chapterTitle.type = 'button';
      chapterTitle.className = 'chapter-node__open';
      chapterTitle.setAttribute('data-open-chapter', '');
      chapterTitle.setAttribute('aria-pressed', String(activeChapter?.id === chapter.id));
      chapterTitle.textContent = chapter.title;
      chapterTitle.addEventListener('click', () => {
        void openChapterDraft(chapter);
      });
      const chapterMetadata = document.createElement('small');
      const target =
        chapter.targetWordMin === null && chapter.targetWordMax === null
          ? '未设目标'
          : `${chapter.targetWordMin ?? 0}—${chapter.targetWordMax ?? '∞'} 字`;
      chapterMetadata.textContent = `${lifecycleLabels[chapter.status]} · ${target}`;
      chapterLabel.append(chapterTitle, chapterMetadata);
      const chapterActions = document.createElement('div');
      chapterActions.className = 'tree-actions';
      const editChapter = treeAction('编', '编辑章节', 'data-edit-chapter');
      editChapter.addEventListener('click', () => openChapterEditor(volume, chapter));
      const splitChapter = treeAction('拆', '预览并拆分章节', 'data-split-chapter');
      splitChapter.addEventListener('click', () => {
        void splitChapterWithPreview(chapter);
      });
      const mergeChapter = treeAction('并', '预览并合并到相邻章节', 'data-merge-chapter');
      mergeChapter.disabled ||= volume.chapters.length < 2;
      mergeChapter.addEventListener('click', () => {
        void mergeChapterWithPreview(volume, chapter, chapterIndex);
      });
      const moveBlocks = treeAction('移', '预览并跨章移动正文块', 'data-move-blocks');
      moveBlocks.disabled ||= volume.chapters.length < 2;
      moveBlocks.addEventListener('click', () => {
        void moveBlocksWithPreview(volume, chapter, chapterIndex);
      });
      const chapterUp = treeAction('↑', '上移章节', 'data-move-chapter-up');
      chapterUp.disabled ||= chapterIndex === 0;
      chapterUp.addEventListener('click', () => {
        const previous = volume.chapters[chapterIndex - 1];
        const project = activeProject;
        if (!previous || !project) return;
        void runStructureMutation(
          window.worldforge.planning.moveChapter({
            projectId: project.projectId,
            chapterId: chapter.id,
            targetVolumeId: volume.id,
            placement: { kind: 'before', siblingId: previous.id },
          }),
          '正在调整章节顺序…',
        );
      });
      const chapterDown = treeAction('↓', '下移章节', 'data-move-chapter-down');
      chapterDown.disabled ||= chapterIndex === volume.chapters.length - 1;
      chapterDown.addEventListener('click', () => {
        const next = volume.chapters[chapterIndex + 1];
        const project = activeProject;
        if (!next || !project) return;
        void runStructureMutation(
          window.worldforge.planning.moveChapter({
            projectId: project.projectId,
            chapterId: chapter.id,
            targetVolumeId: volume.id,
            placement: { kind: 'after', siblingId: next.id },
          }),
          '正在调整章节顺序…',
        );
      });
      const removeChapter = treeAction('删', '移入废纸篓', 'data-delete-chapter');
      removeChapter.addEventListener('click', () => {
        const project = activeProject;
        const warning =
          draftDirty && activeChapter?.id === chapter.id
            ? `“${chapter.title}”有尚未保存的窗口正文。移入废纸篓会丢弃这些修改，是否继续？`
            : `将“${chapter.title}”移入废纸篓？`;
        if (!project || !window.confirm(warning)) return;
        void runStructureMutation(
          window.worldforge.planning.deleteChapter({
            projectId: project.projectId,
            chapterId: chapter.id,
          }),
          '正在移入废纸篓…',
        );
      });
      chapterActions.append(
        editChapter,
        splitChapter,
        mergeChapter,
        moveBlocks,
        chapterUp,
        chapterDown,
        removeChapter,
      );
      chapterNode.append(chapterLabel, chapterActions);
      chapterList.append(chapterNode);
    }
    node.append(chapterList);
    structureTree.append(node);
  });
}

async function refreshProjectStructure(): Promise<void> {
  const project = activeProject;
  const refreshVersion = ++structureRefreshVersion;
  if (!project) {
    renderProjectStructure(null);
    setStructureState('');
    return;
  }
  setStructureState('正在读取卷章结构…');
  try {
    const result = await window.worldforge.planning.listStructure(project.projectId);
    if (
      activeProject?.projectId !== project.projectId ||
      refreshVersion !== structureRefreshVersion
    )
      return;
    if (result.ok) {
      renderProjectStructure(result.data);
      setStructureState(
        project.databaseMode === 'read-only' ? '只读浏览；结构修改已禁用。' : '结构已同步。',
      );
    } else {
      renderProjectStructure(null);
      setStructureState(`结构读取失败 · ${result.error.code}`, true);
    }
  } catch {
    if (activeProject?.projectId !== project.projectId) return;
    renderProjectStructure(null);
    setStructureState('结构读取失败 · COMMON_INTERNAL_999', true);
  }
}

function setTrashStatus(message: string, error = false): void {
  if (!trashStatus) return;
  trashStatus.textContent = message;
  trashStatus.classList.toggle('is-error', error);
}

function renderTrashEntries(entries: readonly TrashEntry[]): void {
  trashList?.replaceChildren();
  if (!trashList) return;
  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'structure-empty';
    empty.textContent = '废纸篓为空。';
    empty.setAttribute('data-trash-empty', '');
    trashList.append(empty);
    return;
  }
  for (const entry of entries) {
    const row = document.createElement('article');
    row.className = 'trash-entry';
    row.dataset.trashEntryId = entry.id;
    const content = document.createElement('div');
    content.className = 'trash-entry__content';
    const title = document.createElement('strong');
    title.textContent = entry.title;
    const metadata = document.createElement('small');
    metadata.textContent = `${entry.entityType === 'volume' ? '卷' : '章节'} · ${new Date(
      entry.deletedAt,
    ).toLocaleString('zh-CN')}`;
    content.append(title, metadata);
    const actions = document.createElement('div');
    actions.className = 'trash-entry__actions';
    const restoreOriginal = recentAction('恢复原位', 'data-restore-original');
    const restoreEnd = recentAction('恢复到末尾', 'data-restore-end');
    const restoreElsewhere = recentAction('恢复到其他卷', 'data-restore-elsewhere');
    const permanentDelete = recentAction('永久删除', 'data-permanent-delete');
    const readOnly = activeProject?.databaseMode !== 'read-write';
    restoreOriginal.disabled = readOnly;
    restoreEnd.disabled = readOnly;
    restoreElsewhere.disabled =
      readOnly || entry.entityType !== 'chapter' || (activeStructure?.volumes.length ?? 0) === 0;
    permanentDelete.disabled = readOnly;
    restoreOriginal.addEventListener('click', () => {
      void restoreTrash(entry, 'original');
    });
    restoreEnd.addEventListener('click', () => {
      void restoreTrash(entry, { kind: 'end' });
    });
    restoreElsewhere.addEventListener('click', () => {
      const volumes = activeStructure?.volumes ?? [];
      const requested = window.prompt(
        `请选择目标卷：\n${volumes.map((volume, index) => `${index + 1}. ${volume.title}`).join('\n')}`,
        '1',
      );
      const index = Number(requested) - 1;
      const target = volumes[index];
      if (!target) {
        if (requested !== null) setTrashStatus('目标卷无效，未恢复。', true);
        return;
      }
      void restoreTrash(entry, { kind: 'end' }, target.id);
    });
    permanentDelete.addEventListener('click', () => {
      void permanentlyDeleteTrash(entry);
    });
    actions.append(restoreOriginal, restoreEnd, restoreElsewhere, permanentDelete);
    row.append(content, actions);
    trashList.append(row);
  }
}

async function refreshTrashEntries(): Promise<void> {
  const project = activeProject;
  if (!project) return;
  setTrashStatus('正在读取废纸篓…');
  try {
    const result = await window.worldforge.trash.list(project.projectId);
    if (result.ok) {
      renderTrashEntries(result.data.entries);
      setTrashStatus(result.data.entries.length === 0 ? '' : `共 ${result.data.entries.length} 项`);
    } else {
      setTrashStatus(`废纸篓读取失败 · ${result.error.code}`, true);
    }
  } catch {
    setTrashStatus('废纸篓读取失败 · COMMON_INTERNAL_999', true);
  }
}

async function restoreTrash(
  entry: TrashEntry,
  placement: 'original' | { readonly kind: 'end' },
  targetVolumeId?: string,
): Promise<void> {
  const project = activeProject;
  if (!project || project.databaseMode !== 'read-write') return;
  setTrashStatus('正在恢复…');
  try {
    const result = await window.worldforge.trash.restore({
      projectId: project.projectId,
      trashEntryId: entry.id,
      placement,
      ...(targetVolumeId ? { targetVolumeId } : {}),
    });
    if (result.ok) {
      structureRefreshVersion += 1;
      renderProjectStructure(result.data);
      setStructureState('已从废纸篓恢复。');
      await refreshTrashEntries();
    } else {
      setTrashStatus(`恢复失败 · ${result.error.code}`, true);
    }
  } catch {
    setTrashStatus('恢复失败 · COMMON_INTERNAL_999', true);
  }
}

async function permanentlyDeleteTrash(entry: TrashEntry): Promise<void> {
  const project = activeProject;
  if (!project || project.databaseMode !== 'read-write') return;
  setTrashStatus('正在检查永久删除影响…');
  try {
    const preview = await window.worldforge.trash.previewPermanentDelete({
      projectId: project.projectId,
      trashEntryId: entry.id,
    });
    if (!preview.ok) return setTrashStatus(`影响检查失败 · ${preview.error.code}`, true);
    if (!preview.data.canDelete) {
      const blockers = preview.data.blockers
        .map((blocker) => `${blocker.kind} ${blocker.count} 项`)
        .join('、');
      setTrashStatus(`不可永久删除：${blockers}仍在引用该对象。`, true);
      return;
    }
    const impact = preview.data.impact;
    const confirmation = window.prompt(
      `永久删除“${entry.title}”将删除 ${impact.volumes} 卷、${impact.chapters} 章、` +
        `${impact.drafts} 份Draft和 ${impact.draftBlocks} 个正文块。\n` +
        `执行前会创建已验证恢复点。请输入完整标题以确认：`,
      '',
    );
    if (confirmation !== entry.title) {
      setTrashStatus(
        confirmation === null ? '已取消永久删除。' : '标题不匹配，未删除。',
        confirmation !== null,
      );
      return;
    }
    setTrashStatus('正在创建恢复点并永久删除…');
    const result = await window.worldforge.trash.permanentDelete({
      projectId: project.projectId,
      trashEntryId: entry.id,
      planHash: preview.data.planHash,
      confirmationTitle: confirmation,
    });
    if (!result.ok) return setTrashStatus(`永久删除失败 · ${result.error.code}`, true);
    await refreshTrashEntries();
    setTrashStatus(`已永久删除 · 恢复点 ${result.data.backupId.slice(0, 8)}`);
  } catch {
    setTrashStatus('永久删除失败 · COMMON_INTERNAL_999', true);
  }
}

function renderActiveProject(project: ProjectWorkspaceSummary | null): void {
  activeProject = project;
  document.body.dataset.projectState = project
    ? project.databaseMode === 'read-only'
      ? 'read-only'
      : 'open'
    : 'closed';
  for (const button of createProjectButtons) button.disabled = project !== null;
  for (const button of openProjectButtons) button.disabled = project !== null;
  if (activeProjectPanel) activeProjectPanel.hidden = project === null;
  if (homeNavigation) homeNavigation.hidden = project !== null;
  if (homePanelNote) homePanelNote.hidden = project !== null;
  if (structurePanel) structurePanel.hidden = project === null;
  if (createVolumeButton) createVolumeButton.disabled = project?.databaseMode !== 'read-write';
  if (!project) {
    destroyDraftEditor();
    if (homeIntro) homeIntro.hidden = false;
    if (recentProjectsPanel) recentProjectsPanel.hidden = false;
    if (draftWorkspace) draftWorkspace.hidden = true;
    if (workspaceTitle) workspaceTitle.textContent = '继续你的本地写作';
    if (workspaceBadge) workspaceBadge.textContent = '应用级数据';
    renderProjectStructure(null);
    setStructureState('');
    setProjectOperationStatus('');
    return;
  }
  showProjectOverview();
  if (workspaceTitle) workspaceTitle.textContent = project.name;
  if (workspaceBadge) {
    workspaceBadge.textContent = project.databaseMode === 'read-only' ? '只读项目' : '本地项目';
  }
  if (activeProjectName) activeProjectName.textContent = project.name;
  if (activeProjectPath) {
    activeProjectPath.textContent = project.workspacePath;
    activeProjectPath.title = project.workspacePath;
  }
  if (activeProjectMode) {
    activeProjectMode.textContent =
      project.databaseMode === 'read-only' ? '只读兼容模式' : '可写 · 本地数据库';
  }
  if (activeProjectReadOnly) {
    activeProjectReadOnly.hidden = project.databaseMode !== 'read-only';
    activeProjectReadOnly.textContent =
      project.databaseMode === 'read-only'
        ? `数据库以只读方式打开（${project.readOnlyReason ?? '兼容性保护'}），原文件未被修改；写入和移动已禁用。`
        : '';
  }
  if (moveProjectButton) moveProjectButton.disabled = project.databaseMode === 'read-only';
  if (closeProjectButton) closeProjectButton.disabled = false;
  setProjectOperationStatus('项目身份和路径边界已由 Core 验证。');
  void refreshProjectStructure();
}

async function refreshActiveProject(): Promise<void> {
  try {
    const result = await window.worldforge.project.getActive();
    if (result.ok) renderActiveProject(result.data);
    else setProjectOperationStatus(`项目状态读取失败 · ${result.error.code}`, true);
  } catch {
    setProjectOperationStatus('项目状态读取失败 · COMMON_INTERNAL_999', true);
  }
}

async function openRecentProject(projectId: string, button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  const result = await window.worldforge.project.openRecent(projectId);
  if (!result.ok) {
    button.disabled = false;
    showRecentFailure(`打开失败 · ${result.error.code}`);
    return;
  }
  renderActiveProject(result.data);
  await refreshRecentProjects();
}

async function openSelectedProject(button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  try {
    const result = await window.worldforge.project.openSelected();
    if (result.ok) {
      renderActiveProject(result.data);
      await refreshRecentProjects();
    } else if (result.error.code !== 'COMMON_CANCELLED_004') {
      showRecentFailure(`打开失败 · ${result.error.code}`);
    }
  } catch {
    showRecentFailure('打开失败 · COMMON_INTERNAL_999');
  } finally {
    button.disabled = activeProject !== null;
  }
}

function showRecentFailure(message: string): void {
  if (recentLoading) recentLoading.hidden = true;
  if (recentEmpty) recentEmpty.hidden = true;
  if (recentError) {
    recentError.hidden = false;
    recentError.textContent = message;
  }
}

function recentAction(label: string, attribute: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'quiet-button';
  button.textContent = label;
  button.setAttribute(attribute, '');
  return button;
}

async function removeRecentProject(projectId: string, button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  const result = await window.worldforge.project.removeRecent(projectId);
  if (!result.ok) {
    button.disabled = false;
    showRecentFailure(`移除失败 · ${result.error.code}`);
    return;
  }
  await refreshRecentProjects();
}

async function relocateRecentProject(projectId: string, button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  const result = await window.worldforge.project.relocateRecent(projectId);
  if (!result.ok) {
    button.disabled = false;
    if (result.error.code !== 'COMMON_CANCELLED_004') {
      showRecentFailure(`重新定位失败 · ${result.error.code}`);
    }
    return;
  }
  await refreshRecentProjects();
}

function renderRecentProjects(projects: readonly RecentProject[]): void {
  recentList?.replaceChildren();
  if (recentLoading) recentLoading.hidden = true;
  if (recentError) recentError.hidden = true;
  if (recentEmpty) recentEmpty.hidden = projects.length > 0;
  if (!recentList) return;

  for (const project of projects) {
    const card = document.createElement('article');
    card.className = 'recent-project-card';
    card.setAttribute('data-recent-card', '');
    card.dataset.projectMissing = String(project.missingSince !== null);

    const content = document.createElement('div');
    content.className = 'recent-project-card__content';
    const name = document.createElement('strong');
    name.textContent = project.displayName;
    const workspacePath = document.createElement('span');
    workspacePath.className = 'recent-project-card__path';
    workspacePath.textContent = project.workspacePath;
    workspacePath.title = project.workspacePath;
    const metadata = document.createElement('span');
    metadata.className = 'recent-project-card__meta';
    metadata.textContent = `最近打开：${new Date(project.lastOpenedAt).toLocaleString('zh-CN')}`;
    content.append(name, workspacePath, metadata);
    if (project.missingSince) {
      const warning = document.createElement('span');
      warning.className = 'recent-project-card__meta recent-project-card__warning';
      warning.textContent = '路径已丢失';
      content.append(warning);
    }

    const actions = document.createElement('div');
    actions.className = 'recent-project-card__actions';
    if (!project.missingSince) {
      const open = recentAction('打开', 'data-open-recent');
      open.disabled = activeProject !== null;
      open.addEventListener('click', () => {
        void openRecentProject(project.projectId, open);
      });
      actions.append(open);
    } else {
      const relocate = recentAction('重新定位', 'data-relocate-recent');
      relocate.addEventListener('click', () => {
        void relocateRecentProject(project.projectId, relocate);
      });
      actions.append(relocate);
    }
    const remove = recentAction('移除记录', 'data-remove-recent');
    remove.addEventListener('click', () => {
      void removeRecentProject(project.projectId, remove);
    });
    actions.append(remove);
    card.append(content, actions);
    recentList.append(card);
  }
}

async function refreshRecentProjects(): Promise<void> {
  if (recentLoading) recentLoading.hidden = false;
  if (recentError) recentError.hidden = true;
  refreshRecentButton?.setAttribute('disabled', '');
  try {
    const result = await window.worldforge.project.listRecent();
    if (result.ok) renderRecentProjects(result.data.projects);
    else showRecentFailure(`最近项目读取失败 · ${result.error.code}`);
  } catch {
    showRecentFailure('最近项目读取失败 · COMMON_INTERNAL_999');
  } finally {
    refreshRecentButton?.removeAttribute('disabled');
  }
}

function modeLabel(mode: ReturnType<typeof layoutPolicyForViewport>['mode']): string {
  const labels = {
    compact: '紧凑 · 双抽屉',
    narrow: '窄屏 · 右抽屉',
    standard: '标准 · 三栏',
    'two-k': '2K 标准 · 三栏',
    wide: '宽屏 · 三栏',
    ultrawide: '超宽 · 限宽工作区',
  } as const;
  return labels[mode];
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
  document.body.dataset.rightPanel = policy.rightPanel;
  document.body.dataset.workspaceAlignment = appearance.workspaceAlignment;
  leftPanel?.setAttribute('data-panel-mode', policy.leftPanel);
  rightPanel?.setAttribute('data-panel-mode', policy.rightPanel);
  leftToggle?.setAttribute('aria-hidden', String(policy.leftPanel !== 'drawer'));
  rightToggle?.setAttribute('aria-hidden', String(policy.rightPanel !== 'drawer'));
  if (policy.leftPanel !== 'drawer') closeDrawer(leftPanel, leftToggle, false);
  if (policy.rightPanel !== 'drawer') closeDrawer(rightPanel, rightToggle, false);

  if (layoutReadout) layoutReadout.textContent = modeLabel(policy.mode);
  if (viewportReadout) {
    viewportReadout.textContent = `${Math.round(effectiveViewportWidth)} × ${Math.round(
      window.innerHeight / uiScale,
    )} CSS px`;
  }
  if (contentReadout) contentReadout.textContent = `${contentWidth} px`;
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
  if (!leftPanel?.classList.contains('is-open') && !rightPanel?.classList.contains('is-open')) {
    document.body.classList.remove('has-open-drawer');
  }
  if (restoreFocus) drawerRestoreTarget?.focus();
  drawerRestoreTarget = null;
}

function closeAllDrawers(restoreFocus = true): void {
  const target = drawerRestoreTarget;
  closeDrawer(leftPanel, leftToggle, false);
  closeDrawer(rightPanel, rightToggle, false);
  if (restoreFocus) target?.focus();
  drawerRestoreTarget = null;
}

function trapDrawerFocus(event: KeyboardEvent): void {
  const openPanel = leftPanel?.classList.contains('is-open')
    ? leftPanel
    : rightPanel?.classList.contains('is-open')
      ? rightPanel
      : null;
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

function readForm(): AppearancePreferences | null {
  if (!appearanceForm) return null;
  const data = new FormData(appearanceForm);
  const uiScalePercent = Number(data.get('uiScalePercent'));
  const bodyFontSize = Number(data.get('bodyFontSize'));
  const contentWidth = data.get('contentWidth');
  const workspaceAlignment = data.get('workspaceAlignment');
  if (
    !Number.isInteger(uiScalePercent) ||
    uiScalePercent < 90 ||
    uiScalePercent > 150 ||
    uiScalePercent % 10 !== 0 ||
    !Number.isInteger(bodyFontSize) ||
    bodyFontSize < 14 ||
    bodyFontSize > 28 ||
    !['narrow', 'normal', 'wide', 'adaptive'].includes(String(contentWidth)) ||
    !['left', 'center', 'right'].includes(String(workspaceAlignment))
  ) {
    return null;
  }
  return {
    uiScalePercent,
    bodyFontSize,
    contentWidth: contentWidth as AppearancePreferences['contentWidth'],
    workspaceAlignment: workspaceAlignment as AppearancePreferences['workspaceAlignment'],
  };
}

async function saveAppearance(next: AppearancePreferences): Promise<void> {
  appearance = next;
  applyLayout();
  if (preferenceStatus) {
    preferenceStatus.classList.remove('is-error');
    preferenceStatus.textContent = '正在保存…';
  }
  const result = await window.worldforge.app.setAppearancePreferences(next);
  if (result.ok) {
    appearance = {
      workspaceAlignment: result.data.workspaceAlignment,
      uiScalePercent: result.data.uiScalePercent,
      bodyFontSize: result.data.bodyFontSize,
      contentWidth: result.data.contentWidth,
    };
    setFormValues(appearance);
    applyLayout();
    if (preferenceStatus) preferenceStatus.textContent = '已由 Core 保存到应用数据库';
    return;
  }
  if (preferenceStatus) {
    preferenceStatus.classList.add('is-error');
    preferenceStatus.textContent = `保存失败 · ${result.error.code}`;
  }
}

async function refreshApplicationSettings(): Promise<void> {
  try {
    const result = await window.worldforge.settings.get();
    if (result.ok) {
      showSettingsSnapshot(result.data);
      return;
    }
    if (settingsStatus) {
      settingsStatus.classList.add('is-error');
      settingsStatus.textContent = `设置读取失败 · ${result.error.code}`;
    }
  } catch {
    if (settingsStatus) {
      settingsStatus.classList.add('is-error');
      settingsStatus.textContent = '设置读取失败 · COMMON_INTERNAL_999';
    }
  }
}

async function refresh(): Promise<void> {
  try {
    const [info, core, preferences] = await Promise.all([
      window.worldforge.app.getInfo(),
      window.worldforge.app.getCoreStatus(),
      window.worldforge.app.getWindowPreferences(),
    ]);
    if (info.ok && versionElement) {
      versionElement.textContent = `WorldForge ${info.data.version} · ${info.data.platform}`;
    }
    if (core.ok) {
      setStatus(core.data.status, core.data.diagnosticId);
    } else {
      setStatus(core.error.code, core.error.diagnosticId ?? null);
    }
    if (preferences.ok) {
      appearance = {
        workspaceAlignment: preferences.data.workspaceAlignment,
        uiScalePercent: preferences.data.uiScalePercent,
        bodyFontSize: preferences.data.bodyFontSize,
        contentWidth: preferences.data.contentWidth,
      };
    }
    await refreshActiveProject();
    await Promise.all([refreshApplicationSettings(), refreshRecentProjects()]);
  } catch {
    setStatus('COMMON_INTERNAL_999', null);
    showRecentFailure('最近项目读取失败 · COMMON_INTERNAL_999');
  } finally {
    setFormValues(appearance);
    applyLayout();
    document.body.dataset.rendererReady = 'true';
  }
}

restartButton?.addEventListener('click', async () => {
  restartButton.disabled = true;
  const result = await window.worldforge.app.restartCore();
  if (result.ok) {
    setStatus(result.data.status.status, result.data.status.diagnosticId);
  } else {
    setStatus(result.error.code, result.error.diagnosticId ?? null);
  }
  restartButton.disabled = false;
  if (result.ok) {
    await refreshActiveProject();
    await Promise.all([refreshApplicationSettings(), refreshRecentProjects()]);
  }
});

leftToggle?.addEventListener('click', () => openDrawer(leftPanel, leftToggle));
rightToggle?.addEventListener('click', () => openDrawer(rightPanel, rightToggle));
document.querySelector('[data-close-left]')?.addEventListener('click', () => closeAllDrawers());
document.querySelector('[data-close-right]')?.addEventListener('click', () => closeAllDrawers());
drawerScrim?.addEventListener('click', () => closeAllDrawers());
document.addEventListener('keydown', trapDrawerFocus);

appearanceForm?.addEventListener('change', () => {
  const next = readForm();
  if (next) void saveAppearance(next);
});

refreshRecentButton?.addEventListener('click', () => {
  void refreshRecentProjects();
});

for (const button of createProjectButtons) {
  button.addEventListener('click', () => {
    if (activeProject) return;
    if (createProjectStatus) {
      createProjectStatus.classList.remove('is-error');
      createProjectStatus.textContent = '';
    }
    if (projectInitialStructure) {
      projectInitialStructure.value =
        applicationSettings.defaultMode === 'professional' ? 'blank' : 'starter';
    }
    createProjectDialog?.showModal();
    createProjectForm?.querySelector<HTMLInputElement>('[data-project-name]')?.focus();
  });
}

for (const button of openProjectButtons) {
  button.addEventListener('click', () => {
    if (!activeProject) void openSelectedProject(button);
  });
}

cancelCreateProjectButton?.addEventListener('click', () => createProjectDialog?.close());
createProjectForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (activeProject || !createProjectForm) return;
  const nameInput = createProjectForm.elements.namedItem('name');
  const channelInput = createProjectForm.elements.namedItem('channel');
  const initialStructureInput = createProjectForm.elements.namedItem('initialStructure');
  if (
    !(nameInput instanceof HTMLInputElement) ||
    !(channelInput instanceof HTMLInputElement) ||
    !(initialStructureInput instanceof HTMLSelectElement)
  ) {
    return;
  }
  const name = nameInput.value.trim();
  const channel = channelInput.value.trim();
  const initialStructure = initialStructureInput.value;
  if (!name || !channel || !['starter', 'blank'].includes(initialStructure)) {
    if (createProjectStatus) {
      createProjectStatus.classList.add('is-error');
      createProjectStatus.textContent = '请填写项目名称和创作频道。';
    }
    return;
  }
  if (confirmCreateProjectButton) confirmCreateProjectButton.disabled = true;
  if (createProjectStatus) {
    createProjectStatus.classList.remove('is-error');
    createProjectStatus.textContent = '请选择保存位置…';
  }
  try {
    const result = await window.worldforge.project.create({
      name,
      channel,
      initialStructure: initialStructure as 'starter' | 'blank',
    });
    if (result.ok) {
      createProjectDialog?.close();
      createProjectForm.reset();
      channelInput.value = '未分类';
      initialStructureInput.value = 'starter';
      renderActiveProject(result.data);
      await refreshRecentProjects();
    } else if (result.error.code !== 'COMMON_CANCELLED_004' && createProjectStatus) {
      createProjectStatus.classList.add('is-error');
      createProjectStatus.textContent = `创建失败 · ${result.error.code}`;
    } else if (createProjectStatus) {
      createProjectStatus.textContent = '';
    }
  } catch {
    if (createProjectStatus) {
      createProjectStatus.classList.add('is-error');
      createProjectStatus.textContent = '创建失败 · COMMON_INTERNAL_999';
    }
  } finally {
    if (confirmCreateProjectButton) confirmCreateProjectButton.disabled = false;
  }
});

createVolumeButton?.addEventListener('click', () => openVolumeEditor());
cancelStructureButton?.addEventListener('click', () => structureDialog?.close());

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

structureForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const project = activeProject;
  if (
    !project ||
    project.databaseMode !== 'read-write' ||
    !structureForm ||
    !structureTitleInput ||
    !structureStatusSelect ||
    !structureVolumeSelect
  ) {
    return;
  }
  const entityType = structureForm.dataset.entityType;
  const mode = structureForm.dataset.mode;
  const entityId = structureForm.dataset.entityId ?? '';
  const title = structureTitleInput.value.trim();
  const status = structureStatusSelect.value as LifecycleStatus;
  if (
    !title ||
    !['volume', 'chapter'].includes(entityType ?? '') ||
    !['create', 'edit'].includes(mode ?? '') ||
    !Object.hasOwn(lifecycleLabels, status)
  ) {
    if (structureFormStatus) {
      structureFormStatus.classList.add('is-error');
      structureFormStatus.textContent = '请检查标题和状态。';
    }
    return;
  }

  const minimumInput = structureForm.elements.namedItem('targetWordMin');
  const maximumInput = structureForm.elements.namedItem('targetWordMax');
  const minimum =
    minimumInput instanceof HTMLInputElement && minimumInput.value !== ''
      ? Number(minimumInput.value)
      : null;
  const maximum =
    maximumInput instanceof HTMLInputElement && maximumInput.value !== ''
      ? Number(maximumInput.value)
      : null;
  if (
    (minimum !== null && (!Number.isInteger(minimum) || minimum < 0)) ||
    (maximum !== null && (!Number.isInteger(maximum) || maximum < 0)) ||
    (minimum !== null && maximum !== null && minimum > maximum)
  ) {
    if (structureFormStatus) {
      structureFormStatus.classList.add('is-error');
      structureFormStatus.textContent = '目标字数必须为非负整数，且下限不能超过上限。';
    }
    return;
  }

  if (saveStructureButton) saveStructureButton.disabled = true;
  if (structureFormStatus) {
    structureFormStatus.classList.remove('is-error');
    structureFormStatus.textContent = '正在保存…';
  }
  try {
    let result: Awaited<ReturnType<typeof window.worldforge.planning.createVolume>>;
    if (entityType === 'volume' && mode === 'create') {
      result = await window.worldforge.planning.createVolume({
        projectId: project.projectId,
        title,
        placement: { kind: 'end' },
      });
    } else if (entityType === 'volume') {
      result = await window.worldforge.planning.updateVolume({
        projectId: project.projectId,
        volumeId: entityId,
        patch: { title, status },
      });
    } else if (mode === 'create') {
      result = await window.worldforge.planning.createChapter({
        projectId: project.projectId,
        volumeId: structureVolumeSelect.value,
        title,
        placement: { kind: 'end' },
      });
    } else {
      result = await window.worldforge.planning.updateChapter({
        projectId: project.projectId,
        chapterId: entityId,
        patch: {
          title,
          status,
          targetWordMin: minimum,
          targetWordMax: maximum,
        },
      });
      const originalVolumeId = structureForm.dataset.originalVolumeId;
      if (result.ok && originalVolumeId !== structureVolumeSelect.value) {
        result = await window.worldforge.planning.moveChapter({
          projectId: project.projectId,
          chapterId: entityId,
          targetVolumeId: structureVolumeSelect.value,
          placement: { kind: 'end' },
        });
      }
    }
    if (result.ok) {
      renderProjectStructure(result.data);
      setStructureState('卷章结构已保存到项目数据库。');
      structureDialog?.close();
    } else if (structureFormStatus) {
      structureFormStatus.classList.add('is-error');
      structureFormStatus.textContent = `保存失败 · ${result.error.code}`;
    }
  } catch {
    if (structureFormStatus) {
      structureFormStatus.classList.add('is-error');
      structureFormStatus.textContent = '保存失败 · COMMON_INTERNAL_999';
    }
  } finally {
    if (saveStructureButton) saveStructureButton.disabled = false;
  }
});

openTrashButton?.addEventListener('click', () => {
  if (!activeProject) return;
  trashDialog?.showModal();
  void refreshTrashEntries();
});
closeTrashButton?.addEventListener('click', () => trashDialog?.close());

closeProjectButton?.addEventListener('click', async () => {
  const project = activeProject;
  if (draftAutosave?.hasPendingWork && !(await draftAutosave.flush())) {
    setDraftState('自动保存失败，已阻止关闭项目。', true);
    return;
  }
  if (!project) return;
  closeProjectButton.disabled = true;
  setProjectOperationStatus('正在安全关闭并清空活动上下文…');
  try {
    const result = await window.worldforge.project.close(project.projectId);
    if (result.ok) {
      renderActiveProject(null);
      await refreshRecentProjects();
    } else {
      setProjectOperationStatus(`关闭失败 · ${result.error.code}`, true);
      closeProjectButton.disabled = false;
    }
  } catch {
    setProjectOperationStatus('关闭失败 · COMMON_INTERNAL_999', true);
    closeProjectButton.disabled = false;
  }
});

moveProjectButton?.addEventListener('click', async () => {
  const project = activeProject;
  if (!project || project.databaseMode === 'read-only') return;
  moveProjectButton.disabled = true;
  setProjectOperationStatus('请选择新位置；Core 将复制、校验后再切换。');
  try {
    const result = await window.worldforge.project.move(project.projectId);
    if (result.ok) {
      renderActiveProject(result.data);
      setProjectOperationStatus(
        result.data.sourceRetained
          ? '移动已完成；原位置未能清理，请确认后手动处理。'
          : '移动已完成，哈希与数据库完整性校验通过。',
      );
      await refreshRecentProjects();
    } else if (result.error.code === 'COMMON_CANCELLED_004') {
      setProjectOperationStatus('已取消移动。');
      moveProjectButton.disabled = false;
    } else {
      setProjectOperationStatus(`移动失败 · ${result.error.code}；原项目保持可用。`, true);
      moveProjectButton.disabled = false;
    }
  } catch {
    setProjectOperationStatus('移动失败 · COMMON_INTERNAL_999；原项目保持可用。', true);
    moveProjectButton.disabled = false;
  }
});

openSettingsButton?.addEventListener('click', () => {
  setSettingsFormValues(applicationSettings);
  settingsDialog?.showModal();
});
closeSettingsButton?.addEventListener('click', () => settingsDialog?.close());
settingsForm?.addEventListener('change', updateThemeVariantAvailability);

saveSettingsButton?.addEventListener('click', async () => {
  const next = readSettingsForm();
  if (!next) {
    if (settingsStatus) {
      settingsStatus.classList.add('is-error');
      settingsStatus.textContent = '设置值无效';
    }
    return;
  }
  saveSettingsButton.disabled = true;
  if (settingsStatus) {
    settingsStatus.classList.remove('is-error');
    settingsStatus.textContent = '正在保存…';
  }
  try {
    const result = await window.worldforge.settings.set(next);
    if (result.ok) {
      showSettingsSnapshot(result.data);
      if (settingsStatus) settingsStatus.textContent = '设置已保存到应用数据库';
    } else if (settingsStatus) {
      settingsStatus.classList.add('is-error');
      settingsStatus.textContent = `设置保存失败 · ${result.error.code}`;
    }
  } catch {
    if (settingsStatus) {
      settingsStatus.classList.add('is-error');
      settingsStatus.textContent = '设置保存失败 · COMMON_INTERNAL_999';
    }
  } finally {
    saveSettingsButton.disabled = false;
  }
});

resetSettingsButton?.addEventListener('click', async () => {
  resetSettingsButton.disabled = true;
  try {
    const result = await window.worldforge.settings.reset();
    if (result.ok) {
      showSettingsSnapshot(result.data);
      if (settingsStatus) settingsStatus.textContent = '已恢复默认设置';
    } else if (settingsStatus) {
      settingsStatus.classList.add('is-error');
      settingsStatus.textContent = `恢复失败 · ${result.error.code}`;
    }
  } catch {
    if (settingsStatus) {
      settingsStatus.classList.add('is-error');
      settingsStatus.textContent = '恢复失败 · COMMON_INTERNAL_999';
    }
  } finally {
    resetSettingsButton.disabled = false;
  }
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

const openRecoveryButton = document.querySelector<HTMLButtonElement>('[data-open-recovery]');
const recoveryDialog = document.querySelector<HTMLDialogElement>('[data-recovery-dialog]');
const createCheckpointButton = document.querySelector<HTMLButtonElement>(
  '[data-create-checkpoint]',
);
const refreshRecoveryButton = document.querySelector<HTMLButtonElement>('[data-refresh-recovery]');
const closeRecoveryButton = document.querySelector<HTMLButtonElement>('[data-close-recovery]');
const recoveryStatus = document.querySelector<HTMLElement>('[data-recovery-status]');
const recoveryCheckpointList = document.querySelector<HTMLElement>('[data-recovery-checkpoints]');
const recoveryVersionList = document.querySelector<HTMLElement>('[data-recovery-versions]');

function setRecoveryStatus(message: string, error = false): void {
  if (!recoveryStatus) return;
  recoveryStatus.textContent = message;
  recoveryStatus.classList.toggle('is-error', error);
}

async function refreshRecoveryOverview(): Promise<void> {
  const project = activeProject;
  if (!project || !recoveryCheckpointList || !recoveryVersionList) return;
  if (createCheckpointButton)
    createCheckpointButton.disabled = project.databaseMode !== 'read-write';
  setRecoveryStatus(
    project.databaseMode === 'read-only'
      ? `当前数据库只读 · ${project.readOnlyReason ?? 'unknown'}；可恢复外部副本。`
      : '正在读取恢复点…',
  );
  const result = await window.worldforge.recovery.getOverview(project.projectId);
  recoveryCheckpointList.replaceChildren();
  recoveryVersionList.replaceChildren();
  if (!result.ok) {
    setRecoveryStatus(`读取恢复信息失败 · ${result.error.code}`, true);
    return;
  }
  if (result.data.checkpoints.length === 0) {
    recoveryCheckpointList.textContent = '还没有已验证恢复点。';
  } else {
    for (const checkpoint of result.data.checkpoints) {
      const row = document.createElement('article');
      row.className = 'recovery-row';
      row.dataset.backupId = checkpoint.backupId;
      const detail = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = checkpoint.operation;
      const meta = document.createElement('small');
      meta.textContent = `${new Date(checkpoint.createdAt).toLocaleString()} · ${checkpoint.sizeBytes} bytes`;
      detail.append(title, meta);
      const restore = document.createElement('button');
      restore.type = 'button';
      restore.className = 'quiet-button';
      restore.dataset.restoreCheckpoint = checkpoint.backupId;
      restore.textContent = '恢复为新项目';
      row.append(detail, restore);
      recoveryCheckpointList.append(row);
    }
  }
  if (result.data.exportableVersions.length === 0) {
    recoveryVersionList.textContent = '当前数据库没有可读取的Version。';
  } else {
    for (const version of result.data.exportableVersions) {
      const row = document.createElement('article');
      row.className = 'recovery-row';
      const detail = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = `${version.chapterTitle} · ${version.title}`;
      const meta = document.createElement('small');
      meta.textContent = `${version.wordCount}字${version.finalized ? ' · 定稿' : ''}`;
      detail.append(title, meta);
      const exportButton = document.createElement('button');
      exportButton.type = 'button';
      exportButton.className = 'quiet-button';
      exportButton.dataset.exportRecoveryVersion = version.versionId;
      exportButton.textContent = '导出TXT';
      row.append(detail, exportButton);
      recoveryVersionList.append(row);
    }
  }
  setRecoveryStatus(
    project.databaseMode === 'read-only'
      ? '只读保护已生效；写入命令被阻止。'
      : '恢复点与Version信息已更新。',
  );
}

openRecoveryButton?.addEventListener('click', () => {
  recoveryDialog?.showModal();
  void refreshRecoveryOverview();
});
closeRecoveryButton?.addEventListener('click', () => recoveryDialog?.close());
refreshRecoveryButton?.addEventListener('click', () => void refreshRecoveryOverview());
createCheckpointButton?.addEventListener('click', () => {
  void (async () => {
    const project = activeProject;
    if (!project || project.databaseMode !== 'read-write') return;
    if (draftAutosave?.hasPendingWork && !(await draftAutosave.flush())) {
      setRecoveryStatus('自动保存失败，已阻止创建恢复点。', true);
      return;
    }
    createCheckpointButton.disabled = true;
    setRecoveryStatus('正在创建并验证SQLite在线备份…');
    const result = await window.worldforge.recovery.createCheckpoint({
      projectId: project.projectId,
      operation: 'manual-protection',
    });
    createCheckpointButton.disabled = false;
    if (!result.ok) return setRecoveryStatus(`恢复点创建失败 · ${result.error.code}`, true);
    setRecoveryStatus('恢复点已通过完整性、外键与Hash验证。');
    await refreshRecoveryOverview();
  })();
});
recoveryCheckpointList?.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    '[data-restore-checkpoint]',
  );
  const project = activeProject;
  const backupId = button?.dataset.restoreCheckpoint;
  if (!project || !backupId) return;
  void (async () => {
    button.disabled = true;
    setRecoveryStatus('请选择新目录；恢复不会覆盖源项目。');
    const result = await window.worldforge.recovery.restoreCheckpoint({
      projectId: project.projectId,
      backupId,
    });
    button.disabled = false;
    if (!result.ok) return setRecoveryStatus(`恢复失败 · ${result.error.code}`, true);
    setRecoveryStatus(`恢复副本“${result.data.name}”已注册到最近项目。`);
    await refreshRecentProjects();
  })();
});
recoveryVersionList?.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    '[data-export-recovery-version]',
  );
  const project = activeProject;
  const versionId = button?.dataset.exportRecoveryVersion;
  if (!project || !versionId) return;
  void (async () => {
    button.disabled = true;
    const result = await window.worldforge.recovery.exportVersion({
      projectId: project.projectId,
      versionId,
    });
    button.disabled = false;
    if (!result.ok) return setRecoveryStatus(`Version导出失败 · ${result.error.code}`, true);
    setRecoveryStatus(`已导出 ${result.data.fileName}，Hash验证完成。`);
  })();
});

function setTextIoStatus(message: string, error = false): void {
  if (!textIoStatus) return;
  textIoStatus.textContent = message;
  textIoStatus.classList.toggle('is-error', error);
}

function planBody(chapter: ImportPlanChapter): string {
  return chapter.blocks
    .map((block) => (block.blockType === 'separator' ? '***' : block.text))
    .join('\n\n');
}

function bodyBlocks(value: string): ImportPlanChapter['blocks'] {
  const blocks = value
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split(/\n\s*\n/gu)
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) =>
      text === '***'
        ? ({ blockType: 'separator', text: '' } as const)
        : ({ blockType: 'paragraph', text } as const),
    );
  return blocks.length ? blocks : [{ blockType: 'paragraph', text: '' }];
}

function renderImportPlan(): void {
  if (!importPlanList) return;
  importPlanList.replaceChildren();
  const plan = activeImportPlan;
  if (!plan) {
    importPlanList.textContent = '请选择TXT或Markdown文件生成预览。';
    if (commitImportButton) commitImportButton.disabled = true;
    return;
  }
  plan.chapters.forEach((chapter, index) => {
    const row = document.createElement('article');
    row.className = 'text-io-plan-row';
    row.dataset.importPlanChapter = chapter.planChapterId;
    row.innerHTML = `<header><strong>章节 ${index + 1}</strong><div></div></header><input data-import-chapter-title maxlength="240" /><textarea data-import-chapter-body rows="6"></textarea>`;
    const title = row.querySelector<HTMLInputElement>('[data-import-chapter-title]')!;
    const body = row.querySelector<HTMLTextAreaElement>('[data-import-chapter-body]')!;
    title.value = chapter.title;
    body.value = planBody(chapter);
    const actions = row.querySelector<HTMLElement>('header div')!;
    for (const [label, action] of [
      ['上移', 'up'],
      ['下移', 'down'],
      ['拆分', 'split'],
      ['合并下一章', 'merge'],
      ['移除', 'remove'],
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'quiet-button';
      button.textContent = label;
      button.dataset.importPlanAction = action;
      button.dataset.importPlanChapterId = chapter.planChapterId;
      button.disabled =
        (action === 'up' && index === 0) ||
        ((action === 'down' || action === 'merge') && index === plan.chapters.length - 1) ||
        (action === 'remove' && plan.chapters.length === 1);
      actions.append(button);
    }
    importPlanList.append(row);
  });
  if (commitImportButton)
    commitImportButton.disabled = activeProject?.databaseMode !== 'read-write';
}

function chaptersFromPlanEditor(): ImportPlanChapter[] {
  const plan = activeImportPlan;
  if (!plan || !importPlanList) return [];
  return plan.chapters.map((chapter) => {
    const row = importPlanList.querySelector<HTMLElement>(
      `[data-import-plan-chapter="${chapter.planChapterId}"]`,
    );
    const title = row?.querySelector<HTMLInputElement>('[data-import-chapter-title]')?.value.trim();
    const body = row?.querySelector<HTMLTextAreaElement>('[data-import-chapter-body]')?.value ?? '';
    return {
      planChapterId: chapter.planChapterId,
      title: title || chapter.title,
      blocks: body === planBody(chapter) ? chapter.blocks : bodyBlocks(body),
    };
  });
}

function updatePlanFromEditor(): void {
  if (!activeImportPlan) return;
  activeImportPlan = { ...activeImportPlan, chapters: chaptersFromPlanEditor() };
}

async function refreshExportCatalog(): Promise<void> {
  const project = activeProject;
  if (!project || !exportVersionList) return;
  const result = await window.worldforge.textIo.listExportVersions(project.projectId);
  exportVersionList.replaceChildren();
  if (!result.ok) {
    setTextIoStatus(`Version读取失败 · ${result.error.code}`, true);
    return;
  }
  exportVersionChoices = result.data.versions;
  if (!exportVersionChoices.length) {
    exportVersionList.textContent = '当前项目没有可导出的Version。';
    return;
  }
  for (const version of exportVersionChoices) {
    const label = document.createElement('label');
    label.className = 'text-io-export-row';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = version.versionId;
    checkbox.dataset.exportVersionChoice = '';
    checkbox.checked = version.finalized;
    const detail = document.createElement('span');
    detail.textContent = `${version.volumeTitle} / ${version.chapterTitle} · ${version.versionTitle} · ${version.wordCount}字${version.finalized ? ' · 定稿' : ''}`;
    label.append(checkbox, detail);
    exportVersionList.append(label);
  }
}

openTextIoButton?.addEventListener('click', () => {
  textIoDialog?.showModal();
  setTextIoStatus('预览不会修改项目；确认导入前会创建已验证恢复点。');
  renderImportPlan();
  void refreshExportCatalog();
});
closeTextIoButton?.addEventListener('click', () => textIoDialog?.close());
previewImportButton?.addEventListener('click', () => {
  void (async () => {
    const project = activeProject;
    if (!project) return;
    previewImportButton.disabled = true;
    setTextIoStatus('请选择TXT或Markdown文件…');
    const encoding = importEncoding?.value ?? 'auto';
    const result = await window.worldforge.textIo.previewImport({
      projectId: project.projectId,
      encoding: encoding as 'auto' | 'utf-8' | 'utf-16le' | 'utf-16be' | 'gb18030',
    });
    previewImportButton.disabled = false;
    if (!result.ok) {
      if (result.error.code === 'COMMON_CANCELLED_004') return setTextIoStatus('已取消选择。');
      return setTextIoStatus(`预览失败 · ${result.error.code}`, true);
    }
    activeImportPlan = result.data;
    if (importVolumeTitle && importVolumeTitle.value === '导入稿') {
      importVolumeTitle.value = result.data.fileName.replace(/\.(?:txt|md|markdown)$/iu, '');
    }
    setTextIoStatus(
      `已识别 ${result.data.format.toUpperCase()} · ${result.data.detectedEncoding} · ${result.data.confidence} · ${result.data.chapters.length}章`,
    );
    renderImportPlan();
  })();
});

importPlanList?.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    '[data-import-plan-action]',
  );
  const action = button?.dataset.importPlanAction;
  const id = button?.dataset.importPlanChapterId;
  if (!activeImportPlan || !action || !id) return;
  updatePlanFromEditor();
  const chapters = [...activeImportPlan.chapters];
  const index = chapters.findIndex((chapter) => chapter.planChapterId === id);
  if (index < 0) return;
  if (action === 'up' && index > 0)
    [chapters[index - 1], chapters[index]] = [chapters[index]!, chapters[index - 1]!];
  if (action === 'down' && index < chapters.length - 1)
    [chapters[index + 1], chapters[index]] = [chapters[index]!, chapters[index + 1]!];
  if (action === 'remove' && chapters.length > 1) chapters.splice(index, 1);
  if (action === 'merge' && index < chapters.length - 1) {
    const current = chapters[index]!;
    const next = chapters[index + 1]!;
    chapters.splice(index, 2, { ...current, blocks: [...current.blocks, ...next.blocks] });
  }
  if (action === 'split') {
    const current = chapters[index]!;
    const midpoint = Math.max(1, Math.floor(current.blocks.length / 2));
    let left = current.blocks.slice(0, midpoint);
    let right = current.blocks.slice(midpoint);
    if (!right.length) {
      const block = left[0]!;
      const text = block.text;
      const point = Math.max(1, Math.floor(text.length / 2));
      left = [{ ...block, text: text.slice(0, point) }];
      right = [{ ...block, text: text.slice(point) }];
    }
    chapters.splice(
      index,
      1,
      { ...current, blocks: left },
      {
        planChapterId: crypto.randomUUID(),
        title: `${current.title}（下）`,
        blocks: right,
      },
    );
  }
  activeImportPlan = { ...activeImportPlan, chapters };
  renderImportPlan();
});

commitImportButton?.addEventListener('click', () => {
  void (async () => {
    const project = activeProject;
    if (!project || !activeImportPlan || project.databaseMode !== 'read-write') return;
    updatePlanFromEditor();
    const volumeTitle = importVolumeTitle?.value.trim() ?? '';
    if (!volumeTitle) return setTextIoStatus('请输入新卷标题。', true);
    commitImportButton.disabled = true;
    setTextIoStatus('正在创建恢复点并以单事务导入…');
    const result = await window.worldforge.textIo.commitImport({
      projectId: project.projectId,
      planId: activeImportPlan.planId,
      volumeTitle,
      chapters: activeImportPlan.chapters,
    });
    commitImportButton.disabled = false;
    if (!result.ok) return setTextIoStatus(`导入失败 · ${result.error.code}`, true);
    setTextIoStatus(
      `已导入 ${result.data.importedChapterCount} 章；恢复点与导入基线Version已创建。`,
    );
    activeImportPlan = null;
    renderImportPlan();
    await refreshProjectStructure();
    await refreshExportCatalog();
  })();
});

refreshExportVersionsButton?.addEventListener('click', () => void refreshExportCatalog());
exportVersionsButton?.addEventListener('click', () => {
  void (async () => {
    const project = activeProject;
    if (!project || !exportVersionList) return;
    const versionIds = Array.from(
      exportVersionList.querySelectorAll<HTMLInputElement>('[data-export-version-choice]:checked'),
      (input) => input.value,
    );
    if (!versionIds.length) return setTextIoStatus('请至少选择一个Version。', true);
    const format = exportFormat?.value === 'markdown' ? 'markdown' : 'txt';
    const fileName = exportFileName?.value.trim() ?? '';
    if (!fileName) return setTextIoStatus('请输入导出文件名。', true);
    exportVersionsButton.disabled = true;
    const result = await window.worldforge.textIo.exportVersions({
      projectId: project.projectId,
      versionIds,
      format,
      fileName,
    });
    exportVersionsButton.disabled = false;
    if (!result.ok) {
      if (result.error.code === 'COMMON_CANCELLED_004') return setTextIoStatus('已取消导出。');
      return setTextIoStatus(`导出失败 · ${result.error.code}`, true);
    }
    setTextIoStatus(`已原子导出 ${result.data.fileName} · ${result.data.sha256.slice(0, 12)}…`);
  })();
});
