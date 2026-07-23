import { describe, expect, it } from 'vitest';

import {
  captureWindowPreferences,
  restoreWindowPreferences,
  type DisplaySnapshot,
} from '../../apps/desktop/main/src/window-state.js';

const appearance = {
  workspaceAlignment: 'center' as const,
  uiScalePercent: 100,
  bodyFontSize: 18,
  contentWidth: 'normal' as const,
};

const displays: readonly DisplaySnapshot[] = [
  {
    id: 'left',
    scaleFactor: 1,
    workArea: { x: -1200, y: 0, width: 1200, height: 800 },
  },
  {
    id: 'primary',
    scaleFactor: 2,
    workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    primary: true,
  },
];

describe('Electron window state unit and regression coverage', () => {
  it('centers default preferences on the primary display', () => {
    expect(restoreWindowPreferences(null, displays)).toEqual({
      ...appearance,
      displayId: 'primary',
      boundsDip: { x: 320, y: 140, width: 1280, height: 800 },
      scaleFactor: 2,
      maximized: false,
    });
  });

  it('keeps a saved window visible on its original display and clamps oversized/offscreen bounds', () => {
    const restored = restoreWindowPreferences(
      {
        ...appearance,
        displayId: 'left',
        boundsDip: { x: -5000, y: 5000, width: 5000, height: 5000 },
        scaleFactor: 1,
        maximized: true,
      },
      displays,
    );
    expect(restored).toMatchObject({
      displayId: 'left',
      boundsDip: { x: -1200, y: 0, width: 1200, height: 800 },
      maximized: true,
    });
  });

  it('recenters saved dimensions when the original display disappeared', () => {
    const restored = restoreWindowPreferences(
      {
        workspaceAlignment: 'right',
        uiScalePercent: 120,
        bodyFontSize: 20,
        contentWidth: 'wide',
        displayId: 'missing',
        boundsDip: { x: 8000, y: 8000, width: 900, height: 600 },
        scaleFactor: 1,
        maximized: false,
      },
      displays,
    );
    expect(restored).toMatchObject({
      workspaceAlignment: 'right',
      uiScalePercent: 120,
      bodyFontSize: 20,
      contentWidth: 'wide',
      displayId: 'primary',
      boundsDip: { x: 510, y: 240, width: 900, height: 600 },
      scaleFactor: 2,
    });
  });

  it('supports displays smaller than the normal minimum window size', () => {
    const tiny: readonly DisplaySnapshot[] = [
      {
        id: 'tiny',
        scaleFactor: 1,
        primary: true,
        workArea: { x: 10, y: 20, width: 500, height: 300 },
      },
    ];
    expect(restoreWindowPreferences(null, tiny).boundsDip).toEqual({
      x: 10,
      y: 20,
      width: 500,
      height: 300,
    });
  });

  it('throws when no display is available', () => {
    expect(() => restoreWindowPreferences(null, [])).toThrow('WINDOW_RESTORE_DISPLAY_UNAVAILABLE');
    expect(() =>
      captureWindowPreferences(
        { x: 0, y: 0, width: 800, height: 600 },
        false,
        [],
        appearance,
      ),
    ).toThrow('WINDOW_RESTORE_DISPLAY_UNAVAILABLE');
  });

  it('captures the display with the greatest visible intersection', () => {
    const captured = captureWindowPreferences(
      { x: -200, y: 100, width: 1000, height: 700 },
      true,
      displays,
      { ...appearance, workspaceAlignment: 'left' },
    );
    expect(captured).toMatchObject({
      displayId: 'primary',
      scaleFactor: 2,
      maximized: true,
      workspaceAlignment: 'left',
    });
  });

  it('falls back to primary when the window has no visible intersection', () => {
    const captured = captureWindowPreferences(
      { x: 9000, y: 9000, width: 800, height: 600 },
      false,
      displays,
      appearance,
    );
    expect(captured.displayId).toBe('primary');
  });
});
