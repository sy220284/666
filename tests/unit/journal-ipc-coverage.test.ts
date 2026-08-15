import { describe, expect, it, vi } from 'vitest';

import {
  JOURNAL_COMMANDS,
  JOURNAL_IPC_CHANNELS,
  TASK_PROTOCOL_VERSION,
  type JournalCatalog,
  type JournalPreview,
} from '@worldforge/contracts';
import { registerJournalIpc } from '../../apps/desktop/main/src/journal-ipc.js';
import { contractInput, strictTestDouble } from '../testkit/strict-test-doubles.js';

const requestId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const rendererUrl = 'file:///renderer.html';
const periodStart = '2026-08-14T00:00:00.000Z';
const periodEnd = '2026-08-15T00:00:00.000Z';
const updatedAt = '2026-08-15T01:00:00.000Z';

type JournalOptions = Parameters<typeof registerJournalIpc>[0];
type RegisteredHandler = (event: unknown, raw: unknown) => Promise<unknown> | unknown;

const trustedEvent = { senderFrame: { url: rendererUrl } };
const untrustedEvent = { senderFrame: { url: 'https://evil.example' } };

function deterministicSummary() {
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
    deterministicSummary: deterministicSummary(),
  });
}

function envelope(command: string, payload: unknown): Record<string, unknown> {
  return {
    protocolVersion: TASK_PROTOCOL_VERSION,
    requestId,
    command,
    payload,
    sentAt: '2026-08-15T00:00:00.000Z',
  };
}

function createHarness() {
  const handlers = new Map<string, RegisteredHandler>();
  const removed: string[] = [];
  const ipcMainMembers = {
    handle: vi.fn((channel: string, handler: RegisteredHandler) => {
      handlers.set(channel, handler);
    }),
    removeHandler: vi.fn((channel: string) => {
      removed.push(channel);
    }),
  };
  const invokeProjectOperation = vi.fn();
  const unregister = registerJournalIpc({
    ipcMain: strictTestDouble(
      'IpcMain',
      contractInput<Partial<JournalOptions['ipcMain']>>(ipcMainMembers),
    ),
    supervisor: strictTestDouble(
      'CoreSupervisor',
      contractInput<Partial<JournalOptions['supervisor']>>({ invokeProjectOperation }),
    ),
    rendererUrl,
  });
  return { handlers, removed, invokeProjectOperation, unregister };
}

async function call(
  harness: ReturnType<typeof createHarness>,
  channel: string,
  raw: unknown,
  event: unknown = trustedEvent,
): Promise<unknown> {
  const handler = harness.handlers.get(channel);
  expect(handler, `missing journal handler for ${channel}`).toBeTypeOf('function');
  return await handler?.(event, raw);
}

describe('M12-01 Journal IPC boundary coverage', () => {
  it('covers catalog validation, trust, core failure and success paths', async () => {
    const harness = createHarness();
    const listCommand = envelope(JOURNAL_COMMANDS.list, {
      projectId,
      limit: 30,
      before: null,
    });

    await expect(call(harness, JOURNAL_IPC_CHANNELS.list, {})).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INVALID_INPUT_001' },
    });
    await expect(
      call(harness, JOURNAL_IPC_CHANNELS.list, listCommand, untrustedEvent),
    ).resolves.toMatchObject({
      ok: false,
      requestId,
      error: { code: 'COMMON_INVALID_INPUT_001' },
    });
    expect(harness.invokeProjectOperation).not.toHaveBeenCalled();

    harness.invokeProjectOperation.mockResolvedValueOnce({
      ok: false,
      operation: JOURNAL_COMMANDS.list,
      errorCode: 'COMMON_NOT_FOUND_002',
    });
    await expect(call(harness, JOURNAL_IPC_CHANNELS.list, listCommand)).resolves.toMatchObject({
      ok: false,
      requestId,
      error: { code: 'COMMON_NOT_FOUND_002' },
    });

    harness.invokeProjectOperation.mockResolvedValueOnce({
      ok: true,
      operation: JOURNAL_COMMANDS.list,
      data: catalog(),
    });
    await expect(call(harness, JOURNAL_IPC_CHANNELS.list, listCommand)).resolves.toEqual({
      ok: true,
      requestId,
      data: catalog(),
    });
    expect(harness.invokeProjectOperation).toHaveBeenLastCalledWith(requestId, {
      operation: JOURNAL_COMMANDS.list,
      input: { projectId, limit: 30, before: null },
    });
  });

  it('covers preview validation, trust, core failure and success paths', async () => {
    const harness = createHarness();
    const previewCommand = envelope(JOURNAL_COMMANDS.preview, {
      projectId,
      periodType: 'manual',
      periodStart,
      periodEnd,
    });

    await expect(call(harness, JOURNAL_IPC_CHANNELS.preview, null)).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INVALID_INPUT_001' },
    });
    await expect(
      call(harness, JOURNAL_IPC_CHANNELS.preview, previewCommand, untrustedEvent),
    ).resolves.toMatchObject({
      ok: false,
      requestId,
      error: { code: 'COMMON_INVALID_INPUT_001' },
    });

    harness.invokeProjectOperation.mockResolvedValueOnce({
      ok: false,
      operation: JOURNAL_COMMANDS.preview,
      errorCode: 'COMMON_INTERNAL_999',
    });
    await expect(
      call(harness, JOURNAL_IPC_CHANNELS.preview, previewCommand),
    ).resolves.toMatchObject({
      ok: false,
      requestId,
      error: { code: 'COMMON_INTERNAL_999' },
    });

    harness.invokeProjectOperation.mockResolvedValueOnce({
      ok: true,
      operation: JOURNAL_COMMANDS.preview,
      data: preview(),
    });
    await expect(call(harness, JOURNAL_IPC_CHANNELS.preview, previewCommand)).resolves.toEqual({
      ok: true,
      requestId,
      data: preview(),
    });
    expect(harness.invokeProjectOperation).toHaveBeenLastCalledWith(requestId, {
      operation: JOURNAL_COMMANDS.preview,
      input: { projectId, periodType: 'manual', periodStart, periodEnd },
    });
  });

  it('registers and removes the complete Journal IPC surface symmetrically', () => {
    const harness = createHarness();
    expect([...harness.handlers.keys()].sort()).toEqual(Object.values(JOURNAL_IPC_CHANNELS).sort());
    harness.unregister();
    expect(harness.removed.sort()).toEqual(Object.values(JOURNAL_IPC_CHANNELS).sort());
  });
});
