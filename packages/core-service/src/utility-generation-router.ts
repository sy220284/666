import {
  CoreGenerationResultSchema,
  ErrorCodeSchema,
  GENERATION_COMMANDS,
  GenerationRequestSchema,
  type CoreGenerationOperation,
  type CoreGenerationResult,
  type ErrorCode,
} from '@worldforge/contracts';
import {
  chapterPrompt,
  parseChapterTextCandidate,
  serializeConstraintPackage,
} from '@worldforge/prompts';

import type { HardenedConstraintPackageService } from './constraint-package-hardening.js';
import { GenerationRunServiceError, type GenerationRunService } from './generation-run.js';
import type { GenerationRuntime } from './generation-runtime.js';
import { createProviderAdapter } from './provider-adapter-runtime.js';
import { TaskProtocolError } from './task-protocol.js';
import { projectOperationError } from './utility-errors.js';

export interface UtilityGenerationServices {
  readonly constraints: HardenedConstraintPackageService;
  readonly runs: GenerationRunService;
  readonly runtime: GenerationRuntime;
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

export async function executeGenerationOperation(
  services: UtilityGenerationServices,
  requestId: string,
  operation: CoreGenerationOperation,
): Promise<CoreGenerationResult> {
  try {
    switch (operation.operation) {
      case GENERATION_COMMANDS.start: {
        const input = operation.input;
        const intent = input.intent;
        if (intent.runType !== 'chapter') unsupported(intent.runType);
        if (intent.source.sourceType !== 'direct_chapter_goal') unsupported('chapter-source');
        const constraints = services.constraints.build({
          projectId: input.projectId,
          chapterId: input.chapterId,
          taskType: 'chapter',
          query: intent.source.chapterGoal,
        });
        const profile = services.runs.getModelSupport({
          projectId: input.projectId,
          providerId: operation.provider.id,
          model: operation.provider.model,
          taskType: 'chapter',
          promptId: chapterPrompt.promptId,
          promptVersion: chapterPrompt.version,
        });
        const bundle = chapterPrompt.build({
          constraintHash: constraints.constraintHash,
          constraintContext: serializeConstraintPackage(constraints),
          targetLanguage: intent.targetLanguage,
          source: intent.source,
          targetCharacters: intent.targetCharacters,
          styleInstructions: intent.styleInstructions,
          outputMode: 'text',
        });
        const provider = createProviderAdapter(operation.provider, operation.credential);
        const started = await services.runtime.startProse({
          requestId,
          run: {
            projectId: input.projectId,
            chapterId: input.chapterId,
            baseDraftId: input.baseDraftId,
            baseDraftRevision: input.baseDraftRevision,
            runType: 'chapter',
            promptId: bundle.metadata.promptId,
            promptVersion: bundle.metadata.promptVersion,
            outputMode: 'text',
            providerId: operation.provider.id,
            actualModel: operation.provider.model,
            supportStatus: profile.status,
            constraintPackage: constraints,
          },
          provider,
          requestFor: (runId) =>
            GenerationRequestSchema.parse({
              runId,
              model: operation.provider.model,
              systemPrompt: bundle.system,
              messages: bundle.messages,
              maxOutputTokens: Math.min(
                1_000_000,
                Math.max(512, Math.ceil(intent.targetCharacters * 1.5)),
              ),
              metadata: bundle.metadata,
            }),
          candidate: { title: '章节生成候选', candidateType: 'full' },
          parse: (raw) => {
            const parsed = parseChapterTextCandidate(raw);
            if (!parsed.ok) {
              throw Object.assign(new Error('The chapter output was empty after cleaning.'), {
                code: parsed.errorCode,
                retryable: false,
              });
            }
            return parsed.text
              .split(/\n\s*\n/u)
              .map((text) => text.trim())
              .filter(Boolean)
              .map((text) => ({ blockType: 'paragraph' as const, text, attributes: {} }));
          },
        });
        return CoreGenerationResultSchema.parse({
          ok: true,
          operation: operation.operation,
          data: started,
        });
      }
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
