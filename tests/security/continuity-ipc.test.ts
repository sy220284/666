import { randomUUID } from 'node:crypto';

import {
  CONTINUITY_COMMANDS,
  CONTINUITY_IPC_CHANNELS,
  type CoreProjectOperation,
  type CoreProjectResult,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import { registerContinuityIpc } from '../../apps/desktop/main/src/continuity-ipc.js';
import type { CoreSupervisor } from '../../apps/desktop/main/src/core-supervisor.js';

describe('M3-04 continuity IPC boundary', () => {
  it('registers named channels, rejects untrusted input, and forwards validated commands only', async () => {
    const handlers = new Map<
      string,
      (event: IpcMainInvokeEvent, raw: unknown) => Promise<unknown> | unknown
    >();
    const ipcMain = {
      handle: vi.fn(
        (
          channel: string,
          handler: (event: IpcMainInvokeEvent, raw: unknown) => Promise<unknown> | unknown,
        ) => handlers.set(channel, handler),
      ),
      removeHandler: vi.fn(),
    } as unknown as IpcMain;
    const projectId = randomUUID();
    const invokeProjectOperation = vi.fn(
      async (_requestId: string, operation: CoreProjectOperation): Promise<CoreProjectResult> => ({
        ok: true,
        operation: operation.operation as typeof CONTINUITY_COMMANDS.list,
        data: {
          projectId,
          entityStates: [],
          timelineEvents: [],
          knowledgeStates: [],
        },
      }),
    );
    const unregister = registerContinuityIpc({
      ipcMain,
      supervisor: { invokeProjectOperation } as unknown as CoreSupervisor,
      rendererUrl: 'file:///trusted/index.html',
    });

    expect([...handlers.keys()].sort()).toEqual(Object.values(CONTINUITY_IPC_CHANNELS).sort());
    const listHandler = handlers.get(CONTINUITY_IPC_CHANNELS.list);
    const requestId = randomUUID();
    const command = {
      protocolVersion: 1,
      requestId,
      sentAt: new Date().toISOString(),
      command: CONTINUITY_COMMANDS.list,
      payload: {
        projectId,
        query: '',
        includeHistory: true,
        includeArchivedEvents: false,
        effectiveAtChapterId: null,
      },
    };

    await expect(
      listHandler?.(
        { senderFrame: { url: 'https://attacker.invalid' } } as unknown as IpcMainInvokeEvent,
        command,
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'COMMON_INVALID_INPUT_001' } });
    await expect(
      listHandler?.(
        { senderFrame: { url: 'file:///trusted/index.html' } } as unknown as IpcMainInvokeEvent,
        { ...command, payload: { projectId: '../escape' } },
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'COMMON_INVALID_INPUT_001' } });
    expect(invokeProjectOperation).not.toHaveBeenCalled();

    await expect(
      listHandler?.(
        { senderFrame: { url: 'file:///trusted/index.html' } } as unknown as IpcMainInvokeEvent,
        command,
      ),
    ).resolves.toEqual({
      ok: true,
      requestId,
      data: {
        projectId,
        entityStates: [],
        timelineEvents: [],
        knowledgeStates: [],
      },
    });
    expect(invokeProjectOperation).toHaveBeenCalledWith(requestId, {
      operation: CONTINUITY_COMMANDS.list,
      input: command.payload,
    });

    unregister();
    expect(ipcMain.removeHandler).toHaveBeenCalledTimes(7);
  });
});
