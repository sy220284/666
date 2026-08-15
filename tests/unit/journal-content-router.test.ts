import { describe, expect, it, vi } from 'vitest';

import {
  JOURNAL_COMMANDS,
  type JournalCatalog,
  type JournalPreview,
} from '@worldforge/contracts';
import { routeContentProjectOperation } from '../../packages/core-service/src/utility-project-content-router.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const requestId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const entryId = '33333333-3333-4333-8333-333333333333';
const runId = '44444444-4444-4444-8444-444444444444';
const periodStart = '2026-08-14T00:00:00.000Z';
const periodEnd = '2026-08-15T00:00:00.000Z';
const updatedAt = '2026-08-15T01:00:00.000Z';

function summary() {
  return {
    periodStart,
    periodEnd,
    writing: { sessions: 0, netCharacters: 0, activeSeconds: 0, touchedChapters: 0 },
    versions: { created: 0, finalized: 0 },
    generation: {
      started: 0,
      succeeded: 0,
      failed: 0,
      cancelled: 0,
      acceptedCandidates: 0,
    },
    review: {
      stateProposalsResolved: 0,
      validationIssuesCreated: 0,
      validationIssuesResolved: 0,
      todosCreated: 0,
      todosCompleted: 0,
      commentsCreated: 0,
      commentsResolved: 0,
    },
    ideas: { created: 0, converted: 0 },
    knowledge: {
      relationshipChanges: 0,
      timelineChanges: 0,
      foreshadowingChanges: 0,
      arcChanges: 0,
    },
    recovery: { backupsCreated: 0 },
    navigationReferences: [],
    digestReferences: [],
  };
}

function catalog(): JournalCatalog {
  return contractInput<JournalCatalog>({
    projectId,
    entries: [],
    preferences: { projectId, schedule: 'off', updatedAt },
    nextCursor: null,
  });
}

function preview(): JournalPreview {
  return contractInput<JournalPreview>({
    projectId,
    periodType: 'manual',
    sourceRevision: 0,
    sourceHash: 'a'.repeat(64),
    deterministicSummary: summary(),
  });
}

function createHarness() {
  const journal = {
    list: vi.fn(() => catalog()),
    preview: vi.fn(() => preview()),
    generate: vi.fn(async () => catalog()),
    updateNote: vi.fn(async () => catalog()),
    updatePreferences: vi.fn(async () => catalog()),
    catchUp: vi.fn(async () => catalog()),
    markAiFailed: vi.fn(async () => catalog()),
  };
  const services = contractInput<Parameters<typeof routeContentProjectOperation>[0]>({ journal });
  return { journal, services };
}

function operation(name: string, input: unknown): Parameters<typeof routeContentProjectOperation>[2] {
  return contractInput({ operation: name, input });
}

describe('M12-01 Journal project-content routing', () => {
  it('maps every Journal command to the existing Journal service without a second router', async () => {
    const cases = [
      [
        JOURNAL_COMMANDS.list,
        { projectId, limit: 30, before: null },
        'list',
        [{ projectId, limit: 30, before: null }],
      ],
      [
        JOURNAL_COMMANDS.preview,
        { projectId, periodType: 'manual', periodStart, periodEnd },
        'preview',
        [{ projectId, periodType: 'manual', periodStart, periodEnd }],
      ],
      [
        JOURNAL_COMMANDS.generate,
        { projectId, periodType: 'manual', periodStart, periodEnd },
        'generate',
        [requestId, { projectId, periodType: 'manual', periodStart, periodEnd }],
      ],
      [
        JOURNAL_COMMANDS.updateNote,
        { projectId, entryId, expectedUpdatedAt: updatedAt, authorNote: '复盘备注' },
        'updateNote',
        [requestId, { projectId, entryId, expectedUpdatedAt: updatedAt, authorNote: '复盘备注' }],
      ],
      [
        JOURNAL_COMMANDS.updatePreferences,
        { projectId, schedule: 'daily' },
        'updatePreferences',
        [requestId, { projectId, schedule: 'daily' }],
      ],
      [
        JOURNAL_COMMANDS.catchUp,
        { projectId, now: '2026-08-15T00:00:00.000Z' },
        'catchUp',
        [requestId, { projectId, now: '2026-08-15T00:00:00.000Z' }],
      ],
      [
        JOURNAL_COMMANDS.markAiFailed,
        { projectId, entryId, generationRunId: runId },
        'markAiFailed',
        [requestId, { projectId, entryId, generationRunId: runId }],
      ],
    ] as const;

    for (const [name, input, method, expectedArgs] of cases) {
      const harness = createHarness();
      const result = await routeContentProjectOperation(
        harness.services,
        requestId,
        operation(name, input),
      );
      expect(result).toMatchObject({ ok: true, operation: name });
      const called = harness.journal[method];
      expect(called).toHaveBeenCalledOnce();
      expect(called).toHaveBeenCalledWith(...expectedArgs);
      if (name === JOURNAL_COMMANDS.preview) {
        expect(result).toEqual({ ok: true, operation: name, data: preview() });
      } else {
        expect(result).toEqual({ ok: true, operation: name, data: catalog() });
      }
    }
  });
});
