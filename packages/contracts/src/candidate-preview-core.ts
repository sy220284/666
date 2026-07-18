import { z } from 'zod';

import {
  CANDIDATE_APPLY_COMMANDS,
  CandidateApplyInputSchema,
  CandidateApplyOutcomeSchema,
  CandidatePreviewInputSchema,
  CandidatePreviewSchema,
} from './candidate-apply.js';
import { ErrorCodeSchema } from './error-codes.js';

export const CoreCandidatePreviewOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal(CANDIDATE_APPLY_COMMANDS.previewCandidate),
    input: CandidatePreviewInputSchema,
  }),
  z.strictObject({
    operation: z.literal(CANDIDATE_APPLY_COMMANDS.applyCandidate),
    input: CandidateApplyInputSchema,
  }),
]);

export const CoreCandidatePreviewResultSchema = z.union([
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(CANDIDATE_APPLY_COMMANDS.previewCandidate),
    data: CandidatePreviewSchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(CANDIDATE_APPLY_COMMANDS.applyCandidate),
    data: CandidateApplyOutcomeSchema,
  }),
  z.strictObject({
    ok: z.literal(false),
    operation: z.enum([
      CANDIDATE_APPLY_COMMANDS.previewCandidate,
      CANDIDATE_APPLY_COMMANDS.applyCandidate,
    ]),
    errorCode: ErrorCodeSchema,
  }),
]);

export type CoreCandidatePreviewOperation = z.infer<typeof CoreCandidatePreviewOperationSchema>;
export type CoreCandidatePreviewResult = z.infer<typeof CoreCandidatePreviewResultSchema>;
