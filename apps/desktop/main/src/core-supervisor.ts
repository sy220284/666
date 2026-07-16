import { randomUUID } from 'node:crypto';

import {
  CoreAppDataOperationSchema,
  CoreAppDataResultSchema,
  CoreEventSchema,
  PROTOCOL_VERSION,
  TaskCommandResultSchema,
  WindowPreferencesSchema,
  type CoreControlMessage,
  type CoreAppDataOperation,
  type CoreAppDataResult,
  type CoreEvent,
  type CoreStatus,
  type CoreWindowPreferencesResult,
  type TaskCommand,
  type TaskCommandResult,
  type WindowPreferences,
} from '@worldforge/contracts';

import { createDiagnosticId, type LogFields, type LogLevel } from './privacy-logger.js';

export interface UtilityProcessHandle {
  readonly pid?: number;
  postMessage(message: CoreControlMessage, transfer?: readonly unknown[]): void;
  onMessage(listener: (message: unknown) => void): () => void;
  onExit(listener: (exitCode: number | null) => void): () => void;
}

export interface SupervisorLogger {
  log(level: LogLevel, event: string, fields?: LogFields): Promise<void> | void;
}

export interface CoreSupervisorOptions {
  readonly spawn: () => UtilityProcessHandle;
  readonly logger: SupervisorLogger;
  readonly startupTimeoutMs?: number;
  readonly commandTimeoutMs?: number;
}

export interface SupervisorOperationResult {
  readonly ok: boolean;
  readonly errorCode?: string;
  readonly diagnosticId?: string;
}

interface MessageWaiter {
  readonly matches: (message: CoreEvent) => boolean;
  readonly resolve: (message: CoreEvent | null) => void;
  readonly timer: NodeJS.Timeout;
}

interface ExitWaiter {
  readonly process: UtilityProcessHandle;
  readonly resolve: (exited: boolean) => void;
  readonly timer: NodeJS.Timeout;
}

export class CoreSupervisor {
  readonly #spawn: () => UtilityProcessHandle;
  readonly #logger: SupervisorLogger;
  readonly #startupTimeoutMs: number;
  readonly #commandTimeoutMs: number;
  readonly #messageWaiters = new Set<MessageWaiter>();
  readonly #exitWaiters = new Set<ExitWaiter>();
  #process: UtilityProcessHandle | undefined;
  #state: CoreStatus['status'] = 'stopped';
  #restartCount = 0;
  #lastErrorCode: string | null = null;
  #diagnosticId: string | null = null;
  #expectedExit = false;
  #removeMessageListener: (() => void) | undefined;
  #removeExitListener: (() => void) | undefined;

  constructor(options: CoreSupervisorOptions) {
    this.#spawn = options.spawn;
    this.#logger = options.logger;
    this.#startupTimeoutMs = options.startupTimeoutMs ?? 10_000;
    this.#commandTimeoutMs = options.commandTimeoutMs ?? 5_000;
  }

  getStatus(): CoreStatus {
    return {
      status: this.#state,
      pid: this.#process?.pid ?? null,
      restartCount: this.#restartCount,
      lastErrorCode: this.#lastErrorCode,
      diagnosticId: this.#diagnosticId,
    };
  }

