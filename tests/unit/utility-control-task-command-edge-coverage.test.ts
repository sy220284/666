import { PROTOCOL_VERSION, type CoreControlMessage } from '@worldforge/contracts';
import { describe, expect, it, vi } from 'vitest';

import type {
  TrackedOperationHandlers,
  UtilityControlContext,
} from '../../packages/core-service/src/utility-control-context.js';
import { dispatchUtilityTaskCommand } from '../../packages/core-service/src/utility-control-task-command.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const requestId = '66666666-6666-4666-8666-666666666666';
const projectId = '77777777-7777-4777-8777-777777777777';
const taskId = '88888888-8888-4888-8888-888888888888';

interface Tracked {
  readonly operation: Promise<unknown>;
  readonly handlers: TrackedOperationHandlers<unknown>;
}

function taskMessage(): Extract<CoreControlMessage, { readonly type: 'core.command' }> {
  return contractInput({
    type: 'core.command',
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    envelope: {
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      projectId,
      sentAt: '2026-08-17T00:00:00.000Z',
      command: 'task.cancel',
      payload: { taskId },
    },
  });
}

function context(cancelTask: ReturnType<typeof vi.fn>, execute: ReturnType<typeof vi.fn>) {
  const tracked: Tracked[] = [];
  const sent: unknown[] = [];
  const reports: string[] = [];
  const value = contractInput<UtilityControlContext>({
    options: {
      generationRuntime: { cancelTask },
      taskCommands: { execute },
    },
    track: (operation: Promise<unknown>, handlers: TrackedOperationHandlers<unknown>) => {
      tracked.push({ operation, handlers });
    },
    send: (message: unknown) => {
      sent.push(message);
      return true;
    },
    report: (event: string) => reports.push(event),
  });
  return { value, tracked, sent, reports };
}

describe('utility generation task cancellation routing', () => {
  it('returns a cancelled result when the generation runtime handles the task', async () => {
    const cancelTask = vi.fn().mockResolvedValue(true);
    const execute = vi.fn();
    const current = context(cancelTask, execute);
    dispatchUtilityTaskCommand(current.value, taskMessage());

    expect(current.tracked).toHaveLength(1);
    const result = await current.tracked[0]!.operation;
    expect(result).toEqual({
      ok: true,
      requestId,
      data: { accepted: true, status: 'cancelled' },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(current.tracked[0]!.handlers.success(result)).toEqual({
      type: 'core.command-result',
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      result,
    });
  });

  it('falls back to the task router when the generation runtime does not own the task', async () => {
    const fallback = {
      ok: true,
      requestId,
      data: { accepted: false, status: 'running' },
    } as const;
    const cancelTask = vi.fn().mockResolvedValue(false);
    const execute = vi.fn().mockReturnValue(fallback);
    const current = context(cancelTask, execute);
    dispatchUtilityTaskCommand(current.value, taskMessage());

    await expect(current.tracked[0]!.operation).resolves.toEqual(fallback);
    expect(execute).toHaveBeenCalledOnce();
  });

  it('builds fail-closed cancellation errors for structured, Error and primitive failures', () => {
    const current = context(vi.fn().mockResolvedValue(true), vi.fn());
    dispatchUtilityTaskCommand(current.value, taskMessage());
    const failure = current.tracked[0]!.handlers.failure;

    expect(failure({ code: 'COMMON_CANCELLED_004', retryable: true })).toMatchObject({
      result: {
        ok: false,
        error: {
          code: 'COMMON_CANCELLED_004',
          message: 'The task could not be cancelled safely.',
          retryable: true,
        },
      },
    });

    expect(
      failure(Object.assign(new Error('explicit failure'), { code: 'NOT_A_REAL_CODE' })),
    ).toMatchObject({
      result: {
        error: {
          code: 'COMMON_INTERNAL_999',
          message: 'explicit failure',
          retryable: false,
        },
      },
    });

    expect(failure(null)).toMatchObject({
      result: {
        error: {
          code: 'COMMON_INTERNAL_999',
          message: 'The task could not be cancelled safely.',
          retryable: false,
        },
      },
    });
    expect(current.tracked[0]!.handlers.failureEvent).toBe('generation-task.cancel.failed');
  });
});
