import { randomUUID } from 'node:crypto';

import {
  ChapterCandidateOutputSchema,
  CoreGenerationResultSchema,
  DraftEntityIdSchema,
  GENERATION_COMMANDS,
  GenerationRequestSchema,
  RewriteOutputSchema,
  SemanticValidationOutputSchema,
  SkeletonCandidateBatchOutputSchema,
  StateExtractionOutputSchema,
  type CandidateBlockInput,
  type CoreGenerationOperation,
  type CoreGenerationResult,
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
import { generationOperationError } from './generation-operation-error.js';
import { type GenerationRunService } from './generation-run.js';
import type { GenerationRuntime } from './generation-runtime.js';
import {
  GenerationSourceResolverError,
  type GenerationSourceResolver,
} from './generation-source-resolver.js';
import { createProviderAdapter } from './provider-adapter-runtime.js';
import type { StateProposalService } from './state-proposal.js';
import type { ValidationService } from './validation.js';

export interface UtilityGenerationServices {
  readonly constraints: HardenedConstraintPackageService;
  readonly runs: GenerationRunService;
  readonly runtime: GenerationRuntime;
  readonly sources: GenerationSourceResolver;
  readonly stateProposals: StateProposalService;
  readonly validation: ValidationService;
}

type StartOperation = Extract<
  CoreGenerationOperation,
  { readonly operation: 'ai.startGeneration' }
>;

interface Parser<Output> {
  parse(input: unknown): Output;
}

interface GenerationWorkflowContext {
  readonly services: UtilityGenerationServices;
  readonly requestId: string;
  readonly operation: StartOperation;
}

type GenerationWorkflowHandler = (context: GenerationWorkflowContext) => Promise<unknown>;

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

function workflowMismatch(expected: GenerationRunType, actual: GenerationRunType): never {
  throw new TypeError(
    `Generation workflow handler mismatch: expected ${expected}, received ${actual}.`,
  );
}

function unsupported(runType: string): never {
  throw Object.assign(new Error(`The ${runType} workflow is not implemented yet.`), {
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

function requireChapter(chapterId: string | null): string {
  if (chapterId === null) {
    throw new GenerationSourceResolverError(
      'GENERATION_SOURCE_NOT_FOUND',
      'This Generation workflow requires a chapter scope.',
    );
  }
  return chapterId;
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
  input: StartOperation['input'],
  runType: GenerationRunType,
  prompt: { readonly promptId: string; readonly version: number },
  outputMode: PromptOutputMode,
  operation: StartOperation,
  support: ModelSupportProfile,
  constraints: ReturnType<HardenedConstraintPackageService['build']>,
  inputSources: NonNullable<Parameters<GenerationRunService['create']>[1]['inputSources']>,
) {
  return {
    projectId: input.projectId,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
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

async function skeletonWorkflow({ services, requestId, operation }: GenerationWorkflowContext) {
  const input = operation.input;
  if (input.intent.runType !== 'skeleton') {
    return workflowMismatch('skeleton', input.intent.runType);
  }
  const intent = input.intent;
  const chapterId = requireChapter(input.chapterId);
  requireDraft(input.baseDraftId, input.baseDraftRevision);
  const provider = createProviderAdapter(operation.provider, operation.credential);
  const resolved = services.sources.resolveSkeleton(
    input.projectId,
    chapterId,
    intent.requiredSceneBeatIds,
    intent.chapterGoal,
  );
  const constraints = services.constraints.build({
    projectId: input.projectId,
    chapterId,
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
        throw Object.assign(new Error('The Skeleton Candidate count does not match the request.'), {
          code: 'AI_OUTPUT_INVALID_008',
          retryable: false,
        });
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

async function chapterWorkflow({ services, requestId, operation }: GenerationWorkflowContext) {
  const input = operation.input;
  if (input.intent.runType !== 'chapter') return workflowMismatch('chapter', input.intent.runType);
  const intent = input.intent;
  const chapterId = requireChapter(input.chapterId);
  requireDraft(input.baseDraftId, input.baseDraftRevision);
  const provider = createProviderAdapter(operation.provider, operation.credential);
  const resolved = services.sources.resolveChapter(input.projectId, chapterId, intent.source);
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
    chapterId,
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

async function rewriteWorkflow({ services, requestId, operation }: GenerationWorkflowContext) {
  const input = operation.input;
  if (input.intent.runType !== 'rewrite') return workflowMismatch('rewrite', input.intent.runType);
  const intent = input.intent;
  const chapterId = requireChapter(input.chapterId);
  const draft = requireDraft(input.baseDraftId, input.baseDraftRevision);
  const provider = createProviderAdapter(operation.provider, operation.credential);
  const resolved = services.sources.resolveRewrite(
    input.projectId,
    chapterId,
    draft.baseDraftId,
    draft.baseDraftRevision,
    intent.scope,
  );
  const constraints = services.constraints.build({
    projectId: input.projectId,
    chapterId,
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

async function mergeWorkflow({ services, requestId, operation }: GenerationWorkflowContext) {
  const input = operation.input;
  if (input.intent.runType !== 'merge') return workflowMismatch('merge', input.intent.runType);
  const intent = input.intent;
  const chapterId = requireChapter(input.chapterId);
  requireDraft(input.baseDraftId, input.baseDraftRevision);
  const provider = createProviderAdapter(operation.provider, operation.credential);
  const resolved = services.sources.resolveMerge(input.projectId, chapterId, intent.mapping);
  const constraints = services.constraints.build({
    projectId: input.projectId,
    chapterId,
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

async function stateExtractWorkflow({ services, requestId, operation }: GenerationWorkflowContext) {
  const input = operation.input;
  if (input.intent.runType !== 'state_extract') {
    return workflowMismatch('state_extract', input.intent.runType);
  }
  const intent = input.intent;
  const chapterId = requireChapter(input.chapterId);
  const provider = createProviderAdapter(operation.provider, operation.credential);
  const resolved = services.sources.resolveFinalVersion(
    input.projectId,
    chapterId,
    intent.sourceVersionId,
  );
  const constraints = services.constraints.build({
    projectId: input.projectId,
    chapterId,
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
        chapterId,
        sourceVersionId: resolved.versionId,
        runId,
        proposals: output.proposals,
        usage,
      });
      const run = services.runs.get({ projectId: input.projectId, runId });
      return { run, candidateIds: [], resultRefs: run.resultRefs };
    },
  });
}

async function validateWorkflow({ services, requestId, operation }: GenerationWorkflowContext) {
  const input = operation.input;
  if (input.intent.runType !== 'validate')
    return workflowMismatch('validate', input.intent.runType);
  const intent = input.intent;
  const chapterId = requireChapter(input.chapterId);
  const provider = createProviderAdapter(operation.provider, operation.credential);
  const resolved = services.sources.resolveFinalVersion(
    input.projectId,
    chapterId,
    intent.sourceVersionId,
  );
  await services.validation.runRules(randomUUID(), {
    projectId: input.projectId,
    sourceVersionId: resolved.versionId,
  });
  const constraints = services.constraints.build({
    projectId: input.projectId,
    chapterId,
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
        chapterId,
        sourceVersionId: resolved.versionId,
        runId,
        output,
        usage,
      });
      const run = services.runs.get({ projectId: input.projectId, runId });
      return { run, candidateIds: [], resultRefs: run.resultRefs };
    },
  });
}

async function ideaExploreWorkflow({ operation }: GenerationWorkflowContext): Promise<never> {
  if (operation.input.intent.runType !== 'idea_explore') {
    return workflowMismatch('idea_explore', operation.input.intent.runType);
  }
  return unsupported('idea_explore');
}

export const GenerationWorkflowHandlers = {
  skeleton: skeletonWorkflow,
  chapter: chapterWorkflow,
  rewrite: rewriteWorkflow,
  merge: mergeWorkflow,
  validate: validateWorkflow,
  state_extract: stateExtractWorkflow,
  idea_explore: ideaExploreWorkflow,
} as const satisfies Record<GenerationRunType, GenerationWorkflowHandler>;

async function startGeneration(
  services: UtilityGenerationServices,
  requestId: string,
  operation: StartOperation,
) {
  const runType = operation.input.intent.runType;
  return GenerationWorkflowHandlers[runType]({ services, requestId, operation });
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
      errorCode: generationOperationError(error),
    });
  }
}
