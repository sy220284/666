import { z } from 'zod';

import {
  CoreCandidateOperationSchema as CandidateOperationSchema,
  CoreCandidateResultSchema as CandidateResultSchema,
} from './candidate.js';
import {
  CoreCandidateApplyOperationSchema as CandidateApplyOperationSchema,
  CoreCandidateApplyResultSchema as CandidateApplyResultSchema,
} from './candidate-apply.js';

export const CombinedCandidateOperationSchema = z.union([
  CandidateOperationSchema,
  CandidateApplyOperationSchema,
]);

export const CombinedCandidateResultSchema = z.union([
  CandidateResultSchema,
  CandidateApplyResultSchema,
]);
