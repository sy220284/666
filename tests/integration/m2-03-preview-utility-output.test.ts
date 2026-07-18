import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('M2-03 Preview Utility routing', () => {
  it('contains the Candidate Preview operation route', async () => {
    const source = await readFile('packages/core-service/src/utility-entry.ts', 'utf8');
    expect(source).toContain('CANDIDATE_APPLY_COMMANDS.previewCandidate');
    expect(source).toContain('candidateApply.preview(operation.input)');
  });
});
