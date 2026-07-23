import {
  CANDIDATE_COMMANDS,
  CANDIDATE_IPC_CHANNELS,
  CandidateCreateFixtureCommandSchema,
  CandidateDiscardCommandSchema,
  PROTOCOL_VERSION,
  type CandidateDocument,
  type CoreProjectOperation,
  type CoreProjectResult,
  type WindowPreferences,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import type { CoreSupervisor } from '../../apps/desktop/main/src/core-supervisor.js';
import type { CredentialBroker } from '../../apps/desktop/main/src/credential-broker.js';
import { registerIpcHandlers } from '../../apps/desktop/main/src/ipc-handlers.js';
import type { PrivacyLogger } from '../../apps/desktop/main/src/privacy-logger.js';

const requestId = '550e8400-e29b-41d4-a716-446655440000';
const projectId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const chapterId = '931b82aa-9c6f-4fc8-b7fd-2d201ceaa95d';
const draftId = '48ee4f14-d049-401a-8f21-991c769b1b86';
const candidateId = 'd60c2f63-7f2c-4605-bf2d-bf8cd433bca6';
const candidateBlockId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const logicalBlockId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const contentHash = '1'.repeat(64);
const sentAt = '2026-07-17T12:30:00.000Z';

const command = {
  protocolVersion: PROTOCOL_VERSION,
  requestId,
  sentAt,
  command: CANDIDATE_COMMANDS.createFixtureCandidate,
  payload: {
    projectId,
    chapterId,
    draftId,
    baseDraftRevision: 0,
    candidateType: 'rewrite',
    completeness: 'partial',
    title: '严格候选',
    blocks: [
      {
        logicalBlockId,
        blockType: 'paragraph',
        text: '候选正文',
        attributes: {},
        sourceBlockHash: contentHash,
      },
    ],
  },
} as const;

const discardCommand = {
  protocolVersion: PROTOCOL_VERSION,
  requestId,
  sentAt,
  command: CANDIDATE_COMMANDS.discardCandidate,
  payload: { projectId, chapterId, candidateId },
} as const;

const candidate: CandidateDocument = {
  candidateId,
  projectId,
  chapterId,
  generationRunId: null,
  candidateType: 'rewrite',
  baseDraftId: draftId,
  baseDraftRevision: 0,
  completeness: 'partial',
  status: 'pending',
  title: '严格候选',
  sourceVersionId: null,
  contentHash: '2'.repeat(64),
  blockCount: 1,
  createdAt: sentAt,
  resolvedAt: null,
  blocks: [
    {
      candidateBlockId,
      logicalBlockId,
      orderKey: '1024',
      blockType: 'paragraph',
      text: '候选正文',
      attributes: {},
      beatId: null,
      sourceBlockHash: contentHash,
      contentHash: '3'.repeat(64),
    },
  ],
};

const preferences: WindowPreferences = {
  displayId: 'display-1',
  boundsDip: { x: 0, y: 0, width: 1_280, height: 800 },
  scaleFactor: 1,
  maximized: false,
  workspaceAlignment: 'center',
  uiScalePercent: 100,
  bodyFontSize: 18,
  contentWidth: 'normal',
};

function registerCandidateHandler(enableTestFixtures = true) {
  const handlers = new Map<string, (event: IpcMainInvokeEvent, raw: unknown) => unknown>();
  const ipcMain = {
    handle: vi.fn(
      (channel: string, handler: (event: IpcMainInvokeEvent, raw: unknown) => unknown) => {
        handlers.set(channel, handler);
      },
    ),
    removeHandler: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  } as unknown as IpcMain;
  const invokeProjectOperation = vi.fn(
    async (_id: string, operation: CoreProjectOperation): Promise<CoreProjectResult> => {
      if (operation.operation === CANDIDATE_COMMANDS.discardCandidate) {
        const { blocks: _blocks, ...summary } = candidate;
        return {
          ok: true,
          operation: CANDIDATE_COMMANDS.discardCandidate,
          data: { ...summary, status: 'discarded', resolvedAt: sentAt },
        };
      }
      return {
        ok: true,
        operation: CANDIDATE_COMMANDS.createFixtureCandidate,
        data: candidate,
      };
    },
  );
  registerIpcHandlers({
    ipcMain,
    supervisor: {
      getStatus: vi.fn(),
      restart: vi.fn(),
      invokeTaskCommand: vi.fn(),
      invokeAppDataOperation: vi.fn(),
      invokeProjectOperation,
      attachTaskPort: vi.fn(() => ({ ok: true })),
    } as unknown as CoreSupervisor,
    credentialBroker: {
      store: vi.fn(),
      remove: vi.fn(),
      has: vi.fn(),
    } as unknown as CredentialBroker,
    rendererUrl: 'file:///trusted/index.html',
    version: '0.1.0',
    platform: 'test',
    enableTestFixtures,
    logger: { log: vi.fn() } as unknown as PrivacyLogger,
    getWindowPreferences: () => preferences,
    setAppearancePreferences: vi.fn(async () => preferences),
    chooseRecentLocation: vi.fn(async () => null),
    chooseProjectCreateParent: vi.fn(async () => null),
    chooseProjectToOpen: vi.fn(async () => null),
    chooseProjectMoveParent: vi.fn(async () => null),
    chooseRecoveryRestoreParent: vi.fn(async () => null),
    chooseRecoveryExportDirectory: vi.fn(async () => null),
    chooseTextImportFile: vi.fn(async () => null),
    chooseTextExportDirectory: vi.fn(async () => null),
  });
  return { handlers, invokeProjectOperation };
}

describe('Candidate IPC authority boundary', () => {
  it('does not register the fixture command in the production/default boundary', () => {
    const { handlers } = registerCandidateHandler(false);
    expect(handlers.has(CANDIDATE_IPC_CHANNELS.createFixtureCandidate)).toBe(false);
    expect(handlers.has(CANDIDATE_IPC_CHANNELS.listCandidates)).toBe(true);
  });

  it('rejects renderer-supplied status and provenance authority fields', () => {
    expect(CandidateCreateFixtureCommandSchema.safeParse(command).success).toBe(true);
    for (const authority of [
      { status: 'accepted' },
      { generationRunId: candidateId },
      { resolvedAt: sentAt },
      { contentHash },
    ]) {
      expect(
        CandidateCreateFixtureCommandSchema.safeParse({
          ...command,
          payload: { ...command.payload, ...authority },
        }).success,
      ).toBe(false);
    }
    expect(CandidateDiscardCommandSchema.safeParse(discardCommand).success).toBe(true);
    expect(
      CandidateDiscardCommandSchema.safeParse({
        ...discardCommand,
        payload: { ...discardCommand.payload, status: 'discarded' },
      }).success,
    ).toBe(false);
  });

  it('validates sender origin and strict schema before forwarding to Core', async () => {
    const { handlers, invokeProjectOperation } = registerCandidateHandler();
    const handler = handlers.get(CANDIDATE_IPC_CHANNELS.createFixtureCandidate);

    await expect(
      handler?.(
        { senderFrame: { url: 'https://attacker.invalid' } } as unknown as IpcMainInvokeEvent,
        command,
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'COMMON_INVALID_INPUT_001' } });
    expect(invokeProjectOperation).not.toHaveBeenCalled();

    await expect(
      handler?.(
        { senderFrame: { url: 'file:///trusted/index.html' } } as unknown as IpcMainInvokeEvent,
        { ...command, payload: { ...command.payload, status: 'accepted' } },
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'COMMON_INVALID_INPUT_001' } });
    expect(invokeProjectOperation).not.toHaveBeenCalled();

    await expect(
      handler?.(
        { senderFrame: { url: 'file:///trusted/index.html' } } as unknown as IpcMainInvokeEvent,
        command,
      ),
    ).resolves.toEqual({ ok: true, requestId, data: candidate });
    expect(invokeProjectOperation).toHaveBeenCalledWith(requestId, {
      operation: CANDIDATE_COMMANDS.createFixtureCandidate,
      input: command.payload,
    });

    const discardHandler = handlers.get(CANDIDATE_IPC_CHANNELS.discardCandidate);
    await expect(
      discardHandler?.(
        { senderFrame: { url: 'file:///trusted/index.html' } } as unknown as IpcMainInvokeEvent,
        discardCommand,
      ),
    ).resolves.toMatchObject({
      ok: true,
      requestId,
      data: { candidateId, status: 'discarded' },
    });
    expect(invokeProjectOperation).toHaveBeenLastCalledWith(requestId, {
      operation: CANDIDATE_COMMANDS.discardCandidate,
      input: discardCommand.payload,
    });
  });
});
