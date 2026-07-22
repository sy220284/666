import type { AppSettings, AppearancePreferences } from '@worldforge/contracts';

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

/**
 * Transitional interface kept only so the M3-07 runtime contract remains source-compatible.
 * M3-10 removed the legacy DOM root; all visible business UI is now React-owned.
 */
export function createLegacySurfaceController(): LegacySurfaceController {
  return {
    activate() {},
    deactivate() {},
    synchronizeProjectContext() {},
    toggleProjectPanel() {},
    openChapter() {},
    flushPendingDraft() {
      const flush = (
        globalThis as typeof globalThis & {
          readonly worldforgeFlushDraft?: () => Promise<boolean>;
        }
      ).worldforgeFlushDraft;
      return flush ? flush() : Promise.resolve(true);
    },
    refreshPlacement() {},
    applyPresentation(settings, appearance, projectState) {
      document.body.dataset.theme = settings.themeId;
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
      document.body.dataset.workspaceAlignment = appearance.workspaceAlignment;
    },
  };
}
