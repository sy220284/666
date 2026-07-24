import { describe, expect, it } from 'vitest';

import { AppDataRepositoryError } from '../../packages/core-service/src/app-data-errors.js';
import { CandidateApplyServiceError } from '../../packages/core-service/src/candidate-state.js';
import { CandidateServiceError } from '../../packages/core-service/src/candidate.js';
import { ContinuityServiceError } from '../../packages/core-service/src/continuity.js';
import { DatabaseFoundationError } from '../../packages/core-service/src/database/index.js';
import { DraftServiceError } from '../../packages/core-service/src/draft.js';
import { EntityCanonServiceError } from '../../packages/core-service/src/entity-canon.js';
import { ImportExportServiceError } from '../../packages/core-service/src/import-export.js';
import { ProjectPlanningError } from '../../packages/core-service/src/project-planning.js';
import { ProjectStructureError } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceError } from '../../packages/core-service/src/project-workspace.js';
import { RecoveryServiceError } from '../../packages/core-service/src/recovery.js';
import { SceneBeatServiceError } from '../../packages/core-service/src/scene-beat.js';
import { VersionServiceError } from '../../packages/core-service/src/version.js';
import {
  appDataError,
  projectOperationError,
  windowPreferencesError,
} from '../../packages/core-service/src/utility-errors.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

type ErrorConstructor = new (code: string, message: string) => Error;

function serviceError(ctor: unknown, code: string): Error {
  const Constructor = contractInput<ErrorConstructor>(ctor);
  return new Constructor(code, `coverage:${code}`);
}

function zodError(): Error {
  const error = new Error('invalid');
  error.name = 'ZodError';
  return error;
}

