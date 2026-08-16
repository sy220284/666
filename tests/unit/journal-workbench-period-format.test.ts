import { createRequire } from 'node:module';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JournalCatalog, JournalEntry } from '@worldforge/contracts';
import type { createElement as createReactElement, ReactElement } from 'react';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { JournalWorkbench } from '../../apps/desktop/renderer/src/features/journal/journal-workbench.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const rendererRequire = createRequire(
  new URL('../../apps/desktop/renderer/package.json', import.meta.url),
);
const { createElement } = rendererRequire('react') as {
  readonly createElement: typeof createReactElement;
};

interface TestRenderer {
  toJSON(): unknown;
  unmount(): void;
}

const { act, create } = rendererRequire('react-test-renderer') as {
  readonly act: (callback: () => void | Promise<void>) => Promise<void>;
  readonly create: (element: ReactElement) => TestRenderer;
};

const projectId = '11111111-1111-4111-8111-111111111111';
const entryId = '22222222-2222-4222-8222-222222222222';
const periodStart = '2026-08-10T00:00:00.000Z';
const periodEnd = '2026-08-17T00:00:00.000Z';
const updatedAt = '2026-08-16T01:00:00.000Z';

function weeklyEntry(): JournalEntry {
  return contractInput({
    id: entryId,
    projectId,
    periodType: 'weekly',
    periodStart,
    periodEnd,
    sourceRevision: 1,
    sourceHash: 'a'.repeat(64),
    deterministicSummary: {
      periodStart,
      periodEnd,
      writing: { sessions: 1, netCharacters: 1200, activeSeconds: 600, touchedChapters: 1 },
      versions: { created: 1, finalized: 1 },
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
    },
    aiSummary: null,
    authorNote: null,
    generationRunId: null,
    status: 'deterministic',
    createdAt: periodEnd,
    updatedAt,
  });
}

function weeklyCatalog(): JournalCatalog {
  return contractInput({
    projectId,
    entries: [weeklyEntry()],
    preferences: { projectId, schedule: 'weekly', updatedAt },
    nextCursor: null,
  });
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('JournalWorkbench 周期文案覆盖', () => {
  it('将 weekly 日志显示为每周复盘', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const catalog = weeklyCatalog();
    vi.stubGlobal('window', {
      worldforgeJournal: {
        catchUp: vi.fn().mockResolvedValue({ ok: true, data: catalog }),
      },
    });
    const bridge = contractInput<RendererBridgeAdapter>({
      providers: {
        list: vi.fn().mockResolvedValue({ state: 'success', data: { providers: [] } }),
      },
      generation: {
        start: vi.fn(),
        getRun: vi.fn(),
      },
    });

    let renderer!: TestRenderer;
    await act(async () => {
      renderer = create(
        createElement(JournalWorkbench, {
          bridge,
          projectId,
          readOnly: false,
          onNavigate: vi.fn(),
        }),
      );
      await flushPromises();
    });

    expect(JSON.stringify(renderer.toJSON())).toContain('每周');
    await act(async () => renderer.unmount());
  });
});
