import { describe, expect, it } from 'vitest';

import {
  archiveTagFor,
  canonicalWorkDecision,
  isLegacyWorkBranch,
} from '../../scripts/work-branch-policy.mjs';

const sha = (character: string): string => character.repeat(40);

describe('canonical work branch policy', () => {
  it('identifies only work namespace child branches as legacy', () => {
    expect(isLegacyWorkBranch('work/m10-02-full-code-audit')).toBe(true);
    expect(isLegacyWorkBranch('work')).toBe(false);
    expect(isLegacyWorkBranch('workspace/example')).toBe(false);
    expect(isLegacyWorkBranch('main')).toBe(false);
  });

  it('creates a deterministic archive tag before deleting a legacy branch', () => {
    expect(archiveTagFor('work/m10-02/full-code-audit', sha('a'))).toBe(
      'archive/legacy-work/m10-02-full-code-audit-aaaaaaaaaaaa',
    );
  });

  it('keeps an existing canonical work branch', () => {
    expect(canonicalWorkDecision(['main', 'work'])).toEqual({ action: 'keep', blockers: [] });
  });

  it('blocks canonical creation while any work child branch remains', () => {
    expect(canonicalWorkDecision(['main', 'work/task-b', 'work/task-a'])).toEqual({
      action: 'blocked',
      blockers: ['work/task-a', 'work/task-b'],
    });
  });

  it('allows canonical creation after all work child branches are removed', () => {
    expect(canonicalWorkDecision(['main', 'release/v1'])).toEqual({
      action: 'create',
      blockers: [],
    });
  });
});
