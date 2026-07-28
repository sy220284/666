import { describe, expect, it } from 'vitest';

import { summarizeWorkspaceAttention } from '../../apps/desktop/renderer/src/runtime/workspace-attention.js';

describe('workspace attention summary', () => {
  it('derives pending author decisions from authoritative domain snapshots', () => {
    expect(
      summarizeWorkspaceAttention({
        candidates: [
          { status: 'pending', completeness: 'partial' },
          { status: 'pending', completeness: 'complete' },
          { status: 'accepted', completeness: 'complete' },
        ],
        proposals: [{ status: 'pending' }, { status: 'accepted' }],
        validationIssues: [
          { status: 'open', severity: 'high' },
          { status: 'open', severity: 'low' },
          { status: 'resolved', severity: 'high' },
        ],
        searchState: { status: 'stale', failedCount: 2 },
      }),
    ).toEqual({
      pendingCandidateCount: 2,
      partialCandidateCount: 1,
      pendingProposalCount: 1,
      openValidationCount: 2,
      highValidationCount: 1,
      searchStatus: 'stale',
      searchFailedCount: 2,
      unavailableSources: [],
    });
  });

  it('keeps unavailable domains explicit instead of treating them as successful empty results', () => {
    expect(
      summarizeWorkspaceAttention({
        candidates: [],
        proposals: [],
        validationIssues: [],
        searchState: null,
        unavailableSources: ['proposal', 'search'],
      }).unavailableSources,
    ).toEqual(['proposal', 'search']);
  });
});
