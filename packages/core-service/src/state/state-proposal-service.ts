import { type DatabaseClock } from '../database/index.js';
import { type ProjectWorkspaceService } from '../project-workspace.js';
import { invalidateDerived } from './derived-invalidation-service.js';
import { readSnapshot, refreshSnapshot } from './ending-snapshot-service.js';
import {
  catalog,
  completeProviderBatch,
  generate,
  list,
  resolve,
} from './proposal-batch-repository.js';
import {
  type ProviderProposalBatchCompletionInput,
  type StateProposalServiceContext,
  type StateProposalServiceOptions,
} from './state-row-mappers.js';
import {
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
import { randomUUID } from 'node:crypto';

export { StateProposalServiceError } from './state-row-mappers.js';
export type {
  StateProposalServiceErrorCode,
  StateProposalServiceOptions,
  ProviderProposalBatchCompletionInput,
} from './state-row-mappers.js';

const systemClock: DatabaseClock = { now: () => new Date() };

export class StateProposalService {
  readonly #context: StateProposalServiceContext;

  constructor(workspace: ProjectWorkspaceService, options: StateProposalServiceOptions = {}) {
    this.#context = {
      workspace,
      clock: options.clock ?? systemClock,
      idFactory: options.idFactory ?? randomUUID,
    };
  }

  list(raw: { projectId: string; chapterId?: string | null; includeResolved?: boolean }) {
    return list(this.#context, raw);
  }

  generate(requestId: string, raw: StateProposalGenerateInput): Promise<StateProposalCatalog> {
    return generate(this.#context, requestId, raw);
  }

  completeProviderBatch(
    requestId: string,
    input: ProviderProposalBatchCompletionInput,
  ): Promise<{ readonly batchId: string; readonly catalog: StateProposalCatalog }> {
    return completeProviderBatch(this.#context, requestId, input);
  }

  resolve(requestId: string, raw: StateProposalResolveInput): Promise<StateProposalCatalog> {
    return resolve(this.#context, requestId, raw);
  }

  refreshSnapshot(requestId: string, raw: EndingSnapshotRefreshInput): Promise<EndingSnapshot> {
    return refreshSnapshot(this.#context, requestId, raw);
  }

  readSnapshot(raw: EndingSnapshotReadInput): EndingSnapshotReadResult {
    return readSnapshot(this.#context, raw);
  }

  invalidateDerived(
    requestId: string,
    raw: DerivedInvalidationInput,
  ): Promise<DerivedInvalidationResult> {
    return invalidateDerived(this.#context, requestId, raw);
  }
}
