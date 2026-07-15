import { randomUUID } from 'node:crypto';

import {
  AIStageSchema,
  ErrorCodeSchema,
  MAX_TASK_PREVIEW_CHARACTERS,
  PROTOCOL_VERSION,
  ProjectIdSchema,
  TaskCommandResultSchema,
  TaskEventAckSchema,
  TaskEventEnvelopeSchema,
  TaskIdSchema,
  TaskSnapshotSchema,
  TaskStageSchema,
  TaskTypeSchema,
  type ErrorCode,
  type TaskCommand,
  type TaskCommandResult,
  type TaskEventEnvelope,
  type TaskSnapshot,
} from '@worldforge/contracts';

export interface TaskMessagePort {
  postMessage(message: TaskEventEnvelope): void;
  onMessage(listener: (message: unknown) => void): () => void;
  onClose?(listener: () => void): () => void;
  close?(): void;
}

interface TaskSubscriber {
  readonly port: TaskMessagePort;
  readonly projectId?: string;
  readonly unacknowledged: Map<string, TaskEventEnvelope>;
  readonly skippedByTask: Map<string, TaskEventEnvelope>;
  removeMessageListener: () => void;
  removeCloseListener?: () => void;
}

export interface TaskEventBroadcasterOptions {
  readonly maximumUnacknowledgedEvents?: number;
  readonly resumeAtUnacknowledgedEvents?: number;
  readonly maximumSkippedTasks?: number;
}

export class TaskEventBroadcaster {
  readonly #subscribers = new Set<TaskSubscriber>();
  readonly #maximumUnacknowledgedEvents: number;
  readonly #resumeAtUnacknowledgedEvents: number;
  readonly #maximumSkippedTasks: number;

