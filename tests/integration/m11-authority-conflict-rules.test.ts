import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanupContinuityHarnesses,
  closeContinuityHarness,
  createContinuityHarness,
  seedContinuity,
} from './continuity-hardening-harness.js';

afterEach(async () => {
  await cleanupContinuityHarnesses();
});

describe('M11-03 deterministic authority conflicts', () => {
  it('reports death continuation and age reversal with both sides of the evidence', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      await harness.versions.setFinal(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        versionId: seeded.version.versionId,
      });
      const chapter2Draft = await harness.drafts.open(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter2.id,
      });
      const chapter2Version = await harness.versions.create(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter2.id,
        draftId: chapter2Draft.draftId,
        baseRevision: chapter2Draft.revision,
        title: '第二章冲突检查来源',
      });
      await harness.versions.setFinal(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter2.id,
        versionId: chapter2Version.versionId,
      });
      const firstEvidence = [
        { kind: 'version' as const, targetId: seeded.version.versionId, note: '第一章已确认' },
      ];
      const secondEvidence = [
        { kind: 'version' as const, targetId: chapter2Version.versionId, note: '第二章已确认' },
      ];
      await harness.continuity.setEntityState(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityId: seeded.character.id,
        stateKey: 'life_status',
        semanticKind: 'life_status',
        value: 'dead',
        validFromChapterId: seeded.chapter1.id,
        validUntilChapterId: null,
        evidence: firstEvidence,
        sourceVersionId: seeded.version.versionId,
      });
      await harness.continuity.setEntityState(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityId: seeded.character.id,
        stateKey: 'age',
        semanticKind: 'age',
        value: 30,
        validFromChapterId: seeded.chapter1.id,
        validUntilChapterId: null,
        evidence: firstEvidence,
        sourceVersionId: seeded.version.versionId,
      });
      await harness.continuity.setEntityState(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityId: seeded.character.id,
        stateKey: 'age',
        semanticKind: 'age',
        value: 20,
        validFromChapterId: seeded.chapter2.id,
        validUntilChapterId: null,
        evidence: secondEvidence,
        sourceVersionId: chapter2Version.versionId,
      });

      const result = await harness.validation.runRules(randomUUID(), {
        projectId: seeded.project.projectId,
        sourceVersionId: chapter2Version.versionId,
      });
      const death = result.issues.find(
        (item) => item.issueType === 'authority.character_after_death',
      );
      const age = result.issues.find((item) => item.issueType === 'authority.age_reversal');
      expect(death).toMatchObject({ severity: 'high', source: 'rule' });
      expect(age).toMatchObject({ severity: 'high', source: 'rule' });
      for (const item of [death, age]) {
        expect(item?.currentEvidenceIds.length).toBeGreaterThan(0);
        expect(item?.conflictEvidenceIds.length).toBeGreaterThan(0);
        expect(item?.evidenceIds).toEqual(
          expect.arrayContaining([...item!.currentEvidenceIds, ...item!.conflictEvidenceIds]),
        );
      }

      const remembered = await harness.validation.rememberException(randomUUID(), {
        projectId: seeded.project.projectId,
        issueId: death!.issueId,
        exceptionType: 'intentional_exception',
        scopeType: 'issue',
        notes: '作者确认此处为倒叙片段。',
      });
      expect(remembered.exceptions).toContainEqual(
        expect.objectContaining({
          validationIssueId: death!.issueId,
          active: true,
          exceptionType: 'intentional_exception',
        }),
      );
      const rescanned = await harness.validation.runRules(randomUUID(), {
        projectId: seeded.project.projectId,
        sourceVersionId: chapter2Version.versionId,
      });
      expect(
        rescanned.issues.some(
          (item) => item.issueType === 'authority.character_after_death' && item.status === 'open',
        ),
      ).toBe(false);
      expect(
        rescanned.issues.some(
          (item) => item.issueType === 'authority.age_reversal' && item.status === 'open',
        ),
      ).toBe(true);
    } finally {
      await closeContinuityHarness(harness);
    }
  });
});
