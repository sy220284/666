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

export type GenerationTaskProtocol = Pick<TaskProtocol, 'startTask' | 'getSnapshot' | 'cancel'>;

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

interface CancellationBarrier {
  readonly decision: Promise<boolean>;
  readonly resolve: (cancelled: boolean) => void;
}

interface GenerationLifecycleResult {
  readonly candidateIds: readonly string[];
  readonly resultRefs: readonly GenerationResultRef[];
}

interface GenerationLifecycleInput<Prepared> {
  readonly provider: GenerationRuntimeProvider;
  readonly requestFor: (runId: string) => GenerationRequest;
  readonly emptyOutputMessage: string;
  readonly parsingStageMessage: string;
  readonly prepare: (text: string) => Prepared | Promise<Prepared>;
  readonly persist: (
    prepared: Prepared,
    text: string,
    usage: GenerationUsage,
  ) => Promise<GenerationLifecycleResult>;
  readonly partialTextOnFailure: (text: string) => string | undefined;
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

function cancellationBarrier(): CancellationBarrier {
  let resolve!: (cancelled: boolean) => void;
  const decision = new Promise<boolean>((resolveDecision) => {
    resolve = resolveDecision;
  });
  return { decision, resolve };
}

export class GenerationRuntime {
  readonly #runs: GenerationRunService;
  readonly #tasks: GenerationTaskProtocol;
  readonly #executions = new Map<string, Execution>();
  readonly #cancellations = new Map<string, CancellationBarrier>();
  readonly #lifecycleTails = new Map<string, Promise<void>>();

  constructor(runs: GenerationRunService, tasks: GenerationTaskProtocol) {
    this.#runs = runs;
    this.#tasks = tasks;
  }

