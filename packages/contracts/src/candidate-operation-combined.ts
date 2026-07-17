import { z } from 'zod';

import {
  CoreCandidateOperationSchema as CandidateOperationSchema,
  CoreCandidateResultSchema as CandidateResultSchema,
} from './candidate-base.js';
import {
  CoreCandidateApplyOperationSchema as CandidateApplyOperationSchema,
  CoreCandidateApplyResultSchema as CandidateApplyResultSchema,
} from './candidate-apply.js';

export const CandidateOperationSchema = z.union([
  CandidateOperationSchema,
  CandidateApplyOperationSchema,
]);

export const CandidateResultSchema = z.union([
  CandidateResultSchema,
  CandidateApplyResultSchema,
]);
