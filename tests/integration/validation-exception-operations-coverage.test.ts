import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanupContinuityHarnesses,
  closeContinuityHarness,
  createContinuityHarness,
  seedContinuity,
} from './continuity-hardening-harness.js';

async function seedIssue(
  harness: Awaited<ReturnType<typeof createContinuityHarness>>,
  seeded: Awaited<ReturnType<typeof seedContinuity>>,
): Promise<string> {
  const batchId = randomUUID();
  const issueId = randomUUID();
  const now = '2026-08-14T00:00:00.000Z';
  await harness.workspace.writeProject(randomUUID(), seeded.project.projectId, (database) => {
    database
      .prepare(
        `INSERT INTO validation_batches(
           id, project_id, chapter_id, source_version_id, generation_run_id, source,
           rule_version, config_version, input_fingerprint, issue_count, created_at
         ) VALUES(?, ?, ?, ?, NULL, 'rule', 'coverage-rule-v1', 'coverage-config-v1', ?, 1, ?)`,
      )
      .run(
        batchId,
        seeded.project.projectId,
        seeded.chapter1.id,
        seeded.version.versionId,
        'a'.repeat(64),
        now,
      );
    database
      .prepare(
        `INSERT INTO validation_issues(
           id, batch_id, project_id, chapter_id, source_version_id, logical_block_id,
           expected_block_hash, text_quote, range_hint_json, issue_type, source, severity,
           rationale, evidence_ids_json, suggestion, confidence, rule_id, rule_version,
           config_version, status, created_at, updated_at
         ) VALUES(?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 'continuity', 'rule', 'medium',
                  'coverage issue', '[]', NULL, NULL, 'rule.coverage',
                  'coverage-rule-v1', 'coverage-config-v1', 'open', ?, ?)`,
      )
      .run(
        issueId,
        batchId,
        seeded.project.projectId,
        seeded.chapter1.id,
        seeded.version.versionId,
        now,
        now,
      );
  });
  return issueId;
}

afterEach(async () => {
  await cleanupContinuityHarnesses();
});

describe('validation exception operations coverage', () => {
  it('persists issue, chapter, entity, range and project-rule scopes with exact ownership', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      const issueId = await seedIssue(harness, seeded);
      const common = {
        projectId: seeded.project.projectId,
        issueId,
        exceptionType: 'intentional_exception' as const,
        notes: '作者明确允许',
      };

      let catalog = await harness.validation.rememberException(randomUUID(), {
        ...common,
        scopeType: 'issue',
      });
      expect(catalog.exceptions.find((item) => item.scopeType === 'issue')).toMatchObject({
        scopeType: 'issue',
        validationIssueId: issueId,
        chapterId: seeded.chapter1.id,
        active: true,
      });
      expect(catalog.issues.find((issue) => issue.issueId === issueId)?.status).toBe('ignored');

      catalog = await harness.validation.rememberException(randomUUID(), {
        ...common,
        scopeType: 'chapter',
      });
      expect(catalog.exceptions.find((item) => item.scopeType === 'chapter')).toMatchObject({
        scopeType: 'chapter',
        chapterId: seeded.chapter1.id,
      });

      catalog = await harness.validation.rememberException(randomUUID(), {
        ...common,
        scopeType: 'entity',
        entityId: seeded.character.id,
      });
      expect(catalog.exceptions.find((item) => item.scopeType === 'entity')).toMatchObject({
        scopeType: 'entity',
        entityId: seeded.character.id,
      });

      catalog = await harness.validation.rememberException(randomUUID(), {
        ...common,
        scopeType: 'chapter_range',
        validFromChapterId: seeded.chapter2.id,
        validUntilChapterId: seeded.chapter4.id,
      });
      expect(catalog.exceptions.find((item) => item.scopeType === 'chapter_range')).toMatchObject({
        scopeType: 'chapter_range',
        validFromChapterId: seeded.chapter2.id,
        validUntilChapterId: seeded.chapter4.id,
      });

      catalog = await harness.validation.rememberException(randomUUID(), {
        ...common,
        scopeType: 'project_rule',
      });
      expect(catalog.exceptions.find((item) => item.scopeType === 'project_rule')).toMatchObject({
        scopeType: 'project_rule',
        projectRuleKey: 'rule.coverage',
      });
    } finally {
      await closeContinuityHarness(harness);
    }
  });

  it('rejects missing issues, invalid entities and malformed chapter-range scopes', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      const issueId = await seedIssue(harness, seeded);
      const common = {
        projectId: seeded.project.projectId,
        exceptionType: 'custom' as const,
        notes: '',
      };

      await expect(
        harness.validation.rememberException(randomUUID(), {
          ...common,
          issueId: randomUUID(),
          scopeType: 'issue',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_NOT_FOUND' });

      await expect(
        harness.validation.rememberException(randomUUID(), {
          ...common,
          issueId,
          scopeType: 'entity',
          entityId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_NOT_FOUND' });

      await expect(
        harness.validation.rememberException(randomUUID(), {
          ...common,
          issueId,
          scopeType: 'chapter_range',
          validFromChapterId: null,
          validUntilChapterId: seeded.chapter4.id,
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_INVALID' });

      await expect(
        harness.validation.rememberException(randomUUID(), {
          ...common,
          issueId,
          scopeType: 'chapter_range',
          validFromChapterId: seeded.chapter3.id,
          validUntilChapterId: seeded.chapter2.id,
        }),
      ).rejects.toMatchObject({ code: 'CONTINUITY_CONFLICT' });
    } finally {
      await closeContinuityHarness(harness);
    }
  });

  it('disables an active exception once and rejects repeated or unknown disables', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      const issueId = await seedIssue(harness, seeded);
      const created = await harness.validation.rememberException(randomUUID(), {
        projectId: seeded.project.projectId,
        issueId,
        exceptionType: 'dream',
        scopeType: 'chapter',
        notes: '梦境章节',
      });
      const exception = created.exceptions.find((item) => item.active)!;

      const disabled = await harness.validation.disableException(randomUUID(), {
        projectId: seeded.project.projectId,
        exceptionId: exception.exceptionId,
      });
      expect(
        disabled.exceptions.find((item) => item.exceptionId === exception.exceptionId),
      ).toMatchObject({
        active: false,
      });

      await expect(
        harness.validation.disableException(randomUUID(), {
          projectId: seeded.project.projectId,
          exceptionId: exception.exceptionId,
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_NOT_FOUND' });
      await expect(
        harness.validation.disableException(randomUUID(), {
          projectId: seeded.project.projectId,
          exceptionId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_NOT_FOUND' });
    } finally {
      await closeContinuityHarness(harness);
    }
  });
});
