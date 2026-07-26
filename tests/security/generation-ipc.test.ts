import {
  GENERATION_COMMANDS,
  GENERATION_IPC_CHANNELS,
  PROTOCOL_VERSION,
  PROVIDER_CORE_OPERATIONS,
  type CoreGenerationOperation,
  type CoreGenerationResult,
  type CoreProviderOperation,
  type CoreProviderResult,
  type GenerationRun,
  type ProviderConfig,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import type { CoreSupervisor } from '../../apps/desktop/main/src/core-supervisor.js';
import type { CredentialBroker } from '../../apps/desktop/main/src/credential-broker.js';
import { registerGenerationIpc } from '../../apps/desktop/main/src/generation-ipc.js';
import type { PrivacyLogger } from '../../apps/desktop/main/src/privacy-logger.js';

const requestId = '550e8400-e29b-41d4-a716-446655440000';
const projectId = '550e8400-e29b-41d4-a716-446655440001';
const chapterId = '550e8400-e29b-41d4-a716-446655440002';
const draftId = '550e8400-e29b-41d4-a716-446655440003';
const runId = '550e8400-e29b-41d4-a716-446655440004';
const taskId = '550e8400-e29b-41d4-a716-446655440005';
const credentialRef = 'cred_550e8400-e29b-41d4-a716-446655440006';
const secret = 'generation-provider-secret';
const now = '2026-07-26T07:00:00.000Z';
const provider: ProviderConfig = {
  id: 'local-openai',
  name: '本地模型',
  protocol: 'openai_compatible',
  baseUrl: 'http://127.0.0.1:11434/v1',
  model: 'writer-model',
  credentialRef,
  timeoutMs: 30_000,
  options: {},
  createdAt: now,
  updatedAt: now,
};
const run: GenerationRun = {
  runId,
  requestId,
  taskId,
  projectId,
  chapterId,
  baseDraftId: draftId,
  baseDraftRevision: 0,
  runType: 'chapter',
  promptId: 'worldforge.chapter',
  promptVersion: 1,
  outputMode: 'text',
  providerId: provider.id,
  actualModel: provider.model,
  supportStatus: 'unverified',
  status: 'queued',
  stage: 'queued',
  retryCount: 0,
  inputTokens: null,
  outputTokens: null,
  errorCode: null,
  retryable: null,
  partialStatus: 'unavailable',
  resultRefs: [],
  createdAt: now,
  startedAt: null,
  finishedAt: null,
};

const trusted = {
  senderFrame: { url: 'file:///trusted/index.html' },
} as unknown as IpcMainInvokeEvent;
const untrusted = {
  senderFrame: { url: 'https://attacker.invalid' },
} as unknown as IpcMainInvokeEvent;

function startCommand() {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    sentAt: now,
    command: GENERATION_COMMANDS.start,
    payload: {
      projectId,
      chapterId,
      baseDraftId: draftId,
      baseDraftRevision: 0,
      providerId: provider.id,
      intent: {
        runType: 'chapter',
        source: { sourceType: 'direct_chapter_goal', chapterGoal: '推进调查' },
        targetLanguage: 'zh-CN',
        targetCharacters: 3_000,
        styleInstructions: [],
      },
    },
  };
}

function harness() {
  const handlers = new Map<string, (event: IpcMainInvokeEvent, raw: unknown) => unknown>();
  const ipcMain = {
    handle: vi.fn(
      (channel: string, handler: (event: IpcMainInvokeEvent, raw: unknown) => unknown) =>
        handlers.set(channel, handler),
    ),
    removeHandler: vi.fn(),
  } as unknown as IpcMain;
  const providerOperations: CoreProviderOperation[] = [];
  const generationOperations: CoreGenerationOperation[] = [];
  const invokeProviderOperation = vi.fn(
    async (_requestId: string, operation: CoreProviderOperation): Promise<CoreProviderResult> => {
      providerOperations.push(operation);
      if (operation.operation !== PROVIDER_CORE_OPERATIONS.get) {
        return { ok: false, operation: operation.operation, errorCode: 'COMMON_INVALID_INPUT_001' };
      }
      return { ok: true, operation: operation.operation, data: { provider } };
    },
  );
  const invokeGenerationOperation = vi.fn(
    async (
      _requestId: string,
      operation: CoreGenerationOperation,
    ): Promise<CoreGenerationResult> => {
      generationOperations.push(operation);
      if (operation.operation === GENERATION_COMMANDS.start) {
        return { ok: true, operation: operation.operation, data: { run, taskId } };
      }
      return { ok: false, operation: operation.operation, errorCode: 'AI_RUN_NOT_FOUND_011' };
    },
  );
  const credentialBroker = {
    resolveForProvider: vi.fn(async () => secret),
  } as unknown as CredentialBroker;
  const log = vi.fn(async () => undefined);
  registerGenerationIpc({
    ipcMain,
    supervisor: {
      invokeProviderOperation,
      invokeGenerationOperation,
    } as unknown as CoreSupervisor,
    credentialBroker,
    rendererUrl: 'file:///trusted/index.html',
    logger: { log } as unknown as PrivacyLogger,
  });
  return {
    handlers,
    providerOperations,
    generationOperations,
    invokeProviderOperation,
    invokeGenerationOperation,
    credentialBroker,
    log,
  };
}

describe('M4-04 Generation IPC security boundary', () => {
  it('rejects untrusted and malformed requests before Core or credential access', async () => {
    const subject = harness();
    const handler = subject.handlers.get(GENERATION_IPC_CHANNELS.start);
    await expect(handler?.(untrusted, startCommand())).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INVALID_INPUT_001' },
    });
    await expect(handler?.(trusted, { ...startCommand(), extra: secret })).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INVALID_INPUT_001' },
    });
    expect(subject.invokeProviderOperation).not.toHaveBeenCalled();
    expect(subject.credentialBroker.resolveForProvider).not.toHaveBeenCalled();
    expect(subject.invokeGenerationOperation).not.toHaveBeenCalled();
  });

  it('resolves an owner-checked credential only in Main and never returns or logs it', async () => {
    const subject = harness();
    const result = await subject.handlers.get(GENERATION_IPC_CHANNELS.start)?.(
      trusted,
      startCommand(),
    );
    expect(subject.credentialBroker.resolveForProvider).toHaveBeenCalledWith(
      provider.id,
      credentialRef,
    );
    expect(subject.generationOperations[0]).toMatchObject({
      operation: GENERATION_COMMANDS.start,
      provider: { id: provider.id },
      credential: secret,
    });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain(credentialRef);
    expect(JSON.stringify(subject.log.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(subject.log.mock.calls)).not.toContain(credentialRef);
  });
});
