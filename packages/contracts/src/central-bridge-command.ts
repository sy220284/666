import type { z } from 'zod';

import { RegisteredCommandSchema } from './protocol-registry.js';

/**
 * Commands accepted by the central desktop bridge registry.
 *
 * Specialty bridges such as Candidate, Generation, Continuity, Narrative Planning,
 * State Proposal, Validation, Search and Rhythm intentionally keep their own strict schemas.
 * `RegisteredCommandSchema` remains exported for compatibility; new code should use this
 * scope-accurate name.
 */
export const CentralBridgeCommandSchema = RegisteredCommandSchema;

export type CentralBridgeCommand = z.infer<typeof CentralBridgeCommandSchema>;
