import type { CandidatePreview, CandidateSelection, CandidateSummary } from '@worldforge/contracts';

import { groupCandidatesForReview } from './review-diff.js';

export type CandidateSelectionMode = 'all' | 'blocks' | 'scene-beats';

export function candidateReviewCollections(candidates: readonly CandidateSummary[]) {
  return {
    skeletonCandidates: candidates.filter(
      (candidate): candidate is Extract<CandidateSummary, { candidateType: 'skeleton' }> =>
        candidate.candidateType === 'skeleton' && candidate.status !== 'discarded',
    ),
    proseCandidates: candidates.filter(
      (candidate) => candidate.candidateType !== 'skeleton' && candidate.status !== 'discarded',
    ),
    reviewGroups: groupCandidatesForReview(candidates),
  };
}

export function buildCandidateSelection(
  preview: CandidatePreview | null,
  mode: CandidateSelectionMode,
  selectedBlocks: ReadonlySet<string>,
  selectedBeats: ReadonlySet<string>,
): CandidateSelection | null {
  if (!preview) return null;
  if (mode === 'all') return preview.candidate.completeness === 'partial' ? null : { mode: 'all' };
  if (mode === 'blocks') {
    return selectedBlocks.size
      ? {
          mode: 'blocks',
          candidateBlockIds: [...selectedBlocks],
          deleteLogicalBlockIds: [],
        }
      : null;
  }
  return selectedBeats.size
    ? { mode: 'scene-beats', beatIds: [...selectedBeats], deleteLogicalBlockIds: [] }
    : null;
}

export function toggleSelectionSet(
  source: ReadonlySet<string>,
  value: string,
  included: boolean,
): Set<string> {
  const next = new Set(source);
  if (included) next.add(value);
  else next.delete(value);
  return next;
}

export function nullableFormText(value: FormDataEntryValue | null): string | null {
  const result = String(value ?? '').trim();
  return result || null;
}
