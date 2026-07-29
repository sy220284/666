import { z } from 'zod';

import { TASK_PROTOCOL_VERSION } from './task-protocol.js';

export const RENDERER_SHUTDOWN_CHANNELS = {
  prepare: 'worldforge:lifecycle:shutdown-prepare',
  result: 'worldforge:lifecycle:shutdown-result',
} as const;

export const RendererShutdownPrepareSchema = z.strictObject({
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  requestId: z.uuid(),
});

export const RendererShutdownResultSchema = z.strictObject({
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  requestId: z.uuid(),
  saved: z.boolean(),
});

export type RendererShutdownPrepare = z.infer<typeof RendererShutdownPrepareSchema>;
export type RendererShutdownResult = z.infer<typeof RendererShutdownResultSchema>;

export interface RendererLifecycleBridge {
  readonly onShutdownPrepare: (listener: (request: RendererShutdownPrepare) => void) => () => void;
  readonly acknowledgeShutdown: (result: RendererShutdownResult) => void;
}
