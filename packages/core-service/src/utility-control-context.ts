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

export interface UtilityControlContext {
  readonly options: UtilityControlRouterOptions;
  readonly state: UtilityControlState;
  send(message: CoreEvent): void;
  track(operation: Promise<void>): void;
}

export function createUtilityControlContext(
  options: UtilityControlRouterOptions,
): UtilityControlContext {
  const state: UtilityControlState = {
    shuttingDown: false,
    acceptingAppDataOperations: true,
    activeAppDataOperations: new Set<Promise<void>>(),
  };

  return {
    options,
    state,
    send: (message) => options.parentPort.postMessage(message),
    track: (operation) => {
      state.activeAppDataOperations.add(operation);
      void operation.finally(() => state.activeAppDataOperations.delete(operation));
    },
  };
}
