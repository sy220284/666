import { describe, expect, it } from 'vitest';

import { validateMainVerification, validateTreeIdentity } from '../../scripts/main-verification.mjs';

const expectedSha = 'a'.repeat(40);
const sourceHeadSha = 'b'.repeat(40);
const requiredChecks = ['pr-policy'];
const checkRuns = [
  {
    id: 1,
    name: 'pr-policy',
    status: 'completed',
    conclusion: 'success',
    created_at: '2026-08-11T00:00:00Z',
  },
];

function pull(head: string) {
  return {
    merged: true,
    merged_at: '2026-08-11T00:01:00Z',
    base: { ref: 'main' },
    head: { ref: head, sha: sourceHeadSha },
    merge_commit_sha: expectedSha,
  };
}

function validate(head: string) {
  return () =>
    validateMainVerification({
      repository: 'sy220284/666',
      baseBranch: 'main',
      expectedSha,
      sourcePr: 400,
      sourceHeadSha,
      githubRef: 'refs/heads/main',
      githubSha: expectedSha,
      pull: pull(head),
      requiredChecks,
      checkRuns,
    });
}

describe('governance main verification provenance', () => {
  it('accepts permanent work and governance integration branches', () => {
    expect(validate('work')).not.toThrow();
    expect(validate('governance')).not.toThrow();
  });

  it('rejects undeclared source branches', () => {
    expect(validate('governance/task')).toThrow('must originate from work or governance');
  });

  it('accepts identical verified PR and final main Git trees', () => {
    const tree = 'c'.repeat(40);
    expect(validateTreeIdentity({ tree: { sha: tree } }, { tree: { sha: tree } })).toBe(tree);
  });

  it('rejects a final main tree that differs from the verified PR Head', () => {
    expect(() =>
      validateTreeIdentity(
        { tree: { sha: 'c'.repeat(40) } },
        { tree: { sha: 'd'.repeat(40) } },
      ),
    ).toThrow('Final main tree differs from verified PR Head tree');
  });
});
