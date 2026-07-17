import { z } from 'zod';

import {
  CANDIDATE_APPLY_COMMANDS,
  CandidatePreviewInputSchema,
  CandidatePreviewSchema,
} from './candidate-apply.js';
import { ErrorCodeSchema } from './error-codes.js';

export const CoreCandidatePreviewOperationSchema = z.strictObject({
  operation: z.literal(CANDIDATE_APPLY_COMMANDS.previewCandidate),
  input: CandidatePreviewInputSchema,
});

export const CoreCandidatePreviewResultSchema = z.union([
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(CANDIDATE_APPLY_COMMANDS.previewCandidate),
    data: CandidatePreviewSchema,
  }),
  z.strictObject({
    ok: z.literal(false),
    operation: z.literal(CANDIDATE_APPLY_COMMANDS.previewCandidate),
    errorCode: ErrorCodeSchema,
  }),
]);

export type CoreCandidatePreviewOperation = z.infer<
  typeof CoreCandidatePreviewOperationSchema
>;
export type CoreCandidatePreviewResult = z.infer<typeof CoreCandidatePreviewResultSchema>;
