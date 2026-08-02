import { PROTOCOL_VERSION, type CoreControlMessage } from '@worldforge/contracts';

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
      context.send({
        type: 'core.command-result',
        protocolVersion: PROTOCOL_VERSION,
        requestId: message.requestId,
        result: options.taskCommands.execute(message.envelope),
      });
      return;
    case 'core.attach-task-port': {
      const port = ports[0];
      if (!port || ports.length !== 1) return;
      options.taskProtocol.attachPort(adaptTransferredPort(port), message.connection.projectId);
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
      void options.appRuntime.windowPreferences
        .save(message.requestId, message.preferences)
        .then((preferences) => {
          context.send({
            type: 'core.window-preferences-result',
            protocolVersion: PROTOCOL_VERSION,
            requestId: message.requestId,
            result: { ok: true, preferences },
          });
        })
        .catch((error: unknown) => {
          context.send({
            type: 'core.window-preferences-result',
            protocolVersion: PROTOCOL_VERSION,
            requestId: message.requestId,
            result: { ok: false, errorCode: windowPreferencesError(error) },
          });
        });
      return;
    case 'core.drain':
      state.acceptingAppDataOperations = false;
      void Promise.all([options.taskProtocol.beginDrain(), ...state.activeAppDataOperations]).then(
        () => {
          context.send({
            type: 'core.drained',
            protocolVersion: PROTOCOL_VERSION,
            requestId: message.requestId,
            pendingTasks: 0,
          });
        },
      );
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
        .catch(() => process.exit(1));
      return;
    default:
      return;
  }
}
