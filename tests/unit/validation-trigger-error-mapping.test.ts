import { describe, expect, it } from 'vitest';

import { DatabaseFoundationError } from '../../packages/core-service/src/database/index.js';
import { projectOperationError } from '../../packages/core-service/src/utility-errors.js';

const scopeMarkers = [
  'STORY_TODO_BEAT_CHAPTER_SCOPE_INVALID',
  'STORY_TODO_BLOCK_CHAPTER_SCOPE_INVALID',
  'STORY_TODO_ISSUE_ANCHOR_SCOPE_INVALID',
  'STORY_COMMENT_VERSION_CHAPTER_SCOPE_INVALID',
  'STORY_COMMENT_BLOCK_SOURCE_SCOPE_INVALID',
  'STORY_COMMENT_ISSUE_ANCHOR_SCOPE_INVALID',
] as const;

describe('validation trigger error mapping', () => {
  it.each(scopeMarkers)('maps nested %s to stable invalid input', (marker) => {
    const sqliteError = Object.assign(new Error(marker), {
      code: 'ERR_SQLITE_CONSTRAINT_TRIGGER',
    });
    const wrapped = new DatabaseFoundationError(
      'DATABASE_WRITE_FAILED',
      'The database write failed and was rolled back.',
      { cause: sqliteError },
    );

    expect(projectOperationError(wrapped)).toBe('COMMON_INVALID_INPUT_001');
  });

  it('keeps unrelated database write failures on the database error path', () => {
    const wrapped = new DatabaseFoundationError(
      'DATABASE_WRITE_FAILED',
      'The database write failed and was rolled back.',
      { cause: Object.assign(new Error('SQLITE_BUSY'), { code: 'ERR_SQLITE_BUSY' }) },
    );

    expect(projectOperationError(wrapped)).toBe('DB_BUSY_TIMEOUT_002');
  });
});
