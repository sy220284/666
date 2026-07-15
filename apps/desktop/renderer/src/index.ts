import { contentWidthPixels, layoutPolicyForViewport } from './layout-model.js';
import type { AppearancePreferences } from './types.js';

const defaultAppearance: AppearancePreferences = {
  workspaceAlignment: 'center',
  uiScalePercent: 100,
  bodyFontSize: 18,
  contentWidth: 'normal',
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

let appearance = defaultAppearance;
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

async function refresh(): Promise<void> {
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
  setFormValues(appearance);
  applyLayout();
  document.body.dataset.rendererReady = 'true';
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
