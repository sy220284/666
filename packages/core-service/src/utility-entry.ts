import { PROTOCOL_VERSION } from '@worldforge/contracts';

import { ProjectTaskBarrier } from './project-task-protocol.js';
import { TaskCommandRouter, TaskProtocol } from './task-protocol.js';
import { createUtilityControlHandler } from './utility-control-router.js';
import {
  checkpointRequestId,
  requireUtilityParentPort,
  requiredAbsolutePath,
  requiredArgument,
} from './utility-runtime-context.js';
import { openUtilityServiceContainer } from './utility-service-container.js';

const parentPort = requireUtilityParentPort();
const startedAt = Date.now();
const taskProtocol = new TaskProtocol();
const projectTaskBarrier = new ProjectTaskBarrier(taskProtocol);
const taskCommands = new TaskCommandRouter(taskProtocol);
const container = await openUtilityServiceContainer({
  taskProtocol,
  projectTaskBarrier,
  checkpointRequestId,
  requiredArgument,
  requiredAbsolutePath,
});

parentPort.on(
  'message',
  createUtilityControlHandler({
    ...container,
    parentPort,
    startedAt,
    taskProtocol,
    taskCommands,
  }),
);

parentPort.postMessage({
  type: 'core.ready',
  protocolVersion: PROTOCOL_VERSION,
  startedAt: new Date(startedAt).toISOString(),
});
