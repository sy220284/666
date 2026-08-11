import { randomUUID } from 'node:crypto';

import {
  ChapterCandidateOutputSchema,
  CoreGenerationResultSchema,
  DraftEntityIdSchema,
  ErrorCodeSchema,
  GENERATION_COMMANDS,
  GenerationRequestSchema,
  RewriteOutputSchema,
  SemanticValidationOutputSchema,
  SkeletonCandidateBatchOutputSchema,
  StateExtractionOutputSchema,
  type CandidateBlockInput,
  type CoreGenerationOperation,
  type CoreGenerationResult,
  type ErrorCode,
  type GenerationRunType,
  type ModelSupportProfile,
  type PromptOutputMode,
} from '@worldforge/contracts';
import {
  chapterPrompt,
  mergePrompt,
  parseChapterTextCandidate,
  rewritePrompt,
  selectChapterOutputMode,
  serializeConstraintPackage,
  skeletonPrompt,
  stateExtractPrompt,
  validatePrompt,
} from '@worldforge/prompts';

import type { HardenedConstraintPackageService } from './constraint-package-hardening.js';
import { GenerationRunServiceError, type GenerationRunService } from './generation-run.js';
import type { GenerationRuntime } from './generation-runtime.js';
import {
  GenerationSourceResolverError,
  type GenerationSourceResolver,
} from './generation-source-resolver.js';
import { createProviderAdapter } from './provider-adapter-runtime.js';
import { StateProposalServiceError, type StateProposalService } from './state-proposal.js';
import { TaskProtocolError } from './task-protocol.js';
import { projectOperationError } from './utility-errors.js';
import { ValidationServiceError, type ValidationService } from './validation.js';

export interface UtilityGenerationServices {
  readonly constraints: HardenedConstraintPackageService;
  readonly runs: GenerationRunService;
  readonly runtime: GenerationRuntime;
  readonly sources: GenerationSourceResolver;
  readonly stateProposals: StateProposalService;
  readonly validation: ValidationService;
}

interface Parser<Output> {
  parse(input: unknown): Output;
}

function parseStructured<Output>(parser: Parser<Output>, raw: string): Output {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/iu.exec(trimmed);
  const repaired = fenced?.[1] ?? trimmed;
  try {
    return parser.parse(JSON.parse(repaired));
  } catch (error) {
    throw Object.assign(
      new Error('The Provider returned invalid structured output.', { cause: error }),
      {
        code: 'AI_OUTPUT_INVALID_008',
        retryable: false,
      },
    );
  }
}

function generationError(error: unknown): ErrorCode {
  if (error instanceof GenerationRunServiceError) {
    switch (error.code) {
      case 'GENERATION_RUN_NOT_FOUND':
        return 'AI_RUN_NOT_FOUND_011';
      case 'GENERATION_RUN_TERMINAL':
      case 'GENERATION_PARTIAL_DECIDED':
        return 'AI_RUN_ALREADY_FINISHED_012';
      case 'GENERATION_BASE_CONFLICT':
        return 'CANDIDATE_BASE_CONFLICT_002';
      case 'GENERATION_PARTIAL_UNAVAILABLE':
      case 'GENERATION_RESULT_CONFLICT':
        return 'COMMON_CONFLICT_003';
      case 'GENERATION_CANDIDATE_INVALID':
      case 'GENERATION_MODEL_SUPPORT_INVALID':
        return 'AI_OUTPUT_INVALID_008';
      case 'GENERATION_RUN_NOT_ACTIVE':
        return 'COMMON_CONFLICT_003';
    }
  }
  if (error instanceof GenerationSourceResolverError) {
    switch (error.code) {
      case 'GENERATION_SOURCE_NOT_FOUND':
        return 'COMMON_NOT_FOUND_002';
      case 'GENERATION_SOURCE_STALE':
        return 'CANDIDATE_BASE_CONFLICT_002';
      case 'GENERATION_SOURCE_LOCKED':
        return 'DRAFT_BLOCK_LOCKED_003';
      case 'GENERATION_SOURCE_INVALID':
        return 'COMMON_INVALID_INPUT_001';
    }
  }
  if (error instanceof StateProposalServiceError) {
    if (error.code === 'STATE_PROPOSAL_NOT_FOUND') return 'COMMON_NOT_FOUND_002';
    if (error.code === 'STATE_PROPOSAL_CONFLICT') return 'COMMON_CONFLICT_003';
    return 'COMMON_INVALID_INPUT_001';
  }
  if (error instanceof ValidationServiceError) {
    if (error.code === 'VALIDATION_NOT_FOUND') return 'COMMON_NOT_FOUND_002';
    if (error.code === 'VALIDATION_CONFLICT') return 'COMMON_CONFLICT_003';
    return 'COMMON_INVALID_INPUT_001';
  }
  if (error instanceof TaskProtocolError) return error.code;
  if (error && typeof error === 'object' && 'code' in error) {
    const parsed = ErrorCodeSchema.safeParse(error.code);
    if (parsed.success) return parsed.data;
  }
  return projectOperationError(error);
}

