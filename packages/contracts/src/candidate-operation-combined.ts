import { z } from 'zod';

import {
  CoreCandidateOperationSchema as BaseCandidateOperationSchema,
  CoreCandidateResultSchema as BaseCandidateResultSchema,
} from './candidate-base.js';
import {
  CoreCandidateApplyOperationSchema as CandidateApplyOperationSchema,
  CoreCandidateApplyResultSchema as CandidateApplyResultSchema,
} from './candidate-apply.js';

export const CandidateOperationSchema = z.union([
  BaseCandidateOperationSchema,
  CandidateApplyOperationSchema,
]);

export const CandidateResultSchema = z.union([
  BaseCandidateResultSchema,
  CandidateApplyResultSchema,
]);
