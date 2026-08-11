import { describe, expect, it } from 'vitest';

import { workspaceExportPath } from '../../scripts/package-foundation.mjs';

describe('foundation package runtime entry', () => {
  it('uses each workspace declared export instead of a hard-coded ESM entry', () => {
    expect(
      workspaceExportPath('apps/desktop/preload', {
        exports: './dist/index.cjs',
      }),
    ).toBe('dist/index.cjs');
    expect(
      workspaceExportPath('apps/desktop/renderer', {
        exports: './dist/index.js',
      }),
    ).toBe('dist/index.js');
  });

  it('rejects exports that escape the workspace or are not relative strings', () => {
    expect(() => workspaceExportPath('apps/desktop/preload', { exports: '../outside.js' })).toThrow(
      /relative string package export/,
    );
    expect(() =>
      workspaceExportPath('apps/desktop/preload', {
        exports: './../../outside.js',
      }),
    ).toThrow(/stay inside the workspace/);
    expect(() => workspaceExportPath('apps/desktop/preload', { exports: {} })).toThrow(
      /relative string package export/,
    );
  });
});
