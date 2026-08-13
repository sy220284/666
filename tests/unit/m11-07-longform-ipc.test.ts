import { describe, expect, it, vi } from 'vitest';

import {
  LONGFORM_AI_COMMANDS,
  LONGFORM_AI_IPC_CHANNELS,
  type CoreProjectOperation,
  type CoreProjectResult,
} from '@worldforge/contracts';
import { registerLongformAiIpc } from '../../apps/desktop/main/src/longform-ai-ipc.js';
import type { CoreSupervisor } from '../../apps/desktop/main/src/core-supervisor.js';
import type { IpcMain } from 'electron';
import { contractInput } from '../testkit/strict-test-doubles.js';

const projectId = '5a198db8-5a43-45ea-b777-7dfb63742bb7';
const requestId = '1297f55c-68b9-4a09-bf74-c3ba6cb4a2af';
const sentAt = '2026-08-13T00:00:00.000Z';
const settings = {
  schemaVersion: 1 as const,
  activeStyleProfileId: null,
  styleProfiles: [],
  taskRoutes: [],
  updatedAt: null,
};

type Handler = (event: unknown, raw: unknown) => Promise<unknown>;

describe('M11-07 long-form IPC', () => {
  it('registers six guarded handlers and maps successful Core results', async () => {
    const handlers = new Map<string, Handler>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: Handler) => handlers.set(channel, handler)),
      removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
    };
    const invokeProjectOperation = vi.fn(
      async (_requestId: string, operation: CoreProjectOperation): Promise<CoreProjectResult> =>
        successFor(operation),
    );
    const unregister = registerLongformAiIpc({
      ipcMain: contractInput<IpcMain>(ipcMain),
      supervisor: { invokeProjectOperation } as unknown as CoreSupervisor,
      rendererUrl: 'file:///renderer',
    });
    expect(ipcMain.handle).toHaveBeenCalledTimes(6);

    const event = { senderFrame: { url: 'file:///renderer' } };
    const commands = [
      [LONGFORM_AI_IPC_CHANNELS.getSettings, LONGFORM_AI_COMMANDS.getSettings, { projectId }],
      [
        LONGFORM_AI_IPC_CHANNELS.updateSettings,
        LONGFORM_AI_COMMANDS.updateSettings,
        {
          projectId,
          authority: 'author',
          expectedUpdatedAt: null,
          settings: {
            schemaVersion: 1,
            activeStyleProfileId: null,
            styleProfiles: [],
            taskRoutes: [],
          },
        },
      ],
      [
        LONGFORM_AI_IPC_CHANNELS.listDigests,
        LONGFORM_AI_COMMANDS.listDigests,
        { projectId, scopeType: null, scopeId: null, freshness: null, limit: 20 },
      ],
      [
        LONGFORM_AI_IPC_CHANNELS.rebuildDigests,
        LONGFORM_AI_COMMANDS.rebuildDigests,
        { projectId, scopeType: 'project', scopeId: projectId },
      ],
      [
        LONGFORM_AI_IPC_CHANNELS.evaluateStyle,
        LONGFORM_AI_COMMANDS.evaluateStyle,
        {
          projectId,
          profileId: 'b68de1fd-cb0b-49c9-aa1a-d87ee694aee4',
          versionId: '14c75ab9-cff0-4e04-8d10-2613247773ec',
        },
      ],
      [
        LONGFORM_AI_IPC_CHANNELS.resolveTaskRoute,
        LONGFORM_AI_COMMANDS.resolveTaskRoute,
        {
          projectId,
          taskType: 'chapter',
          candidates: [
            { providerId: 'local-model', model: 'writer-7b', credentialConfigured: true },
          ],
        },
      ],
    ] as const;

    for (const [channel, command, payload] of commands) {
      const result = await handlers.get(channel)!(event, {
        protocolVersion: 1,
        requestId,
        sentAt,
        command,
        payload,
      });
      expect(result).toMatchObject({ ok: true, requestId });
    }
    expect(invokeProjectOperation).toHaveBeenCalledTimes(6);

    unregister();
    expect(ipcMain.removeHandler).toHaveBeenCalledTimes(6);
    expect(handlers.size).toBe(0);
  });

  it('rejects malformed/untrusted requests and explains Core failures', async () => {
    const handlers = new Map<string, Handler>();
    const invokeProjectOperation = vi.fn(async () => ({
      ok: false as const,
      operation: LONGFORM_AI_COMMANDS.getSettings,
      errorCode: 'COMMON_INTERNAL_999' as const,
    }));
    registerLongformAiIpc({
      ipcMain: contractInput<IpcMain>({
        handle: (channel: string, handler: Handler) => handlers.set(channel, handler),
        removeHandler: vi.fn(),
      }),
      supervisor: { invokeProjectOperation } as unknown as CoreSupervisor,
      rendererUrl: 'file:///renderer',
    });
    const handler = handlers.get(LONGFORM_AI_IPC_CHANNELS.getSettings)!;

    await expect(handler({ senderFrame: { url: 'file:///renderer' } }, {})).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INVALID_INPUT_001', retryable: false },
    });
    await expect(
      handler(
        { senderFrame: { url: 'https://untrusted.example' } },
        envelope(LONGFORM_AI_COMMANDS.getSettings, { projectId }),
      ),
    ).resolves.toMatchObject({
      ok: false,
      requestId,
      error: { code: 'COMMON_INVALID_INPUT_001' },
    });
    await expect(
      handler(
        { senderFrame: { url: 'file:///renderer' } },
        envelope(LONGFORM_AI_COMMANDS.getSettings, { projectId }),
      ),
    ).resolves.toMatchObject({
      ok: false,
      requestId,
      error: { code: 'COMMON_INTERNAL_999', retryable: true },
    });
  });
});

function envelope(command: string, payload: unknown) {
  return { protocolVersion: 1, requestId, sentAt, command, payload };
}

function successFor(operation: CoreProjectOperation): CoreProjectResult {
  if (operation.operation === LONGFORM_AI_COMMANDS.getSettings)
    return { ok: true, operation: operation.operation, data: settings };
  if (operation.operation === LONGFORM_AI_COMMANDS.updateSettings)
    return { ok: true, operation: operation.operation, data: settings };
  if (operation.operation === LONGFORM_AI_COMMANDS.listDigests)
    return {
      ok: true,
      operation: operation.operation,
      data: { projectId, digests: [] },
    };
  if (operation.operation === LONGFORM_AI_COMMANDS.rebuildDigests)
    return {
      ok: true,
      operation: operation.operation,
      data: {
        projectId,
        requestedScopeType: 'project',
        requestedScopeId: projectId,
        rebuilt: [],
        skippedUnfinalizedChapters: 0,
      },
    };
  if (operation.operation === LONGFORM_AI_COMMANDS.evaluateStyle)
    return {
      ok: true,
      operation: operation.operation,
      data: {
        projectId,
        profileId: 'b68de1fd-cb0b-49c9-aa1a-d87ee694aee4',
        versionId: '14c75ab9-cff0-4e04-8d10-2613247773ec',
        status: 'insufficient_samples',
        measured: {
          averageSentenceCharacters: 18,
          averageParagraphCharacters: 60,
          dialogueRatio: 0.2,
        },
        target: null,
        deviations: [],
      },
    };
  return {
    ok: true,
    operation: LONGFORM_AI_COMMANDS.resolveTaskRoute,
    data: {
      projectId,
      taskType: 'chapter',
      providerId: 'local-model',
      model: 'writer-7b',
      selection: 'default',
      support: 'verified',
      rejectedProviderIds: [],
    },
  };
}
