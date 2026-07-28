import type { SearchIndexStatus } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../bridge/renderer-bridge-adapter.js';
import type { BridgeRequestOutcome } from '../bridge/request-lifecycle.js';

export type WorkspaceAttentionSource =
  'candidate' | 'proposal' | 'validation' | 'search' | 'recovery';

export interface WorkspaceAttention {
  readonly pendingCandidateCount: number;
  readonly partialCandidateCount: number;
  readonly pendingProposalCount: number;
  readonly openValidationCount: number;
  readonly highValidationCount: number;
  readonly searchStatus: SearchIndexStatus | 'unknown';
  readonly searchFailedCount: number;
  readonly backupFailureCount: number;
  readonly unavailableSources: readonly WorkspaceAttentionSource[];
}

export const EMPTY_WORKSPACE_ATTENTION: WorkspaceAttention = {
  pendingCandidateCount: 0,
  partialCandidateCount: 0,
  pendingProposalCount: 0,
  openValidationCount: 0,
  highValidationCount: 0,
  searchStatus: 'unknown',
  searchFailedCount: 0,
  backupFailureCount: 0,
  unavailableSources: [],
};

interface WorkspaceAttentionInput {
  readonly candidates: readonly {
    readonly status: string;
    readonly completeness: string;
  }[];
  readonly proposals: readonly { readonly status: string }[];
  readonly validationIssues: readonly {
    readonly status: string;
    readonly severity: string;
  }[];
  readonly searchState: {
    readonly status: SearchIndexStatus;
    readonly failedCount: number;
  } | null;
  readonly backupFailures?: readonly unknown[];
  readonly unavailableSources?: readonly WorkspaceAttentionSource[];
}

export function summarizeWorkspaceAttention(input: WorkspaceAttentionInput): WorkspaceAttention {
  const pendingCandidates = input.candidates.filter((candidate) => candidate.status === 'pending');
  const openIssues = input.validationIssues.filter((issue) => issue.status === 'open');
  return {
    pendingCandidateCount: pendingCandidates.length,
    partialCandidateCount: pendingCandidates.filter(
      (candidate) => candidate.completeness === 'partial',
    ).length,
    pendingProposalCount: input.proposals.filter((proposal) => proposal.status === 'pending')
      .length,
    openValidationCount: openIssues.length,
    highValidationCount: openIssues.filter((issue) => issue.severity === 'high').length,
    searchStatus: input.searchState?.status ?? 'unknown',
    searchFailedCount: input.searchState?.failedCount ?? 0,
    backupFailureCount: input.backupFailures?.length ?? 0,
    unavailableSources: input.unavailableSources ?? [],
  };
}

async function guarded<Data>(
  run: () => Promise<BridgeRequestOutcome<Data>>,
): Promise<BridgeRequestOutcome<Data> | null> {
  try {
    return await run();
  } catch {
    return null;
  }
}

export async function loadWorkspaceAttention(
  bridge: RendererBridgeAdapter,
  projectId: string,
): Promise<WorkspaceAttention> {
  const [candidateOutcome, proposalOutcome, validationOutcome, searchOutcome, recoveryOutcome] =
    await Promise.all([
      guarded(() => bridge.candidate.list(projectId, undefined, { mode: 'replace' })),
      guarded(() =>
        bridge.stateProposal.list(
          { projectId, chapterId: null, includeResolved: false },
          { mode: 'replace' },
        ),
      ),
      guarded(() =>
        bridge.validation.list(
          { projectId, chapterId: null, includeClosed: false },
          { mode: 'replace' },
        ),
      ),
      guarded(() => bridge.searchTools.getIndexState({ projectId }, { mode: 'replace' })),
      guarded(() => bridge.recovery.getOverview(projectId, { mode: 'replace' })),
    ]);

  const unavailableSources: WorkspaceAttentionSource[] = [];
  if (candidateOutcome?.state !== 'success') unavailableSources.push('candidate');
  if (proposalOutcome?.state !== 'success') unavailableSources.push('proposal');
  if (validationOutcome?.state !== 'success') unavailableSources.push('validation');
  if (searchOutcome?.state !== 'success') unavailableSources.push('search');
  if (recoveryOutcome?.state !== 'success') unavailableSources.push('recovery');

  return summarizeWorkspaceAttention({
    candidates: candidateOutcome?.state === 'success' ? candidateOutcome.data.candidates : [],
    proposals: proposalOutcome?.state === 'success' ? proposalOutcome.data.proposals : [],
    validationIssues: validationOutcome?.state === 'success' ? validationOutcome.data.issues : [],
    searchState: searchOutcome?.state === 'success' ? searchOutcome.data : null,
    backupFailures: recoveryOutcome?.state === 'success' ? recoveryOutcome.data.backupFailures : [],
    unavailableSources,
  });
}
