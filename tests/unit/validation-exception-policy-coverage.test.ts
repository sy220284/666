import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { isValidationExceptionActive } from '../../packages/core-service/src/validation/validation-exception-policy.js';

const databases: DatabaseSync[] = [];
const projectId = 'project-a';

function database(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  databases.push(db);
  db.exec(`
    CREATE TABLE validation_issues(
      id TEXT PRIMARY KEY,
      evidence_ids_json TEXT
    );
    CREATE TABLE validation_exceptions(
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      issue_type TEXT NOT NULL,
      active INTEGER NOT NULL,
      scope_type TEXT NOT NULL,
      validation_issue_id TEXT,
      chapter_id TEXT,
      entity_id TEXT,
      valid_from_chapter_id TEXT,
      valid_until_chapter_id TEXT,
      project_rule_key TEXT
    );
    CREATE TABLE volumes(
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      order_key INTEGER NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE chapters(
      id TEXT PRIMARY KEY,
      volume_id TEXT NOT NULL,
      order_key INTEGER NOT NULL,
      deleted_at TEXT
    );
    INSERT INTO volumes(id, project_id, order_key, deleted_at)
      VALUES('volume-1', '${projectId}', 1, NULL);
    INSERT INTO chapters(id, volume_id, order_key, deleted_at) VALUES
      ('chapter-1', 'volume-1', 1, NULL),
      ('chapter-2', 'volume-1', 2, NULL),
      ('chapter-3', 'volume-1', 3, NULL),
      ('chapter-4', 'volume-1', 4, NULL);
  `);
  return db;
}

function insertException(
  db: DatabaseSync,
  values: {
    id: string;
    scopeType: 'issue' | 'chapter' | 'entity' | 'chapter_range' | 'project_rule';
    validationIssueId?: string | null;
    chapterId?: string | null;
    entityId?: string | null;
    validFromChapterId?: string | null;
    validUntilChapterId?: string | null;
    projectRuleKey?: string | null;
  },
): void {
  db.prepare(
    `INSERT INTO validation_exceptions(
       id, project_id, issue_type, active, scope_type, validation_issue_id,
       chapter_id, entity_id, valid_from_chapter_id, valid_until_chapter_id,
       project_rule_key
     ) VALUES(?, ?, 'continuity', 1, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    values.id,
    projectId,
    values.scopeType,
    values.validationIssueId ?? null,
    values.chapterId ?? null,
    values.entityId ?? null,
    values.validFromChapterId ?? null,
    values.validUntilChapterId ?? null,
    values.projectRuleKey ?? null,
  );
}

function active(
  db: DatabaseSync,
  chapterId: string,
  candidate: {
    issueType?: string;
    ruleId?: string | null;
    evidenceIds?: readonly string[];
    entityIds?: readonly string[];
  } = {},
): boolean {
  return isValidationExceptionActive(db, projectId, chapterId, {
    issueType: candidate.issueType ?? 'continuity',
    evidenceIds: candidate.evidenceIds ?? [],
    ...(candidate.ruleId === undefined ? {} : { ruleId: candidate.ruleId }),
    ...(candidate.entityIds === undefined ? {} : { entityIds: candidate.entityIds }),
  });
}

afterEach(() => {
  while (databases.length > 0) databases.pop()?.close();
});

describe('validation exception policy coverage', () => {
  it('matches issue scope by normalized evidence identity and rejects missing original evidence', () => {
    const db = database();
    db.prepare('INSERT INTO validation_issues(id, evidence_ids_json) VALUES(?, ?)').run(
      'issue-1',
      JSON.stringify(['evidence-b', 'evidence-a', 'evidence-a']),
    );
    insertException(db, {
      id: 'exception-issue',
      scopeType: 'issue',
      validationIssueId: 'issue-1',
    });
    insertException(db, {
      id: 'exception-missing-issue',
      scopeType: 'issue',
      validationIssueId: 'missing',
    });

    expect(active(db, 'chapter-2', { evidenceIds: ['evidence-a', 'evidence-b'] })).toBe(true);
    expect(active(db, 'chapter-2', { evidenceIds: ['evidence-a'] })).toBe(false);
  });

  it('matches exact chapter and entity scopes without leaking to unrelated candidates', () => {
    const db = database();
    insertException(db, { id: 'exception-chapter', scopeType: 'chapter', chapterId: 'chapter-2' });
    insertException(db, { id: 'exception-entity', scopeType: 'entity', entityId: 'entity-a' });

    expect(active(db, 'chapter-2')).toBe(true);
    expect(active(db, 'chapter-1')).toBe(false);
    expect(active(db, 'chapter-1', { entityIds: ['entity-a', 'entity-b'] })).toBe(true);
    expect(active(db, 'chapter-1', { entityIds: ['entity-b'] })).toBe(false);
  });

  it('uses an inclusive start and exclusive end for chapter ranges, including open-ended ranges', () => {
    const db = database();
    insertException(db, {
      id: 'exception-range',
      scopeType: 'chapter_range',
      validFromChapterId: 'chapter-2',
      validUntilChapterId: 'chapter-4',
    });

    expect(active(db, 'chapter-1')).toBe(false);
    expect(active(db, 'chapter-2')).toBe(true);
    expect(active(db, 'chapter-3')).toBe(true);
    expect(active(db, 'chapter-4')).toBe(false);

    db.prepare('DELETE FROM validation_exceptions').run();
    insertException(db, {
      id: 'exception-open-range',
      scopeType: 'chapter_range',
      validFromChapterId: 'chapter-3',
    });
    expect(active(db, 'chapter-2')).toBe(false);
    expect(active(db, 'chapter-4')).toBe(true);

    db.prepare('DELETE FROM validation_exceptions').run();
    insertException(db, { id: 'exception-invalid-range', scopeType: 'chapter_range' });
    expect(active(db, 'chapter-4')).toBe(false);
  });

  it('matches project rules by explicit rule id and falls back to issue type', () => {
    const db = database();
    insertException(db, {
      id: 'exception-rule',
      scopeType: 'project_rule',
      projectRuleKey: 'rule.custom',
    });
    insertException(db, {
      id: 'exception-fallback-rule',
      scopeType: 'project_rule',
      projectRuleKey: 'continuity',
    });

    expect(active(db, 'chapter-1', { ruleId: 'rule.custom' })).toBe(true);
    expect(active(db, 'chapter-1', { ruleId: 'rule.other' })).toBe(false);
    expect(active(db, 'chapter-1')).toBe(true);
  });

  it('ignores inactive and different-issue exceptions at the SQL boundary', () => {
    const db = database();
    db.prepare(
      `INSERT INTO validation_exceptions(
         id, project_id, issue_type, active, scope_type, chapter_id
       ) VALUES('inactive', ?, 'continuity', 0, 'chapter', 'chapter-1'),
               ('other-type', ?, 'timeline', 1, 'chapter', 'chapter-1')`,
    ).run(projectId, projectId);

    expect(active(db, 'chapter-1')).toBe(false);
  });
});