  async startProse(input: StartProseGenerationInput): Promise<StartedGeneration> {
    const creation = await this.#runs.createWithReplay(input.requestId, input.run);
    const run = creation.run;
    if (creation.replayed) return { run, taskId: run.taskId };
    const task = this.#startTask(run);
    const completion = this.#executeLifecycle(run, task, {
      provider: input.provider,
      requestFor: input.requestFor,
      emptyOutputMessage: 'The Provider returned no prose.',
      parsingStageMessage: '正在整理模型输出',
      prepare: input.parse,
      persist: async (blocks, _text, usage) => {
        const completedRun = await this.#runs.completeProseCandidate(randomUUID(), {
          projectId: run.projectId,
          runId: run.runId,
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
        return {
          candidateIds: [completedRun.candidate.candidateId],
          resultRefs: completedRun.run.resultRefs,
        };
      },
      partialTextOnFailure: (text) => text || undefined,
    });
    this.#rememberExecution(run, completion);
    return { run, taskId: task.taskId };
  }

  async startStructured(input: StartStructuredGenerationInput): Promise<StartedGeneration> {
    const creation = await this.#runs.createWithReplay(input.requestId, input.run);
    const run = creation.run;
    if (creation.replayed) return { run, taskId: run.taskId };
    const task = this.#startTask(run);
    const completion = this.#executeLifecycle(run, task, {
      provider: input.provider,
      requestFor: input.requestFor,
      emptyOutputMessage: 'The Provider returned no structured result.',
      parsingStageMessage: '正在校验结构化输出',
      prepare: (text) => text,
      persist: (_prepared, text, usage) => input.complete(run.runId, text, usage),
      partialTextOnFailure: (text) =>
        text && input.partialOnFailure && input.run.outputMode === 'text' ? text : undefined,
    });
    this.#rememberExecution(run, completion);
    return { run, taskId: task.taskId };
  }

  async waitFor(runId: string): Promise<void> {
    await this.#executions.get(runId)?.completion;
  }

  async cancelTask(taskId: string, projectId: string): Promise<boolean> {
    const found = [...this.#executions.entries()].find(
      ([, execution]) => execution.taskId === taskId && execution.projectId === projectId,
    );
    if (!found) return false;
    const [runId, execution] = found;
    const snapshot = this.#tasks.getSnapshot(taskId, projectId);
    if (snapshot.status !== 'queued' && snapshot.status !== 'running') {
      await execution.completion;
      return true;
    }
    try {
      await this.cancel(randomUUID(), { projectId, runId });
    } catch (error) {
      if (
        error instanceof GenerationRunServiceError &&
        error.code === 'GENERATION_RUN_TERMINAL'
      ) {
        await execution.completion;
        return true;
      }
      if (error instanceof TaskProtocolError && error.code === 'COMMON_CONFLICT_003') {
        await execution.completion;
        return true;
      }
      throw error;
    }
    return true;
  }

  async drainProject(projectId: string): Promise<void> {
    const tasks = [...this.#executions.values()]
      .filter((execution) => execution.projectId === projectId)
      .map((execution) => execution.taskId);
    for (const taskId of tasks) await this.cancelTask(taskId, projectId);
  }

  async drainAll(): Promise<void> {
    const tasks = [...this.#executions.values()].map((execution) => ({
      taskId: execution.taskId,
      projectId: execution.projectId,
    }));
    for (const task of tasks) await this.cancelTask(task.taskId, task.projectId);
  }

  async cancel(
    requestId: string,
    input: { readonly projectId: string; readonly runId: string },
  ): Promise<GenerationRun> {
    const execution = this.#executions.get(input.runId);
    const cancelled = await this.#withLifecycleLock(input.runId, async () => {
      const current = this.#runs.get(input);
      if (current.stage === 'saving_candidate') {
        throw new TaskProtocolError(
          'TASK_NOT_CANCELLABLE_001',
          'The task is in an atomic stage that cannot be cancelled.',
        );
      }
      const snapshot = execution
        ? this.#tasks.getSnapshot(execution.taskId, input.projectId)
        : undefined;
      const barrier = cancellationBarrier();
      this.#cancellations.set(input.runId, barrier);
      try {
        const persisted = await this.#runs.cancel(
          requestId,
          input,
          snapshot?.previewTruncated ? undefined : snapshot?.previewText,
        );
        barrier.resolve(true);
        if (execution) {
          try {
            this.#tasks.cancel(execution.taskId, input.projectId);
          } catch (error) {
            if (!(error instanceof TaskProtocolError)) throw error;
            if (error.code === 'TASK_NOT_CANCELLABLE_001') throw error;
          }
        }
        return persisted;
      } catch (error) {
        barrier.resolve(false);
        throw error;
      } finally {
        if (this.#cancellations.get(input.runId) === barrier) {
          this.#cancellations.delete(input.runId);
        }
      }
    });
    if (execution) await execution.completion;
    return cancelled;
  }

  async #withLifecycleLock<Result>(
    runId: string,
    operation: () => Promise<Result>,
  ): Promise<Result> {
    const previous = this.#lifecycleTails.get(runId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    this.#lifecycleTails.set(runId, tail);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.#lifecycleTails.get(runId) === tail) {
        this.#lifecycleTails.delete(runId);
      }
    }
  }

  #startTask(run: GenerationRun): RunningTask {
    return this.#tasks.startTask({
      taskId: run.taskId,
      taskType: run.runType,
      projectId: run.projectId,
      runId: run.runId,
      initialStage: 'queued',
    });
  }

  #rememberExecution(run: GenerationRun, completion: Promise<void>): void {
    const execution: Execution = {
      projectId: run.projectId,
      taskId: run.taskId,
      completion,
    };
    this.#executions.set(run.runId, execution);
    const clear = (): void => {
      if (this.#executions.get(run.runId) === execution) this.#executions.delete(run.runId);
    };
    void completion.then(clear, clear);
  }

  async #cancelled(runId: string): Promise<boolean> {
    return (await this.#cancellations.get(runId)?.decision) ?? false;
  }

  async #executeLifecycle<Prepared>(
    initialRun: GenerationRun,
    task: RunningTask,
    input: GenerationLifecycleInput<Prepared>,
  ): Promise<void> {
    let text = '';
    let usage: GenerationUsage = {};
    try {
      if (await this.#cancelled(initialRun.runId)) return;
      await this.#runs.markRunning(randomUUID(), {
        projectId: initialRun.projectId,
        runId: initialRun.runId,
      });
      if (await this.#cancelled(initialRun.runId)) return;
      task.setStage('calling_model', '正在请求模型');
      await this.#runs.markStage(randomUUID(), {
        projectId: initialRun.projectId,
        runId: initialRun.runId,
        stage: 'calling_model',
      });
      const request = validateRequest(initialRun, input.requestFor(initialRun.runId));
      let completed = false;
      for await (const event of input.provider.generate(request, task.signal)) {
        if (await this.#cancelled(initialRun.runId)) return;
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
      if (await this.#cancelled(initialRun.runId)) return;
      if (task.signal.aborted) return;
      if (!completed) {
        throw Object.assign(new Error('The Provider stream ended without completion.'), {
          code: 'AI_STREAM_INTERRUPTED_009',
          retryable: true,
        });
      }
      if (!text.trim()) {
        throw Object.assign(new Error(input.emptyOutputMessage), {
          code: 'AI_OUTPUT_INVALID_008',
          retryable: false,
        });
      }
      task.setStage('parsing_output', input.parsingStageMessage);
      await this.#runs.markStage(randomUUID(), {
        projectId: initialRun.projectId,
        runId: initialRun.runId,
        stage: 'parsing_output',
      });
      if (await this.#cancelled(initialRun.runId)) return;
      const prepared = await input.prepare(text);
      if (await this.#cancelled(initialRun.runId)) return;
      const result = await this.#withLifecycleLock(initialRun.runId, async () => {
        const current = this.#runs.get({
          projectId: initialRun.projectId,
          runId: initialRun.runId,
        });
        if (current.status !== 'queued' && current.status !== 'running') return null;
        await this.#runs.markStage(randomUUID(), {
          projectId: initialRun.projectId,
          runId: initialRun.runId,
          stage: 'saving_candidate',
        });
        task.setStage('saving_candidate', '正在保存候选', { cancellable: false });
        return input.persist(prepared, text, usage);
      });
      if (!result) return;
      for (const candidateId of result.candidateIds) task.saveCandidate(candidateId, 'complete');
      for (const resultRef of result.resultRefs) task.saveResult(resultRef);
      task.completeResults(result.resultRefs);
    } catch (error) {
      if (await this.#cancelled(initialRun.runId)) return;
      if (task.signal.aborted) return;
      const mapped = runtimeError(error);
      try {
        const partialText = input.partialTextOnFailure(text);
        await this.#runs.fail(randomUUID(), {
          projectId: initialRun.projectId,
          runId: initialRun.runId,
          errorCode: mapped.code,
          retryable: mapped.retryable,
          ...(partialText ? { partialText } : {}),
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
}
