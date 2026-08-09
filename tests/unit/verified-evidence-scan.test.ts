import { describe, expect, it } from 'vitest';

import {
  assertCompleteStatusResolution,
  effectivelyVerifiedTaskIds,
  historicalEvidenceBindingCommit,
} from '../../scripts/verified-evidence-scan.mjs';

const source = `
| ID | 任务卡 | 依赖 | 状态 |
|---|---|---|---|
| M0-01 | [A](M0/A.md) | 无 | Verified |
| M0-02 | [B](M0/B.md) | M0-01 | Implemented |
| M1-01 | [C](M1/C.md) | M0 | Verified |
`;

const implementedRuntime = {
  schemaVersion: 2,
  id: 'M0-02',
  status: 'IMPLEMENTED',
  verificationBinding: { taskContext: 'task-verification/M0-02' },
};

describe('verified evidence scan', () => {
  it('includes static Verified tasks and effectively Verified runtime tasks', () => {
    expect(
      effectivelyVerifiedTaskIds(
        source,
        [implementedRuntime],
        [{ context: 'task-verification/M0-02', state: 'success' }],
      ),
    ).toEqual(['M0-01', 'M0-02', 'M1-01']);
  });

  it('excludes an Implemented runtime whose task status is absent or failed', () => {
    expect(effectivelyVerifiedTaskIds(source, [implementedRuntime], [])).toEqual([
      'M0-01',
      'M1-01',
    ]);
  });

  it('does not treat text outside task rows as a Verified task', () => {
    expect(effectivelyVerifiedTaskIds('M2-04 is Verified in prose.')).toEqual([]);
  });

  it('缺少GitHub状态解析时拒绝把Implemented任务静默漏出全量扫描', () => {
    expect(() => assertCompleteStatusResolution([implementedRuntime], false)).toThrow(
      'partial success is forbidden',
    );
    expect(() => assertCompleteStatusResolution([implementedRuntime], true)).not.toThrow();
  });

  it('binds an orphaned Schema 1 Evidence commit to its controlled squash merge', () => {
    const orphan = 'a'.repeat(40);
    const controlledMerge = 'b'.repeat(40);
    const runtime = {
      schemaVersion: 2,
      verificationBinding: { sourcePr: 310 },
    };

    expect(
      historicalEvidenceBindingCommit(
        { schemaVersion: 1, commit: orphan },
        runtime,
        false,
        () => controlledMerge,
      ),
    ).toBe(controlledMerge);
    expect(
      historicalEvidenceBindingCommit(
        { schemaVersion: 1, commit: orphan },
        runtime,
        true,
        () => controlledMerge,
      ),
    ).toBe(orphan);
  });

  it('does not weaken current Schema 2 or legacy unbound Evidence commits', () => {
    const sourceCommit = 'c'.repeat(40);
    const controlledMerge = 'd'.repeat(40);

    expect(
      historicalEvidenceBindingCommit(
        { schemaVersion: 2, implementationCommit: sourceCommit },
        { schemaVersion: 2, verificationBinding: { sourcePr: 311 } },
        false,
        () => controlledMerge,
      ),
    ).toBe(sourceCommit);
    expect(
      historicalEvidenceBindingCommit(
        { schemaVersion: 1, commit: sourceCommit },
        { schemaVersion: 1, sourcePr: 263 },
        false,
        () => controlledMerge,
      ),
    ).toBe(sourceCommit);
  });
});
