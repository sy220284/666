import { parentPort, workerData } from 'node:worker_threads';

import {
  computeCandidateDiff,
  type CandidateDiffWorkerInput,
  type CandidateDiffWorkerMessage,
} from './candidate-apply-diff.js';

const input = workerData as CandidateDiffWorkerInput;

if (!parentPort || input.kind !== 'worldforge.candidate-diff') {
  throw new Error('CANDIDATE_DIFF_WORKER_INPUT_INVALID');
}

try {
  parentPort.postMessage({
    ok: true,
    result: computeCandidateDiff(input.current, input.candidate),
  } satisfies CandidateDiffWorkerMessage);
} catch (error) {
  parentPort.postMessage({
    ok: false,
    message: error instanceof Error ? error.message : 'Candidate Diff Worker failed.',
  } satisfies CandidateDiffWorkerMessage);
} finally {
  parentPort.close();
}