  constructor(options: TaskEventBroadcasterOptions = {}) {
    this.#maximumUnacknowledgedEvents = options.maximumUnacknowledgedEvents ?? 32;
    this.#resumeAtUnacknowledgedEvents =
      options.resumeAtUnacknowledgedEvents ??
      Math.max(1, Math.floor(this.#maximumUnacknowledgedEvents / 2));
    this.#maximumSkippedTasks = options.maximumSkippedTasks ?? 256;
    if (
      this.#maximumUnacknowledgedEvents < 1 ||
      this.#resumeAtUnacknowledgedEvents >= this.#maximumUnacknowledgedEvents ||
      this.#maximumSkippedTasks < 1
    ) {
      throw new Error('TASK_BACKPRESSURE_CONFIGURATION_INVALID');
    }
  }

  get subscriberCount(): number {
    return this.#subscribers.size;
  }

  attach(port: TaskMessagePort, projectId?: string): () => void {
    const subscriber: TaskSubscriber = {
      port,
      ...(projectId ? { projectId } : {}),
      unacknowledged: new Map(),
      skippedByTask: new Map(),
      removeMessageListener: () => undefined,
    };
    subscriber.removeMessageListener = port.onMessage((message) => {
      const acknowledgement = TaskEventAckSchema.safeParse(message);
      if (!acknowledgement.success) return;
      subscriber.unacknowledged.delete(acknowledgement.data.eventId);
      if (subscriber.unacknowledged.size <= this.#resumeAtUnacknowledgedEvents) {
        this.#resumeSubscriber(subscriber);
      }
    });
    const removeCloseListener = port.onClose?.(() => this.#detach(subscriber));
    if (removeCloseListener) subscriber.removeCloseListener = removeCloseListener;
    this.#subscribers.add(subscriber);
    return () => this.#detach(subscriber);
  }

  publish(event: TaskEventEnvelope): void {
    for (const subscriber of [...this.#subscribers]) {
      if (
        event.projectId !== undefined &&
        (subscriber.projectId === undefined || subscriber.projectId !== event.projectId)
      ) {
        continue;
      }
      this.#deliver(subscriber, event);
    }
  }

  close(): void {
    for (const subscriber of [...this.#subscribers]) {
      subscriber.port.close?.();
      this.#detach(subscriber);
    }
  }

  #deliver(subscriber: TaskSubscriber, event: TaskEventEnvelope): void {
    if (subscriber.unacknowledged.size >= this.#maximumUnacknowledgedEvents) {
      subscriber.skippedByTask.delete(event.taskId);
      subscriber.skippedByTask.set(event.taskId, event);
      while (subscriber.skippedByTask.size > this.#maximumSkippedTasks) {
        const oldestTask = subscriber.skippedByTask.keys().next().value;
        if (typeof oldestTask !== 'string') break;
        subscriber.skippedByTask.delete(oldestTask);
      }
      return;
    }

    subscriber.unacknowledged.set(event.eventId, event);
    try {
      subscriber.port.postMessage(event);
    } catch {
      subscriber.unacknowledged.delete(event.eventId);
      this.#detach(subscriber);
    }
  }

  #resumeSubscriber(subscriber: TaskSubscriber): void {
    for (const [taskId, event] of [...subscriber.skippedByTask]) {
      if (subscriber.unacknowledged.size >= this.#maximumUnacknowledgedEvents) break;
      subscriber.skippedByTask.delete(taskId);
      this.#deliver(subscriber, event);
    }
  }

  #detach(subscriber: TaskSubscriber): void {
    if (!this.#subscribers.delete(subscriber)) return;
    subscriber.removeMessageListener();
    subscriber.removeCloseListener?.();
    subscriber.unacknowledged.clear();
    subscriber.skippedByTask.clear();
  }
}

interface TaskRecord {
  readonly taskId: string;
  readonly taskType: string;
  readonly projectId?: string;
  readonly runId?: string;
  readonly startedAtMs: number;
  readonly abortController: AbortController;
  status: TaskSnapshot['status'];
  stage: string;
  sequence: number;
  receivedChars: number;
  resultIds?: readonly string[];
  errorCode?: ErrorCode;
  cancellable: boolean;
  partialAvailable: boolean;
  previewText: string;
  previewTruncated: boolean;
  pendingDelta: string;
  deltaTimer: ReturnType<typeof setTimeout> | undefined;
}

export interface StartTaskOptions {
  readonly taskId?: string;
  readonly taskType: string;
  readonly projectId?: string;
  readonly initialStage?: string;
  readonly runId?: string;
  readonly cancellable?: boolean;
}

export interface RunningTask {
  readonly taskId: string;
  readonly signal: AbortSignal;
  setStage(stage: string, message: string, options?: { readonly cancellable?: boolean }): boolean;
  reportProgress(current?: number, total?: number): boolean;
  pushDelta(text: string): boolean;
  reportUsage(usage: { readonly inputTokens?: number; readonly outputTokens?: number }): boolean;
  saveCandidate(candidateId: string, completeness: 'complete' | 'partial'): boolean;
  complete(resultIds?: readonly string[]): boolean;
  fail(errorCode: ErrorCode, retryable: boolean): boolean;
}

export interface TaskProtocolOptions {
  readonly broadcaster?: TaskEventBroadcaster;
  readonly batchIntervalMs?: number;
  readonly batchCharacterThreshold?: number;
  readonly maximumBatchCharacters?: number;
  readonly maximumPreviewCharacters?: number;
  readonly maximumRetainedTasks?: number;
  readonly now?: () => number;
}

export class TaskProtocolError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;

  constructor(code: ErrorCode, message: string, retryable = false) {
    super(message);
    this.name = 'TaskProtocolError';
    this.code = code;
    this.retryable = retryable;
  }
}

export class TaskProtocol {
  readonly #tasks = new Map<string, TaskRecord>();
  readonly #broadcaster: TaskEventBroadcaster;
  readonly #batchIntervalMs: number;
  readonly #batchCharacterThreshold: number;
  readonly #maximumBatchCharacters: number;
  readonly #maximumPreviewCharacters: number;
  readonly #maximumRetainedTasks: number;
  readonly #now: () => number;
  readonly #drainWaiters = new Set<() => void>();
  #accepting = true;

  constructor(options: TaskProtocolOptions = {}) {
    this.#broadcaster = options.broadcaster ?? new TaskEventBroadcaster();
    this.#batchIntervalMs = options.batchIntervalMs ?? 30;
    this.#batchCharacterThreshold = options.batchCharacterThreshold ?? 512;
    this.#maximumBatchCharacters = options.maximumBatchCharacters ?? 65_536;
    this.#maximumPreviewCharacters =
      options.maximumPreviewCharacters ?? MAX_TASK_PREVIEW_CHARACTERS;
    this.#maximumRetainedTasks = options.maximumRetainedTasks ?? 1_000;
    this.#now = options.now ?? Date.now;
    if (
      this.#batchIntervalMs < 20 ||
      this.#batchIntervalMs > 50 ||
      this.#batchCharacterThreshold < 1 ||
      this.#maximumBatchCharacters < this.#batchCharacterThreshold ||
      this.#maximumPreviewCharacters < 1 ||
      this.#maximumPreviewCharacters > MAX_TASK_PREVIEW_CHARACTERS ||
      this.#maximumRetainedTasks < 1
    ) {
      throw new Error('TASK_PROTOCOL_CONFIGURATION_INVALID');
    }
  }

  get accepting(): boolean {
    return this.#accepting;
  }

  get activeTaskCount(): number {
    return [...this.#tasks.values()].filter((task) => this.#isActive(task)).length;
  }

  attachPort(port: TaskMessagePort, projectId?: string): () => void {
    return this.#broadcaster.attach(port, projectId ? ProjectIdSchema.parse(projectId) : undefined);
  }

  startTask(options: StartTaskOptions): RunningTask {
    if (!this.#accepting) {
      throw new TaskProtocolError(
        'DB_WRITE_QUEUE_STOPPED_008',
        'The Core is draining and cannot accept another task.',
      );
    }
    const taskId = TaskIdSchema.parse(options.taskId ?? randomUUID());
    if (this.#tasks.has(taskId)) {
      throw new TaskProtocolError('COMMON_CONFLICT_003', 'The taskId is already registered.');
    }
    const taskType = TaskTypeSchema.parse(options.taskType);
    const projectId = options.projectId ? ProjectIdSchema.parse(options.projectId) : undefined;
    const runId = options.runId ? TaskIdSchema.parse(options.runId) : undefined;
    const initialStage = TaskStageSchema.parse(options.initialStage ?? 'queued');
    if (runId) AIStageSchema.parse(initialStage);

    const task: TaskRecord = {
      taskId,
      taskType,
      ...(projectId ? { projectId } : {}),
      ...(runId ? { runId } : {}),
      startedAtMs: this.#now(),
      abortController: new AbortController(),
      status: 'running',
      stage: initialStage,
      sequence: 0,
      receivedChars: 0,
      cancellable: options.cancellable ?? true,
      partialAvailable: false,
      previewText: '',
      previewTruncated: false,
      pendingDelta: '',
      deltaTimer: undefined,
    };
    this.#tasks.set(taskId, task);
    this.#emit(
      task,
      runId ? 'ai.started' : 'task.started',
      runId ? { runId, stage: initialStage } : { taskType, stage: initialStage },
    );
    this.#trimRetainedTasks();

    return {
      taskId,
      signal: task.abortController.signal,
      setStage: (stage, message, stageOptions) =>
        this.#setStage(task, stage, message, stageOptions?.cancellable),
      reportProgress: (current, total) => this.#reportProgress(task, current, total),
      pushDelta: (text) => this.#pushDelta(task, text),
      reportUsage: (usage) => this.#reportUsage(task, usage),
      saveCandidate: (candidateId, completeness) =>
        this.#saveCandidate(task, candidateId, completeness),
      complete: (resultIds = []) => this.#complete(task, resultIds),
      fail: (errorCode, retryable) => this.#fail(task, errorCode, retryable),
    };
  }

  getSnapshot(taskId: string, projectId?: string): TaskSnapshot {
    const task = this.#requireTask(taskId, projectId);
    return this.#snapshot(task);
  }

  listActive(projectId?: string): readonly TaskSnapshot[] {
    const parsedProjectId = projectId ? ProjectIdSchema.parse(projectId) : undefined;
    return [...this.#tasks.values()]
      .filter(
        (task) =>
          this.#isActive(task) &&
          (parsedProjectId === undefined || task.projectId === parsedProjectId),
      )
      .map((task) => this.#snapshot(task));
  }

  cancel(
    taskId: string,
    projectId?: string,
  ): { readonly accepted: true; readonly status: 'cancelled' } {
    const task = this.#requireTask(taskId, projectId);
    if (!this.#isActive(task)) {
      throw new TaskProtocolError('COMMON_CONFLICT_003', 'The task has already finished.');
    }
    if (!task.cancellable) {
      throw new TaskProtocolError(
        'TASK_NOT_CANCELLABLE_001',
        'The task is in an atomic stage that cannot be cancelled.',
      );
    }

    this.#clearPendingDelta(task);
    task.status = 'cancelled';
    task.stage = 'cancelled';
    task.abortController.abort('task.cancel');
    this.#emit(task, task.runId ? 'ai.cancelled' : 'task.cancelled', {
      partialAvailable: task.partialAvailable,
    });
    this.#notifyDrainedIfReady();
    return { accepted: true, status: 'cancelled' };
  }

  async beginDrain(): Promise<void> {
    this.#accepting = false;
    for (const task of this.#tasks.values()) {
      if (this.#isActive(task) && task.cancellable) this.cancel(task.taskId, task.projectId);
    }
    if (this.activeTaskCount === 0) return;
    await new Promise<void>((resolve) => this.#drainWaiters.add(resolve));
  }

  close(): void {
    this.#accepting = false;
    for (const task of this.#tasks.values()) this.#clearPendingDelta(task);
    this.#broadcaster.close();
    for (const resolve of this.#drainWaiters) resolve();
    this.#drainWaiters.clear();
  }

  #setStage(task: TaskRecord, stage: string, message: string, cancellable?: boolean): boolean {
    if (!this.#isActive(task)) return false;
    this.#flushPendingDelta(task);
    const parsedStage = task.runId ? AIStageSchema.parse(stage) : TaskStageSchema.parse(stage);
    task.stage = parsedStage;
    if (cancellable !== undefined) task.cancellable = cancellable;
    this.#emit(task, task.runId ? 'ai.stage' : 'task.stage', {
      stage: parsedStage,
      message,
    });
    return true;
  }

  #reportProgress(task: TaskRecord, current?: number, total?: number): boolean {
    if (!this.#isActive(task)) return false;
    this.#emit(task, 'task.progress', {
      stage: task.stage,
      ...(current === undefined ? {} : { current }),
      ...(total === undefined ? {} : { total }),
    });
    return true;
  }

  #pushDelta(task: TaskRecord, text: string): boolean {
    if (!this.#isActive(task) || !task.runId || text.length === 0) return false;
    task.receivedChars += text.length;
    const remainingPreviewCharacters = Math.max(
      0,
      this.#maximumPreviewCharacters - task.previewText.length,
    );
    task.previewText += text.slice(0, remainingPreviewCharacters);
    task.previewTruncated ||= text.length > remainingPreviewCharacters;
    task.pendingDelta += text;
    while (task.pendingDelta.length >= this.#batchCharacterThreshold) {
      this.#flushPendingDelta(task, this.#maximumBatchCharacters);
    }
    if (task.pendingDelta.length > 0 && !task.deltaTimer) {
      task.deltaTimer = setTimeout(() => {
        task.deltaTimer = undefined;
        this.#flushPendingDelta(task);
      }, this.#batchIntervalMs);
    }
    return true;
  }

  #reportUsage(
    task: TaskRecord,
    usage: { readonly inputTokens?: number; readonly outputTokens?: number },
  ): boolean {
    if (!this.#isActive(task) || !task.runId) return false;
    this.#emit(task, 'ai.usage', usage);
    return true;
  }

  #saveCandidate(
    task: TaskRecord,
    candidateId: string,
    completeness: 'complete' | 'partial',
  ): boolean {
    if (!this.#isActive(task) || !task.runId) return false;
    const parsedCandidateId = TaskIdSchema.parse(candidateId);
    task.partialAvailable ||= completeness === 'partial';
    this.#emit(task, 'ai.candidateSaved', { candidateId: parsedCandidateId, completeness });
    return true;
  }

  #complete(task: TaskRecord, resultIds: readonly string[]): boolean {
    if (!this.#isActive(task)) return false;
    this.#flushPendingDelta(task);
    const parsedResultIds = resultIds.map((resultId) => TaskIdSchema.parse(resultId));
    task.status = 'succeeded';
    task.stage = 'completed';
    task.resultIds = parsedResultIds;
    this.#emit(
      task,
      task.runId ? 'ai.completed' : 'task.completed',
      task.runId ? { candidateIds: parsedResultIds } : { resultIds: parsedResultIds },
    );
    this.#notifyDrainedIfReady();
    return true;
  }

  #fail(task: TaskRecord, errorCode: ErrorCode, retryable: boolean): boolean {
    if (!this.#isActive(task)) return false;
    ErrorCodeSchema.parse(errorCode);
    this.#flushPendingDelta(task);
    task.status = 'failed';
    task.stage = 'failed';
    task.errorCode = errorCode;
    this.#emit(task, task.runId ? 'ai.failed' : 'task.failed', { errorCode, retryable });
    this.#notifyDrainedIfReady();
    return true;
  }

  #flushPendingDelta(task: TaskRecord, maximumCharacters = this.#maximumBatchCharacters): void {
    if (task.deltaTimer) {
      clearTimeout(task.deltaTimer);
      task.deltaTimer = undefined;
    }
    if (!this.#isActive(task) || !task.runId || task.pendingDelta.length === 0) {
      if (!this.#isActive(task)) task.pendingDelta = '';
      return;
    }
    const text = task.pendingDelta.slice(0, maximumCharacters);
    task.pendingDelta = task.pendingDelta.slice(text.length);
    this.#emit(task, 'ai.delta', { text, receivedChars: task.receivedChars });
    if (task.pendingDelta.length > 0 && !task.deltaTimer) {
      task.deltaTimer = setTimeout(() => {
        task.deltaTimer = undefined;
        this.#flushPendingDelta(task);
      }, this.#batchIntervalMs);
    }
  }

  #clearPendingDelta(task: TaskRecord): void {
    if (task.deltaTimer) clearTimeout(task.deltaTimer);
    task.deltaTimer = undefined;
    task.pendingDelta = '';
  }

  #emit(task: TaskRecord, type: TaskEventEnvelope['type'], payload: unknown): void {
    task.sequence += 1;
    const event = TaskEventEnvelopeSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      eventId: randomUUID(),
      taskId: task.taskId,
      ...(task.projectId ? { projectId: task.projectId } : {}),
      sequence: task.sequence,
      type,
      payload,
      emittedAt: new Date(this.#now()).toISOString(),
    });
    this.#broadcaster.publish(event);
  }

  #requireTask(taskId: string, projectId?: string): TaskRecord {
    const parsedTaskId = TaskIdSchema.parse(taskId);
    const parsedProjectId = projectId ? ProjectIdSchema.parse(projectId) : undefined;
    const task = this.#tasks.get(parsedTaskId);
    if (!task) throw new TaskProtocolError('COMMON_NOT_FOUND_002', 'The task does not exist.');
    if (task.projectId !== undefined && task.projectId !== parsedProjectId) {
      throw new TaskProtocolError(
        'PROJECT_ID_MISMATCH_004',
        'The task does not belong to the requested project.',
      );
    }
    return task;
  }

