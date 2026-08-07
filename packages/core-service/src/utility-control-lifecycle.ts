import {
  PROTOCOL_VERSION,
  TaskCommandResultSchema,
  type CoreControlMessage,
} from '@worldforge/contracts';

import { runWithCommandIdentity } from './command-identity-context.js';
import type { UtilityControlContext } from './utility-control-context.js';
import { windowPreferencesError } from './utility-errors.js';
import { adaptTransferredPort, type UtilityParentMessage } from './utility-runtime-context.js';

export function dispatchUtilityLifecycle(
  context: UtilityControlContext,
  message: CoreControlMessage,
  ports: UtilityParentMessage['ports'],
): void {
  const { options, state } = context;

  switch (message.type) {
    case 'core.ping':
      context.send({
        type: 'core.health',
        protocolVersion: PROTOCOL_VERSION,
        requestId: message.requestId,
        status: 'healthy',
        uptimeMs: Math.max(0, Date.now() - options.startedAt),
      });
      return;
    case 'core.command':
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
      return;
    case 'core.attach-task-port': {
      const port = ports[0];
      if (!port || ports.length !== 1) return;
      try {
        options.taskProtocol.attachPort(adaptTransferredPort(port), message.connection.projectId);
      } catch {
        context.report('task-port.attach.failed');
        try {
          port.close();
        } catch {
          context.report('task-port.close.failed');
        }
      }
      return;
    }
    case 'core.window-preferences.get':
      try {
        context.send({
          type: 'core.window-preferences-result',
          protocolVersion: PROTOCOL_VERSION,
          requestId: message.requestId,
          result: { ok: true, preferences: options.appRuntime.windowPreferences.get() },
        });
      } catch (error) {
        context.send({
          type: 'core.window-preferences-result',
          protocolVersion: PROTOCOL_VERSION,
          requestId: message.requestId,
          result: { ok: false, errorCode: windowPreferencesError(error) },
        });
      }
      return;
    case 'core.window-preferences.set':
      context.track(
        runWithCommandIdentity('core.window-preferences.set', message.preferences, () =>
          options.appRuntime.windowPreferences.save(message.requestId, message.preferences),
        ),
        {
          success: (preferences) => ({
            type: 'core.window-preferences-result',
            protocolVersion: PROTOCOL_VERSION,
            requestId: message.requestId,
            result: { ok: true, preferences },
          }),
          failure: (error) => ({
            type: 'core.window-preferences-result',
            protocolVersion: PROTOCOL_VERSION,
            requestId: message.requestId,
            result: { ok: false, errorCode: windowPreferencesError(error) },
          }),
          failureEvent: 'window-preferences.save.failed',
        },
      );
      return;
    case 'core.drain':
      state.acceptingAppDataOperations = false;
      void Promise.all([options.taskProtocol.beginDrain(), ...state.activeAppDataOperations])
        .then(() => {
          context.send({
            type: 'core.drained',
            protocolVersion: PROTOCOL_VERSION,
            requestId: message.requestId,
            pendingTasks: 0,
          });
        })
        .catch(() => context.report('core.drain.failed'));
      return;
    case 'core.shutdown':
      if (
        options.taskProtocol.accepting ||
        options.taskProtocol.activeTaskCount > 0 ||
        state.acceptingAppDataOperations ||
        state.activeAppDataOperations.size > 0 ||
        state.shuttingDown
      ) {
        return;
      }
      state.shuttingDown = true;
      options.taskProtocol.close();
      void options.projectWorkspace
        .shutdown()
        .then(() => options.appRuntime.close())
        .then(() => {
          context.send({
            type: 'core.shutdown-complete',
            protocolVersion: PROTOCOL_VERSION,
            requestId: message.requestId,
          });
          setImmediate(() => process.exit(0));
        })
        .catch(() => {
          context.report('core.shutdown.failed');
          process.exit(1);
        });
      return;
    default:
      return;
  }
}
