import type { AppSettings, AppearancePreferences } from '@worldforge/contracts';

import { layoutPolicyForViewport } from '../layout-model.js';
import { flushRegisteredDraft } from '../runtime/draft-flush-registry.js';
import { contentWidthPixels } from './app-shell-helpers.js';

export type ProjectPresentationState = 'closed' | 'open' | 'read-only';

export interface RendererApplicationController {
  readonly flushPendingDraft: () => Promise<boolean>;
  readonly applyPresentation: (
    settings: AppSettings,
    appearance: AppearancePreferences,
    projectState: ProjectPresentationState,
  ) => void;
  readonly refreshPlacement: () => void;
}

export function createRendererApplicationController(): RendererApplicationController {
  const refreshPlacement = (): void => {
    const rawScale = getComputedStyle(document.documentElement).getPropertyValue('--ui-scale');
    const scale = Number.parseFloat(rawScale) || 1;
    const policy = layoutPolicyForViewport(window.innerWidth / scale);
    document.body.dataset.layoutMode = policy.mode;
    document.body.dataset.leftPanel = policy.leftPanel;
  };

  return {
    flushPendingDraft: flushRegisteredDraft,
    applyPresentation(settings, appearance, projectState) {
      document.body.dataset.theme = settings.themeId;
      document.body.dataset.visualThemeVariant = settings.themeVariant;
      document.body.dataset.motionPreference = settings.reduceMotion ? 'reduced' : 'full';
      document.body.dataset.authorMode = settings.defaultMode;
      document.body.dataset.projectState = projectState;
      document.body.dataset.workspaceAlignment = appearance.workspaceAlignment;
      document.documentElement.style.colorScheme =
        settings.themeVariant === 'dark' ? 'dark' : 'light';
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
      refreshPlacement();
      window.dispatchEvent(new CustomEvent('worldforge:presentation-changed'));
    },
    refreshPlacement,
  };
}
