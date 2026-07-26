import { randomUUID } from 'node:crypto';

import {
  ErrorCodeSchema,
  GenerationRequestSchema,
  type CandidateBlockInput,
  type ErrorCode,
  type GenerationRequest,
  type GenerationResultRef,
  type GenerationRun,
  type ProviderEvent,
} from '@worldforge/contracts';

import {
  GenerationRunServiceError,
  type GenerationProseCandidateInput,
  type GenerationRunCreateInput,
  type GenerationRunService,
  type GenerationUsage,
} from './generation-run.js';
import { TaskProtocolError, type RunningTask, type TaskProtocol } from './task-protocol.js';

const MAX_GENERATION_TEXT_CHARACTERS = 2_000_000;

export interface GenerationRuntimeProvider {
  generate(request: GenerationRequest, signal: AbortSignal): AsyncIterable<ProviderEvent>;
}

export interface StartProseGenerationInput {
  readonly requestId: string;
  readonly run: GenerationRunCreateInput;
  readonly provider: GenerationRuntimeProvider;
  readonly requestFor: (runId: string) => GenerationRequest;
  readonly candidate: {
    readonly title: string;
    readonly candidateType: GenerationProseCandidateInput['candidateType'];
    readonly sourceVersionId?: string | null;
  };
  readonly parse: (text: string) => readonly CandidateBlockInput[];
}

export interface StartedGeneration {
  readonly run: GenerationRun;
  readonly taskId: string;
}

export interface StartStructuredGenerationInput {
  readonly requestId: string;
  readonly run: GenerationRunCreateInput;
  readonly provider: GenerationRuntimeProvider;
  readonly requestFor: (runId: string) => GenerationRequest;
  readonly partialOnFailure: boolean;
  readonly complete: (
    runId: string,
    text: string,
    usage: GenerationUsage,
  ) => Promise<{
    readonly run: GenerationRun;
    readonly candidateIds: readonly string[];
    readonly resultRefs: readonly GenerationResultRef[];
  }>;
}

interface Execution {
  readonly projectId: string;
  readonly taskId: string;
  readonly completion: Promise<void>;
}

function runtimeError(error: unknown): { readonly code: ErrorCode; readonly retryable: boolean } {
  if (error && typeof error === 'object') {
    const parsed = ErrorCodeSchema.safeParse('code' in error ? error.code : undefined);
    if (parsed.success) {
      return {
        code: parsed.data,
        retryable: 'retryable' in error && error.retryable === true,
      };
    }
  }
  return { code: 'AI_OUTPUT_INVALID_008', retryable: false };
}

function validateRequest(run: GenerationRun, request: GenerationRequest): GenerationRequest {
  const parsed = GenerationRequestSchema.parse(request);
  if (
    parsed.runId !== run.runId ||
    parsed.model !== run.actualModel ||
    parsed.metadata.promptId !== run.promptId ||
    parsed.metadata.promptVersion !== run.promptVersion ||
    parsed.metadata.taskType !== run.runType
  ) {
    throw new GenerationRunServiceError(
      'GENERATION_RESULT_CONFLICT',
      'The Provider request metadata does not match the persisted GenerationRun.',
    );
  }
  return parsed;
}

export class GenerationRuntime {
  readonly #runs: GenerationRunService;
  readonly #tasks: TaskProtocol;
  readonly #executions = new Map<string, Execution>();

  constructor(runs: GenerationRunService, tasks: TaskProtocol) {
    this.#runs = runs;
    this.#tasks = tasks;
  }