function unsupported(runType: string): never {
  throw Object.assign(new Error(`The ${runType} workflow is implemented by a later M4-04 stage.`), {
    code: 'AI_MODEL_UNSUPPORTED_010',
  });
}

function requireDraft(
  baseDraftId: string | null,
  baseDraftRevision: number | null,
): { readonly baseDraftId: string; readonly baseDraftRevision: number } {
  if (baseDraftId === null || baseDraftRevision === null) {
    throw new GenerationSourceResolverError(
      'GENERATION_SOURCE_NOT_FOUND',
      'Generation requires an active Draft baseline.',
    );
  }
  return { baseDraftId, baseDraftRevision };
}

function modelSupport(
  services: UtilityGenerationServices,
  input: {
    readonly projectId: string;
    readonly providerId: string;
    readonly model: string;
    readonly taskType: GenerationRunType;
    readonly promptId: string;
    readonly promptVersion: number;
  },
): ModelSupportProfile {
  return services.runs.getModelSupport(input);
}

function request(
  runId: string,
  model: string,
  bundle: {
    readonly system: string;
    readonly messages: readonly { readonly role: 'user' | 'assistant'; readonly content: string }[];
    readonly structuredOutput?: {
      readonly name: string;
      readonly schema: Readonly<Record<string, unknown>>;
    };
    readonly metadata: {
      readonly promptId: string;
      readonly promptVersion: number;
      readonly taskType: GenerationRunType;
      readonly constraintHash: string;
    };
  },
  maxOutputTokens: number,
) {
  return GenerationRequestSchema.parse({
    runId,
    model,
    systemPrompt: bundle.system,
    messages: bundle.messages,
    maxOutputTokens: Math.min(1_000_000, Math.max(512, maxOutputTokens)),
    ...(bundle.structuredOutput ? { structuredOutput: bundle.structuredOutput } : {}),
    metadata: bundle.metadata,
  });
}

function proseBlocks(
  output: ReturnType<typeof ChapterCandidateOutputSchema.parse>,
): readonly CandidateBlockInput[] {
  return output.blocks.map((block) => ({
    blockType: block.type,
    text: block.content,
    attributes: {},
    ...(block.beatId && DraftEntityIdSchema.safeParse(block.beatId).success
      ? { beatId: block.beatId }
      : {}),
  }));
}

function runSettings(
  input: {
    readonly projectId: string;
    readonly chapterId: string;
    readonly baseDraftId: string | null;
    readonly baseDraftRevision: number | null;
  },
  runType: GenerationRunType,
  prompt: { readonly promptId: string; readonly version: number },
  outputMode: PromptOutputMode,
  operation: Extract<CoreGenerationOperation, { readonly operation: 'ai.startGeneration' }>,
  support: ModelSupportProfile,
  constraints: ReturnType<HardenedConstraintPackageService['build']>,
  inputSources: NonNullable<Parameters<GenerationRunService['create']>[1]['inputSources']>,
) {
  return {
    projectId: input.projectId,
    chapterId: input.chapterId,
    baseDraftId: input.baseDraftId,
    baseDraftRevision: input.baseDraftRevision,
    runType,
    promptId: prompt.promptId,
    promptVersion: prompt.version,
    outputMode,
    providerId: operation.provider.id,
    actualModel: operation.provider.model,
    supportStatus: support.status,
    constraintPackage: constraints,
    inputSources,
  };
}

