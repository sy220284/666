import { describe, expect, it } from 'vitest';

import { branchDeletionDecision, isProtectedBranch } from '../../scripts/branch-hygiene.mjs';

const sha = (character: string): string => character.repeat(40);
const authorization = { baseBranch: 'main', workBranch: 'work', governanceBranch: 'governance' };

describe('branch hygiene deletion safety', () => {
  it('protects the authorized main, work and governance branches', () => {
    expect(isProtectedBranch('main', authorization)).toBe(true);
    expect(isProtectedBranch('work', authorization)).toBe(true);
    expect(isProtectedBranch('governance', authorization)).toBe(true);
    expect(isProtectedBranch('release/v1.0.0', authorization)).toBe(false);
    expect(isProtectedBranch('feature/test', authorization)).toBe(false);
  });

  it('allows deletion when the current branch head is fully reachable from main', () => {
    expect(
      branchDeletionDecision({
        branchSha: sha('a'),
        pull: null,
        comparison: { ahead_by: 0 },
      }),
    ).toEqual({ safe: true, reason: 'current-head-is-fully-reachable-from-main' });
  });

  it('allows a squash-merged branch only while its current head still matches the merged PR', () => {
    expect(
      branchDeletionDecision({
        branchSha: sha('b'),
        pull: { merged_at: '2026-07-27T00:00:00Z', head: { sha: sha('b') } },
        comparison: { ahead_by: 3 },
      }),
    ).toEqual({ safe: true, reason: 'merged-pr-head-is-still-current' });
  });

  it('blocks deletion when new commits were added after a merged PR', () => {
    expect(
      branchDeletionDecision({
        branchSha: sha('c'),
        pull: { merged_at: '2026-07-27T00:00:00Z', head: { sha: sha('b') } },
        comparison: { ahead_by: 1 },
      }),
    ).toEqual({ safe: false, reason: 'branch-advanced-after-merged-pr' });
  });

  it('blocks unmerged commits and invalid comparison payloads', () => {
    expect(
      branchDeletionDecision({
        branchSha: sha('d'),
        pull: null,
        comparison: { ahead_by: 2 },
      }),
    ).toEqual({ safe: false, reason: 'branch-contains-unmerged-commits' });
    expect(
      branchDeletionDecision({
        branchSha: sha('d'),
        pull: null,
        comparison: {},
      }),
    ).toEqual({ safe: false, reason: 'invalid-main-comparison' });
  });
});
