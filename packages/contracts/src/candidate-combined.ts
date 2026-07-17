import { z } from 'zod';

import {
  CoreCandidateOperationSchema as BaseOperationSchema,
  CoreCandidateResultSchema as BaseResultSchema,
} from './candidate-base.js';
import {
  CoreCandidateApplyOperationSchema as ApplyOperationSchema,
  CoreCandidateApplyResultSchema as ApplyResultSchema,
} from './candidate-apply.js';

// prettier-ignore
export const CandidateCombinedOperationSchema = z.union([BaseOperationSchema, ApplyOperationSchema]);
export const CandidateCombinedResultSchema = z.union([BaseResultSchema, ApplyResultSchema]);