async function startGeneration(
  services: UtilityGenerationServices,
  requestId: string,
  operation: Extract<CoreGenerationOperation, { readonly operation: 'ai.startGeneration' }>,
) {
  const input = operation.input;
  const intent = input.intent;
  const provider = createProviderAdapter(operation.provider, operation.credential);

  if (intent.runType === 'skeleton') {
    requireDraft(input.baseDraftId, input.baseDraftRevision);
    const resolved = services.sources.resolveSkeleton(
      input.projectId,
      input.chapterId,
      intent.requiredSceneBeatIds,
      intent.chapterGoal,
    );
    const constraints = services.constraints.build({
      projectId: input.projectId,
      chapterId: input.chapterId,
      taskType: 'skeleton',
      query: intent.chapterGoal,
    });
    const profile = modelSupport(services, {
      projectId: input.projectId,
      providerId: operation.provider.id,
      model: operation.provider.model,
      taskType: 'skeleton',
      promptId: skeletonPrompt.promptId,
      promptVersion: skeletonPrompt.version,
    });
    const bundle = skeletonPrompt.build({
      constraintHash: constraints.constraintHash,
      constraintContext: serializeConstraintPackage(constraints),
      targetLanguage: intent.targetLanguage,
      chapterGoal: intent.chapterGoal,
      requiredBeats: [...resolved.requiredBeats],
      tendency: intent.tendency,
      candidateCount: intent.candidateCount,
    });
    return services.runtime.startStructured({
      requestId,
      run: runSettings(
        input,
        'skeleton',
        skeletonPrompt,
        'structured',
        operation,
        profile,
        constraints,
        resolved.inputSources,
      ),
      provider,
      requestFor: (runId) =>
        request(runId, operation.provider.model, bundle, intent.candidateCount * 4_096),
      partialOnFailure: false,
      complete: async (runId, raw, usage) => {
        const output = parseStructured(SkeletonCandidateBatchOutputSchema, raw);
        if (output.candidates.length !== intent.candidateCount) {
          throw Object.assign(
            new Error('The Skeleton Candidate count does not match the request.'),
            {
              code: 'AI_OUTPUT_INVALID_008',
              retryable: false,
            },
          );
        }
        const requiredIds = new Set(resolved.requiredBeats.map((beat) => beat.beatId));
        for (const candidate of output.candidates) {
          const covered = new Set(candidate.beats.map((beat) => beat.beatId));
          if ([...requiredIds].some((beatId) => !covered.has(beatId))) {
            throw Object.assign(new Error('A Skeleton omitted a required SceneBeat.'), {
              code: 'AI_OUTPUT_INVALID_008',
              retryable: false,
            });
          }
        }
        const completed = await services.runs.completeSkeletonCandidates(requestId, {
          projectId: input.projectId,
          runId,
          candidates: output.candidates.map((candidate, index) => ({
            title: candidate.titleSuggestion?.trim() || `骨架候选 ${index + 1}`,
            structuredPayload: candidate,
          })),
          usage,
        });
        return {
          run: completed.run,
          candidateIds: completed.candidates.map((candidate) => candidate.candidateId),
          resultRefs: completed.run.resultRefs,
        };
      },
    });
  }

  if (intent.runType === 'chapter') {
    requireDraft(input.baseDraftId, input.baseDraftRevision);
    const resolved = services.sources.resolveChapter(
      input.projectId,
      input.chapterId,
      intent.source,
    );
    const continuation = input.continuationOfRunId
      ? services.runs.getContinuationContext({
          projectId: input.projectId,
          runId: input.continuationOfRunId,
        })
      : undefined;
    const inputSources = [
      ...resolved.inputSources,
      ...(continuation
        ? [
            {
              sourceType: 'generation_run' as const,
              sourceId: continuation.originalRunId,
              sourceOrder: resolved.inputSources.length,
              contentHash: continuation.originalConstraintHash,
              metadata: {
                originalPromptId: continuation.originalPromptId,
                originalPromptVersion: continuation.originalPromptVersion,
                receivedCharacters: continuation.receivedText.length,
              },
            },
          ]
        : []),
    ];
    const constraints = services.constraints.build({
      projectId: input.projectId,
      chapterId: input.chapterId,
      taskType: 'chapter',
      query:
        resolved.source.sourceType === 'direct_chapter_goal'
          ? resolved.source.chapterGoal
          : JSON.stringify(resolved.source),
    });
    const profile = modelSupport(services, {
      projectId: input.projectId,
      providerId: operation.provider.id,
      model: operation.provider.model,
      taskType: 'chapter',
      promptId: chapterPrompt.promptId,
      promptVersion: chapterPrompt.version,
    });
    const outputMode = selectChapterOutputMode({
      preferStructured: true,
      promptId: chapterPrompt.promptId,
      promptVersion: chapterPrompt.version,
      profile,
    }).mode;
    const bundle = chapterPrompt.build({
      constraintHash: constraints.constraintHash,
      constraintContext: serializeConstraintPackage(constraints),
      targetLanguage: intent.targetLanguage,
      source: resolved.source,
      targetCharacters: intent.targetCharacters,
      styleInstructions: intent.styleInstructions,
      outputMode,
      continuation,
    });
    const baseRun = runSettings(
      input,
      'chapter',
      chapterPrompt,
      outputMode,
      operation,
      profile,
      constraints,
      inputSources,
    );
    if (outputMode === 'text') {
      return services.runtime.startProse({
        requestId,
        run: baseRun,
        provider,
        requestFor: (runId) =>
          request(runId, operation.provider.model, bundle, intent.targetCharacters * 1.5),
        candidate: {
          title: continuation ? '继续生成候选' : '章节生成候选',
          candidateType: 'full',
        },
        parse: (raw) => {
          const parsed = parseChapterTextCandidate(raw);
          if (!parsed.ok) {
            throw Object.assign(new Error('The chapter output was empty after cleaning.'), {
              code: parsed.errorCode,
              retryable: false,
            });
          }
          return [continuation?.receivedText, parsed.text]
            .filter((text): text is string => Boolean(text))
            .join('\n\n')
            .split(/\n\s*\n/u)
            .map((text) => text.trim())
            .filter(Boolean)
            .map((text) => ({ blockType: 'paragraph' as const, text, attributes: {} }));
        },
      });
    }
    return services.runtime.startStructured({
      requestId,
      run: baseRun,
      provider,
      requestFor: (runId) =>
        request(runId, operation.provider.model, bundle, intent.targetCharacters * 1.5),
      partialOnFailure: true,
      complete: async (runId, raw, usage) => {
        const output = parseStructured(ChapterCandidateOutputSchema, raw);
        const completed = await services.runs.completeProseCandidate(requestId, {
          projectId: input.projectId,
          runId,
          title: continuation ? '继续生成候选' : '章节生成候选',
          candidateType: 'full',
          completeness: 'complete',
          blocks: [
            ...(continuation
              ? continuation.receivedText
                  .split(/\n\s*\n/u)
                  .map((text) => text.trim())
                  .filter(Boolean)
                  .map((text) => ({
                    blockType: 'paragraph' as const,
                    text,
                    attributes: {},
                  }))
              : []),
            ...proseBlocks(output),
          ],
          usage,
        });
        return {
          run: completed.run,
          candidateIds: [completed.candidate.candidateId],
          resultRefs: completed.run.resultRefs,
        };
      },
    });
  }

  if (intent.runType === 'rewrite') {
    requireDraft(input.baseDraftId, input.baseDraftRevision);
    const resolved = services.sources.resolveRewrite(
      input.projectId,
      input.chapterId,
      input.baseDraftId,
      input.baseDraftRevision,
      intent.scope,
    );
    const constraints = services.constraints.build({
      projectId: input.projectId,
      chapterId: input.chapterId,
      taskType: 'rewrite',
      query: intent.instruction,
    });
    const profile = modelSupport(services, {
      projectId: input.projectId,
      providerId: operation.provider.id,
      model: operation.provider.model,
      taskType: 'rewrite',
      promptId: rewritePrompt.promptId,
      promptVersion: rewritePrompt.version,
    });
    const bundle = rewritePrompt.build({
      constraintHash: constraints.constraintHash,
      constraintContext: serializeConstraintPackage(constraints),
      targetLanguage: intent.targetLanguage,
      instruction: intent.instruction,
      sourceText: resolved.sourceText,
    });
    return services.runtime.startStructured({
      requestId,
      run: runSettings(
        input,
        'rewrite',
        rewritePrompt,
        'structured',
        operation,
        profile,
        constraints,
        resolved.inputSources,
      ),
      provider,
      requestFor: (runId) =>
        request(runId, operation.provider.model, bundle, resolved.sourceText.length * 2),
      partialOnFailure: true,
      complete: async (runId, raw, usage) => {
        const output = parseStructured(RewriteOutputSchema, raw);
        const completed = await services.runs.completeProseCandidate(requestId, {
          projectId: input.projectId,
          runId,
          title: '改写候选',
          candidateType: 'rewrite',
          completeness: 'complete',
          blocks: resolved.buildBlocks(output.replacement),
          sourceMappings: resolved.sourceMappings,
          usage,
        });
        return {
          run: completed.run,
          candidateIds: [completed.candidate.candidateId],
          resultRefs: completed.run.resultRefs,
        };
      },
    });
  }

  if (intent.runType === 'merge') {
    requireDraft(input.baseDraftId, input.baseDraftRevision);
    const resolved = services.sources.resolveMerge(
      input.projectId,
      input.chapterId,
      intent.mapping,
    );
    const constraints = services.constraints.build({
      projectId: input.projectId,
      chapterId: input.chapterId,
      taskType: 'merge',
      query: intent.instruction ?? '融合作者选定的来源单元',
    });
    const profile = modelSupport(services, {
      projectId: input.projectId,
      providerId: operation.provider.id,
      model: operation.provider.model,
      taskType: 'merge',
      promptId: mergePrompt.promptId,
      promptVersion: mergePrompt.version,
    });
    const bundle = mergePrompt.build({
      constraintHash: constraints.constraintHash,
      constraintContext: serializeConstraintPackage(constraints),
      targetLanguage: intent.targetLanguage,
      sources: [...resolved.sources],
      instruction: intent.instruction,
    });
    return services.runtime.startStructured({
      requestId,
      run: runSettings(
        input,
        'merge',
        mergePrompt,
        'structured',
        operation,
        profile,
        constraints,
        resolved.inputSources,
      ),
      provider,
      requestFor: (runId) =>
        request(
          runId,
          operation.provider.model,
          bundle,
          resolved.sources.reduce((total, source) => total + source.text.length, 0) * 1.5,
        ),
      partialOnFailure: true,
      complete: async (runId, raw, usage) => {
        const output = parseStructured(ChapterCandidateOutputSchema, raw);
        const completed = await services.runs.completeProseCandidate(requestId, {
          projectId: input.projectId,
          runId,
          title: '融合候选',
          candidateType: 'merge',
          completeness: 'complete',
          blocks: proseBlocks(output),
          sourceMappings: resolved.sourceMappings,
          usage,
        });
        return {
          run: completed.run,
          candidateIds: [completed.candidate.candidateId],
          resultRefs: completed.run.resultRefs,
        };
      },
    });
  }

  if (intent.runType === 'state_extract') {
    const resolved = services.sources.resolveFinalVersion(
      input.projectId,
      input.chapterId,
      intent.sourceVersionId,
    );
    const constraints = services.constraints.build({
      projectId: input.projectId,
      chapterId: input.chapterId,
      taskType: 'state_extract',
      query: '从当前定稿提取需要作者确认的实体状态和人物弧光变化',
    });
    const profile = modelSupport(services, {
      projectId: input.projectId,
      providerId: operation.provider.id,
      model: operation.provider.model,
      taskType: 'state_extract',
      promptId: stateExtractPrompt.promptId,
      promptVersion: stateExtractPrompt.version,
    });
    const bundle = stateExtractPrompt.build({
      constraintHash: constraints.constraintHash,
      constraintContext: serializeConstraintPackage(constraints),
      finalVersionId: resolved.versionId,
      blocks: resolved.blocks.map((block) => ({
        logicalBlockId: block.logicalBlockId,
        content: block.content,
      })),
    });
    return services.runtime.startStructured({
      requestId,
      run: runSettings(
        input,
        'state_extract',
        stateExtractPrompt,
        'structured',
        operation,
        profile,
        constraints,
        resolved.inputSources,
      ),
      provider,
      requestFor: (runId) =>
        request(
          runId,
          operation.provider.model,
          bundle,
          Math.max(2_048, resolved.blocks.length * 256),
        ),
      partialOnFailure: false,
      complete: async (runId, raw, usage) => {
        const output = parseStructured(StateExtractionOutputSchema, raw);
        await services.stateProposals.completeProviderBatch(requestId, {
          projectId: input.projectId,
          chapterId: input.chapterId,
          sourceVersionId: resolved.versionId,
          runId,
          proposals: output.proposals,
          usage,
        });
        const run = services.runs.get({ projectId: input.projectId, runId });
        return {
          run,
          candidateIds: [],
          resultRefs: run.resultRefs,
        };
      },
    });
  }

  if (intent.runType === 'validate') {
    const resolved = services.sources.resolveFinalVersion(
      input.projectId,
      input.chapterId,
      intent.sourceVersionId,
    );
    await services.validation.runRules(randomUUID(), {
      projectId: input.projectId,
      sourceVersionId: resolved.versionId,
    });
    const constraints = services.constraints.build({
      projectId: input.projectId,
      chapterId: input.chapterId,
      taskType: 'validate',
      query: '核对当前定稿的连续性、设定、知情、伏笔、文风和人物弧光风险',
    });
    const profile = modelSupport(services, {
      projectId: input.projectId,
      providerId: operation.provider.id,
      model: operation.provider.model,
      taskType: 'validate',
      promptId: validatePrompt.promptId,
      promptVersion: validatePrompt.version,
    });
    const bundle = validatePrompt.build({
      constraintHash: constraints.constraintHash,
      constraintContext: serializeConstraintPackage(constraints),
      versionId: resolved.versionId,
      blocks: resolved.blocks.map((block) => ({
        logicalBlockId: block.logicalBlockId,
        content: block.content,
      })),
    });
    return services.runtime.startStructured({
      requestId,
      run: runSettings(
        input,
        'validate',
        validatePrompt,
        'structured',
        operation,
        profile,
        constraints,
        resolved.inputSources,
      ),
      provider,
      requestFor: (runId) =>
        request(
          runId,
          operation.provider.model,
          bundle,
          Math.max(2_048, resolved.blocks.length * 256),
        ),
      partialOnFailure: false,
      complete: async (runId, raw, usage) => {
        const output = parseStructured(SemanticValidationOutputSchema, raw);
        await services.validation.completeAiBatch(requestId, {
          projectId: input.projectId,
          chapterId: input.chapterId,
          sourceVersionId: resolved.versionId,
          runId,
          output,
          usage,
        });
        const run = services.runs.get({ projectId: input.projectId, runId });
        return {
          run,
          candidateIds: [],
          resultRefs: run.resultRefs,
        };
      },
    });
  }

  unsupported('unknown');
}

