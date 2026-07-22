import type { AppSettings, AppearancePreferences } from '@worldforge/contracts';

import { contentWidthPixels } from '../layout-model.js';
import type { RendererRouteId } from '../state/ui-state-boundary.js';

export interface LegacySurfaceController {
  readonly activate: (route: RendererRouteId) => void;
  readonly deactivate: () => void;
  readonly synchronizeProjectContext: () => void;
  readonly toggleProjectPanel: () => void;
  readonly openChapter: (chapterId: string) => void;
  readonly flushPendingDraft: () => Promise<boolean>;
  readonly refreshPlacement: () => void;
  readonly applyPresentation: (
    settings: AppSettings,
    appearance: AppearancePreferences,
    projectState: 'closed' | 'open' | 'read-only',
  ) => void;
}

export function createLegacySurfaceController(): LegacySurfaceController {
  const root = document.getElementById('legacy-root');
  if (!root) throw new Error('RENDERER_LEGACY_ROOT_MISSING');

  const position = (): void => {
    if (root.hidden) return;
    const placeholder = document.querySelector<HTMLElement>('[data-legacy-placeholder="true"]');
    const heading = placeholder?.querySelector<HTMLElement>('.react-legacy-heading');
    if (!placeholder || !heading) return;
    const placeholderBounds = placeholder.getBoundingClientRect();
    const headingBounds = heading.getBoundingClientRect();
    const structureRail = placeholder.querySelector<HTMLElement>('[data-react-structure-rail]');
    const railWidth = structureRail?.offsetWidth ?? 0;
    if (structureRail) {
      structureRail.style.inset = `${Math.round(headingBounds.bottom)}px auto 0 ${Math.round(placeholderBounds.left)}px`;
    }
    root.style.inset = `${Math.round(headingBounds.bottom)}px 0 0 ${Math.round(placeholderBounds.left + railWidth)}px`;
  };

  window.addEventListener('resize', position);

  const synchronizeProjectContext = (): void => {
    window.dispatchEvent(new Event('worldforge:project-context-changed'));
  };
  return {
    activate(route) {
      root.hidden = false;
      root.dataset.embedded = 'true';
      root.dataset.legacyRoute = route;
      synchronizeProjectContext();
      window.requestAnimationFrame(position);
    },
    deactivate() {
      for (const dialog of root.querySelectorAll<HTMLDialogElement>('dialog[open]')) dialog.close();
      root.hidden = true;
      root.style.removeProperty('inset');
      delete root.dataset.legacyRoute;
    },
    synchronizeProjectContext,
    toggleProjectPanel() {
      root.querySelector<HTMLButtonElement>('[data-toggle-left]')?.click();
    },
    openChapter(chapterId) {
      window.dispatchEvent(
        new CustomEvent('worldforge:legacy-open-chapter', { detail: { chapterId } }),
      );
    },
    flushPendingDraft() {
      const flush = (
        globalThis as typeof globalThis & {
          readonly worldforgeFlushDraft?: () => Promise<boolean>;
        }
      ).worldforgeFlushDraft;
      return flush ? flush() : Promise.resolve(true);
    },
    refreshPlacement() {
      window.requestAnimationFrame(position);
    },
    applyPresentation(settings, appearance, projectState) {
      document.body.dataset.theme = settings.themeId;
      delete document.body.dataset.themeVariant;
      document.body.dataset.visualThemeVariant = settings.themeVariant;
      document.body.dataset.motionPreference = settings.reduceMotion ? 'reduced' : 'full';
      document.body.dataset.authorMode = settings.defaultMode;
      document.body.dataset.projectState = projectState;
      document.documentElement.style.setProperty(
        '--ui-scale',
        String(appearance.uiScalePercent / 100),
      );
      document.documentElement.style.setProperty(
        '--body-font-size',
        `${appearance.bodyFontSize}px`,
      );
      document.documentElement.style.setProperty(
        '--content-width',
        `${contentWidthPixels(appearance.contentWidth, window.innerWidth)}px`,
      );
      document.body.dataset.workspaceAlignment = appearance.workspaceAlignment;
      window.dispatchEvent(new Event('worldforge:presentation-changed'));
    },
  };
}
