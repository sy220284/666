import { setTimeout as delay } from 'node:timers/promises';

import { ProjectIdSchema, type TaskSnapshot } from '@worldforge/contracts';

import {
  TaskProtocolError,
  type RunningTask,
  type StartTaskOptions,
  type TaskProtocol,
} from './task-protocol.js';

export interface ProjectTaskDrainOptions {
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
}

export type ProjectTaskDomainCanceller = (
  taskId: string,
  projectId: string,
) => Promise<boolean>;

/**
 * Project-scoped lifecycle barrier over the authoritative TaskProtocol instance.
 * The global TaskProtocol remains unchanged and continues to own Core drain/shutdown.
 * Domain-owned tasks may register one canceller so their persistent lifecycle reaches
 * a terminal state before the project database is closed or moved.
 */
export class ProjectTaskBarrier {
  readonly #tasks: TaskProtocol;
  readonly #drainingProjects = new Set<string>();
  readonly #timeoutMs: number;
  readonly #pollIntervalMs: number;
  #domainCanceller: ProjectTaskDomainCanceller | undefined;

  constructor(tasks: TaskProtocol, options: ProjectTaskDrainOptions = {}) {
    this.#tasks = tasks;
    this.#timeoutMs = options.timeoutMs ?? 30_000;
    this.#pollIntervalMs = options.pollIntervalMs ?? 20;
    if (this.#timeoutMs < 1 || this.#pollIntervalMs < 1) {
      throw new Error('PROJECT_TASK_DRAIN_CONFIGURATION_INVALID');
    }
  }

  setDomainCanceller(canceller: ProjectTaskDomainCanceller): void {
    if (this.#domainCanceller && this.#domainCanceller !== canceller) {
      throw new Error('PROJECT_TASK_DOMAIN_CANCELLER_ALREADY_REGISTERED');
    }
    this.#domainCanceller = canceller;
  }

  startTask(options: StartTaskOptions): RunningTask {
    const projectId = options.projectId ? ProjectIdSchema.parse(options.projectId) : undefined;
    if (projectId && this.#drainingProjects.has(projectId)) {
      throw new TaskProtocolError(
        'COMMON_CONFLICT_003',
        'The project is draining and cannot start another background task.',
      );
    }
    return this.#tasks.startTask(options);
  }

  getSnapshot(taskId: string, projectId?: string): TaskSnapshot {
    return this.#tasks.getSnapshot(taskId, projectId);
  }

  cancel(
    taskId: string,
    projectId?: string,
  ): { readonly accepted: true; readonly status: 'cancelled' } {
    return this.#tasks.cancel(taskId, projectId);
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
      const active = this.#tasks.listActive(projectId);
      if (active.length === 0) return;
      await this.#cancelCancellable(active, projectId);
      if (this.#tasks.listActive(projectId).length === 0) return;
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

  async #cancelCancellable(tasks: readonly TaskSnapshot[], projectId: string): Promise<void> {
    for (const task of tasks) {
      try {
        if (this.#domainCanceller && (await this.#domainCanceller(task.taskId, projectId))) {
          continue;
        }
        this.#tasks.cancel(task.taskId, projectId);
      } catch (error) {
        if (error instanceof TaskProtocolError && error.code === 'TASK_NOT_CANCELLABLE_001') {
          continue;
        }
        throw error;
      }
    }
  }
}
