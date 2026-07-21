import { z } from 'zod';

import { ErrorCodeSchema } from './error-codes.js';
import {
  DerivedInvalidationResultSchema,
  EndingSnapshotReadResultSchema,
  EndingSnapshotSchema,
  StateProposalCatalogSchema,
  type DerivedInvalidationInput,
  type DerivedInvalidationResult,
  type EndingSnapshot,
  type EndingSnapshotReadInput,
  type EndingSnapshotReadResult,
  type EndingSnapshotRefreshInput,
  type StateProposalCatalog,
  type StateProposalGenerateInput,
  type StateProposalResolveInput,
} from './state-proposal.js';

const failureSchema = z.strictObject({
  ok: z.literal(false),
  requestId: z.uuid(),
  error: z.strictObject({
    code: ErrorCodeSchema,
    message: z.string().min(1).max(512),
    retryable: z.boolean(),
    userAction: z.string().min(1).max(512).optional(),
    diagnosticId: z.string().min(1).max(128).optional(),
  }),
});

type StateProposalCommandResult<Data> =
  | { readonly ok: true; readonly requestId: string; readonly data: Data }
  | z.infer<typeof failureSchema>;

function resultSchema<Data extends z.ZodType>(data: Data) {
  return z.union([
    z.strictObject({ ok: z.literal(true), requestId: z.uuid(), data }),
    failureSchema,
  ]);
}

export const StateProposalCatalogResultSchema = resultSchema(StateProposalCatalogSchema);
export const EndingSnapshotResultSchema = resultSchema(EndingSnapshotSchema);
export const EndingSnapshotReadResultEnvelopeSchema = resultSchema(EndingSnapshotReadResultSchema);
export const DerivedInvalidationResultEnvelopeSchema = resultSchema(
  DerivedInvalidationResultSchema,
);

export interface StateProposalBridge {
  readonly list: (input: {
    readonly projectId: string;
    readonly chapterId?: string | null;
    readonly includeResolved?: boolean;
  }) => Promise<StateProposalCommandResult<StateProposalCatalog>>;
  readonly generate: (
    input: StateProposalGenerateInput,
  ) => Promise<StateProposalCommandResult<StateProposalCatalog>>;
  readonly resolve: (
    input: StateProposalResolveInput,
  ) => Promise<StateProposalCommandResult<StateProposalCatalog>>;
  readonly refreshSnapshot: (
    input: EndingSnapshotRefreshInput,
  ) => Promise<StateProposalCommandResult<EndingSnapshot>>;
  readonly readSnapshot: (
    input: EndingSnapshotReadInput,
  ) => Promise<StateProposalCommandResult<EndingSnapshotReadResult>>;
  readonly invalidateDerived: (
    input: DerivedInvalidationInput,
  ) => Promise<StateProposalCommandResult<DerivedInvalidationResult>>;
}
