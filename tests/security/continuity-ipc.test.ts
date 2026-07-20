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

const trustedEvent = {
  senderFrame: { url: 'file:///trusted/index.html' },
} as unknown as IpcMainInvokeEvent;
const untrustedEvent = {
  senderFrame: { url: 'https://attacker.invalid' },
} as unknown as IpcMainInvokeEvent;

describe('M3-04 continuity IPC boundary', () => {
  it('strictly validates and forwards every named continuity command', async () => {
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
    const entityId = randomUUID();
    const chapterId = randomUUID();
    const versionId = randomUUID();
    const eventId = randomUUID();
    const invokeProjectOperation = vi.fn(
      async (_requestId: string, operation: CoreProjectOperation): Promise<CoreProjectResult> =>
        ({
          ok: true,
          operation: operation.operation,
          data: {
            projectId,
            entityStates: [],
            timelineEvents: [],
            knowledgeStates: [],
          },
        }) as CoreProjectResult,
    );
    const unregister = registerContinuityIpc({
      ipcMain,
      supervisor: { invokeProjectOperation } as unknown as CoreSupervisor,
      rendererUrl: 'file:///trusted/index.html',
    });

    expect([...handlers.keys()].sort()).toEqual(Object.values(CONTINUITY_IPC_CHANNELS).sort());

    const cases = [
      {
        channel: CONTINUITY_IPC_CHANNELS.list,
        operation: CONTINUITY_COMMANDS.list,
        payload: {
          projectId,
          query: '',
          includeHistory: true,
          includeArchivedEvents: false,
          effectiveAtChapterId: null,
        },
      },
      {
        channel: CONTINUITY_IPC_CHANNELS.setEntityState,
        operation: CONTINUITY_COMMANDS.setEntityState,
        payload: {
          projectId,
          authority: 'author',
          entityId,
          stateKey: 'health',
          value: 'well',
          validFromChapterId: chapterId,
          validUntilChapterId: null,
          evidence: [],
          sourceVersionId: versionId,
        },
      },
      {
        channel: CONTINUITY_IPC_CHANNELS.invalidateEntityState,
        operation: CONTINUITY_COMMANDS.invalidateEntityState,
        payload: { projectId, authority: 'author', entityId, stateKey: 'health' },
      },
      {
        channel: CONTINUITY_IPC_CHANNELS.saveTimelineEvent,
        operation: CONTINUITY_COMMANDS.saveTimelineEvent,
        payload: {
          projectId,
          authority: 'author',
          eventId: null,
          title: '事件',
          startValue: '2026-07-20',
          endValue: null,
          precision: 'day',
          chapterId,
          locationId: null,
          description: '',
          participantIds: [entityId],
          witnessIds: [],
          subjectIds: [],
          dependencyIds: [],
        },
      },
      {
        channel: CONTINUITY_IPC_CHANNELS.archiveTimelineEvent,
        operation: CONTINUITY_COMMANDS.archiveTimelineEvent,
        payload: { projectId, authority: 'author', eventId },
      },
      {
        channel: CONTINUITY_IPC_CHANNELS.setKnowledgeState,
        operation: CONTINUITY_COMMANDS.setKnowledgeState,
        payload: {
          projectId,
          authority: 'author',
          informationKey: 'secret',
          characterId: entityId,
          knowledgeStatus: 'knows',
          validFromChapterId: chapterId,
          validUntilChapterId: null,
          sourceVersionId: versionId,
          sourceLogicalBlockId: null,
          notes: '',
        },
      },
      {
        channel: CONTINUITY_IPC_CHANNELS.invalidateKnowledgeState,
        operation: CONTINUITY_COMMANDS.invalidateKnowledgeState,
        payload: {
          projectId,
          authority: 'author',
          informationKey: 'secret',
          characterId: entityId,
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
        sentAt: new Date().toISOString(),
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

      await expect(handler?.(trustedEvent, command)).resolves.toEqual({
        ok: true,
        requestId,
        data: {
          projectId,
          entityStates: [],
          timelineEvents: [],
          knowledgeStates: [],
        },
      });
      expect(invokeProjectOperation).toHaveBeenLastCalledWith(requestId, {
        operation: item.operation,
        input: item.payload,
      });
    }

    unregister();
    expect(ipcMain.removeHandler).toHaveBeenCalledTimes(7);
  });
});
