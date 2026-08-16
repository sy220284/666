import { describe, expect, it } from 'vitest';

import { AppDataRepositoryError } from '../../packages/core-service/src/app-data-errors.js';
import { CandidateApplyServiceError } from '../../packages/core-service/src/candidate-state.js';
import { CandidateServiceError } from '../../packages/core-service/src/candidate.js';
import { ContinuityServiceError } from '../../packages/core-service/src/continuity.js';
import { DatabaseFoundationError } from '../../packages/core-service/src/database/index.js';
import { DraftServiceError } from '../../packages/core-service/src/draft.js';
import { EntityCanonServiceError } from '../../packages/core-service/src/entity-canon.js';
import { IdeaCapsuleServiceError } from '../../packages/core-service/src/idea-capsule-service.js';
import { ImportExportServiceError } from '../../packages/core-service/src/import-export.js';
import { JournalServiceError } from '../../packages/core-service/src/journal-service.js';
import { LongformAiServiceError } from '../../packages/core-service/src/longform-ai-service.js';
import { NarrativePlanningServiceError } from '../../packages/core-service/src/narrative-planning.js';
import { ProjectPlanningError } from '../../packages/core-service/src/project-planning.js';
import { ProjectStructureError } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceError } from '../../packages/core-service/src/project-workspace.js';
import { RecoveryServiceError } from '../../packages/core-service/src/recovery.js';
import { ResearchServiceError } from '../../packages/core-service/src/research-service.js';
import { RhythmServiceError } from '../../packages/core-service/src/rhythm.js';
import { SceneBeatServiceError } from '../../packages/core-service/src/scene-beat.js';
import { SearchToolsServiceError } from '../../packages/core-service/src/search-tools.js';
import { StateProposalServiceError } from '../../packages/core-service/src/state-proposal.js';
import { StoryKnowledgeProjectionServiceError } from '../../packages/core-service/src/story-knowledge-projection.js';
import {
  appDataError,
  projectOperationError,
  windowPreferencesError,
} from '../../packages/core-service/src/utility-errors.js';
import { ValidationServiceError } from '../../packages/core-service/src/validation.js';
import { VersionServiceError } from '../../packages/core-service/src/version.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const message = 'coverage';

function zodLikeError(): Error {
  const error = new Error(message);
  error.name = 'ZodError';
  return error;
}

