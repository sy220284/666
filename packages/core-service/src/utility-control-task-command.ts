import {
  ErrorCodeSchema,
  PROTOCOL_VERSION,
  TaskCommandResultSchema,
  type CoreControlMessage,
  type TaskCommandResult,
} from '@worldforge/contracts';

import type { UtilityControlContext } from './utility-control-context.js';

type CoreTaskCommandMessage = Extract<CoreControlMessage, { readonly type: 'core.command' }>;

function generationTaskFailure(requestId: string, error: unknown): TaskCommandResult {
  const code = ErrorCodeSchema.safeParse(
    error && typeof error === 'object' && 'code' in error ? error.code : undefined,
  );
  const message =
    error instanceof Error ? error.message : 'The task could not be cancelled safely.';
  const retryable =
    error !== null && typeof error === 'object' && 'retryable' in error && error.retryable === true;
  return TaskCommandResultSchema.parse({
    ok: false,
    requestId,
    error: {
      code: code.success ? code.data : 'COMMON_INTERNAL_999',
      message,
      retryable,
    },
  });
}

export function dispatchUtilityTaskCommand(
  context: UtilityControlContext,
  message: CoreTaskCommandMessage,
): void {
  const { options } = context;
  if (message.envelope.command === 'task.cancel' && message.envelope.projectId !== undefined) {
    context.track(
      options.generationRuntime
        .cancelTask(message.envelope.payload.taskId, message.envelope.projectId)
        .then((handled) =>
          handled
            ? TaskCommandResultSchema.parse({
                ok: true,
                requestId: message.requestId,
                data: { accepted: true, status: 'cancelled' },
              })
            : options.taskCommands.execute(message.envelope),
        ),
      {
        success: (result) => ({
          type: 'core.command-result',
          protocolVersion: PROTOCOL_VERSION,
          requestId: message.requestId,
          result,
        }),
        failure: (error) => ({
          type: 'core.command-result',
          protocolVersion: PROTOCOL_VERSION,
          requestId: message.requestId,
          result: generationTaskFailure(message.requestId, error),
        }),
        failureEvent: 'generation-task.cancel.failed',
      },
    );
    return;
  }

  try {
    context.send({
      type: 'core.command-result',
      protocolVersion: PROTOCOL_VERSION,
      requestId: message.requestId,
      result: options.taskCommands.execute(message.envelope),
    });
  } catch {
    context.report('task-command.execute.failed');
    context.send({
      type: 'core.command-result',
      protocolVersion: PROTOCOL_VERSION,
      requestId: message.requestId,
      result: TaskCommandResultSchema.parse({
        ok: false,
        requestId: message.requestId,
        error: {
          code: 'COMMON_INTERNAL_999',
          message: 'The task command could not be completed.',
          retryable: true,
        },
      }),
    });
  }
}
