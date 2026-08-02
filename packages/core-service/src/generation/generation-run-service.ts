import { type DatabaseClock } from '../database/index.js';
import { type ProjectWorkspaceService } from '../project-workspace.js';
import { completeProseCandidate, completeSkeletonCandidates } from './candidate-persistence.js';
import { getModelSupport, upsertModelSupport } from './model-support-repository.js';
import { discardPartial, recordPartial, savePartial } from './partial-result-service.js';
import {
  cancel,
  create,
  fail,
  type GenerationCompletion,
  type GenerationContinuationContext,
  type GenerationPartialDecision,
  type GenerationProseCandidateInput,
  type GenerationRunCreateInput,
  type GenerationRunIdentity,
  type GenerationRunServiceContext,
  type GenerationRunServiceOptions,
  type GenerationRunStageInput,
  type GenerationSkeletonCompletion,
  type GenerationSkeletonCompletionInput,
  type GenerationUsage,
  get,
  getContinuationContext,
  list,
  markRunning,
  markStage,
  recoverInterrupted,
  updateUsage,
} from './run-repository.js';
import {
  type ErrorCode,
  type GenerationGetRunInput,
  type GenerationListRunsInput,
  type GenerationModelSupportInput,
  type GenerationRun,
  type ModelSupportProfile,
} from '@worldforge/contracts';
import { randomUUID } from 'node:crypto';

export { GenerationRunServiceError } from './run-repository.js';
export type {
  GenerationRunServiceErrorCode,
  GenerationRunServiceOptions,
  GenerationRunCreateInput,
  GenerationInputSourceInput,
  GenerationRunIdentity,
  GenerationRunStageInput,
  GenerationUsage,
  GenerationProseCandidateInput,
  GenerationCandidateSourceMappingInput,
  GenerationSkeletonCandidateInput,
  GenerationSkeletonCompletionInput,
  GenerationCompletion,
  GenerationSkeletonCompletion,
  GenerationPartialDecision,
  GenerationContinuationContext,
} from './run-repository.js';

const systemClock: DatabaseClock = { now: () => new Date() };

export class GenerationRunService {
  readonly #context: GenerationRunServiceContext;

  constructor(workspace: ProjectWorkspaceService, options: GenerationRunServiceOptions = {}) {
    this.#context = {
      workspace,
      clock: options.clock ?? systemClock,
      idFactory: options.idFactory ?? randomUUID,
    };
  }

  create(requestId: string, input: GenerationRunCreateInput): Promise<GenerationRun> {
    return create(this.#context, requestId, input);
  }

  get(raw: GenerationGetRunInput): GenerationRun {
    return get(this.#context, raw);
  }

  list(raw: GenerationListRunsInput): { readonly runs: readonly GenerationRun[] } {
    return list(this.#context, raw);
  }

  getContinuationContext(input: GenerationRunIdentity): GenerationContinuationContext {
    return getContinuationContext(this.#context, input);
  }

  markRunning(requestId: string, input: GenerationRunIdentity): Promise<GenerationRun> {
    return markRunning(this.#context, requestId, input);
  }

  markStage(requestId: string, input: GenerationRunStageInput): Promise<GenerationRun> {
    return markStage(this.#context, requestId, input);
  }

  updateUsage(
    requestId: string,
    input: GenerationRunIdentity & GenerationUsage,
  ): Promise<GenerationRun> {
    return updateUsage(this.#context, requestId, input);
  }

  recordPartial(
    requestId: string,
    input: GenerationRunIdentity & { readonly text: string },
  ): Promise<GenerationRun> {
    return recordPartial(this.#context, requestId, input);
  }

  cancel(
    requestId: string,
    input: GenerationRunIdentity,
    partialText?: string,
  ): Promise<GenerationRun> {
    return cancel(this.#context, requestId, input, partialText);
  }

  fail(
    requestId: string,
    input: GenerationRunIdentity & {
      readonly errorCode: ErrorCode;
      readonly retryable: boolean;
      readonly partialText?: string;
    },
  ): Promise<GenerationRun> {
    return fail(this.#context, requestId, input);
  }

  completeProseCandidate(
    requestId: string,
    input: GenerationProseCandidateInput,
  ): Promise<GenerationCompletion> {
    return completeProseCandidate(this.#context, requestId, input);
  }

  completeSkeletonCandidates(
    requestId: string,
    input: GenerationSkeletonCompletionInput,
  ): Promise<GenerationSkeletonCompletion> {
    return completeSkeletonCandidates(this.#context, requestId, input);
  }

  savePartial(requestId: string, input: GenerationRunIdentity): Promise<GenerationPartialDecision> {
    return savePartial(this.#context, requestId, input);
  }

  discardPartial(
    requestId: string,
    input: GenerationRunIdentity,
  ): Promise<GenerationPartialDecision> {
    return discardPartial(this.#context, requestId, input);
  }

  recoverInterrupted(requestId: string, projectId: string): Promise<number> {
    return recoverInterrupted(this.#context, requestId, projectId);
  }

  getModelSupport(raw: GenerationModelSupportInput): ModelSupportProfile {
    return getModelSupport(this.#context, raw);
  }

  upsertModelSupport(
    requestId: string,
    projectId: string,
    raw: ModelSupportProfile,
  ): Promise<ModelSupportProfile> {
    return upsertModelSupport(this.#context, requestId, projectId, raw);
  }
}
