import type { CoreEvent } from '@worldforge/contracts';

import type { TaskCommandRouter, TaskProtocol } from './task-protocol.js';
import type { UtilityParentPort } from './utility-runtime-context.js';
import type { UtilityServiceContainer } from './utility-service-container.js';

export type UtilityControlRouterOptions = UtilityServiceContainer & {
  readonly parentPort: UtilityParentPort;
  readonly startedAt: number;
  readonly taskProtocol: TaskProtocol;
  readonly taskCommands: TaskCommandRouter;
};

export interface UtilityControlState {
  shuttingDown: boolean;
  acceptingAppDataOperations: boolean;
  readonly activeAppDataOperations: Set<Promise<void>>;
}

export interface TrackedOperationHandlers<Result> {
  readonly success: (result: Result) => CoreEvent;
  readonly failure: (error: unknown) => CoreEvent;
  readonly failureEvent: string;
}

export interface UtilityControlContext {
  readonly options: UtilityControlRouterOptions;
  readonly state: UtilityControlState;
  send(message: CoreEvent): boolean;
  report(event: string): void;
  track<Result>(operation: Promise<Result>, handlers: TrackedOperationHandlers<Result>): void;
}

export function createUtilityControlContext(
  options: UtilityControlRouterOptions,
): UtilityControlContext {
  const state: UtilityControlState = {
    shuttingDown: false,
    acceptingAppDataOperations: true,
    activeAppDataOperations: new Set<Promise<void>>(),
  };

  const report = (event: string): void => {
    try {
      process.stderr.write(`[worldforge-core] ${event}\n`);
    } catch {
      // The parent process may already be gone; reporting must stay best effort.
    }
  };
  const send = (message: CoreEvent): boolean => {
    try {
      options.parentPort.postMessage(message);
      return true;
    } catch {
      report('parent-port.send.failed');
      return false;
    }
  };

  return {
    options,
    state,
    send,
    report,
    track: <Result>(
      operation: Promise<Result>,
      handlers: TrackedOperationHandlers<Result>,
    ): void => {
      const tracked = Promise.resolve(operation)
        .then(
          (result) => {
            try {
              send(handlers.success(result));
            } catch (error) {
              report(`${handlers.failureEvent}.success-build.failed`);
              try {
                send(handlers.failure(error));
              } catch {
                report(`${handlers.failureEvent}.failure-build.failed`);
              }
            }
          },
          (error: unknown) => {
            report(handlers.failureEvent);
            try {
              send(handlers.failure(error));
            } catch {
              report(`${handlers.failureEvent}.failure-build.failed`);
            }
          },
        )
        .catch(() => {
          report(`${handlers.failureEvent}.unhandled`);
        })
        .finally(() => state.activeAppDataOperations.delete(tracked));
      state.activeAppDataOperations.add(tracked);
    },
  };
}
