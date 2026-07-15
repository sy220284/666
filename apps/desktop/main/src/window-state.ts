import {
  DEFAULT_APPEARANCE_PREFERENCES,
  WindowPreferencesSchema,
  type AppearancePreferences,
  type WindowBoundsDip,
  type WindowPreferences,
} from '@worldforge/contracts';

export interface DisplaySnapshot {
  readonly id: string;
  readonly scaleFactor: number;
  readonly workArea: WindowBoundsDip;
  readonly primary?: boolean;
}

const minimumWindowWidth = 720;
const minimumWindowHeight = 520;
const defaultWindowWidth = 1_280;
const defaultWindowHeight = 800;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function primaryDisplay(displays: readonly DisplaySnapshot[]): DisplaySnapshot {
  const display = displays.find((candidate) => candidate.primary) ?? displays[0];
  if (!display) throw new Error('WINDOW_RESTORE_DISPLAY_UNAVAILABLE');
  return display;
}

function centeredBounds(
  display: DisplaySnapshot,
  preferredWidth: number,
  preferredHeight: number,
): WindowBoundsDip {
  const minimumWidth = Math.min(minimumWindowWidth, display.workArea.width);
  const minimumHeight = Math.min(minimumWindowHeight, display.workArea.height);
  const width = clamp(preferredWidth, minimumWidth, display.workArea.width);
  const height = clamp(preferredHeight, minimumHeight, display.workArea.height);
  return {
    x: Math.round(display.workArea.x + (display.workArea.width - width) / 2),
    y: Math.round(display.workArea.y + (display.workArea.height - height) / 2),
    width,
    height,
  };
}

function visibleBounds(display: DisplaySnapshot, preferred: WindowBoundsDip): WindowBoundsDip {
  const centered = centeredBounds(display, preferred.width, preferred.height);
  return {
    x: clamp(
      preferred.x,
      display.workArea.x,
      display.workArea.x + display.workArea.width - centered.width,
    ),
    y: clamp(
      preferred.y,
      display.workArea.y,
      display.workArea.y + display.workArea.height - centered.height,
    ),
    width: centered.width,
    height: centered.height,
  };
}

function appearanceFrom(preferences: WindowPreferences | null): AppearancePreferences {
  return preferences
    ? {
        workspaceAlignment: preferences.workspaceAlignment,
        uiScalePercent: preferences.uiScalePercent,
        bodyFontSize: preferences.bodyFontSize,
        contentWidth: preferences.contentWidth,
      }
    : DEFAULT_APPEARANCE_PREFERENCES;
}

export function restoreWindowPreferences(
  saved: WindowPreferences | null,
  displays: readonly DisplaySnapshot[],
): WindowPreferences {
  const originalDisplay = saved
    ? displays.find((display) => display.id === saved.displayId)
    : undefined;
  const targetDisplay = originalDisplay ?? primaryDisplay(displays);
  const boundsDip = saved
    ? originalDisplay
      ? visibleBounds(targetDisplay, saved.boundsDip)
      : centeredBounds(targetDisplay, saved.boundsDip.width, saved.boundsDip.height)
    : centeredBounds(targetDisplay, defaultWindowWidth, defaultWindowHeight);
  return WindowPreferencesSchema.parse({
    ...appearanceFrom(saved),
    displayId: targetDisplay.id,
    boundsDip,
    scaleFactor: targetDisplay.scaleFactor,
    maximized: saved?.maximized ?? false,
  });
}

function intersectionArea(left: WindowBoundsDip, right: WindowBoundsDip): number {
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  );
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y),
  );
  return width * height;
}

export function captureWindowPreferences(
  boundsDip: WindowBoundsDip,
  maximized: boolean,
  displays: readonly DisplaySnapshot[],
  appearance: AppearancePreferences,
): WindowPreferences {
  let display: DisplaySnapshot | undefined;
  let visibleArea = 0;
  for (const candidate of displays) {
    const area = intersectionArea(boundsDip, candidate.workArea);
    if (area <= visibleArea) continue;
    display = candidate;
    visibleArea = area;
  }
  display ??= primaryDisplay(displays);
  return WindowPreferencesSchema.parse({
    ...appearance,
    displayId: display.id,
    boundsDip,
    scaleFactor: display.scaleFactor,
    maximized,
  });
}
