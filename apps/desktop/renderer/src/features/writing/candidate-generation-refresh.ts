import type { GenerationRun } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { loadCandidateList, type CandidateReviewLoader } from './candidate-review-loader.js';

interface GenerationEpoch {
  readonly current: number;
}

export interface CandidateGenerationRefreshInput {
  readonly activeRun: GenerationRun | null;
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly loader: CandidateReviewLoader;
  readonly generationEpoch: GenerationEpoch;
  readonly loadCandidate: (candidateId: string) => Promise<unknown>;
  readonly setActiveRun: (run: GenerationRun) => void;
  readonly setGenerationStatus: (status: string) => void;
  readonly setCandidateId: (candidateId: string) => void;
  readonly setActiveTaskId: (taskId: string | null) => void;
}

export async function refreshCandidateGenerationRun(
  input: CandidateGenerationRefreshInput,
): Promise<void> {
  const run = input.activeRun;
  if (!run) return;

  const epoch = input.generationEpoch.current;
  const isCurrent = (): boolean => input.generationEpoch.current === epoch;
  const outcome = await input.bridge.generation.getRun(input.projectId, run.runId);
  if (!isCurrent()) return;
  if (outcome.state !== 'success') {
    input.setActiveTaskId(null);
    return;
  }

  input.setActiveRun(outcome.data);
  input.setGenerationStatus(
    `${outcome.data.stage} · ${outcome.data.status}${
      outcome.data.outputTokens === null ? '' : ` · 输出 ${outcome.data.outputTokens} tokens`
    }`,
  );
  if (
    outcome.data.status !== 'succeeded' &&
    outcome.data.status !== 'failed' &&
    outcome.data.status !== 'cancelled'
  ) {
    return;
  }

  const items = await loadCandidateList(input.loader, isCurrent);
  if (!isCurrent()) return;
  const firstResult = outcome.data.resultRefs.find((result) => result.resultType === 'candidate');
  const candidate = firstResult
    ? items.find((item) => item.candidateId === firstResult.resultId)
    : undefined;
  if (candidate) {
    input.setCandidateId(candidate.candidateId);
    await input.loadCandidate(candidate.candidateId);
    if (!isCurrent()) return;
  }
  input.setActiveTaskId(null);
}
