import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { createWorldforgeEditorExtensions } from '../../packages/editor-core/src/draft-document.js';

describe('editor client identity invariant', () => {
  it('installs the identity extension that repairs missing and duplicate client ids', () => {
    const extensions = createWorldforgeEditorExtensions(() => 'generated-client');
    expect(extensions.some((extension) => extension.name === 'worldforgeClientIdentity')).toBe(
      true,
    );
  });

  it('does not retain the former module-global pending snapshot protocol', async () => {
    const source = await readFile('packages/editor-core/src/persisted-metadata-sync.ts', 'utf8');
    expect(source).not.toContain('pendingSnapshot');
    expect(source).not.toContain('rememberPendingDraftSnapshot');
  });
});
