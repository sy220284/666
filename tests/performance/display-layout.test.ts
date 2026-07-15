import { performance } from 'node:perf_hooks';

import { describe, expect, it } from 'vitest';

import {
  captureWindowPreferences,
  restoreWindowPreferences,
  type DisplaySnapshot,
} from '../../apps/desktop/main/src/window-state.js';
import {
  contentWidthPixels,
  layoutPolicyForViewport,
} from '../../apps/desktop/renderer/src/layout-model.js';

const primary: DisplaySnapshot = {
  id: 'primary-100',
  primary: true,
  scaleFactor: 1,
  workArea: { x: 0, y: 0, width: 1_920, height: 1_040 },
};

const mixedDpi: DisplaySnapshot = {
  id: 'secondary-150',
  scaleFactor: 1.5,
  workArea: { x: 1_920, y: -180, width: 1_707, height: 960 },
};

const appearance = {
  workspaceAlignment: 'center' as const,
  uiScalePercent: 100,
  bodyFontSize: 18,
  contentWidth: 'normal' as const,
};

describe('display and responsive layout performance', () => {
  it.each([
    [1_280, 100, 'standard', 'sidebar', 'sidebar'],
    [2_560, 100, 'ultrawide', 'sidebar', 'sidebar'],
    [2_560, 125, 'wide', 'sidebar', 'sidebar'],
    [2_560, 150, 'two-k', 'sidebar', 'sidebar'],
    [3_440, 100, 'ultrawide', 'sidebar', 'sidebar'],
    [3_840, 100, 'ultrawide', 'sidebar', 'sidebar'],
    [1_024, 100, 'narrow', 'sidebar', 'drawer'],
    [1_280, 150, 'compact', 'drawer', 'drawer'],
  ] as const)(
    'maps %ipx at %i%% to %s without coupling physical pixels to breakpoints',
    (physicalWidth, scalePercent, mode, leftPanel, rightPanel) => {
      expect(layoutPolicyForViewport(physicalWidth / (scalePercent / 100))).toEqual({
        mode,
        leftPanel,
        rightPanel,
      });
    },
  );

  it('keeps every content-width preference within the frozen 680–860 CSS px range', () => {
    expect(contentWidthPixels('narrow', 3_440)).toBe(680);
    expect(contentWidthPixels('normal', 3_440)).toBe(760);
    expect(contentWidthPixels('wide', 3_440)).toBe(860);
    expect(contentWidthPixels('adaptive', 1_280)).toBe(680);
    expect(contentWidthPixels('adaptive', 1_600)).toBe(800);
    expect(contentWidthPixels('adaptive', 3_440)).toBe(860);
  });

  it('captures the dominant mixed-DPI display and restores a lost display visibly', () => {
    const captured = captureWindowPreferences(
      { x: 2_050, y: -120, width: 1_200, height: 820 },
      false,
      [primary, mixedDpi],
      appearance,
    );
    expect(captured).toMatchObject({ displayId: 'secondary-150', scaleFactor: 1.5 });

    const restored = restoreWindowPreferences(captured, [primary]);
    expect(restored).toMatchObject({ displayId: 'primary-100', scaleFactor: 1 });
    expect(restored.boundsDip.x).toBeGreaterThanOrEqual(primary.workArea.x);
    expect(restored.boundsDip.y).toBeGreaterThanOrEqual(primary.workArea.y);
    expect(restored.boundsDip.x + restored.boundsDip.width).toBeLessThanOrEqual(
      primary.workArea.x + primary.workArea.width,
    );
    expect(restored.boundsDip.y + restored.boundsDip.height).toBeLessThanOrEqual(
      primary.workArea.y + primary.workArea.height,
    );
  });

  it('keeps 10,000 mixed-DPI layout recalculations well below the one-second recovery budget', () => {
    const samples: number[] = [];
    const startedAt = performance.now();
    let saved = captureWindowPreferences(
      { x: 2_050, y: -120, width: 1_200, height: 820 },
      false,
      [primary, mixedDpi],
      appearance,
    );
    for (let index = 0; index < 10_000; index += 1) {
      const sampleStartedAt = performance.now();
      saved = restoreWindowPreferences(saved, index % 2 === 0 ? [primary, mixedDpi] : [primary]);
      layoutPolicyForViewport(1_280 + (index % 2_400));
      contentWidthPixels(index % 2 === 0 ? 'adaptive' : 'normal', 1_280 + (index % 2_400));
      samples.push(performance.now() - sampleStartedAt);
    }
    samples.sort((left, right) => left - right);
    const p95 = samples[Math.floor(samples.length * 0.95)] ?? Number.POSITIVE_INFINITY;
    expect(p95).toBeLessThan(1);
    expect(performance.now() - startedAt).toBeLessThan(1_000);
  });
});
