import { CoreControlMessageSchema, PROTOCOL_VERSION, type CoreEvent } from '@worldforge/contracts';

interface UtilityParentPort {
  on(event: 'message', listener: (event: { readonly data: unknown }) => void): void;
  postMessage(message: CoreEvent): void;
}

type UtilityProcess = NodeJS.Process & { readonly parentPort?: UtilityParentPort };

const parentPort = (process as UtilityProcess).parentPort;

if (!parentPort) {
  throw new Error('CORE_PARENT_PORT_UNAVAILABLE');
}

const startedAt = Date.now();
let acceptingTasks = true;

function send(message: CoreEvent): void {
  parentPort?.postMessage(message);
}

parentPort.on('message', ({ data }) => {
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
    case 'core.drain':
      acceptingTasks = false;
      send({
        type: 'core.drained',
        protocolVersion: PROTOCOL_VERSION,
        requestId: parsed.data.requestId,
        pendingTasks: 0,
      });
      break;
    case 'core.shutdown':
      if (acceptingTasks) return;
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