export async function executeGenerationOperation(
  services: UtilityGenerationServices,
  requestId: string,
  operation: CoreGenerationOperation,
): Promise<CoreGenerationResult> {
  try {
    switch (operation.operation) {
      case GENERATION_COMMANDS.start:
        return CoreGenerationResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await startGeneration(services, requestId, operation),
        });
      case GENERATION_COMMANDS.getRun:
        return CoreGenerationResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: services.runs.get(operation.input),
        });
      case GENERATION_COMMANDS.listRuns:
        return CoreGenerationResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: services.runs.list(operation.input),
        });
      case GENERATION_COMMANDS.cancel:
        return CoreGenerationResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: await services.runtime.cancel(requestId, operation.input),
        });
      case GENERATION_COMMANDS.savePartial: {
        const decision = await services.runs.savePartial(requestId, operation.input);
        return CoreGenerationResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: {
            run: decision.run,
            candidateId: decision.candidate?.candidateId ?? null,
          },
        });
      }
      case GENERATION_COMMANDS.discardPartial: {
        const decision = await services.runs.discardPartial(requestId, operation.input);
        return CoreGenerationResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: { run: decision.run, candidateId: null },
        });
      }
      case GENERATION_COMMANDS.getModelSupport:
        return CoreGenerationResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: { profile: services.runs.getModelSupport(operation.input) },
        });
    }
  } catch (error) {
    return CoreGenerationResultSchema.parse({
      ok: false,
      operation: operation.operation,
      errorCode: generationError(error),
    });
  }
}
