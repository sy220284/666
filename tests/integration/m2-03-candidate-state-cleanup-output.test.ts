import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('M2-03 Candidate state boundary', () => {
  it('parses persisted selections through contracts without an editor dependency', async () => {
    const source = await readFile('packages/core-service/src/candidate-state.ts', 'utf8');

    expect(source).toContain('CandidateSelectionSchema.parse');
    expect(source).not.toContain('@worldforge/editor-core');
    expect(source).not.toContain('M203_CANDIDATE_STATE_BASE64');
  });
});
