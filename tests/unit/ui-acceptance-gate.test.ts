import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  evaluateUiAcceptanceState,
  filterScopeChanges,
  resolveUiFreshnessAuthority,
  scopeMatches,
  validateUiAcceptanceEvidence,
} from '../../scripts/ui-acceptance-gate.mjs';

const temporaryDirectories: string[] = [];

function acceptanceState(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    taskId: 'M8-07',
    updatedAt: '2026-08-11T13:11:00+08:00',
    releaseBlockingSeverities: ['P0', 'P1'],
    items: [
      {
        id: 'CHN-TERM-001',
        severity: 'P1',
        status: 'PASS',
        description: '正式中文名称通过',
        verifiedCommit: 'a'.repeat(40),
        scope: ['apps/desktop/renderer/**'],
        evidence: ['manual:windows-ime'],
        waiver: null,
      },
    ],
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('UI acceptance gate', () => {
  it('accepts release-blocking items only when PASS remains fresh and evidence is reachable', () => {
    expect(
      evaluateUiAcceptanceState(acceptanceState(), {
        head: 'b'.repeat(40),
        isReachable: () => true,
        changedSinceVerification: () => [],
      }),
    ).toEqual([]);
  });

  it('blocks open P0/P1 items and missing evidence', () => {
    const state = acceptanceState({
      items: [
        {
          id: 'VIS-DARK-001',
          severity: 'P1',
          status: 'FAIL',
          description: '深色主题未通过',
          verifiedCommit: null,
          scope: ['apps/desktop/renderer/**'],
          evidence: [],
          waiver: null,
        },
      ],
    });

    expect(evaluateUiAcceptanceState(state)).toEqual([
      'VIS-DARK-001: release-blocking P1 item must be PASS, found FAIL',
    ]);
  });

  it('blocks unreachable verification commits', () => {
    expect(
      evaluateUiAcceptanceState(acceptanceState(), {
        head: 'b'.repeat(40),
        isReachable: () => false,
        changedSinceVerification: () => [],
      }),
    ).toContain('CHN-TERM-001: verifiedCommit is not reachable from the release commit');
  });

  it('blocks stale PASS when a scoped file changed after verifiedCommit', () => {
    expect(
      evaluateUiAcceptanceState(acceptanceState(), {
        head: 'b'.repeat(40),
        isReachable: () => true,
        changedSinceVerification: () => ['apps/desktop/renderer/src/App.tsx'],
      }),
    ).toContain(
      'CHN-TERM-001: acceptance is stale because scoped files changed after verifiedCommit: apps/desktop/renderer/src/App.tsx',
    );
  });

  it('delegates freshness only inside the permanent Release workflow or after live E2E success', () => {
    const workflowAuthority = resolveUiFreshnessAuthority([], {
      GITHUB_ACTIONS: 'true',
      GITHUB_WORKFLOW: 'Release',
    });
    expect(workflowAuthority).toBe('release-workflow');

    const delegatedErrors = evaluateUiAcceptanceState(acceptanceState(), {
      head: 'b'.repeat(40),
      freshnessAuthority: workflowAuthority,
      isReachable: () => true,
      changedSinceVerification: () => ['apps/desktop/renderer/src/App.tsx'],
    });
    expect(delegatedErrors).toEqual([]);

    const liveAuthority = resolveUiFreshnessAuthority(['--release-e2e-authority'], {
      RELEASE_E2E_AUTHORITY: 'success',
    });
    expect(liveAuthority).toBe('release-e2e');

    expect(() =>
      resolveUiFreshnessAuthority(['--release-e2e-authority'], {
        RELEASE_E2E_AUTHORITY: 'failure',
      }),
    ).toThrow(/RELEASE_E2E_AUTHORITY=success/);
    expect(resolveUiFreshnessAuthority([], {})).toBe('verified-commit');
  });

  it('requires every PASS to declare a freshness scope even with delegated release authority', () => {
    const state = acceptanceState();
    delete (state.items[0] as { scope?: string[] }).scope;
    const errors = evaluateUiAcceptanceState(state, {
      freshnessAuthority: 'release-workflow',
    });
    expect(errors).toContain('CHN-TERM-001: PASS requires a non-empty freshness scope');
  });

  it('matches exact and recursive UI freshness scopes', () => {
    expect(scopeMatches('apps/desktop/renderer/src/App.tsx', 'apps/desktop/renderer/**')).toBe(
      true,
    );
    expect(scopeMatches('scripts/ui-acceptance-gate.mjs', 'scripts/ui-acceptance-gate.mjs')).toBe(
      true,
    );
    expect(scopeMatches('packages/core-service/src/core.ts', 'apps/desktop/renderer/**')).toBe(
      false,
    );
    expect(
      filterScopeChanges(
        ['apps/desktop/renderer/src/App.tsx', 'packages/core-service/src/core.ts'],
        ['apps/desktop/renderer/**'],
      ),
    ).toEqual(['apps/desktop/renderer/src/App.tsx']);
  });

  it('blocks expired accepted-risk waivers', () => {
    const state = acceptanceState({
      releaseBlockingSeverities: ['P0'],
      items: [
        {
          id: 'P2-LIMITATION',
          severity: 'P2',
          status: 'ACCEPTED_RISK',
          description: '非阻断限制',
          verifiedCommit: null,
          scope: [],
          evidence: [],
          waiver: {
            reason: '设备暂不可用',
            approvedBy: 'author',
            expiresAt: '2026-07-29T00:00:00.000Z',
          },
        },
      ],
    });

    expect(
      evaluateUiAcceptanceState(state, {
        now: Date.parse('2026-07-30T00:00:00.000Z'),
      }),
    ).toContain('P2-LIMITATION: accepted-risk waiver has expired');
  });

  it('validates repository evidence paths while allowing typed external references', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-ui-acceptance-'));
    temporaryDirectories.push(directory);
    await writeFile(path.join(directory, 'evidence.txt'), 'ok', 'utf8');
    const state = acceptanceState({
      items: [
        {
          id: 'LAYOUT-1280-001',
          severity: 'P1',
          status: 'PASS',
          description: '布局通过',
          verifiedCommit: 'a'.repeat(40),
          scope: ['apps/desktop/renderer/**'],
          evidence: ['evidence.txt', 'run:30500000000', 'artifact:display-matrix'],
          waiver: null,
        },
      ],
    });

    await expect(validateUiAcceptanceEvidence(state, directory)).resolves.toEqual([]);
    state.items[0]!.evidence = ['missing.txt'];
    await expect(validateUiAcceptanceEvidence(state, directory)).resolves.toEqual([
      'LAYOUT-1280-001: evidence path does not exist: missing.txt',
    ]);
  });
});
