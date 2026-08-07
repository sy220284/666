import { describe, expect, it, vi } from 'vitest';

import type { CoreStatus, DraftDocument } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { startGenerationTask } from '../../apps/desktop/renderer/src/features/writing/generation-start.js';
import { deriveCapabilityMatrix } from '../../apps/desktop/renderer/src/runtime/capability-matrix.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

type StartInput = Parameters<typeof startGenerationTask>[0];

const healthyCore: CoreStatus = {
  status: 'healthy',
  pid: 1,
  restartCount: 0,
  lastErrorCode: null,
  diagnosticId: null,
};

const success = <Data>(data: Data) => ({ state: 'success' as const, data });

function draft(revision: number): DraftDocument {
  return contractInput<DraftDocument>({
    draftId: '00000000-0000-4000-8000-000000000010',
    chapterId: '00000000-0000-4000-8000-000000000020',
    revision,
    blocks: [],
  });
}

function generationInput(bridge: RendererBridgeAdapter, initialDraft: DraftDocument): StartInput {
  return contractInput<StartInput>({
    bridge,
    projectId: '00000000-0000-4000-8000-000000000001',
    chapterId: initialDraft.chapterId,
    commandPrefix: `writing:00000000-0000-4000-8000-000000000001:${initialDraft.chapterId}:`,
    draft: initialDraft,
    providerId: '00000000-0000-4000-8000-000000000030',
    readOnly: false,
    flush: async () => true,
    generationMode: 'chapter',
    chapterSource: 'direct_chapter_goal',
    chapterGoal: '推进冲突',
    tendency: '',
    generationInstruction: '',
    targetCharacters: 2_000,
    candidateCount: 3,
    sceneBeats: [],
    selectedSkeletonId: '',
    acknowledgeStaleSkeleton: false,
    mergeMappingMode: 'segment',
    mergeCandidateIds: new Set<string>(),
    mergeBeatSources: {},
    getRewriteSelectionAnchor: async () => null,
    continuationOfRunId: null,
    intentOverride: null,
    setPending: () => undefined,
    setStatus: () => undefined,
    setLastIntent: () => undefined,
    onStarted: () => undefined,
  });
}

describe('M10-15 AI generation preflight', () => {
  it('allows risk-acknowledged generation when a provider exists without session verification', () => {
    const unverified = deriveCapabilityMatrix({
      hydrated: true,
      coreStatus: healthyCore,
      project: null,
      providerCount: 1,
      verifiedProviderCount: 0,
    });
    expect(unverified.application.generationAvailable).toBe(true);

    const unavailable = deriveCapabilityMatrix({
      hydrated: true,
      coreStatus: healthyCore,
      project: null,
      providerCount: 0,
      verifiedProviderCount: 0,
    });
    expect(unavailable.application.generationAvailable).toBe(false);

    const degraded = deriveCapabilityMatrix({
      hydrated: true,
      coreStatus: { ...healthyCore, status: 'degraded' },
      project: null,
      providerCount: 1,
      verifiedProviderCount: 1,
    });
    expect(degraded.application.generationAvailable).toBe(false);
  });

  it('reopens the authoritative draft after flush and starts from the latest revision', async () => {
    const initialDraft = draft(7);
    const authoritativeDraft = draft(8);
    const flush = vi.fn(async () => true);
    const open = vi.fn(async () => success(authoritativeDraft));
    const start = vi.fn(async () =>
      success({ run: { stage: 'queued', runId: 'run-a' }, taskId: 'task-a' }),
    );
    const bridge = contractInput<RendererBridgeAdapter>({
      draft: { open },
      generation: { start },
    });
    const input = generationInput(bridge, initialDraft);

    await startGenerationTask({ ...input, flush });

    expect(flush).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith({
      projectId: input.projectId,
      chapterId: input.chapterId,
    });
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        baseDraftId: authoritativeDraft.draftId,
        baseDraftRevision: authoritativeDraft.revision,
      }),
    );
    expect(flush.mock.invocationCallOrder[0]).toBeLessThan(open.mock.invocationCallOrder[0]!);
    expect(open.mock.invocationCallOrder[0]).toBeLessThan(start.mock.invocationCallOrder[0]!);
  });

  it('does not start generation when the authoritative draft cannot be reopened', async () => {
    const initialDraft = draft(7);
    const start = vi.fn();
    const bridge = contractInput<RendererBridgeAdapter>({
      draft: {
        open: async () => ({
          state: 'failure' as const,
          error: { code: 'DATABASE_READ_FAILED', message: 'draft unavailable' },
        }),
      },
      generation: { start },
    });

    await startGenerationTask(generationInput(bridge, initialDraft));

    expect(start).not.toHaveBeenCalled();
  });
});