  #snapshot(task: TaskRecord): TaskSnapshot {
    return TaskSnapshotSchema.parse({
      taskId: task.taskId,
      taskType: task.taskType,
      ...(task.projectId ? { projectId: task.projectId } : {}),
      status: task.status,
      stage: task.stage,
      lastSequence: task.sequence,
      startedAt: new Date(task.startedAtMs).toISOString(),
      elapsedMs: Math.max(0, Math.floor(this.#now() - task.startedAtMs)),
      ...(task.receivedChars > 0 ? { receivedChars: task.receivedChars } : {}),
      ...(task.receivedChars > 0
        ? { previewText: task.previewText, previewTruncated: task.previewTruncated }
        : {}),
      ...(task.resultIds ? { resultIds: task.resultIds } : {}),
      ...(task.errorCode ? { errorCode: task.errorCode } : {}),
    });
  }

  #isActive(task: TaskRecord): boolean {
    return task.status === 'queued' || task.status === 'running';
  }

  #notifyDrainedIfReady(): void {
    if (this.#accepting || this.activeTaskCount > 0) return;
    for (const resolve of this.#drainWaiters) resolve();
    this.#drainWaiters.clear();
  }

  #trimRetainedTasks(): void {
    while (this.#tasks.size > this.#maximumRetainedTasks) {
      const terminal = [...this.#tasks.entries()].find(([, task]) => !this.#isActive(task));
      if (!terminal) break;
      this.#tasks.delete(terminal[0]);
    }
  }
}

function success<T>(requestId: string, data: T): TaskCommandResult {
  return TaskCommandResultSchema.parse({ ok: true, requestId, data });
}

function failure(
  requestId: string,
  code: ErrorCode,
  message: string,
  retryable = false,
  taskId?: string,
): TaskCommandResult {
  return TaskCommandResultSchema.parse({
    ok: false,
    requestId,
    error: {
      code,
      message,
      retryable,
      ...(taskId ? { details: { taskId } } : {}),
    },
  });
}

export class TaskCommandRouter {
  readonly #protocol: TaskProtocol;
  readonly #idempotentResults = new Map<string, TaskCommandResult>();