  async startProse(input: StartProseGenerationInput): Promise<StartedGeneration> {
    const run = await this.#runs.create(input.requestId, input.run);
    const task = this.#tasks.startTask({
      taskId: run.taskId,
      taskType: run.runType,
      projectId: run.projectId,
      runId: run.runId,
      initialStage: 'queued',
    });
    const completion = this.#execute(run, task, input);
    this.#executions.set(run.runId, {
      projectId: run.projectId,
      taskId: run.taskId,
      completion,
    });
    this.#trimExecutions();
    return { run, taskId: task.taskId };
  }

  async startStructured(input: StartStructuredGenerationInput): Promise<StartedGeneration> {
    const run = await this.#runs.create(input.requestId, input.run);
    const task = this.#tasks.startTask({
      taskId: run.taskId,
      taskType: run.runType,
      projectId: run.projectId,
      runId: run.runId,
      initialStage: 'queued',
    });
    const completion = this.#executeStructured(run, task, input);
    this.#executions.set(run.runId, {
      projectId: run.projectId,
      taskId: run.taskId,
      completion,
    });
    this.#trimExecutions();
    return { run, taskId: task.taskId };
  }

  async waitFor(runId: string): Promise<void> {
    await this.#executions.get(runId)?.completion;
  }

  async cancel(
    requestId: string,
    input: { readonly projectId: string; readonly runId: string },
  ): Promise<GenerationRun> {
    this.#runs.get(input);
    const execution = this.#executions.get(input.runId);
    if (execution) {
      try {
        this.#tasks.cancel(execution.taskId, input.projectId);
      } catch (error) {
        if (!(error instanceof TaskProtocolError)) throw error;
        if (error.code === 'TASK_NOT_CANCELLABLE_001') throw error;
      }
    }
    const snapshot = execution
      ? this.#tasks.getSnapshot(execution.taskId, input.projectId)
      : undefined;
    return this.#runs.cancel(
      requestId,
      input,
      snapshot?.previewTruncated ? undefined : snapshot?.previewText,
    );
  }

  async #execute(
    initialRun: GenerationRun,
    task: RunningTask,
    input: StartProseGenerationInput,
  ): Promise<void> {
    let text = '';
    let usage: { inputTokens?: number; outputTokens?: number } = {};
    try {
      await this.#runs.markRunning(randomUUID(), {
        projectId: initialRun.projectId,
        runId: initialRun.runId,
      });
      task.setStage('calling_model', '正在请求模型');
      await this.#runs.markStage(randomUUID(), {
        projectId: initialRun.projectId,
        runId: initialRun.runId,
        stage: 'calling_model',
      });
      const request = validateRequest(initialRun, input.requestFor(initialRun.runId));
      let completed = false;
      for await (const event of input.provider.generate(request, task.signal)) {
        switch (event.type) {
          case 'connected':
            task.setStage('receiving_output', '正在接收模型输出');
            await this.#runs.markStage(randomUUID(), {
              projectId: initialRun.projectId,
              runId: initialRun.runId,
              stage: 'receiving_output',
            });
            break;
          case 'delta':
            if (text.length + event.text.length > MAX_GENERATION_TEXT_CHARACTERS) {
              throw Object.assign(new Error('Generation output exceeded the safe text limit.'), {
                code: 'AI_OUTPUT_INVALID_008',
                retryable: false,
              });
            }
            text += event.text;
            task.pushDelta(event.text);
            break;
          case 'usage':
            usage = {
              ...(event.inputTokens === undefined ? {} : { inputTokens: event.inputTokens }),
              ...(event.outputTokens === undefined ? {} : { outputTokens: event.outputTokens }),
            };
            task.reportUsage(usage);
            break;
          case 'completed':
            completed = true;
            break;
          case 'warning':
            break;
        }
      }
      if (task.signal.aborted) return;
      if (!completed) {
        throw Object.assign(new Error('The Provider stream ended without completion.'), {
          code: 'AI_STREAM_INTERRUPTED_009',
          retryable: true,
        });
      }
      if (!text.trim()) {
        throw Object.assign(new Error('The Provider returned no prose.'), {
          code: 'AI_OUTPUT_INVALID_008',
          retryable: false,
        });
      }
      task.setStage('parsing_output', '正在整理模型输出');
      await this.#runs.markStage(randomUUID(), {
        projectId: initialRun.projectId,
        runId: initialRun.runId,
        stage: 'parsing_output',
      });
      const blocks = input.parse(text);
      task.setStage('saving_candidate', '正在保存候选', { cancellable: false });
      await this.#runs.markStage(randomUUID(), {
        projectId: initialRun.projectId,
        runId: initialRun.runId,
        stage: 'saving_candidate',
      });
      const completedRun = await this.#runs.completeProseCandidate(randomUUID(), {
        projectId: initialRun.projectId,
        runId: initialRun.runId,
        title: input.candidate.title,
        candidateType: input.candidate.candidateType,
        completeness: 'complete',
        ...(input.candidate.sourceVersionId === undefined
          ? {}
          : { sourceVersionId: input.candidate.sourceVersionId }),
        blocks,
        usage,
      });
      const resultRef = completedRun.run.resultRefs[0];
      if (!resultRef || resultRef.resultType !== 'candidate') {
        throw new GenerationRunServiceError(
          'GENERATION_RESULT_CONFLICT',
          'The completed Candidate has no typed result reference.',
        );
      }
      task.saveCandidate(completedRun.candidate.candidateId, 'complete');
      task.saveResult(resultRef);
      task.completeResults(completedRun.run.resultRefs);
    } catch (error) {
      if (task.signal.aborted) return;
      const mapped = runtimeError(error);
      try {
        await this.#runs.fail(randomUUID(), {
          projectId: initialRun.projectId,
          runId: initialRun.runId,
          errorCode: mapped.code,
          retryable: mapped.retryable,
          ...(text ? { partialText: text } : {}),
        });
      } catch (persistenceError) {
        if (!(
          persistenceError instanceof GenerationRunServiceError &&
          persistenceError.code === 'GENERATION_RUN_TERMINAL'
        )) {
          task.fail('COMMON_INTERNAL_999', false);
          return;
        }
      }
      task.fail(mapped.code, mapped.retryable);
    }
  }

  async #executeStructured(
    initialRun: GenerationRun,
    task: RunningTask,
    input: StartStructuredGenerationInput,
  ): Promise<void> {
    let text = '';
    let usage: GenerationUsage = {};
    try {
      await this.#runs.markRunning(randomUUID(), {
        projectId: initialRun.projectId,
        runId: initialRun.runId,
      });
      task.setStage('calling_model', '正在请求模型');
      await this.#runs.markStage(randomUUID(), {
        projectId: initialRun.projectId,
        runId: initialRun.runId,
        stage: 'calling_model',
      });
      const request = validateRequest(initialRun, input.requestFor(initialRun.runId));
      let completed = false;
      for await (const event of input.provider.generate(request, task.signal)) {
        switch (event.type) {
          case 'connected':
            task.setStage('receiving_output', '正在接收模型输出');
            await this.#runs.markStage(randomUUID(), {
              projectId: initialRun.projectId,
              runId: initialRun.runId,
              stage: 'receiving_output',
            });
            break;
          case 'delta':
            if (text.length + event.text.length > MAX_GENERATION_TEXT_CHARACTERS) {
              throw Object.assign(new Error('Generation output exceeded the safe text limit.'), {
                code: 'AI_OUTPUT_INVALID_008',
                retryable: false,
              });
            }
            text += event.text;
            task.pushDelta(event.text);
            break;
          case 'usage':
            usage = {
              ...(event.inputTokens === undefined ? {} : { inputTokens: event.inputTokens }),
              ...(event.outputTokens === undefined ? {} : { outputTokens: event.outputTokens }),
            };
            task.reportUsage(usage);
            break;
          case 'completed':
            completed = true;
            break;
          case 'warning':
            break;
        }
      }
      if (task.signal.aborted) return;
      if (!completed) {
        throw Object.assign(new Error('The Provider stream ended without completion.'), {
          code: 'AI_STREAM_INTERRUPTED_009',
          retryable: true,
        });
      }
      if (!text.trim()) {
        throw Object.assign(new Error('The Provider returned no structured result.'), {
          code: 'AI_OUTPUT_INVALID_008',
          retryable: false,
        });
      }
      task.setStage('parsing_output', '正在校验结构化输出');
      await this.#runs.markStage(randomUUID(), {
        projectId: initialRun.projectId,
        runId: initialRun.runId,
        stage: 'parsing_output',
      });
      task.setStage('saving_candidate', '正在保存候选', { cancellable: false });
      await this.#runs.markStage(randomUUID(), {
        projectId: initialRun.projectId,
        runId: initialRun.runId,
        stage: 'saving_candidate',
      });
      const result = await input.complete(initialRun.runId, text, usage);
      for (const candidateId of result.candidateIds) task.saveCandidate(candidateId, 'complete');
      for (const resultRef of result.resultRefs) task.saveResult(resultRef);
      task.completeResults(result.resultRefs);
    } catch (error) {
      if (task.signal.aborted) return;
      const mapped = runtimeError(error);
      try {
        await this.#runs.fail(randomUUID(), {
          projectId: initialRun.projectId,
          runId: initialRun.runId,
          errorCode: mapped.code,
          retryable: mapped.retryable,
          ...(text && input.partialOnFailure ? { partialText: text } : {}),
        });
      } catch (persistenceError) {
        if (!(
          persistenceError instanceof GenerationRunServiceError &&
          persistenceError.code === 'GENERATION_RUN_TERMINAL'
        )) {
          task.fail('COMMON_INTERNAL_999', false);
          return;
        }
      }
      task.fail(mapped.code, mapped.retryable);
    }
  }

  #trimExecutions(): void {
    while (this.#executions.size > 1_000) {
      const oldest = this.#executions.keys().next().value;
      if (typeof oldest !== 'string') break;
      this.#executions.delete(oldest);
    }
  }
}