  async start(): Promise<SupervisorOperationResult> {
    if (this.#process) {
      return this.#state === 'healthy'
        ? { ok: true }
        : this.#fail('CORE_ALREADY_RUNNING', 'core.start.rejected');
    }

    this.#state = 'starting';
    this.#lastErrorCode = null;
    this.#diagnosticId = null;
    this.#expectedExit = false;

    try {
      const process = this.#spawn();
      this.#process = process;
      this.#bindProcess(process);
      const ready = await this.#waitForMessage(
        (message) => message.type === 'core.ready',
        this.#startupTimeoutMs,
      );
      if (!ready) return this.#fail('CORE_START_TIMEOUT', 'core.start.timeout');
      this.#state = 'healthy';
      await this.#logger.log('info', 'core.start.ready', {
        processStatus: this.#state,
        restartCount: this.#restartCount,
      });
      return { ok: true };
    } catch {
      return this.#fail('CORE_SPAWN_FAILED', 'core.start.failed');
    }
  }

  async ping(): Promise<SupervisorOperationResult> {
    const process = this.#process;
    if (!process || this.#state !== 'healthy') {
      return this.#fail('CORE_NOT_HEALTHY', 'core.health.rejected');
    }
    const requestId = randomUUID();
    const response = this.#waitForMessage(
      (message) => message.type === 'core.health' && message.requestId === requestId,
      this.#commandTimeoutMs,
    );
    process.postMessage({ type: 'core.ping', protocolVersion: PROTOCOL_VERSION, requestId });
    if (!(await response)) return this.#fail('CORE_HEALTH_TIMEOUT', 'core.health.timeout');
    return { ok: true };
  }

  async restart(): Promise<SupervisorOperationResult> {
    if (this.#process) {
      const stopped = await this.shutdown();
      if (!stopped.ok) return stopped;
    }
    this.#restartCount += 1;
    return this.start();
  }

  async invokeTaskCommand(envelope: TaskCommand): Promise<TaskCommandResult> {
    const process = this.#process;
    if (!process || this.#state !== 'healthy') {
      return TaskCommandResultSchema.parse({
        ok: false,
        requestId: envelope.requestId,
        error: {
          code: 'COMMON_INTERNAL_999',
          message: 'The Core service is not available.',
          retryable: true,
        },
      });
    }

    const response = this.#waitForMessage(
      (message) =>
        message.type === 'core.command-result' && message.requestId === envelope.requestId,
      this.#commandTimeoutMs,
    );
    process.postMessage({
      type: 'core.command',
      protocolVersion: PROTOCOL_VERSION,
      requestId: envelope.requestId,
      envelope,
    });
    const result = await response;
    if (result?.type === 'core.command-result') return result.result;
    return TaskCommandResultSchema.parse({
      ok: false,
      requestId: envelope.requestId,
      error: {
        code: 'COMMON_TIMEOUT_005',
        message: 'The task command timed out.',
        retryable: true,
      },
    });
  }

  async invokeAppDataOperation(
    requestId: string,
    input: CoreAppDataOperation,
  ): Promise<CoreAppDataResult> {
    const operation = CoreAppDataOperationSchema.parse(input);
    const process = this.#process;
    if (!process || this.#state !== 'healthy') {
      return CoreAppDataResultSchema.parse({
        ok: false,
        operation: operation.operation,
        errorCode: 'COMMON_INTERNAL_999',
      });
    }

    const response = this.#waitForMessage(
      (message) => message.type === 'core.app-data.result' && message.requestId === requestId,
      this.#commandTimeoutMs,
    );
    process.postMessage({
      type: 'core.app-data.command',
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      operation,
    });
    const result = await response;
    if (result?.type === 'core.app-data.result') return result.result;
    return CoreAppDataResultSchema.parse({
      ok: false,
      operation: operation.operation,
      errorCode: 'COMMON_TIMEOUT_005',
    });
  }

  async getWindowPreferences(): Promise<CoreWindowPreferencesResult> {
    const process = this.#process;
    if (!process || this.#state !== 'healthy') {
      return { ok: false, errorCode: 'COMMON_INTERNAL_999' };
    }
    const requestId = randomUUID();
    const response = this.#waitForMessage(
      (message) =>
        message.type === 'core.window-preferences-result' && message.requestId === requestId,
      this.#commandTimeoutMs,
    );
    process.postMessage({
      type: 'core.window-preferences.get',
      protocolVersion: PROTOCOL_VERSION,
      requestId,
    });
    const result = await response;
    if (result?.type === 'core.window-preferences-result') return result.result;
    return { ok: false, errorCode: 'COMMON_TIMEOUT_005' };
  }

  async setWindowPreferences(input: WindowPreferences): Promise<CoreWindowPreferencesResult> {
    const process = this.#process;
    if (!process || this.#state !== 'healthy') {
      return { ok: false, errorCode: 'COMMON_INTERNAL_999' };
    }
    const preferences = WindowPreferencesSchema.parse(input);
    const requestId = randomUUID();
    const response = this.#waitForMessage(
      (message) =>
        message.type === 'core.window-preferences-result' && message.requestId === requestId,
      this.#commandTimeoutMs,
    );
    process.postMessage({
      type: 'core.window-preferences.set',
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      preferences,
    });
    const result = await response;
    if (result?.type === 'core.window-preferences-result') return result.result;
    return { ok: false, errorCode: 'COMMON_TIMEOUT_005' };
  }

  attachTaskPort(connectionId: string, port: unknown): SupervisorOperationResult {
    const process = this.#process;
    if (!process || this.#state !== 'healthy') {
      return this.#fail('CORE_NOT_HEALTHY', 'core.task-port.rejected');
    }
    try {
      process.postMessage(
        {
          type: 'core.attach-task-port',
          protocolVersion: PROTOCOL_VERSION,
          connection: { protocolVersion: PROTOCOL_VERSION, connectionId },
        },
        [port],
      );
      return { ok: true };
    } catch {
      return this.#fail('CORE_PORT_TRANSFER_FAILED', 'core.task-port.failed');
    }
  }

  async shutdown(): Promise<SupervisorOperationResult> {
    const process = this.#process;
    if (!process) {
      this.#state = 'stopped';
      return { ok: true };
    }

    this.#state = 'draining';
    const drainRequestId = randomUUID();
    const drained = this.#waitForMessage(
      (message) =>
        message.type === 'core.drained' &&
        message.requestId === drainRequestId &&
        message.pendingTasks === 0,
      this.#commandTimeoutMs,
    );
    process.postMessage({
      type: 'core.drain',
      protocolVersion: PROTOCOL_VERSION,
      requestId: drainRequestId,
    });
    if (!(await drained)) return this.#fail('CORE_DRAIN_TIMEOUT', 'core.drain.timeout');

    const shutdownRequestId = randomUUID();
    const completed = this.#waitForMessage(
      (message) =>
        message.type === 'core.shutdown-complete' && message.requestId === shutdownRequestId,
      this.#commandTimeoutMs,
    );
    const exited = this.#waitForExit(process, this.#commandTimeoutMs);
    this.#expectedExit = true;
    process.postMessage({
      type: 'core.shutdown',
      protocolVersion: PROTOCOL_VERSION,
      requestId: shutdownRequestId,
    });

    const [shutdownComplete, processExited] = await Promise.all([completed, exited]);
    if (!shutdownComplete || !processExited) {
      this.#expectedExit = false;
      return this.#fail('CORE_SHUTDOWN_TIMEOUT', 'core.shutdown.timeout');
    }

    this.#state = 'stopped';
    await this.#logger.log('info', 'core.shutdown.complete', { processStatus: this.#state });
    return { ok: true };
  }

  #bindProcess(process: UtilityProcessHandle): void {
    this.#removeMessageListener?.();
    this.#removeExitListener?.();
    this.#removeMessageListener = process.onMessage((message) => {
      const parsed = CoreEventSchema.safeParse(message);
      if (!parsed.success) {
        void this.#logger.log('warn', 'core.message.rejected', {
          errorCode: 'CORE_PROTOCOL_INVALID',
        });
        return;
      }
      for (const waiter of [...this.#messageWaiters]) {
        if (!waiter.matches(parsed.data)) continue;
        clearTimeout(waiter.timer);
        this.#messageWaiters.delete(waiter);
        waiter.resolve(parsed.data);
      }
    });
    this.#removeExitListener = process.onExit((exitCode) => {
      if (process !== this.#process) return;
      this.#process = undefined;
      for (const waiter of [...this.#messageWaiters]) {
        clearTimeout(waiter.timer);
        this.#messageWaiters.delete(waiter);
        waiter.resolve(null);
      }
      for (const waiter of [...this.#exitWaiters]) {
        if (waiter.process !== process) continue;
        clearTimeout(waiter.timer);
        this.#exitWaiters.delete(waiter);
        waiter.resolve(true);
      }
      if (this.#expectedExit) {
        this.#state = 'stopped';
        return;
      }
      this.#state = 'crashed';
      this.#lastErrorCode = 'CORE_PROCESS_EXIT';
      this.#diagnosticId = createDiagnosticId();
      void this.#logger.log('error', 'core.process.exited', {
        processStatus: this.#state,
        exitCode,
        errorCode: this.#lastErrorCode,
        diagnosticId: this.#diagnosticId,
      });
    });
  }

  #waitForMessage(
    matches: (message: CoreEvent) => boolean,
    timeoutMs: number,
  ): Promise<CoreEvent | null> {
    return new Promise((resolve) => {
      const waiter: MessageWaiter = {
        matches,
        resolve,
        timer: setTimeout(() => {
          this.#messageWaiters.delete(waiter);
          resolve(null);
        }, timeoutMs),
      };
      this.#messageWaiters.add(waiter);
    });
  }

  #waitForExit(process: UtilityProcessHandle, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const waiter: ExitWaiter = {
        process,
        resolve,
        timer: setTimeout(() => {
          this.#exitWaiters.delete(waiter);
          resolve(false);
        }, timeoutMs),
      };
      this.#exitWaiters.add(waiter);
    });
  }

  #fail(errorCode: string, event: string): SupervisorOperationResult {
    this.#state = this.#process ? 'degraded' : 'crashed';
    this.#lastErrorCode = errorCode;
    this.#diagnosticId = createDiagnosticId();
    void this.#logger.log('error', event, {
      processStatus: this.#state,
      errorCode,
      diagnosticId: this.#diagnosticId,
      retryable: true,
    });
    return { ok: false, errorCode, diagnosticId: this.#diagnosticId };
  }
}
