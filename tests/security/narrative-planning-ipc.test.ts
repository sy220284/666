import { randomUUID } from 'node:crypto';

import {
  NARRATIVE_PLANNING_COMMANDS,
  NARRATIVE_PLANNING_IPC_CHANNELS,
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

describe('M3-05 narrative planning IPC boundary', () => {
  it('strictly validates and forwards all six narrative commands', async () => {
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
    const foreshadowingId = randomUUID();
    const characterId = randomUUID();
    const arcId = randomUUID();
    const milestoneId = randomUUID();
    const chapterId = randomUUID();
    const invokeProjectOperation = vi.fn(
      async (_requestId: string, operation: CoreProjectOperation): Promise<CoreProjectResult> =>
        ({
          ok: true,
          operation: operation.operation,
          data: { projectId, foreshadowings: [], characterArcs: [] },
        }) as CoreProjectResult,
    );
    const unregister = registerNarrativePlanningIpc({
      ipcMain,
      supervisor: { invokeProjectOperation } as unknown as CoreSupervisor,
      rendererUrl: 'file:///trusted/index.html',
    });

    expect([...handlers.keys()].sort()).toEqual(
      [...Object.values(NARRATIVE_PLANNING_IPC_CHANNELS), ...Object.values(STATE_PROPOSAL_IPC_CHANNELS)].sort(),
    );

    const cases = [
      {
        channel: NARRATIVE_PLANNING_IPC_CHANNELS.list,
        operation: NARRATIVE_PLANNING_COMMANDS.list,
        payload: {
          projectId,
          query: '',
          includeResolved: true,
          referenceChapterId: null,
        },
      },
      {
        channel: NARRATIVE_PLANNING_IPC_CHANNELS.saveForeshadowing,
        operation: NARRATIVE_PLANNING_COMMANDS.saveForeshadowing,
        payload: {
          projectId,
          authority: 'author',
          foreshadowingId: null,
          title: '伏笔',
          description: '',
          revealFromChapterId: chapterId,
          revealByChapterId: chapterId,
          chapterLinks: [{ chapterId, role: 'plant' }],
          relations: [],
        },
      },
      {
        channel: NARRATIVE_PLANNING_IPC_CHANNELS.transitionForeshadowing,
        operation: NARRATIVE_PLANNING_COMMANDS.transitionForeshadowing,
        payload: {
          projectId,
          authority: 'author',
          foreshadowingId,
          status: 'planted',
        },
      },
      {
        channel: NARRATIVE_PLANNING_IPC_CHANNELS.saveCharacterArc,
        operation: NARRATIVE_PLANNING_COMMANDS.saveCharacterArc,
        payload: {
          projectId,
          authority: 'author',
          arcId: null,
          characterId,
          title: '成长弧光',
          arcType: 'growth',
          customType: null,
          status: 'planned',
          authorIntent: '',
        },
      },
      {
        channel: NARRATIVE_PLANNING_IPC_CHANNELS.saveArcMilestone,
        operation: NARRATIVE_PLANNING_COMMANDS.saveArcMilestone,
        payload: {
          projectId,
          authority: 'author',
          milestoneId: null,
          arcId,
          title: '弧光节点',
          description: '',
          sortIndex: 0,
          plannedChapterId: chapterId,
          dependencyMilestoneIds: [],
          dependencyTimelineEventIds: [],
        },
      },
      {
        channel: NARRATIVE_PLANNING_IPC_CHANNELS.transitionArcMilestone,
        operation: NARRATIVE_PLANNING_COMMANDS.transitionArcMilestone,
        payload: {
          projectId,
          authority: 'author',
          milestoneId,
          status: 'hit',
          actualChapterId: chapterId,
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
        data: { projectId, foreshadowings: [], characterArcs: [] },
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