describe('Core utility error mapping regression coverage', () => {
  it.each([
    ['DATABASE_READ_ONLY', 'PROJECT_READ_ONLY_005'],
    ['DATABASE_INTEGRITY_FAILED', 'DB_INTEGRITY_FAILED_003'],
    ['MIGRATION_FAILED', 'DB_MIGRATION_FAILED_005'],
    ['MIGRATION_CHECKSUM_MISMATCH', 'DB_MIGRATION_CHECKSUM_006'],
    ['DATABASE_FUTURE_SCHEMA', 'DB_SCHEMA_UNSUPPORTED_007'],
    ['WRITE_QUEUE_CLOSED', 'DB_WRITE_QUEUE_STOPPED_008'],
    ['DATABASE_WRITE_FAILED', 'DB_BUSY_TIMEOUT_002'],
    ['DATABASE_OPEN_FAILED', 'DB_OPEN_FAILED_001'],
  ])('maps window database error %s', (code, expected) => {
    expect(windowPreferencesError(serviceError(DatabaseFoundationError, code))).toBe(expected);
  });

  it('falls back for unknown window preference failures', () => {
    expect(windowPreferencesError(new Error('unknown'))).toBe('DB_OPEN_FAILED_001');
    expect(windowPreferencesError(null)).toBe('DB_OPEN_FAILED_001');
  });

  it.each([
    ['RECENT_PROJECT_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    ['RECENT_PROJECT_PATH_MISSING', 'PROJECT_PATH_MISSING_002'],
    ['RECENT_PROJECT_PATH_CONFLICT', 'COMMON_CONFLICT_003'],
  ])('maps app-data repository error %s', (code, expected) => {
    expect(appDataError(serviceError(AppDataRepositoryError, code))).toBe(expected);
  });

  it('maps app-data request validation and delegates database failures', () => {
    expect(appDataError(serviceError(DatabaseFoundationError, 'REQUEST_ID_INVALID'))).toBe(
      'COMMON_INVALID_INPUT_001',
    );
    expect(appDataError(zodError())).toBe('COMMON_INVALID_INPUT_001');
    expect(appDataError(serviceError(DatabaseFoundationError, 'DATABASE_READ_ONLY'))).toBe(
      'PROJECT_READ_ONLY_005',
    );
  });

  it.each([
    ['CONTINUITY_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    ['CONTINUITY_INVALID', 'COMMON_INVALID_INPUT_001'],
    ['CONTINUITY_AUTHOR_REQUIRED', 'COMMON_INVALID_INPUT_001'],
    ['CONTINUITY_CONFLICT', 'COMMON_CONFLICT_003'],
    ['CONTINUITY_INTERNAL', 'COMMON_INTERNAL_999'],
  ])('maps continuity error %s', (code, expected) => {
    expect(projectOperationError(serviceError(ContinuityServiceError, code))).toBe(expected);
  });

  it.each([
    ['IMPORT_FORMAT_UNSUPPORTED', 'IMPORT_FORMAT_UNSUPPORTED_001'],
    ['IMPORT_ENCODING_UNCERTAIN', 'IMPORT_ENCODING_UNCERTAIN_002'],
    ['IMPORT_ARCHIVE_LIMIT', 'IMPORT_ARCHIVE_LIMIT_003'],
    ['IMPORT_CONTENT_EMPTY', 'IMPORT_CONTENT_EMPTY_004'],
    ['IMPORT_PLAN_STALE', 'IMPORT_PLAN_STALE_005'],
    ['IMPORT_COMMIT_FAILED', 'IMPORT_COMMIT_FAILED_006'],
    ['EXPORT_VERSION_REQUIRED', 'EXPORT_VERSION_REQUIRED_001'],
    ['EXPORT_TARGET_EXISTS', 'EXPORT_TARGET_EXISTS_002'],
    ['EXPORT_WRITE_FAILED', 'EXPORT_WRITE_FAILED_003'],
  ])('maps import/export error %s', (code, expected) => {
    expect(projectOperationError(serviceError(ImportExportServiceError, code))).toBe(expected);
  });

  it.each([
    ['BACKUP_CREATE_FAILED', 'BACKUP_CREATE_FAILED_001'],
    ['BACKUP_VERIFY_FAILED', 'BACKUP_VERIFY_FAILED_002'],
    ['BACKUP_SPACE_LOW', 'BACKUP_SPACE_LOW_003'],
    ['BACKUP_NOT_FOUND', 'RESTORE_SOURCE_INVALID_001'],
    ['RESTORE_SOURCE_INVALID', 'RESTORE_SOURCE_INVALID_001'],
    ['RESTORE_TARGET_CONFLICT', 'RESTORE_TARGET_CONFLICT_002'],
    ['RESTORE_VERIFY_FAILED', 'RESTORE_VERIFY_FAILED_003'],
    ['EXPORT_VERSION_REQUIRED', 'EXPORT_VERSION_REQUIRED_001'],
    ['EXPORT_TARGET_EXISTS', 'EXPORT_TARGET_EXISTS_002'],
    ['EXPORT_WRITE_FAILED', 'EXPORT_WRITE_FAILED_003'],
  ])('maps recovery error %s', (code, expected) => {
    expect(projectOperationError(serviceError(RecoveryServiceError, code))).toBe(expected);
  });

  it.each([
    ['CANDIDATE_PREVIEW_CANCELLED', 'COMMON_CANCELLED_004'],
    ['CANDIDATE_APPLY_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    ['CANDIDATE_APPLY_INVALID', 'COMMON_INVALID_INPUT_001'],
    ['CANDIDATE_APPLY_CONFLICT', 'COMMON_CONFLICT_003'],
  ])('maps candidate apply error %s', (code, expected) => {
    expect(projectOperationError(serviceError(CandidateApplyServiceError, code))).toBe(expected);
  });

  it.each([
    ['CANDIDATE_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    ['CANDIDATE_DRAFT_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    ['CANDIDATE_REVISION_CONFLICT', 'CANDIDATE_BASE_CONFLICT_002'],
    ['CANDIDATE_SOURCE_CONFLICT', 'CANDIDATE_BASE_CONFLICT_002'],
    ['CANDIDATE_STATUS_CONFLICT', 'CANDIDATE_ALREADY_RESOLVED_001'],
    ['CANDIDATE_INVALID', 'COMMON_INVALID_INPUT_001'],
  ])('maps candidate service error %s', (code, expected) => {
    expect(projectOperationError(serviceError(CandidateServiceError, code))).toBe(expected);
  });

  it.each([
    ['VERSION_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    ['VERSION_DRAFT_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    ['VERSION_REVISION_CONFLICT', 'DRAFT_REVISION_CONFLICT_001'],
    ['VERSION_TITLE_CONFLICT', 'COMMON_CONFLICT_003'],
    ['VERSION_CHAPTER_MISMATCH', 'COMMON_CONFLICT_003'],
  ])('maps version error %s', (code, expected) => {
    expect(projectOperationError(serviceError(VersionServiceError, code))).toBe(expected);
  });

  it.each([
    ['DRAFT_NOT_FOUND', 'DRAFT_NO_ACTIVE_005'],
    ['DRAFT_BLOCK_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    ['DRAFT_REVISION_CONFLICT', 'DRAFT_REVISION_CONFLICT_001'],
    ['DRAFT_BLOCK_HASH_CONFLICT', 'DRAFT_BLOCK_HASH_CONFLICT_002'],
    ['DRAFT_BLOCK_LOCKED', 'DRAFT_BLOCK_LOCKED_003'],
    ['DRAFT_PATCH_INVALID', 'DRAFT_PATCH_INVALID_004'],
    ['DRAFT_INVARIANT_FAILED', 'COMMON_CONFLICT_003'],
  ])('maps draft error %s', (code, expected) => {
    expect(projectOperationError(serviceError(DraftServiceError, code))).toBe(expected);
  });

  it.each([
    [ProjectPlanningError, 'PLANNING_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    [ProjectPlanningError, 'PLANNING_INVALID_POSITION', 'COMMON_INVALID_INPUT_001'],
    [ProjectPlanningError, 'PLANNING_CONFLICT', 'COMMON_CONFLICT_003'],
    [SceneBeatServiceError, 'SCENE_BEAT_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    [SceneBeatServiceError, 'SCENE_BEAT_INVALID_POSITION', 'COMMON_INVALID_INPUT_001'],
    [SceneBeatServiceError, 'SCENE_BEAT_CONFLICT', 'COMMON_CONFLICT_003'],
    [EntityCanonServiceError, 'ENTITY_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    [EntityCanonServiceError, 'ENTITY_INVALID', 'COMMON_INVALID_INPUT_001'],
    [EntityCanonServiceError, 'CANON_AUTHOR_REQUIRED', 'COMMON_INVALID_INPUT_001'],
    [EntityCanonServiceError, 'ENTITY_CONFLICT', 'COMMON_CONFLICT_003'],
    [ProjectStructureError, 'STRUCTURE_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    [ProjectStructureError, 'STRUCTURE_CONFLICT', 'COMMON_CONFLICT_003'],
    [ProjectStructureError, 'STRUCTURE_INVALID', 'COMMON_INVALID_INPUT_001'],
  ])('maps domain service error %s %s', (ctor, code, expected) => {
    expect(projectOperationError(serviceError(ctor, code))).toBe(expected);
  });

  it.each([
    ['PROJECT_ALREADY_ACTIVE', 'PROJECT_ALREADY_OPEN_001'],
    ['PROJECT_PATH_MISSING', 'PROJECT_PATH_MISSING_002'],
    ['PROJECT_PATH_OUTSIDE_SCOPE', 'PROJECT_PATH_OUTSIDE_SCOPE_003'],
    ['PROJECT_ID_MISMATCH', 'PROJECT_ID_MISMATCH_004'],
    ['PROJECT_READ_ONLY', 'PROJECT_READ_ONLY_005'],
    ['PROJECT_DIRECTORY_READ_ONLY', 'PROJECT_READ_ONLY_005'],
    ['PROJECT_MOVE_FAILED', 'PROJECT_MOVE_FAILED_006'],
    ['PROJECT_TARGET_CONFLICT', 'COMMON_CONFLICT_003'],
    ['PROJECT_MANIFEST_INVALID', 'DB_OPEN_FAILED_001'],
    ['PROJECT_OPEN_FAILED', 'DB_OPEN_FAILED_001'],
    ['PROJECT_CREATE_FAILED', 'DB_OPEN_FAILED_001'],
  ])('maps project workspace error %s', (code, expected) => {
    expect(projectOperationError(serviceError(ProjectWorkspaceError, code))).toBe(expected);
  });

  it('maps final validation and database fallbacks', () => {
    expect(projectOperationError(zodError())).toBe('COMMON_INVALID_INPUT_001');
    expect(
      projectOperationError(serviceError(DatabaseFoundationError, 'DATABASE_FUTURE_SCHEMA')),
    ).toBe('DB_SCHEMA_UNSUPPORTED_007');
    expect(projectOperationError(new Error('unknown'))).toBe('DB_OPEN_FAILED_001');
  });
});
