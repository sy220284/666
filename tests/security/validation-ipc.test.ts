import { randomUUID } from 'node:crypto';

import {
  VALIDATION_COMMANDS,
  VALIDATION_IPC_CHANNELS,
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

describe('M4-04 validation IPC boundary', () => {
  it('strictly validates eleven operations and rejects untrusted or expanded payloads', async () => {
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
    const issueId = randomUUID();
    const exceptionId = randomUUID();
    const commentId = randomUUID();
    const createdAt = '2026-07-26T08:30:00.000Z';
    const invokeProjectOperation = vi.fn(
      async (_requestId: string, operation: CoreProjectOperation): Promise<CoreProjectResult> =>
        ({
          ok: true,
          operation: operation.operation,
          data: { projectId, batches: [], issues: [], todos: [], comments: [] },
        }) as CoreProjectResult,
    );
    const unregister = registerNarrativePlanningIpc({
      ipcMain,
      supervisor: { invokeProjectOperation } as unknown as CoreSupervisor,
      rendererUrl: 'file:///trusted/index.html',
    });
    const cases = [
      {
        channel: VALIDATION_IPC_CHANNELS.list,
        operation: VALIDATION_COMMANDS.list,
        payload: { projectId, chapterId: null, includeClosed: true },
      },
      {
        channel: VALIDATION_IPC_CHANNELS.runRules,
        operation: VALIDATION_COMMANDS.runRules,
        payload: { projectId, sourceVersionId: versionId },
      },
      {
        channel: VALIDATION_IPC_CHANNELS.updateIssue,
        operation: VALIDATION_COMMANDS.updateIssue,
        payload: { projectId, issueId, action: 'resolve' },
      },
      {
        channel: VALIDATION_IPC_CHANNELS.createTodoFromIssue,
        operation: VALIDATION_COMMANDS.createTodoFromIssue,
        payload: { projectId, issueId },
      },
      {
        channel: VALIDATION_IPC_CHANNELS.saveTodo,
        operation: VALIDATION_COMMANDS.saveTodo,
        payload: {
          projectId,
          todoId: null,
          chapterId,
          sceneBeatId: null,
          logicalBlockId: null,
          title: '复核问题',
          status: 'open',
        },
      },
      {
        channel: VALIDATION_IPC_CHANNELS.addComment,
        operation: VALIDATION_COMMANDS.addComment,
        payload: {
          projectId,
          issueId: null,
          chapterId,
          sourceVersionId: versionId,
          logicalBlockId: null,
          body: '复核批注',
        },
      },
      {
        channel: VALIDATION_IPC_CHANNELS.resolveComment,
        operation: VALIDATION_COMMANDS.resolveComment,
        payload: { projectId, commentId },
      },
      {
        channel: VALIDATION_IPC_CHANNELS.reopenComment,
        operation: VALIDATION_COMMANDS.reopenComment,
        payload: { projectId, commentId },
      },
      {
        channel: VALIDATION_IPC_CHANNELS.batchComments,
        operation: VALIDATION_COMMANDS.batchComments,
        payload: { projectId, commentIds: [commentId], action: 'tag', tags: ['人物-主角'] },
      },
      {
        channel: VALIDATION_IPC_CHANNELS.rememberException,
        operation: VALIDATION_COMMANDS.rememberException,
        payload: {
          projectId,
          issueId,
          exceptionType: 'dream',
          scopeType: 'issue',
          entityId: null,
          validFromChapterId: null,
          validUntilChapterId: null,
          projectRuleKey: null,
          notes: '作者确认为梦境',
        },
      },
      {
        channel: VALIDATION_IPC_CHANNELS.disableException,
        operation: VALIDATION_COMMANDS.disableException,
        payload: { projectId, exceptionId },
      },
    ] as const;

    for (const item of cases) {
      const handler = handlers.get(item.channel);
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
        handler?.(trustedEvent, {
          ...command,
          payload: { ...item.payload, untrustedField: 'must-not-pass' },
        }),
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
    expect(ipcMain.removeHandler).toHaveBeenCalledTimes(handlers.size);
  });
});
