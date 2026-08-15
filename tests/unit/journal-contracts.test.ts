import { describe, expect, it } from 'vitest';

import {
  GenerationStartInputSchema,
  JournalDeterministicSummarySchema,
  JournalEntrySchema,
} from '@worldforge/contracts';
import { journalSummaryPrompt } from '@worldforge/prompts';

const PROJECT_ID = '00000000-0000-4000-8000-000000000001';
const ENTRY_ID = '00000000-0000-4000-8000-000000000002';
const PROVIDER_ID = 'provider-main';
const HASH = 'a'.repeat(64);

function deterministicSummary() {
  return JournalDeterministicSummarySchema.parse({
    periodStart: '2026-08-14T16:00:00.000Z',
    periodEnd: '2026-08-15T16:00:00.000Z',
    writing: { sessions: 1, netCharacters: 2200, activeSeconds: 1800, touchedChapters: 1 },
    versions: { created: 1, finalized: 1 },
    generation: { started: 2, succeeded: 1, failed: 1, cancelled: 0, acceptedCandidates: 1 },
    review: {
      stateProposalsResolved: 1,
      validationIssuesCreated: 2,
      validationIssuesResolved: 1,
      todosCreated: 1,
      todosCompleted: 1,
      commentsCreated: 1,
      commentsResolved: 1,
    },
    ideas: { created: 1, converted: 1 },
    knowledge: { relationshipChanges: 1, timelineChanges: 1, foreshadowingChanges: 1, arcChanges: 1 },
    recovery: { backupsCreated: 1 },
    digestReferences: [],
  });
}

describe('M12-01 Journal contracts', () => {
  it('keeps navigation references additive and defaults them for stored deterministic summaries', () => {
    const summary = deterministicSummary();
    expect(summary.navigationReferences).toEqual([]);
    expect(
      JournalEntrySchema.parse({
        id: ENTRY_ID,
        projectId: PROJECT_ID,
        periodType: 'daily',
        periodStart: summary.periodStart,
        periodEnd: summary.periodEnd,
        sourceRevision: 1,
        sourceHash: HASH,
        deterministicSummary: summary,
        aiSummary: null,
        authorNote: null,
        generationRunId: null,
        status: 'deterministic',
        createdAt: '2026-08-15T00:00:00.000Z',
        updatedAt: '2026-08-15T00:00:00.000Z',
      }).deterministicSummary.navigationReferences,
    ).toEqual([]);
  });

  it('allows journal AI only as a project-scoped GenerationRun without chapter Draft state', () => {
    const parsed = GenerationStartInputSchema.parse({
      projectId: PROJECT_ID,
      scopeType: 'project',
      scopeId: PROJECT_ID,
      chapterId: null,
      baseDraftId: null,
      baseDraftRevision: null,
      providerId: PROVIDER_ID,
      continuationOfRunId: null,
      intent: { runType: 'journal_summarize', journalEntryId: ENTRY_ID },
    });
    expect(parsed.intent.runType).toBe('journal_summarize');
    expect(parsed.scopeId).toBe(PROJECT_ID);
    expect(parsed.chapterId).toBeNull();
  });

  it('rejects journal AI when it is smuggled through a chapter scope', () => {
    expect(() =>
      GenerationStartInputSchema.parse({
        projectId: PROJECT_ID,
        scopeType: 'chapter',
        scopeId: ENTRY_ID,
        chapterId: ENTRY_ID,
        baseDraftId: null,
        baseDraftRevision: null,
        providerId: PROVIDER_ID,
        continuationOfRunId: null,
        intent: { runType: 'journal_summarize', journalEntryId: ENTRY_ID },
      }),
    ).toThrow();
  });

  it('builds a bounded structured journal prompt with the correct task identity', () => {
    const bundle = journalSummaryPrompt.build({
      projectId: PROJECT_ID,
      journalEntryId: ENTRY_ID,
      periodType: 'daily',
      deterministicSummary: deterministicSummary(),
      projectDigest: '项目摘要',
      constraintHash: HASH,
    });
    expect(bundle.metadata.taskType).toBe('journal_summarize');
    expect(bundle.metadata.promptId).toBe('worldforge.journal-summarize');
    expect(bundle.structuredOutput?.name).toBe('journal_summary_v1');
    expect(bundle.messages).toHaveLength(1);
  });
});
