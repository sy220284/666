import type { ContentWidthPreference } from './types.js';

export type LayoutMode = 'compact' | 'narrow' | 'standard' | 'two-k' | 'wide' | 'ultrawide';

export interface LayoutPolicy {
  readonly mode: LayoutMode;
  readonly leftPanel: 'sidebar' | 'drawer';
  readonly rightPanel: 'sidebar' | 'drawer';
}

export function layoutPolicyForViewport(width: number): LayoutPolicy {
  if (!Number.isFinite(width) || width <= 0)
    throw new RangeError('Viewport width must be positive.');
  if (width < 900) return { mode: 'compact', leftPanel: 'drawer', rightPanel: 'drawer' };
  if (width < 1_100) return { mode: 'narrow', leftPanel: 'sidebar', rightPanel: 'drawer' };
  if (width < 1_440) return { mode: 'standard', leftPanel: 'sidebar', rightPanel: 'sidebar' };
  if (width < 1_920) return { mode: 'two-k', leftPanel: 'sidebar', rightPanel: 'sidebar' };
  if (width < 2_560) return { mode: 'wide', leftPanel: 'sidebar', rightPanel: 'sidebar' };
  return { mode: 'ultrawide', leftPanel: 'sidebar', rightPanel: 'sidebar' };
}

export function contentWidthPixels(
  preference: ContentWidthPreference,
  viewportWidth: number,
): number {
  if (preference === 'narrow') return 680;
  if (preference === 'normal') return 760;
  if (preference === 'wide') return 860;
  return Math.max(680, Math.min(860, Math.round(viewportWidth * 0.5)));
}
