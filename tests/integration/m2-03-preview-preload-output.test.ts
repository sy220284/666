import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('M2-03 Preview Preload bridge', () => {
  it('exposes the validated Candidate Preview method on a narrow bridge', async () => {
    const source = await readFile('apps/desktop/preload/src/entry.ts', 'utf8');
    expect(source).toContain("exposeInMainWorld('worldforgeCandidatePreview'");
    expect(source).toContain('CandidatePreviewCommandSchema.parse');
    expect(source).toContain('CandidatePreviewResultSchema.parse');
  });
});
