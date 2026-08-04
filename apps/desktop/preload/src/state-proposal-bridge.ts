import {
  STATE_PROPOSAL_COMMANDS,
  STATE_PROPOSAL_IPC_CHANNELS,
  DerivedInvalidationCommandSchema,
  DerivedInvalidationResultEnvelopeSchema,
  EndingSnapshotReadCommandSchema,
  EndingSnapshotReadResultEnvelopeSchema,
  EndingSnapshotRefreshCommandSchema,
  EndingSnapshotResultSchema,
  StateProposalCatalogResultSchema,
  StateProposalGenerateCommandSchema,
  StateProposalListCommandSchema,
  StateProposalResolveCommandSchema,
  type CommandResult,
  type DerivedInvalidationInput,
  type DerivedInvalidationResult,
  type EndingSnapshot,
  type EndingSnapshotReadInput,
  type EndingSnapshotReadResult,
  type EndingSnapshotRefreshInput,
  type StateProposalCatalog,
  type StateProposalGenerateInput,
  type StateProposalResolveInput,
} from '@worldforge/contracts';
import { contextBridge } from 'electron';

import { invokeCommand, type Parser } from './bridge-runtime.js';

function invoke<Result>(
  channel: string,
  commandSchema: Parser<unknown>,
  resultSchema: Parser<CommandResult<Result>>,
  command: string,
  payload: unknown,
): Promise<CommandResult<Result>> {
  return invokeCommand(channel, commandSchema, resultSchema, command, payload);
}

const stateProposalBridge = {
  list: (input: {
    readonly projectId: string;
    readonly chapterId?: string | null;
    readonly includeResolved?: boolean;
  }) =>
    invoke<StateProposalCatalog>(
      STATE_PROPOSAL_IPC_CHANNELS.list,
      StateProposalListCommandSchema,
      StateProposalCatalogResultSchema,
      STATE_PROPOSAL_COMMANDS.list,
      input,
    ),
  generate: (input: StateProposalGenerateInput) =>
    invoke<StateProposalCatalog>(
      STATE_PROPOSAL_IPC_CHANNELS.generate,
      StateProposalGenerateCommandSchema,
      StateProposalCatalogResultSchema,
      STATE_PROPOSAL_COMMANDS.generate,
      input,
    ),
  resolve: (input: StateProposalResolveInput) =>
    invoke<StateProposalCatalog>(
      STATE_PROPOSAL_IPC_CHANNELS.resolve,
      StateProposalResolveCommandSchema,
      StateProposalCatalogResultSchema,
      STATE_PROPOSAL_COMMANDS.resolve,
      input,
    ),
  refreshSnapshot: (input: EndingSnapshotRefreshInput) =>
    invoke<EndingSnapshot>(
      STATE_PROPOSAL_IPC_CHANNELS.refreshSnapshot,
      EndingSnapshotRefreshCommandSchema,
      EndingSnapshotResultSchema,
      STATE_PROPOSAL_COMMANDS.refreshSnapshot,
      input,
    ),
  readSnapshot: (input: EndingSnapshotReadInput) =>
    invoke<EndingSnapshotReadResult>(
      STATE_PROPOSAL_IPC_CHANNELS.readSnapshot,
      EndingSnapshotReadCommandSchema,
      EndingSnapshotReadResultEnvelopeSchema,
      STATE_PROPOSAL_COMMANDS.readSnapshot,
      input,
    ),
  invalidateDerived: (input: DerivedInvalidationInput) =>
    invoke<DerivedInvalidationResult>(
      STATE_PROPOSAL_IPC_CHANNELS.invalidateDerived,
      DerivedInvalidationCommandSchema,
      DerivedInvalidationResultEnvelopeSchema,
      STATE_PROPOSAL_COMMANDS.invalidateDerived,
      input,
    ),
} as const;

contextBridge.exposeInMainWorld('worldforgeStateProposal', stateProposalBridge);
