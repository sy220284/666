import {
  GENERATION_COMMANDS,
  GENERATION_IPC_CHANNELS,
  PROTOCOL_VERSION,
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
const blockId = '550e8400-e29b-41d4-a716-446655440004';
const now = '2026-08-06T06:00:00.000Z';

function command() {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    sentAt: now,
    command: GENERATION_COMMANDS.start,
    payload: {
      projectId,
      chapterId,
      baseDraftId: draftId,
      baseDraftRevision: 1,
      providerId: 'local-openai',
      intent: {
        runType: 'rewrite',
        scope: {
          scopeType: 'blocks',
          logicalBlockIds: [blockId, blockId],
          expectedBlockHashes: ['a'.repeat(64), 'a'.repeat(64)],
        },
        instruction: '保持情节不变，压缩重复表达。',
        targetLanguage: 'zh-CN',
      },
    },
  };
}

describe('M10-13 Generation rewrite contract', () => {
  it('rejects duplicate logicalBlockIds before provider and credential access', async () => {
    const handlers = new Map<string, (event: IpcMainInvokeEvent, raw: unknown) => unknown>();
    const ipcMain = {
      handle: vi.fn(
        (channel: string, handler: (event: IpcMainInvokeEvent, raw: unknown) => unknown) =>
          handlers.set(channel, handler),
      ),
      removeHandler: vi.fn(),
    } as unknown as IpcMain;
    const invokeProviderOperation = vi.fn();
    const invokeGenerationOperation = vi.fn();
    const resolveForProvider = vi.fn();
    registerGenerationIpc({
      ipcMain,
      supervisor: {
        invokeProviderOperation,
        invokeGenerationOperation,
      } as unknown as CoreSupervisor,
      credentialBroker: { resolveForProvider } as unknown as CredentialBroker,
      rendererUrl: 'file:///trusted/index.html',
      logger: { log: vi.fn(async () => undefined) } as unknown as PrivacyLogger,
    });

    const result = await handlers.get(GENERATION_IPC_CHANNELS.start)?.(
      {
        senderFrame: { url: 'file:///trusted/index.html' },
      } as unknown as IpcMainInvokeEvent,
      command(),
    );

    expect(result).toMatchObject({
      ok: false,
      requestId,
      error: { code: 'COMMON_INVALID_INPUT_001' },
    });
    expect(invokeProviderOperation).not.toHaveBeenCalled();
    expect(resolveForProvider).not.toHaveBeenCalled();
    expect(invokeGenerationOperation).not.toHaveBeenCalled();
  });
});
