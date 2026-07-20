import { z } from 'zod';

import { TASK_PROTOCOL_VERSION } from './task-protocol.js';
import { CoreContinuityOperationSchema, CoreContinuityResultSchema } from './continuity.js';

export const CoreContinuityCommandMessageSchema = z.strictObject({
  type: z.literal('core.continuity.command'),
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  requestId: z.uuid(),
  operation: CoreContinuityOperationSchema,
});

export const CoreContinuityResultMessageSchema = z.strictObject({
  type: z.literal('core.continuity.result'),
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  requestId: z.uuid(),
  result: CoreContinuityResultSchema,
});

export type CoreContinuityCommandMessage = z.infer<typeof CoreContinuityCommandMessageSchema>;
export type CoreContinuityResultMessage = z.infer<typeof CoreContinuityResultMessageSchema>;
