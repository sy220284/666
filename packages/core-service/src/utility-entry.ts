import path from 'node:path';

import {
  CoreControlMessageSchema,
  PROTOCOL_VERSION,
  type CoreEvent,
  type ErrorCode,
} from '@worldforge/contracts';

import { DatabaseFoundationError } from './database/index.js';
import { openAppRuntime } from './app-runtime.js';
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
let shuttingDown = false;

function requiredArgument(name: string): string {
  const prefix = `--${name}=`;
  const value = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  if (!value) throw new Error(`CORE_ARGUMENT_MISSING_${name.toUpperCase().replaceAll('-', '_')}`);
  return value;
}

function requiredAbsolutePath(name: string): string {
  const value = requiredArgument(name);
  if (!path.isAbsolute(value)) throw new Error(`CORE_ARGUMENT_PATH_INVALID_${name.toUpperCase()}`);
  return value;
}

const appRuntime = await openAppRuntime({
  databasePath: requiredAbsolutePath('app-database'),
  migrationsDirectory: requiredAbsolutePath('app-migrations'),
  recoveryDirectory: requiredAbsolutePath('app-recovery'),
  appVersion: requiredArgument('app-version'),
});

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

function windowPreferencesError(error: unknown): ErrorCode {
  if (error instanceof DatabaseFoundationError) {
    if (error.code === 'DATABASE_READ_ONLY') return 'PROJECT_READ_ONLY_005';
    if (error.code === 'DATABASE_INTEGRITY_FAILED') return 'DB_INTEGRITY_FAILED_003';
    if (error.code === 'MIGRATION_FAILED') return 'DB_MIGRATION_FAILED_005';
    if (error.code === 'MIGRATION_CHECKSUM_MISMATCH') return 'DB_MIGRATION_CHECKSUM_006';
    if (error.code === 'DATABASE_FUTURE_SCHEMA') return 'DB_SCHEMA_UNSUPPORTED_007';
    if (error.code === 'WRITE_QUEUE_CLOSED') return 'DB_WRITE_QUEUE_STOPPED_008';
    if (error.code === 'DATABASE_WRITE_FAILED') return 'DB_BUSY_TIMEOUT_002';
  }
  return 'DB_OPEN_FAILED_001';
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
    case 'core.window-preferences.get':
      try {
        send({
          type: 'core.window-preferences-result',
          protocolVersion: PROTOCOL_VERSION,
          requestId: parsed.data.requestId,
          result: { ok: true, preferences: appRuntime.windowPreferences.get() },
        });
      } catch (error) {
        send({
          type: 'core.window-preferences-result',
          protocolVersion: PROTOCOL_VERSION,
          requestId: parsed.data.requestId,
          result: { ok: false, errorCode: windowPreferencesError(error) },
        });
      }
      break;
    case 'core.window-preferences.set': {
      const requestId = parsed.data.requestId;
      void appRuntime.windowPreferences
        .save(requestId, parsed.data.preferences)
        .then((preferences) => {
          send({
            type: 'core.window-preferences-result',
            protocolVersion: PROTOCOL_VERSION,
            requestId,
            result: { ok: true, preferences },
          });
        })
        .catch((error: unknown) => {
          send({
            type: 'core.window-preferences-result',
            protocolVersion: PROTOCOL_VERSION,
            requestId,
            result: { ok: false, errorCode: windowPreferencesError(error) },
          });
        });
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
    case 'core.shutdown': {
      if (taskProtocol.accepting || taskProtocol.activeTaskCount > 0 || shuttingDown) return;
      shuttingDown = true;
      taskProtocol.close();
      const requestId = parsed.data.requestId;
      void appRuntime
        .close()
        .then(() => {
          send({
            type: 'core.shutdown-complete',
            protocolVersion: PROTOCOL_VERSION,
            requestId,
          });
          setImmediate(() => process.exit(0));
        })
        .catch(() => process.exit(1));
      break;
    }
  }
});

send({
  type: 'core.ready',
  protocolVersion: PROTOCOL_VERSION,
  startedAt: new Date(startedAt).toISOString(),
});
