import { setTimeout as delay } from 'node:timers/promises';

import { ProjectIdSchema, type TaskSnapshot } from '@worldforge/contracts';

import {
  TaskProtocol,
  TaskProtocolError,
  type StartTaskOptions,
  type RunningTask,
  type TaskProtocolOptions,
} from './task-protocol.js';

export interface ProjectTaskDrainOptions {
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
}

/**
 * Adds project-scoped draining without duplicating TaskProtocol task state.
 * TaskProtocol remains authoritative for task status, cancellation and terminal transitions.
 */
export class ProjectTaskProtocol extends TaskProtocol {
  readonly #drainingProjects = new Set<string>();
  readonly #timeoutMs: number;
  readonly #pollIntervalMs: number;

  constructor(
    taskOptions: TaskProtocolOptions = {},
    drainOptions: ProjectTaskDrainOptions = {},
  ) {
    super(taskOptions);
    this.#timeoutMs = drainOptions.timeoutMs ?? 30_000;
    this.#pollIntervalMs = drainOptions.pollIntervalMs ?? 20;
    if (this.#timeoutMs < 1 || this.#pollIntervalMs < 1) {
      throw new Error('PROJECT_TASK_DRAIN_CONFIGURATION_INVALID');
    }
  }

  override startTask(options: StartTaskOptions): RunningTask {
    const projectId = options.projectId ? ProjectIdSchema.parse(options.projectId) : undefined;
    if (projectId && this.#drainingProjects.has(projectId)) {
      throw new TaskProtocolError(
        'COMMON_CONFLICT_003',
        'The project is draining and cannot start another background task.',
      );
    }
    return super.startTask(options);
  }

  isProjectDraining(projectId: string): boolean {
    return this.#drainingProjects.has(ProjectIdSchema.parse(projectId));
  }

  async withProjectDrain<T>(projectId: string, operation: () => Promise<T>): Promise<T> {
    const validProjectId = ProjectIdSchema.parse(projectId);
    if (this.#drainingProjects.has(validProjectId)) {
      throw new TaskProtocolError(
        'COMMON_CONFLICT_003',
        'The project lifecycle is already draining background tasks.',
      );
    }

    this.#drainingProjects.add(validProjectId);
    try {
      await this.#drainProject(validProjectId);
      return await operation();
    } finally {
      this.#drainingProjects.delete(validProjectId);
    }
  }

  async #drainProject(projectId: string): Promise<void> {
    const startedAt = Date.now();
    while (true) {
      const active = this.listActive(projectId);
      if (active.length === 0) return;
      this.#cancelCancellable(active, projectId);
      if (this.listActive(projectId).length === 0) return;
      if (Date.now() - startedAt >= this.#timeoutMs) {
        throw new TaskProtocolError(
          'COMMON_TIMEOUT_005',
          'Background tasks did not reach a terminal state before the project lifecycle timeout.',
          true,
        );
      }
      await delay(this.#pollIntervalMs);
    }
  }

  #cancelCancellable(tasks: readonly TaskSnapshot[], projectId: string): void {
    for (const task of tasks) {
      try {
        this.cancel(task.taskId, projectId);
      } catch (error) {
        if (error instanceof TaskProtocolError && error.code === 'TASK_NOT_CANCELLABLE_001') {
          continue;
        }
        throw error;
      }
    }
  }
}
