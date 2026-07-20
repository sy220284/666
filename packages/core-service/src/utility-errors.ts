import type { ErrorCode } from '@worldforge/contracts';

import { AppDataRepositoryError } from './app-data-errors.js';
import { CandidateApplyServiceError } from './candidate-state.js';
import { CandidateServiceError } from './candidate.js';
import { ContinuityServiceError } from './continuity.js';
import { DatabaseFoundationError } from './database/index.js';
import { DraftServiceError } from './draft.js';
import { EntityCanonServiceError } from './entity-canon.js';
import { ImportExportServiceError } from './import-export.js';
import { ProjectPlanningError } from './project-planning.js';
import { ProjectStructureError } from './project-structure.js';
import { ProjectWorkspaceError } from './project-workspace.js';
import { RecoveryServiceError } from './recovery.js';
import { SceneBeatServiceError } from './scene-beat.js';
import { VersionServiceError } from './version.js';

export function windowPreferencesError(error: unknown): ErrorCode {
  if (error instanceof DatabaseFoundationError) {
    if (error.code === 'DATABASE_READ_ONLY') return 'PROJECT_READ_ONLY_005';
    if (error.code === 'DATABASE_INTEGRITY_FAILED') return 'DB_INTEGRITY_FAILED_003';
    if (error.code === 'MIGRATION_FAILED') return 'DB_MIGRATION_FAILED_005';
    if (error.code === 'MIGRATION_CHECKSUM_MISMATCH') return 'DB_MIGRATION_CHECKSUM_006';
    if (error.code === 'DATABASE_FUTURE_SCHEMA') return 'DB_SCHEMA_UNSUPPORTED_007';
    if (error.code === 'WRITE_QUEUE_CLOSED') return 'DB_WRITE_QUEUE_STOPPED_008';
    if (error.code === 'DATABASE_WRITE_FAILED') return 'DB_BUSY_TIMEOUT_002';
  }
  return 'DB_OPEN_FAILED_001';
}

export function appDataError(error: unknown): ErrorCode {
  if (error instanceof AppDataRepositoryError) {
    if (error.code === 'RECENT_PROJECT_NOT_FOUND') return 'COMMON_NOT_FOUND_002';
    if (error.code === 'RECENT_PROJECT_PATH_MISSING') return 'PROJECT_PATH_MISSING_002';
    if (error.code === 'RECENT_PROJECT_PATH_CONFLICT') return 'COMMON_CONFLICT_003';
  }
  if (error instanceof DatabaseFoundationError && error.code === 'REQUEST_ID_INVALID') {
    return 'COMMON_INVALID_INPUT_001';
  }
  if (error instanceof Error && error.name === 'ZodError') return 'COMMON_INVALID_INPUT_001';
  return windowPreferencesError(error);
}

