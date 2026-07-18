export const coreServiceLayer = {
  name: '@worldforge/core-service',
  responsibility: 'authoritative-local-data-and-use-cases',
} as const;

export const coreRuntime = {
  protocol: 'parentPort-message',
  lifecycle: ['ready', 'health', 'drain', 'shutdown'],
} as const;

export * from './database/index.js';
export * from './app-runtime.js';
export * from './app-data-errors.js';
export * from './app-settings.js';
export * from './provider-configs.js';
export * from './recent-projects.js';
export * from './project-workspace.js';
export * from './project-structure.js';
export * from './project-planning.js';
export * from './scene-beat.js';
export * from './draft.js';
export * from './candidate.js';
export * from './version.js';
export * from './recovery.js';
export * from './import-export.js';
export * from './migration-recovery.js';
export * from './task-protocol.js';
export * from './window-preferences.js';
