import { randomUUID } from 'node:crypto';

import {
  STATE_PROPOSAL_COMMANDS,
  STATE_PROPOSAL_IPC_CHANNELS,
  type CoreProjectOperation,
  type CoreProjectResult,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import type { CoreSupervisor } from '../../apps/desktop/main/src/core-supervisor.js';
import { registerNarrativePlanningIpc } from '../../apps/desktop/main/src/narrative-planning-ipc.js';

const trustedEvent = {
  senderFrame: { url: 'file:///trusted/index.html' },
} as unknown as IpcMainInvokeEvent;
const untrustedEvent = {
  senderFrame: { url: 'https://attacker.invalid' },
} as unknown as IpcMainInvokeEvent;

function emptyContent() {
  return {
    entityStates: [],
    knowledgeStates: [],
    foreshadowings: [],
    arcMilestones: [],
  };
}

describe('M3-06 state proposal IPC boundary', () => {
  it('rejects untrusted or malformed commands and forwards six strictly named operations', async () => {
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
    const chapterId = randomUUID();
    const versionId = randomUUID();
    const proposalId = randomUUID();
    const snapshotId = randomUUID();
    const createdAt = '2026-07-21T01:45:00.000Z';
    const invokeProjectOperation = vi.fn(
      async (_requestId: string, operation: CoreProjectOperation): Promise<CoreProjectResult> => {
        if (operation.operation === STATE_PROPOSAL_COMMANDS.refreshSnapshot) {
          return {
            ok: true,
            operation: operation.operation,
            data: {
              id: snapshotId,
              projectId,
              chapterId,
              sourceVersionId: versionId,
              status: 'valid',
              content: emptyContent(),
              staleReasons: [],
              createdAt,
              staleAt: null,
            },
          } as CoreProjectResult;
        }
        if (operation.operation === STATE_PROPOSAL_COMMANDS.readSnapshot) {
          return {
            ok: true,
            operation: operation.operation,
            data: {
              projectId,
              chapterId,
              snapshotSource: 'fallback_live_query',
              snapshot: null,
              content: emptyContent(),
            },
          } as CoreProjectResult;
        }
        if (operation.operation === STATE_PROPOSAL_COMMANDS.invalidateDerived) {
          return {
            ok: true,
            operation: operation.operation,
            data: { invalidatedSnapshotIds: [], queuedScopes: [] },
          } as CoreProjectResult;
        }
        return {
          ok: true,
          operation: operation.operation,
          data: { projectId, proposals: [], snapshots: [], invalidations: [] },
        } as CoreProjectResult;
      },
    );
    const unregister = registerNarrativePlanningIpc({
      ipcMain,
      supervisor: { invokeProjectOperation } as unknown as CoreSupervisor,
      rendererUrl: 'file:///trusted/index.html',
    });

    const cases = [
      {
        channel: STATE_PROPOSAL_IPC_CHANNELS.list,
        operation: STATE_PROPOSAL_COMMANDS.list,
        payload: { projectId, chapterId: null, includeResolved: true },
      },
      {
        channel: STATE_PROPOSAL_IPC_CHANNELS.generate,
        operation: STATE_PROPOSAL_COMMANDS.generate,
        payload: {
          projectId,
          chapterId,
          sourceVersionId: versionId,
          source: 'rule',
          proposals: [],
        },
      },
      {
        channel: STATE_PROPOSAL_IPC_CHANNELS.resolve,
        operation: STATE_PROPOSAL_COMMANDS.resolve,
        payload: {
          projectId,
          authority: 'author',
          resolutions: [{ proposalId, decision: 'reject' }],
        },
      },
      {
        channel: STATE_PROPOSAL_IPC_CHANNELS.refreshSnapshot,
        operation: STATE_PROPOSAL_COMMANDS.refreshSnapshot,
        payload: { projectId, authority: 'author', chapterId, sourceVersionId: versionId },
      },
      {
        channel: STATE_PROPOSAL_IPC_CHANNELS.readSnapshot,
        operation: STATE_PROPOSAL_COMMANDS.readSnapshot,
        payload: { projectId, chapterId },
      },
      {
        channel: STATE_PROPOSAL_IPC_CHANNELS.invalidateDerived,
        operation: STATE_PROPOSAL_COMMANDS.invalidateDerived,
        payload: {
          projectId,
          authority: 'author',
          sourceChapterId: chapterId,
          sourceVersionId: versionId,
          changeTypes: ['prose'],
        },
      },
    ] as const;

    for (const item of cases) {
      const handler = handlers.get(item.channel);
      expect(handler).toBeDefined();
      const requestId = randomUUID();
      const command = {
        protocolVersion: 1,
        requestId,
        sentAt: createdAt,
        command: item.operation,
        payload: item.payload,
      };
      const callsBefore = invokeProjectOperation.mock.calls.length;

      await expect(handler?.(untrustedEvent, command)).resolves.toMatchObject({
        ok: false,
        error: { code: 'COMMON_INVALID_INPUT_001' },
      });
      await expect(
        handler?.(trustedEvent, { ...command, payload: { projectId: '../escape' } }),
      ).resolves.toMatchObject({
        ok: false,
        error: { code: 'COMMON_INVALID_INPUT_001' },
      });
      expect(invokeProjectOperation).toHaveBeenCalledTimes(callsBefore);

      await expect(handler?.(trustedEvent, command)).resolves.toMatchObject({
        ok: true,
        requestId,
      });
      expect(invokeProjectOperation).toHaveBeenLastCalledWith(requestId, {
        operation: item.operation,
        input: item.payload,
      });
    }

    unregister();
    expect(ipcMain.removeHandler).toHaveBeenCalledTimes(12);
  });
});
