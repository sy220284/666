import { contentWidthPixels, layoutPolicyForViewport } from './layout-model.js';
import type {
  AppearancePreferences,
  AppSettings,
  AppSettingsSnapshot,
  AppSettingsUpdate,
  ProjectWorkspaceSummary,
  RecentProject,
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

let appearance = defaultAppearance;
let applicationSettings = defaultSettings;
let activeProject: ProjectWorkspaceSummary | null = null;
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
  if (!project) {
    if (workspaceTitle) workspaceTitle.textContent = '继续你的本地写作';
    if (workspaceBadge) workspaceBadge.textContent = '应用级数据';
    setProjectOperationStatus('');
    return;
  }
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
  if (!(nameInput instanceof HTMLInputElement) || !(channelInput instanceof HTMLInputElement)) {
    return;
  }
  const name = nameInput.value.trim();
  const channel = channelInput.value.trim();
  if (!name || !channel) {
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
    const result = await window.worldforge.project.create({ name, channel });
    if (result.ok) {
      createProjectDialog?.close();
      createProjectForm.reset();
      channelInput.value = '未分类';
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

closeProjectButton?.addEventListener('click', async () => {
  const project = activeProject;
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
