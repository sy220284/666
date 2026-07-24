import { describe, expect, it } from 'vitest';

import {
  contentWidthPixels,
  layoutPolicyForViewport,
} from '../../apps/desktop/renderer/src/layout-model.js';

describe('Renderer layout policy boundary coverage', () => {
  it.each([
    [1, 'compact', 'drawer', 'drawer'],
    [899, 'compact', 'drawer', 'drawer'],
    [900, 'narrow', 'sidebar', 'drawer'],
    [1099, 'narrow', 'sidebar', 'drawer'],
    [1100, 'standard', 'sidebar', 'sidebar'],
    [1439, 'standard', 'sidebar', 'sidebar'],
    [1440, 'two-k', 'sidebar', 'sidebar'],
    [1919, 'two-k', 'sidebar', 'sidebar'],
    [1920, 'wide', 'sidebar', 'sidebar'],
    [2559, 'wide', 'sidebar', 'sidebar'],
    [2560, 'ultrawide', 'sidebar', 'sidebar'],
  ])('maps viewport %i to %s', (width, mode, leftPanel, rightPanel) => {
    expect(layoutPolicyForViewport(width)).toEqual({ mode, leftPanel, rightPanel });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects invalid viewport %s',
    (width) => {
      expect(() => layoutPolicyForViewport(width)).toThrow('Viewport width must be positive');
    },
  );

  it.each([
    ['narrow', 1000, 680],
    ['normal', 1000, 760],
    ['wide', 1000, 860],
    ['auto', 1000, 680],
    ['auto', 1521, 761],
    ['auto', 3000, 860],
  ] as const)('maps %s width at viewport %i', (preference, viewportWidth, expected) => {
    expect(contentWidthPixels(preference, viewportWidth)).toBe(expected);
  });
});
