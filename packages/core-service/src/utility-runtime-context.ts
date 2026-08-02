import { createHash } from 'node:crypto';
import path from 'node:path';

import type { CoreEvent } from '@worldforge/contracts';

import type { TaskMessagePort } from './task-protocol.js';

export interface TransferredPort {
  postMessage(message: unknown): void;
  on(event: 'message', listener: (event: { readonly data: unknown }) => void): void;
  on(event: 'close', listener: () => void): void;
  off(event: 'message', listener: (event: { readonly data: unknown }) => void): void;
  off(event: 'close', listener: () => void): void;
  start(): void;
  close(): void;
}

export interface UtilityParentMessage {
  readonly data: unknown;
  readonly ports: readonly TransferredPort[];
}

export interface UtilityParentPort {
  on(event: 'message', listener: (event: UtilityParentMessage) => void): void;
  postMessage(message: CoreEvent): void;
}

type UtilityProcess = NodeJS.Process & { readonly parentPort?: UtilityParentPort };

export function requireUtilityParentPort(): UtilityParentPort {
  const parentPort = (process as UtilityProcess).parentPort;
  if (!parentPort) throw new Error('CORE_PARENT_PORT_UNAVAILABLE');
  return parentPort;
}

export function requiredArgument(name: string): string {
  const prefix = `--${name}=`;
  const value = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
  if (!value) throw new Error(`CORE_ARGUMENT_MISSING_${name.toUpperCase().replaceAll('-', '_')}`);
  return value;
}

export function requiredAbsolutePath(name: string): string {
  const value = requiredArgument(name);
  if (!path.isAbsolute(value)) throw new Error(`CORE_ARGUMENT_PATH_INVALID_${name.toUpperCase()}`);
  return value;
}

export function derivedRequestId(requestId: string, purpose: string): string {
  const hex = createHash('sha256')
    .update(`${requestId}:${purpose}`, 'utf8')
    .digest('hex')
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

export function checkpointRequestId(requestId: string): string {
  return derivedRequestId(requestId, 'checkpoint');
}

export function adaptTransferredPort(port: TransferredPort): TaskMessagePort {
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
