import { randomUUID } from 'node:crypto';

import {
  type ErrorCode,
  type GenerationGetRunInput,
  type GenerationListRunsInput,
  type GenerationModelSupportInput,
  type GenerationRun,
  type ModelSupportProfile,
} from '@worldforge/contracts';

import {
  BoundedIdempotentPromiseCache,
  IdempotentRequestConflictError,
} from '../bounded-idempotent-promise-cache.js';
import { type DatabaseClock } from '../database/index.js';
import { type ProjectWorkspaceService } from '../project-workspace.js';
import { finalVersion, validationSemanticIdentity } from '../validation/validation-model.js';
import { completeProseCandidate, completeSkeletonCandidates } from './candidate-persistence.js';
import { getModelSupport, upsertModelSupport } from './model-support-repository.js';
import { discardPartial, recordPartial, savePartial } from './partial-result-service.js';
import { generationCreateFingerprint, readGenerationRunReplay } from './run-command-identity.js';
import {
  cancel,
  create,
  fail,
  type GenerationCompletion,
  type GenerationContinuationContext,
  type GenerationPartialDecision,
  type GenerationProseCandidateInput,
  type GenerationRunCreateInput as PersistedGenerationRunCreateInput,
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
  GenerationRunServiceError,
} from './run-repository.js';

export { GenerationRunServiceError } from './run-repository.js';
export type {
  GenerationRunServiceErrorCode,
  GenerationRunServiceOptions,
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

export type GenerationRunCreateInput = Omit<
  PersistedGenerationRunCreateInput,
  'scopeType' | 'scopeId'
> &
  Partial<Pick<PersistedGenerationRunCreateInput, 'scopeType' | 'scopeId'>>;

export interface GenerationRunCreation {
  readonly run: GenerationRun;
  readonly replayed: boolean;
}

const systemClock: DatabaseClock = { now: () => new Date() };
const VALIDATION_SEMANTIC_IDENTITY_METADATA_KEY = '__worldforgeValidationSemanticIdentityV1';

function normalizeCreateInput(input: GenerationRunCreateInput): PersistedGenerationRunCreateInput {
  const scopeType = input.scopeType ?? 'chapter';
  const scopeId =
    input.scopeId ??
    (scopeType === 'chapter'
      ? input.chapterId
      : scopeType === 'project'
        ? input.projectId
        : null);
  if (scopeId === null) {
    throw new GenerationRunServiceError(
      'GENERATION_BASE_CONFLICT',
      'A non-chapter GenerationRun requires an explicit scopeId.',
    );
  }
  return { ...input, scopeType, scopeId };
}

function withValidationSemanticIdentity(
  context: GenerationRunServiceContext,
  input: PersistedGenerationRunCreateInput,
): PersistedGenerationRunCreateInput {
  if (input.runType !== 'validate') return input;
  if (input.chapterId === null || input.constraintPackage === null) {
    throw new GenerationRunServiceError(
      'GENERATION_BASE_CONFLICT',
      'Validation GenerationRun requires a chapter scope and ConstraintPackage.',
    );
  }
  const sources = input.inputSources ?? [];
  const versionSource =
    sources.find((source) => source.sourceType === 'version' && source.metadata?.final === true) ??
    sources.find(
      (source) =>
        source.sourceType === 'version' &&
        input.constraintPackage?.sourceVersionIds.includes(source.sourceId),
    );
  if (!versionSource) {
    throw new GenerationRunServiceError(
      'GENERATION_BASE_CONFLICT',
      'Validation GenerationRun requires an authoritative Final Version input source.',
    );
  }
  const chapterId = input.chapterId;
  const identity = context.workspace.readProject(input.projectId, (database) => {
    const resolved = finalVersion(database, input.projectId, versionSource.sourceId);
    if (resolved.version.chapterId !== chapterId) {
      throw new GenerationRunServiceError(
        'GENERATION_BASE_CONFLICT',
        'Validation GenerationRun Final Version input belongs to another chapter.',
      );
    }
    return validationSemanticIdentity(database, resolved);
  });
  return {
    ...input,
    inputSources: sources.map((source) =>
      source === versionSource
        ? {
            ...source,
            metadata: {
              ...(source.metadata ?? {}),
              [VALIDATION_SEMANTIC_IDENTITY_METADATA_KEY]: identity,
            },
          }
        : source,
    ),
  };
}

export class GenerationRunService {
  readonly #context: GenerationRunServiceContext;
  readonly #creates = new BoundedIdempotentPromiseCache();

  constructor(workspace: ProjectWorkspaceService, options: GenerationRunServiceOptions = {}) {
    this.#context = {
      workspace,
      clock: options.clock ?? systemClock,
      idFactory: options.idFactory ?? randomUUID,
    };
  }

  async create(requestId: string, input: GenerationRunCreateInput): Promise<GenerationRun> {
    return (await this.createWithReplay(requestId, input)).run;
  }

  async createWithReplay(
    requestId: string,
    rawInput: GenerationRunCreateInput,
  ): Promise<GenerationRunCreation> {
    const input = normalizeCreateInput(rawInput);
    const fingerprint = generationCreateFingerprint(input);
    const cacheKey = `${input.projectId}:${requestId}`;
    try {
      const existing = this.#creates.get<GenerationRun>(cacheKey, fingerprint);
      if (existing) return { run: await existing, replayed: true };
    } catch (error) {
      if (error instanceof IdempotentRequestConflictError) {
        throw new GenerationRunServiceError(
          'GENERATION_RESULT_CONFLICT',
          'The requestId was already used for a different GenerationRun command.',
          { cause: error },
        );
      }
      throw error;
    }

    let replayed = false;
    const operation = Promise.resolve().then(async () => {
      const persisted = readGenerationRunReplay(this.#context.workspace, requestId, input);
      if (persisted) {
        replayed = true;
        return persisted;
      }
      return create(this.#context, requestId, withValidationSemanticIdentity(this.#context, input));
    });
    const run = await this.#creates.remember(cacheKey, fingerprint, operation);
    return { run, replayed };
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
