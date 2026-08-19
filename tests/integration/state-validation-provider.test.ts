import { randomUUID } from 'node:crypto';

import { ConstraintPackageSchema } from '@worldforge/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { SceneBeatService } from '../../packages/core-service/src/scene-beat.js';
import {
  cleanupContinuityHarnesses,
  closeContinuityHarness,
  createContinuityHarness,
  seedContinuity,
} from './continuity-hardening-harness.js';

afterEach(cleanupContinuityHarnesses);

function constraints(projectId: string, chapterId: string, versionId: string, taskType: string) {
  return ConstraintPackageSchema.parse({
    projectId,
    chapterId,
    taskType,
    snapshotSource: 'fallback_live_query',
    sections: { P0: [], P1: [], P2: [], P3: [], P4: [] },
    sourceVersionIds: [versionId],
    estimatedTokens: 0,
    budget: { maxInputTokens: 32_768, safetyMarginTokens: 2_048, usableTokens: 30_720 },
    contentHash: 'a'.repeat(64),
    constraintHash: 'b'.repeat(64),
    trimLog: [],
    conflicts: [],
  });
}

describe('M4-04 Provider state extraction and validation', () => {
  it('persists Provider proposals as a pending atomic batch without changing authority', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      await harness.versions.setFinal(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        versionId: seeded.version.versionId,
      });
      await harness.continuity.setEntityState(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityId: seeded.character.id,
        stateKey: 'health',
        value: 'well',
        validFromChapterId: seeded.chapter1.id,
        validUntilChapterId: null,
        evidence: [{ kind: 'version', targetId: seeded.version.versionId, note: '' }],
        sourceVersionId: seeded.version.versionId,
      });
      const blockId = seeded.version.blocks[0]!.logicalBlockId;
      const run = await harness.generation.create(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        baseDraftId: null,
        baseDraftRevision: null,
        runType: 'state_extract',
        promptId: 'worldforge.state-extract',
        promptVersion: 1,
        outputMode: 'structured',
        providerId: 'provider-test',
        actualModel: 'model-test',
        supportStatus: 'verified',
        constraintPackage: constraints(
          seeded.project.projectId,
          seeded.chapter1.id,
          seeded.version.versionId,
          'state_extract',
        ),
        inputSources: [
          {
            sourceType: 'version',
            sourceId: seeded.version.versionId,
            sourceOrder: 0,
            contentHash: seeded.version.contentHash,
            metadata: { final: true },
          },
        ],
      });
      await harness.generation.markRunning(randomUUID(), {
        projectId: seeded.project.projectId,
        runId: run.runId,
      });
      const completed = await harness.proposals.completeProviderBatch(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        sourceVersionId: seeded.version.versionId,
        runId: run.runId,
        proposals: [
          {
            proposalType: 'entity_state',
            entityId: seeded.character.id,
            stateKey: 'health',
            proposedValue: 'injured',
            validUntilChapterId: null,
            evidence: [{ kind: 'logicalBlock', targetId: blockId, note: '受伤证据' }],
            confidence: 0.91,
          },
        ],
        usage: { inputTokens: 120, outputTokens: 40 },
      });

      expect(completed.catalog.batches[0]).toMatchObject({
        batchId: completed.batchId,
        generationRunId: run.runId,
        source: 'provider',
        status: 'pending',
        proposalCount: 1,
      });
      expect(completed.catalog.proposals[0]).toMatchObject({
        batchId: completed.batchId,
        generationRunId: run.runId,
        source: 'provider',
        status: 'pending',
        freshness: 'current',
        actionability: 'accept',
        previousValue: {
          value: 'well',
          semanticKind: 'custom',
          validUntilChapterId: null,
        },
        proposedValue: {
          value: 'injured',
          semanticKind: 'custom',
          validUntilChapterId: null,
        },
      });
      expect(
        harness.continuity.list({
          projectId: seeded.project.projectId,
          query: '',
          includeHistory: false,
          includeArchivedEvents: false,
          effectiveAtChapterId: seeded.chapter1.id,
        }).entityStates[0],
      ).toMatchObject({ value: 'well' });
      expect(
        harness.generation.get({ projectId: seeded.project.projectId, runId: run.runId }),
      ).toMatchObject({
        status: 'succeeded',
        resultRefs: [{ resultType: 'state_proposal_batch', resultId: completed.batchId }],
      });
    } finally {
      await closeContinuityHarness(harness);
    }
  });

  it('runs deterministic and AI checks with stable anchors, semantic freshness, issue actions, todos and comments', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      await harness.versions.setFinal(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        versionId: seeded.version.versionId,
      });
      const first = await harness.validation.runRules(randomUUID(), {
        projectId: seeded.project.projectId,
        sourceVersionId: seeded.version.versionId,
      });
      expect(first.batches).toHaveLength(1);
      expect(first.batches[0]).toMatchObject({
        source: 'rule',
        ruleVersion: 'worldforge.rules.v2',
        configVersion: 'general-writing.v1',
        anchorFreshness: 'current',
        semanticFreshness: 'current',
      });
      expect(first.issues.length).toBeGreaterThan(0);
      const repeated = await harness.validation.runRules(randomUUID(), {
        projectId: seeded.project.projectId,
        sourceVersionId: seeded.version.versionId,
      });
      expect(repeated.batches).toHaveLength(1);
      expect(repeated.issues.map((issue) => issue.issueId)).toEqual(
        first.issues.map((issue) => issue.issueId),
      );

      const beats = new SceneBeatService(harness.workspace);
      await beats.create(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        plotNodeId: null,
        title: '正文不变的场景要求',
        goal: '验证语义结构变化会失效旧校验',
        coreConflict: '场景节拍新增但正文尚未调整',
        expectedResult: '旧规则批次不得继续命中缓存',
        beatType: 'turn',
        wordTargetPercent: 20,
        required: true,
        characterIds: [seeded.character.id],
        locationIds: [],
        placement: { kind: 'end' },
      });
      const staleAfterBeat = harness.validation.list({
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        includeClosed: true,
      });
      expect(staleAfterBeat.batches[0]).toMatchObject({
        anchorFreshness: 'current',
        semanticFreshness: 'stale',
      });
      const recalculated = await harness.validation.runRules(randomUUID(), {
        projectId: seeded.project.projectId,
        sourceVersionId: seeded.version.versionId,
      });
      expect(recalculated.batches).toHaveLength(2);
      expect(
        recalculated.batches.filter((batch) => batch.semanticFreshness === 'current'),
      ).toHaveLength(1);
      expect(
        recalculated.batches.find((batch) => batch.semanticFreshness === 'current'),
      ).toMatchObject({
        source: 'rule',
        anchorFreshness: 'current',
      });
      expect(
        recalculated.batches.filter((batch) => batch.semanticFreshness === 'stale'),
      ).toHaveLength(1);

      const issue = first.issues[0]!;
      let catalog = await harness.validation.createTodoFromIssue(randomUUID(), {
        projectId: seeded.project.projectId,
        issueId: issue.issueId,
      });
      expect(catalog.todos[0]).toMatchObject({
        validationIssueId: issue.issueId,
        status: 'open',
      });
      catalog = await harness.validation.createTodoFromIssue(randomUUID(), {
        projectId: seeded.project.projectId,
        issueId: issue.issueId,
      });
      expect(catalog.todos.filter((todo) => todo.validationIssueId === issue.issueId)).toHaveLength(
        1,
      );
      catalog = await harness.validation.addComment(randomUUID(), {
        projectId: seeded.project.projectId,
        issueId: issue.issueId,
        chapterId: issue.anchor.chapterId,
        sourceVersionId: issue.anchor.versionId,
        logicalBlockId: issue.anchor.logicalBlockId,
        body: '作者复核此处。',
      });
      expect(catalog.comments[0]).toMatchObject({
        validationIssueId: issue.issueId,
        status: 'open',
      });
      const commentId = catalog.comments[0]!.commentId;
      catalog = await harness.validation.batchComments(randomUUID(), {
        projectId: seeded.project.projectId,
        commentIds: [commentId],
        action: 'tag',
        tags: ['伏笔', '作者复核'],
      });
      expect(catalog.comments[0]?.tags).toEqual(['伏笔', '作者复核']);
      catalog = await harness.validation.batchComments(randomUUID(), {
        projectId: seeded.project.projectId,
        commentIds: [commentId],
        action: 'resolve',
        tags: [],
      });
      expect(catalog.comments[0]?.status).toBe('resolved');
      catalog = await harness.validation.reopenComment(randomUUID(), {
        projectId: seeded.project.projectId,
        commentId,
      });
      expect(catalog.comments[0]?.status).toBe('open');
      await expect(
        harness.validation.batchComments(randomUUID(), {
          projectId: seeded.project.projectId,
          commentIds: [commentId, randomUUID()],
          action: 'resolve',
          tags: [],
        }),
      ).rejects.toThrow();
      expect(
        harness.validation
          .list({
            projectId: seeded.project.projectId,
            chapterId: seeded.chapter1.id,
            includeClosed: true,
          })
          .comments.find((comment) => comment.commentId === commentId)?.status,
      ).toBe('open');
      catalog = await harness.validation.updateIssue(randomUUID(), {
        projectId: seeded.project.projectId,
        issueId: issue.issueId,
        action: 'downgrade',
      });
      expect(catalog.issues.find((item) => item.issueId === issue.issueId)?.severity).not.toBe(
        issue.severity,
      );

      const blockId = seeded.version.blocks[0]!.logicalBlockId;
      const run = await harness.generation.create(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        baseDraftId: null,
        baseDraftRevision: null,
        runType: 'validate',
        promptId: 'worldforge.validate',
        promptVersion: 1,
        outputMode: 'structured',
        providerId: 'provider-test',
        actualModel: 'model-test',
        supportStatus: 'verified',
        constraintPackage: constraints(
          seeded.project.projectId,
          seeded.chapter1.id,
          seeded.version.versionId,
          'validate',
        ),
        inputSources: [
          {
            sourceType: 'version',
            sourceId: seeded.version.versionId,
            sourceOrder: 0,
            contentHash: seeded.version.contentHash,
            metadata: { final: true },
          },
        ],
      });
      await harness.generation.markRunning(randomUUID(), {
        projectId: seeded.project.projectId,
        runId: run.runId,
      });
      const ai = await harness.validation.completeAiBatch(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        sourceVersionId: seeded.version.versionId,
        runId: run.runId,
        output: {
          issues: [
            {
              type: 'semantic.character_motivation',
              severity: 'high',
              logicalBlockId: blockId,
              rationale: '角色动机需要作者确认。',
              evidenceIds: [blockId],
              suggestion: '补充动机线索。',
              confidence: 0.74,
            },
          ],
        },
      });
      expect(ai.catalog.batches.find((batch) => batch.batchId === ai.batchId)).toMatchObject({
        source: 'ai',
        generationRunId: run.runId,
        anchorFreshness: 'current',
        semanticFreshness: 'current',
        constraintHash: 'b'.repeat(64),
        promptId: 'worldforge.validate',
        promptVersion: 1,
      });
      expect(ai.catalog.issues.find((item) => item.batchId === ai.batchId)).toMatchObject({
        source: 'ai',
        anchor: { versionId: seeded.version.versionId, state: 'current' },
      });
      expect(
        harness.generation.get({ projectId: seeded.project.projectId, runId: run.runId }),
      ).toMatchObject({
        status: 'succeeded',
        resultRefs: [{ resultType: 'validation_batch', resultId: ai.batchId }],
      });

      await harness.continuity.setEntityState(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityId: seeded.character.id,
        stateKey: 'health',
        value: 'injured',
        validFromChapterId: seeded.chapter1.id,
        validUntilChapterId: null,
        evidence: [{ kind: 'version', targetId: seeded.version.versionId, note: '' }],
        sourceVersionId: seeded.version.versionId,
      });
      const semanticStale = harness.validation.list({
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        includeClosed: true,
      });
      expect(semanticStale.batches.find((batch) => batch.batchId === ai.batchId)).toMatchObject({
        anchorFreshness: 'current',
        semanticFreshness: 'stale',
      });

      const racingRun = await harness.generation.create(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        baseDraftId: null,
        baseDraftRevision: null,
        runType: 'validate',
        promptId: 'worldforge.validate',
        promptVersion: 1,
        outputMode: 'structured',
        providerId: 'provider-test',
        actualModel: 'model-test',
        supportStatus: 'verified',
        constraintPackage: constraints(
          seeded.project.projectId,
          seeded.chapter1.id,
          seeded.version.versionId,
          'validate',
        ),
        inputSources: [
          {
            sourceType: 'version',
            sourceId: seeded.version.versionId,
            sourceOrder: 0,
            contentHash: seeded.version.contentHash,
            metadata: { final: true },
          },
        ],
      });
      await harness.generation.markRunning(randomUUID(), {
        projectId: seeded.project.projectId,
        runId: racingRun.runId,
      });
      await harness.continuity.setEntityState(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityId: seeded.character.id,
        stateKey: 'health',
        value: 'recovering',
        validFromChapterId: seeded.chapter1.id,
        validUntilChapterId: null,
        evidence: [{ kind: 'version', targetId: seeded.version.versionId, note: '' }],
        sourceVersionId: seeded.version.versionId,
      });
      const raced = await harness.validation.completeAiBatch(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        sourceVersionId: seeded.version.versionId,
        runId: racingRun.runId,
        output: {
          issues: [
            {
              type: 'semantic.character_motivation',
              severity: 'medium',
              logicalBlockId: blockId,
              rationale: '运行期间语义状态变化后的结果仅可作为历史检查。',
              evidenceIds: [blockId],
              suggestion: '基于最新状态重新运行检查。',
              confidence: 0.68,
            },
          ],
        },
      });
      expect(raced.catalog.batches.find((batch) => batch.batchId === raced.batchId)).toMatchObject({
        source: 'ai',
        anchorFreshness: 'current',
        semanticFreshness: 'stale',
      });
    } finally {
      await closeContinuityHarness(harness);
    }
  });
});
