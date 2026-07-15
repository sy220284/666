export const coreServiceLayer = {
  name: '@worldforge/core-service',
  responsibility: 'authoritative-local-data-and-use-cases',
} as const;

export const coreRuntime = {
  protocol: 'parentPort-message',
  lifecycle: ['ready', 'health', 'drain', 'shutdown'],
} as const;

export * from './database/index.js';
export * from './task-protocol.js';