describe('utility error mapping coverage', () => {
  it.each([
    ['REQUEST_ID_CONFLICT', 'COMMON_CONFLICT_003'],
    ['DATABASE_READ_ONLY', 'PROJECT_READ_ONLY_005'],
    ['DATABASE_INTEGRITY_FAILED', 'DB_INTEGRITY_FAILED_003'],
    ['MIGRATION_FAILED', 'DB_MIGRATION_FAILED_005'],
    ['MIGRATION_CHECKSUM_MISMATCH', 'DB_MIGRATION_CHECKSUM_006'],
    ['DATABASE_FUTURE_SCHEMA', 'DB_SCHEMA_UNSUPPORTED_007'],
    ['WRITE_QUEUE_CLOSED', 'DB_WRITE_QUEUE_STOPPED_008'],
    ['DATABASE_WRITE_FAILED', 'DB_BUSY_TIMEOUT_002'],
    ['DATABASE_OPEN_FAILED', 'DB_OPEN_FAILED_001'],
  ] as const)('maps window preference database error %s', (source, expected) => {
    expect(windowPreferencesError(new DatabaseFoundationError(source, message))).toBe(expected);
  });

  it('maps non-database window preference errors to open failure', () => {
    expect(windowPreferencesError(null)).toBe('DB_OPEN_FAILED_001');
    expect(windowPreferencesError(new Error(message))).toBe('DB_OPEN_FAILED_001');
  });

  it.each([
    ['RECENT_PROJECT_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    ['RECENT_PROJECT_PATH_MISSING', 'PROJECT_PATH_MISSING_002'],
    ['RECENT_PROJECT_PATH_CONFLICT', 'COMMON_CONFLICT_003'],
  ] as const)('maps app data error %s', (source, expected) => {
    expect(appDataError(new AppDataRepositoryError(source, message))).toBe(expected);
  });

  it('maps app data validation and fallback errors', () => {
    expect(appDataError(new DatabaseFoundationError('REQUEST_ID_INVALID', message))).toBe(
      'COMMON_INVALID_INPUT_001',
    );
    expect(appDataError(zodLikeError())).toBe('COMMON_INVALID_INPUT_001');
    expect(appDataError(new DatabaseFoundationError('DATABASE_READ_ONLY', message))).toBe(
      'PROJECT_READ_ONLY_005',
    );
  });

  it.each([
    ['LONGFORM_DIGEST_FAILED', 'LONGFORM_DIGEST_FAILED_001'],
    ['LONGFORM_STYLE_SAMPLE_INSUFFICIENT', 'LONGFORM_STYLE_SAMPLE_INSUFFICIENT_002'],
    ['LONGFORM_ROUTE_UNAVAILABLE', 'LONGFORM_ROUTE_UNAVAILABLE_003'],
    ['LONGFORM_SETTINGS_CONFLICT', 'LONGFORM_SETTINGS_CONFLICT_004'],
    ['LONGFORM_SCOPE_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
  ] as const)('maps longform error %s', (source, expected) => {
    expect(projectOperationError(new LongformAiServiceError(source, message))).toBe(expected);
  });

  it.each([
    ['RESEARCH_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    ['RESEARCH_INVALID', 'COMMON_INVALID_INPUT_001'],
    ['RESEARCH_CONFLICT', 'COMMON_CONFLICT_003'],
  ] as const)('maps research error %s', (source, expected) => {
    expect(projectOperationError(new ResearchServiceError(source, message))).toBe(expected);
  });

  it.each([
    ['JOURNAL_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    ['JOURNAL_INVALID', 'COMMON_INVALID_INPUT_001'],
    ['JOURNAL_CONFLICT', 'COMMON_CONFLICT_003'],
    ['JOURNAL_AI_CONFLICT', 'COMMON_CONFLICT_003'],
  ] as const)('maps journal error %s', (source, expected) => {
    expect(projectOperationError(new JournalServiceError(source, message))).toBe(expected);
  });

  it('maps nested story-anchor database failures and safely handles cause cycles', () => {
    const anchored = new DatabaseFoundationError('DATABASE_WRITE_FAILED', message, {
      cause: new Error('STORY_TODO_BEAT_CHAPTER_SCOPE_INVALID'),
    });
    expect(projectOperationError(anchored)).toBe('COMMON_INVALID_INPUT_001');

    const cycle = new Error('cycle');
    Object.defineProperty(cycle, 'cause', { value: cycle });
    expect(
      projectOperationError(
        new DatabaseFoundationError('DATABASE_WRITE_FAILED', message, { cause: cycle }),
      ),
    ).toBe('DB_BUSY_TIMEOUT_002');
  });

  it.each([
    ['IDEA_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    ['IDEA_INVALID', 'COMMON_INVALID_INPUT_001'],
    ['IDEA_CONFLICT', 'COMMON_CONFLICT_003'],
  ] as const)('maps idea error %s', (source, expected) => {
    expect(projectOperationError(new IdeaCapsuleServiceError(source, message))).toBe(expected);
  });

  it.each([
    ['STORY_KNOWLEDGE_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    ['STORY_KNOWLEDGE_INVALID', 'COMMON_INVALID_INPUT_001'],
  ] as const)('maps story knowledge error %s', (source, expected) => {
    expect(projectOperationError(new StoryKnowledgeProjectionServiceError(source, message))).toBe(
      expected,
    );
  });

  it.each([
    ['SEARCH_REPLACE_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    ['SEARCH_REPLACE_INVALID', 'COMMON_INVALID_INPUT_001'],
    ['SEARCH_REPLACE_CONFLICT', 'COMMON_CONFLICT_003'],
  ] as const)('maps search error %s', (source, expected) => {
    expect(projectOperationError(new SearchToolsServiceError(source, message))).toBe(expected);
  });

  it.each([
    ['RHYTHM_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    ['RHYTHM_INVALID', 'COMMON_INVALID_INPUT_001'],
    ['RHYTHM_AUTHOR_REQUIRED', 'COMMON_INVALID_INPUT_001'],
  ] as const)('maps rhythm error %s', (source, expected) => {
    expect(projectOperationError(new RhythmServiceError(source, message))).toBe(expected);
  });

  it.each([
    ['VALIDATION_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    ['VALIDATION_INVALID', 'COMMON_INVALID_INPUT_001'],
    ['VALIDATION_CONFLICT', 'COMMON_CONFLICT_003'],
  ] as const)('maps validation error %s', (source, expected) => {
    expect(projectOperationError(new ValidationServiceError(source, message))).toBe(expected);
  });

  it.each([
    ['NARRATIVE_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    ['NARRATIVE_INVALID', 'COMMON_INVALID_INPUT_001'],
    ['NARRATIVE_AUTHOR_REQUIRED', 'COMMON_INVALID_INPUT_001'],
    ['NARRATIVE_CONFLICT', 'COMMON_CONFLICT_003'],
  ] as const)('maps narrative error %s', (source, expected) => {
    expect(projectOperationError(new NarrativePlanningServiceError(source, message))).toBe(expected);
  });

  it.each([
    ['STATE_PROPOSAL_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    ['STATE_PROPOSAL_INVALID', 'COMMON_INVALID_INPUT_001'],
    ['STATE_PROPOSAL_AUTHOR_REQUIRED', 'COMMON_INVALID_INPUT_001'],
    ['STATE_PROPOSAL_CONFLICT', 'COMMON_CONFLICT_003'],
  ] as const)('maps state proposal error %s', (source, expected) => {
    expect(projectOperationError(new StateProposalServiceError(source, message))).toBe(expected);
  });

  it.each([
    ['CONTINUITY_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    ['CONTINUITY_INVALID', 'COMMON_INVALID_INPUT_001'],
    ['CONTINUITY_AUTHOR_REQUIRED', 'COMMON_INVALID_INPUT_001'],
    ['CONTINUITY_CONFLICT', 'COMMON_CONFLICT_003'],
  ] as const)('maps continuity error %s', (source, expected) => {
    expect(projectOperationError(new ContinuityServiceError(source, message))).toBe(expected);
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
  ] as const)('maps import/export error %s', (source, expected) => {
    expect(projectOperationError(new ImportExportServiceError(source, message))).toBe(expected);
  });

  it.each([
    ['BACKUP_CREATE_FAILED', 'BACKUP_CREATE_FAILED_001'],
    ['BACKUP_VERIFY_FAILED', 'BACKUP_VERIFY_FAILED_002'],
    ['BACKUP_SPACE_LOW', 'BACKUP_SPACE_LOW_003'],
    ['BACKUP_PROTECTED', 'BACKUP_LAST_VERIFIED_PROTECTED_004'],
    ['BACKUP_CLEANUP_STALE', 'COMMON_CONFLICT_003'],
    ['BACKUP_DELETE_FAILED', 'BACKUP_CREATE_FAILED_001'],
    ['BACKUP_NOT_FOUND', 'RESTORE_SOURCE_INVALID_001'],
    ['RESTORE_SOURCE_INVALID', 'RESTORE_SOURCE_INVALID_001'],
    ['RESTORE_TARGET_CONFLICT', 'RESTORE_TARGET_CONFLICT_002'],
    ['RESTORE_VERIFY_FAILED', 'RESTORE_VERIFY_FAILED_003'],
    ['EXPORT_VERSION_REQUIRED', 'EXPORT_VERSION_REQUIRED_001'],
    ['EXPORT_TARGET_EXISTS', 'EXPORT_TARGET_EXISTS_002'],
    ['EXPORT_WRITE_FAILED', 'EXPORT_WRITE_FAILED_003'],
  ] as const)('maps recovery error %s', (source, expected) => {
    expect(projectOperationError(new RecoveryServiceError(source, message))).toBe(expected);
  });

  it.each([
    ['CANDIDATE_PREVIEW_CANCELLED', 'COMMON_CANCELLED_004'],
    ['CANDIDATE_APPLY_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    ['CANDIDATE_APPLY_INVALID', 'COMMON_INVALID_INPUT_001'],
    ['CANDIDATE_APPLY_CONFLICT', 'COMMON_CONFLICT_003'],
  ] as const)('maps candidate apply error %s', (source, expected) => {
    expect(projectOperationError(new CandidateApplyServiceError(source, message))).toBe(expected);
  });

  it.each([
    ['CANDIDATE_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    ['CANDIDATE_DRAFT_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    ['CANDIDATE_REVISION_CONFLICT', 'CANDIDATE_BASE_CONFLICT_002'],
    ['CANDIDATE_SOURCE_CONFLICT', 'CANDIDATE_BASE_CONFLICT_002'],
    ['CANDIDATE_STATUS_CONFLICT', 'CANDIDATE_ALREADY_RESOLVED_001'],
    ['CANDIDATE_INVALID', 'COMMON_INVALID_INPUT_001'],
  ] as const)('maps candidate error %s', (source, expected) => {
    expect(projectOperationError(new CandidateServiceError(source, message))).toBe(expected);
  });

  it.each([
    ['VERSION_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    ['VERSION_DRAFT_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    ['VERSION_REVISION_CONFLICT', 'DRAFT_REVISION_CONFLICT_001'],
    ['VERSION_TITLE_CONFLICT', 'COMMON_CONFLICT_003'],
    ['VERSION_CHAPTER_MISMATCH', 'COMMON_CONFLICT_003'],
  ] as const)('maps version error %s', (source, expected) => {
    expect(projectOperationError(new VersionServiceError(source, message))).toBe(expected);
  });

  it.each([
    ['DRAFT_NOT_FOUND', 'DRAFT_NO_ACTIVE_005'],
    ['DRAFT_BLOCK_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    ['DRAFT_REVISION_CONFLICT', 'DRAFT_REVISION_CONFLICT_001'],
    ['DRAFT_BLOCK_HASH_CONFLICT', 'DRAFT_BLOCK_HASH_CONFLICT_002'],
    ['DRAFT_BLOCK_LOCKED', 'DRAFT_BLOCK_LOCKED_003'],
    ['DRAFT_PATCH_INVALID', 'DRAFT_PATCH_INVALID_004'],
    ['DRAFT_INVARIANT_FAILED', 'COMMON_CONFLICT_003'],
  ] as const)('maps draft error %s', (source, expected) => {
    expect(projectOperationError(new DraftServiceError(source, message))).toBe(expected);
  });

  it.each([
    ['PLANNING_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    ['PLANNING_INVALID_POSITION', 'COMMON_INVALID_INPUT_001'],
    ['PLANNING_CONFLICT', 'COMMON_CONFLICT_003'],
  ] as const)('maps project planning error %s', (source, expected) => {
    expect(projectOperationError(new ProjectPlanningError(source, message))).toBe(expected);
  });

  it.each([
    ['SCENE_BEAT_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    ['SCENE_BEAT_INVALID_POSITION', 'COMMON_INVALID_INPUT_001'],
    ['SCENE_BEAT_CONFLICT', 'COMMON_CONFLICT_003'],
  ] as const)('maps scene beat error %s', (source, expected) => {
    expect(projectOperationError(new SceneBeatServiceError(source, message))).toBe(expected);
  });

  it.each([
    ['ENTITY_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    ['ENTITY_INVALID', 'COMMON_INVALID_INPUT_001'],
    ['CANON_AUTHOR_REQUIRED', 'COMMON_INVALID_INPUT_001'],
    ['ENTITY_CONFLICT', 'COMMON_CONFLICT_003'],
  ] as const)('maps entity canon error %s', (source, expected) => {
    expect(projectOperationError(new EntityCanonServiceError(source, message))).toBe(expected);
  });

  it.each([
    ['STRUCTURE_NOT_FOUND', 'COMMON_NOT_FOUND_002'],
    ['STRUCTURE_CONFLICT', 'COMMON_CONFLICT_003'],
    ['STRUCTURE_INVALID_POSITION', 'COMMON_INVALID_INPUT_001'],
  ] as const)('maps project structure error %s', (source, expected) => {
    expect(projectOperationError(new ProjectStructureError(source, message))).toBe(expected);
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
  ] as const)('maps project workspace error %s', (source, expected) => {
    expect(projectOperationError(new ProjectWorkspaceError(source, message))).toBe(expected);
  });

  it('covers internal fallbacks and final validation/database fallback', () => {
    expect(
      projectOperationError(
        new LongformAiServiceError(
          contractInput<LongformAiServiceError['code']>('UNMAPPED_LONGFORM'),
          message,
        ),
      ),
    ).toBe('COMMON_INTERNAL_999');
    expect(
      projectOperationError(
        new ResearchServiceError(
          contractInput<ResearchServiceError['code']>('UNMAPPED_RESEARCH'),
          message,
        ),
      ),
    ).toBe('COMMON_INTERNAL_999');
    expect(
      projectOperationError(
        new JournalServiceError(
          contractInput<JournalServiceError['code']>('UNMAPPED_JOURNAL'),
          message,
        ),
      ),
    ).toBe('COMMON_INTERNAL_999');
    expect(
      projectOperationError(
        new IdeaCapsuleServiceError(
          contractInput<IdeaCapsuleServiceError['code']>('UNMAPPED_IDEA'),
          message,
        ),
      ),
    ).toBe('COMMON_INTERNAL_999');
    expect(
      projectOperationError(
        new StoryKnowledgeProjectionServiceError(
          contractInput<StoryKnowledgeProjectionServiceError['code']>('UNMAPPED_STORY'),
          message,
        ),
      ),
    ).toBe('COMMON_INTERNAL_999');
    expect(
      projectOperationError(
        new NarrativePlanningServiceError(
          contractInput<NarrativePlanningServiceError['code']>('UNMAPPED_NARRATIVE'),
          message,
        ),
      ),
    ).toBe('COMMON_INTERNAL_999');
    expect(
      projectOperationError(
        new StateProposalServiceError(
          contractInput<StateProposalServiceError['code']>('UNMAPPED_STATE'),
          message,
        ),
      ),
    ).toBe('COMMON_INTERNAL_999');
    expect(
      projectOperationError(
        new ContinuityServiceError(
          contractInput<ContinuityServiceError['code']>('UNMAPPED_CONTINUITY'),
          message,
        ),
      ),
    ).toBe('COMMON_INTERNAL_999');
    expect(projectOperationError(zodLikeError())).toBe('COMMON_INVALID_INPUT_001');
    expect(projectOperationError(new DatabaseFoundationError('DATABASE_READ_ONLY', message))).toBe(
      'PROJECT_READ_ONLY_005',
    );
  });
});
