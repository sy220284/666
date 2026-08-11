import { ErrorCodeSchema, type ErrorCode } from '@worldforge/contracts';

import { GenerationRunServiceError } from './generation-run.js';
import { GenerationSourceResolverError } from './generation-source-resolver.js';
import { TaskProtocolError } from './task-protocol.js';
import { projectOperationError } from './utility-errors.js';

export function generationOperationError(error: unknown): ErrorCode {
  if (error instanceof GenerationRunServiceError) {
    switch (error.code) {
      case 'GENERATION_RUN_NOT_FOUND':
        return 'AI_RUN_NOT_FOUND_011';
      case 'GENERATION_RUN_TERMINAL':
      case 'GENERATION_PARTIAL_DECIDED':
        return 'AI_RUN_ALREADY_FINISHED_012';
      case 'GENERATION_BASE_CONFLICT':
        return 'CANDIDATE_BASE_CONFLICT_002';
      case 'GENERATION_PARTIAL_UNAVAILABLE':
      case 'GENERATION_RESULT_CONFLICT':
      case 'GENERATION_RUN_NOT_ACTIVE':
        return 'COMMON_CONFLICT_003';
      case 'GENERATION_CANDIDATE_INVALID':
      case 'GENERATION_MODEL_SUPPORT_INVALID':
        return 'AI_OUTPUT_INVALID_008';
    }
  }
  if (error instanceof GenerationSourceResolverError) {
    switch (error.code) {
      case 'GENERATION_SOURCE_NOT_FOUND':
        return 'COMMON_NOT_FOUND_002';
      case 'GENERATION_SOURCE_STALE':
        return 'CANDIDATE_BASE_CONFLICT_002';
      case 'GENERATION_SOURCE_LOCKED':
        return 'DRAFT_BLOCK_LOCKED_003';
      case 'GENERATION_SOURCE_INVALID':
        return 'COMMON_INVALID_INPUT_001';
    }
  }
  if (error instanceof TaskProtocolError) return error.code;
  if (error && typeof error === 'object' && 'code' in error) {
    const parsed = ErrorCodeSchema.safeParse(error.code);
    if (parsed.success) return parsed.data;
  }
  return projectOperationError(error);
}