export function projectOperationError(error: unknown): ErrorCode {
  if (error instanceof ContinuityServiceError) {
    if (error.code === 'CONTINUITY_NOT_FOUND') return 'COMMON_NOT_FOUND_002';
    if (error.code === 'CONTINUITY_INVALID' || error.code === 'CONTINUITY_AUTHOR_REQUIRED') {
      return 'COMMON_INVALID_INPUT_001';
    }
    if (error.code === 'CONTINUITY_CONFLICT') return 'COMMON_CONFLICT_003';
    return 'COMMON_INTERNAL_999';
  }
  if (error instanceof ImportExportServiceError) {
    switch (error.code) {
      case 'IMPORT_FORMAT_UNSUPPORTED':
        return 'IMPORT_FORMAT_UNSUPPORTED_001';
      case 'IMPORT_ENCODING_UNCERTAIN':
        return 'IMPORT_ENCODING_UNCERTAIN_002';
      case 'IMPORT_ARCHIVE_LIMIT':
        return 'IMPORT_ARCHIVE_LIMIT_003';
      case 'IMPORT_CONTENT_EMPTY':
        return 'IMPORT_CONTENT_EMPTY_004';
      case 'IMPORT_PLAN_STALE':
        return 'IMPORT_PLAN_STALE_005';
      case 'IMPORT_COMMIT_FAILED':
        return 'IMPORT_COMMIT_FAILED_006';
      case 'EXPORT_VERSION_REQUIRED':
        return 'EXPORT_VERSION_REQUIRED_001';
      case 'EXPORT_TARGET_EXISTS':
        return 'EXPORT_TARGET_EXISTS_002';
      case 'EXPORT_WRITE_FAILED':
        return 'EXPORT_WRITE_FAILED_003';
    }
  }
  if (error instanceof RecoveryServiceError) {
    switch (error.code) {
      case 'BACKUP_CREATE_FAILED':
        return 'BACKUP_CREATE_FAILED_001';
      case 'BACKUP_VERIFY_FAILED':
        return 'BACKUP_VERIFY_FAILED_002';
      case 'BACKUP_SPACE_LOW':
        return 'BACKUP_SPACE_LOW_003';
      case 'BACKUP_NOT_FOUND':
      case 'RESTORE_SOURCE_INVALID':
        return 'RESTORE_SOURCE_INVALID_001';
      case 'RESTORE_TARGET_CONFLICT':
        return 'RESTORE_TARGET_CONFLICT_002';
      case 'RESTORE_VERIFY_FAILED':
        return 'RESTORE_VERIFY_FAILED_003';
      case 'EXPORT_VERSION_REQUIRED':
        return 'EXPORT_VERSION_REQUIRED_001';
      case 'EXPORT_TARGET_EXISTS':
        return 'EXPORT_TARGET_EXISTS_002';
      case 'EXPORT_WRITE_FAILED':
        return 'EXPORT_WRITE_FAILED_003';
    }
  }
  if (error instanceof CandidateApplyServiceError) {
    if (error.code === 'CANDIDATE_PREVIEW_CANCELLED') return 'COMMON_CANCELLED_004';
    if (error.code === 'CANDIDATE_APPLY_NOT_FOUND') return 'COMMON_NOT_FOUND_002';
    if (error.code === 'CANDIDATE_APPLY_INVALID') return 'COMMON_INVALID_INPUT_001';
    return 'COMMON_CONFLICT_003';
  }
  if (error instanceof CandidateServiceError) {
    switch (error.code) {
      case 'CANDIDATE_NOT_FOUND':
      case 'CANDIDATE_DRAFT_NOT_FOUND':
        return 'COMMON_NOT_FOUND_002';
      case 'CANDIDATE_REVISION_CONFLICT':
      case 'CANDIDATE_SOURCE_CONFLICT':
        return 'CANDIDATE_BASE_CONFLICT_002';
      case 'CANDIDATE_STATUS_CONFLICT':
        return 'CANDIDATE_ALREADY_RESOLVED_001';
      case 'CANDIDATE_INVALID':
        return 'COMMON_INVALID_INPUT_001';
    }
  }
  if (error instanceof VersionServiceError) {
    if (error.code === 'VERSION_NOT_FOUND' || error.code === 'VERSION_DRAFT_NOT_FOUND') {
      return 'COMMON_NOT_FOUND_002';
    }
    if (error.code === 'VERSION_REVISION_CONFLICT') return 'DRAFT_REVISION_CONFLICT_001';
    if (error.code === 'VERSION_TITLE_CONFLICT' || error.code === 'VERSION_CHAPTER_MISMATCH') {
      return 'COMMON_CONFLICT_003';
    }
  }
  if (error instanceof DraftServiceError) {
    switch (error.code) {
      case 'DRAFT_NOT_FOUND':
        return 'DRAFT_NO_ACTIVE_005';
      case 'DRAFT_BLOCK_NOT_FOUND':
        return 'COMMON_NOT_FOUND_002';
      case 'DRAFT_REVISION_CONFLICT':
        return 'DRAFT_REVISION_CONFLICT_001';
      case 'DRAFT_BLOCK_HASH_CONFLICT':
        return 'DRAFT_BLOCK_HASH_CONFLICT_002';
      case 'DRAFT_BLOCK_LOCKED':
        return 'DRAFT_BLOCK_LOCKED_003';
      case 'DRAFT_PATCH_INVALID':
        return 'DRAFT_PATCH_INVALID_004';
      case 'DRAFT_INVARIANT_FAILED':
        return 'COMMON_CONFLICT_003';
    }
  }
  if (error instanceof ProjectPlanningError) {
    if (error.code === 'PLANNING_NOT_FOUND') return 'COMMON_NOT_FOUND_002';
    if (error.code === 'PLANNING_INVALID_POSITION') return 'COMMON_INVALID_INPUT_001';
    return 'COMMON_CONFLICT_003';
  }
  if (error instanceof SceneBeatServiceError) {
    if (error.code === 'SCENE_BEAT_NOT_FOUND') return 'COMMON_NOT_FOUND_002';
    if (error.code === 'SCENE_BEAT_INVALID_POSITION') return 'COMMON_INVALID_INPUT_001';
    return 'COMMON_CONFLICT_003';
  }
  if (error instanceof EntityCanonServiceError) {
    if (error.code === 'ENTITY_NOT_FOUND') return 'COMMON_NOT_FOUND_002';
    if (error.code === 'ENTITY_INVALID' || error.code === 'CANON_AUTHOR_REQUIRED') {
      return 'COMMON_INVALID_INPUT_001';
    }
    return 'COMMON_CONFLICT_003';
  }
  if (error instanceof ProjectStructureError) {
    if (error.code === 'STRUCTURE_NOT_FOUND') return 'COMMON_NOT_FOUND_002';
    if (error.code === 'STRUCTURE_CONFLICT') return 'COMMON_CONFLICT_003';
    return 'COMMON_INVALID_INPUT_001';
  }
  if (error instanceof ProjectWorkspaceError) {
    switch (error.code) {
      case 'PROJECT_ALREADY_ACTIVE':
        return 'PROJECT_ALREADY_OPEN_001';
      case 'PROJECT_PATH_MISSING':
        return 'PROJECT_PATH_MISSING_002';
      case 'PROJECT_PATH_OUTSIDE_SCOPE':
        return 'PROJECT_PATH_OUTSIDE_SCOPE_003';
      case 'PROJECT_ID_MISMATCH':
        return 'PROJECT_ID_MISMATCH_004';
      case 'PROJECT_READ_ONLY':
      case 'PROJECT_DIRECTORY_READ_ONLY':
        return 'PROJECT_READ_ONLY_005';
      case 'PROJECT_MOVE_FAILED':
        return 'PROJECT_MOVE_FAILED_006';
      case 'PROJECT_TARGET_CONFLICT':
        return 'COMMON_CONFLICT_003';
      case 'PROJECT_MANIFEST_INVALID':
      case 'PROJECT_OPEN_FAILED':
      case 'PROJECT_CREATE_FAILED':
        return 'DB_OPEN_FAILED_001';
    }
  }
  if (error instanceof Error && error.name === 'ZodError') return 'COMMON_INVALID_INPUT_001';
  return windowPreferencesError(error);
}
