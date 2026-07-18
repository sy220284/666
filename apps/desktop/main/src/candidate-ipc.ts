import { registerCandidateHistoryIpc } from './candidate-history-ipc.js';
import { registerCandidatePreviewIpc as registerCandidateReviewIpc } from './candidate-preview-ipc.js';

export function registerCandidatePreviewIpc(
  options: Parameters<typeof registerCandidateReviewIpc>[0],
): () => void {
  const unregisterReview = registerCandidateReviewIpc(options);
  const unregisterHistory = registerCandidateHistoryIpc(options);
  return () => {
    unregisterHistory();
    unregisterReview();
  };
}