  constructor(protocol: TaskProtocol) {
    this.#protocol = protocol;
  }

  execute(command: TaskCommand): TaskCommandResult {
    if (command.command === 'task.cancel') {
      const existing = this.#idempotentResults.get(command.requestId);
      if (existing) return existing;
    }

    let result: TaskCommandResult;
    try {
      switch (command.command) {
        case 'task.getSnapshot':
          result = success(
            command.requestId,
            this.#protocol.getSnapshot(command.payload.taskId, command.projectId),
          );
          break;
        case 'task.cancel':
          result = success(
            command.requestId,
            this.#protocol.cancel(command.payload.taskId, command.projectId),
          );
          break;
        case 'task.listActive':
          result = success(command.requestId, {
            tasks: this.#protocol.listActive(command.projectId),
          });
          break;
      }
    } catch (error) {
      if (error instanceof TaskProtocolError) {
        result = failure(
          command.requestId,
          error.code,
          error.message,
          error.retryable,
          'taskId' in command.payload ? command.payload.taskId : undefined,
        );
      } else {
        result = failure(
          command.requestId,
          'COMMON_INVALID_INPUT_001',
          'The task command was invalid.',
        );
      }
    }

    if (command.command === 'task.cancel') {
      this.#idempotentResults.set(command.requestId, result);
      while (this.#idempotentResults.size > 1_000) {
        const oldest = this.#idempotentResults.keys().next().value;
        if (typeof oldest !== 'string') break;
        this.#idempotentResults.delete(oldest);
      }
    }
    return result;
  }
}
