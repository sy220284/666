import type { DatabaseSync } from 'node:sqlite';

import { compareChapterPosition } from '@worldforge/domain';

import { chapterPosition } from '../continuity-validation.js';

interface ExceptionCandidate {
  readonly issueType: string;
  readonly ruleId?: string | null;
  readonly evidenceIds: readonly string[];
  readonly entityIds?: readonly string[];
}

interface ExceptionRow {
  readonly scopeType: 'issue' | 'chapter' | 'entity' | 'chapter_range' | 'project_rule';
  readonly validationIssueId: string | null;
  readonly chapterId: string | null;
  readonly entityId: string | null;
  readonly validFromChapterId: string | null;
  readonly validUntilChapterId: string | null;
  readonly projectRuleKey: string | null;
  readonly originalEvidenceIdsJson: string | null;
}

export function isValidationExceptionActive(
  database: DatabaseSync,
  projectId: string,
  chapterId: string,
  candidate: ExceptionCandidate,
): boolean {
  const rows = database
    .prepare(
      `SELECT exception.scope_type AS scopeType,
              exception.validation_issue_id AS validationIssueId,
              exception.chapter_id AS chapterId, exception.entity_id AS entityId,
              exception.valid_from_chapter_id AS validFromChapterId,
              exception.valid_until_chapter_id AS validUntilChapterId,
              exception.project_rule_key AS projectRuleKey,
              original.evidence_ids_json AS originalEvidenceIdsJson
         FROM validation_exceptions exception
         LEFT JOIN validation_issues original ON original.id = exception.validation_issue_id
        WHERE exception.project_id = ? AND exception.active = 1
          AND exception.issue_type = ?`,
    )
    .all(projectId, candidate.issueType) as unknown as ExceptionRow[];
  const evidenceKey = normalizedSet(candidate.evidenceIds);
  return rows.some((row) => {
    switch (row.scopeType) {
      case 'issue':
        return row.originalEvidenceIdsJson
          ? normalizedSet(JSON.parse(row.originalEvidenceIdsJson) as string[]) === evidenceKey
          : false;
      case 'chapter':
        return row.chapterId === chapterId;
      case 'entity':
        return row.entityId !== null && (candidate.entityIds ?? []).includes(row.entityId);
      case 'chapter_range': {
        if (!row.validFromChapterId) return false;
        const chapter = chapterPosition(database, projectId, chapterId);
        const start = chapterPosition(database, projectId, row.validFromChapterId);
        const end = row.validUntilChapterId
          ? chapterPosition(database, projectId, row.validUntilChapterId)
          : null;
        return (
          compareChapterPosition(start, chapter) <= 0 &&
          (!end || compareChapterPosition(chapter, end) < 0)
        );
      }
      case 'project_rule':
        return row.projectRuleKey === (candidate.ruleId ?? candidate.issueType);
    }
  });
}

function normalizedSet(values: readonly string[]): string {
  return JSON.stringify(
    [...new Set(values)].sort((left, right) => left.localeCompare(right, 'en')),
  );
}
