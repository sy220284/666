import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('M2-03 Preview Main registration', () => {
  it('registers and disposes the strict Candidate Preview IPC handler', async () => {
    const source = await readFile('apps/desktop/main/src/electron-main.ts', 'utf8');
    expect(source).toContain('registerCandidatePreviewIpc');
    expect(source).toContain('unregisterPreviewIpc');
    expect(source).toContain('unregisterBaseIpc');
  });
});
