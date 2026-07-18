import { z } from 'zod';

import {
  CANDIDATE_APPLY_COMMANDS,
  CandidateApplyInputSchema,
  CandidateApplyOutcomeSchema,
} from './candidate-apply.js';
import { ErrorCodeSchema } from './error-codes.js';

export const CoreCandidateApplyOperationSchema = z.strictObject({
  operation: z.literal(CANDIDATE_APPLY_COMMANDS.applyCandidate),
  input: CandidateApplyInputSchema,
});

export const CoreCandidateApplyResultSchema = z.union([
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(CANDIDATE_APPLY_COMMANDS.applyCandidate),
    data: CandidateApplyOutcomeSchema,
  }),
  z.strictObject({
    ok: z.literal(false),
    operation: z.literal(CANDIDATE_APPLY_COMMANDS.applyCandidate),
    errorCode: ErrorCodeSchema,
  }),
]);

export type CoreCandidateApplyOperation = z.infer<typeof CoreCandidateApplyOperationSchema>;
export type CoreCandidateApplyResult = z.infer<typeof CoreCandidateApplyResultSchema>;
