import type { GenerationRun } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { authorGenerationStageLabel } from '../../presentation/author-status-labels.js';
import type { AppDisclosureMode } from '../../shell/app-shell-model.js';
import { loadCandidateList, type CandidateReviewLoader } from './candidate-review-loader.js';

interface GenerationEpoch {
  readonly current: number;
}

export interface CandidateGenerationRefreshInput {
  readonly activeRun: GenerationRun | null;
  readonly bridge: RendererBridgeAdapter;
  readonly disclosureMode?: AppDisclosureMode;
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
  const stage = authorGenerationStageLabel(outcome.data.stage, outcome.data.status);
  input.setGenerationStatus(
    input.disclosureMode === 'professional' && outcome.data.outputTokens !== null
      ? `${stage} · 输出用量 ${outcome.data.outputTokens}`
      : stage,
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
