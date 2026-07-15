import { CoreControlMessageSchema, PROTOCOL_VERSION, type CoreEvent } from '@worldforge/contracts';

import { TaskCommandRouter, TaskProtocol, type TaskMessagePort } from './task-protocol.js';

interface TransferredPort {
  postMessage(message: unknown): void;
  on(event: 'message', listener: (event: { readonly data: unknown }) => void): void;
  on(event: 'close', listener: () => void): void;
  off(event: 'message', listener: (event: { readonly data: unknown }) => void): void;
  off(event: 'close', listener: () => void): void;
  start(): void;
  close(): void;
}

interface UtilityParentPort {
  on(
    event: 'message',
    listener: (event: {
      readonly data: unknown;
      readonly ports: readonly TransferredPort[];
    }) => void,
  ): void;
  postMessage(message: CoreEvent): void;
}

type UtilityProcess = NodeJS.Process & { readonly parentPort?: UtilityParentPort };

const parentPort = (process as UtilityProcess).parentPort;

if (!parentPort) {
  throw new Error('CORE_PARENT_PORT_UNAVAILABLE');
}

const startedAt = Date.now();
const taskProtocol = new TaskProtocol();
const taskCommands = new TaskCommandRouter(taskProtocol);

function send(message: CoreEvent): void {
  parentPort?.postMessage(message);
}

function adaptPort(port: TransferredPort): TaskMessagePort {
  port.start();
  return {
    postMessage: (message) => port.postMessage(message),
    onMessage: (listener) => {
      const handleMessage = (event: { readonly data: unknown }) => listener(event.data);
      port.on('message', handleMessage);
      return () => port.off('message', handleMessage);
    },
    onClose: (listener) => {
      port.on('close', listener);
      return () => port.off('close', listener);
    },
    close: () => port.close(),
  };
}

parentPort.on('message', ({ data, ports }) => {
  const parsed = CoreControlMessageSchema.safeParse(data);
  if (!parsed.success) return;

  switch (parsed.data.type) {
    case 'core.ping':
      send({
        type: 'core.health',
        protocolVersion: PROTOCOL_VERSION,
        requestId: parsed.data.requestId,
        status: 'healthy',
        uptimeMs: Math.max(0, Date.now() - startedAt),
      });
      break;
    case 'core.command':
      send({
        type: 'core.command-result',
        protocolVersion: PROTOCOL_VERSION,
        requestId: parsed.data.requestId,
        result: taskCommands.execute(parsed.data.envelope),
      });
      break;
    case 'core.attach-task-port': {
      const port = ports[0];
      if (!port || ports.length !== 1) return;
      taskProtocol.attachPort(adaptPort(port), parsed.data.connection.projectId);
      break;
    }
    case 'core.drain': {
      const requestId = parsed.data.requestId;
      void taskProtocol.beginDrain().then(() => {
        send({
          type: 'core.drained',
          protocolVersion: PROTOCOL_VERSION,
          requestId,
          pendingTasks: 0,
        });
      });
      break;
    }
    case 'core.shutdown':
      if (taskProtocol.accepting || taskProtocol.activeTaskCount > 0) return;
      taskProtocol.close();
      send({
        type: 'core.shutdown-complete',
        protocolVersion: PROTOCOL_VERSION,
        requestId: parsed.data.requestId,
      });
      setImmediate(() => process.exit(0));
      break;
  }
});

send({
  type: 'core.ready',
  protocolVersion: PROTOCOL_VERSION,
  startedAt: new Date(startedAt).toISOString(),
});
