import { randomUUID } from 'node:crypto';

import {
  CoreAppDataOperationSchema,
  CoreAppDataResultSchema,
  CoreEventSchema,
  CoreGenerationOperationSchema,
  CoreGenerationResultSchema,
  CoreProjectOperationSchema,
  CoreProjectResultSchema,
  CoreProviderOperationSchema,
  CoreProviderResultSchema,
  PROTOCOL_VERSION,
  TaskCommandResultSchema,
  WindowPreferencesSchema,
  type CoreAppDataOperation,
  type CoreAppDataResult,
  type CoreControlMessage,
  type CoreEvent,
  type CoreGenerationOperation,
  type CoreGenerationResult,
  type CoreProjectOperation,
  type CoreProjectResult,
  type CoreProviderOperation,
  type CoreProviderResult,
  type CoreStatus,
  type CoreWindowPreferencesResult,
  type ErrorCode,
  type TaskCommand,
  type TaskCommandResult,
  type WindowPreferences,
} from '@worldforge/contracts';

import {
  CoreRpcChannel,
  type CoreRpcRequestResult,
  type CoreRpcRequestState,
} from './core-rpc-channel.js';
import { coreOperationFailureSemantics } from './ipc-error-semantics.js';
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

interface ExitWaiter {
  readonly process: UtilityProcessHandle;
  readonly settle: (exited: boolean) => void;
  readonly timer: NodeJS.Timeout;
}

interface ExitWaitHandle {
  readonly promise: Promise<boolean>;
  readonly cancel: () => void;
}

export class CoreSupervisor {
  readonly #spawn: () => UtilityProcessHandle;
  readonly #logger: SupervisorLogger;
  readonly #startupTimeoutMs: number;
  readonly #commandTimeoutMs: number;
  readonly #rpc = new CoreRpcChannel();
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

    let process: UtilityProcessHandle;
    try {
      process = this.#spawn();
    } catch {
      return this.#fail('CORE_SPAWN_FAILED', 'core.start.failed');
    }

    this.#process = process;
    this.#bindProcess(process);
    const ready = await this.#rpc.request({
      key: `core.ready:${process.pid ?? 'unknown'}`,
      timeoutMs: this.#startupTimeoutMs,
      matches: (message) => message.type === 'core.ready',
      send: () => undefined,
    });
    if (ready.state !== 'response') {
      return this.#fail('CORE_START_TIMEOUT', 'core.start.timeout');
    }

    this.#state = 'healthy';
    await this.#safeLog('info', 'core.start.ready', {
      processStatus: this.#state,
      restartCount: this.#restartCount,
    });
    return { ok: true };
  }

  async ping(): Promise<SupervisorOperationResult> {
    const process = this.#process;
    if (!process || this.#state !== 'healthy') {
      return this.#fail('CORE_NOT_HEALTHY', 'core.health.rejected');
    }
    const requestId = randomUUID();
    const result = await this.#request(
      process,
      `core.health:${requestId}`,
      this.#commandTimeoutMs,
      (message) => message.type === 'core.health' && message.requestId === requestId,
      { type: 'core.ping', protocolVersion: PROTOCOL_VERSION, requestId },
    );
    if (result.state === 'response') return { ok: true };
    return this.#fail(
      result.state === 'send-failed' ? 'CORE_HEALTH_SEND_FAILED' : 'CORE_HEALTH_TIMEOUT',
      result.state === 'send-failed' ? 'core.health.send-failed' : 'core.health.timeout',
    );
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

    const response = await this.#request(
      process,
      `core.command-result:${envelope.requestId}`,
      this.#commandTimeoutMs,
      (message) =>
        message.type === 'core.command-result' &&
        message.requestId === envelope.requestId &&
        message.result.requestId === envelope.requestId,
      {
        type: 'core.command',
        protocolVersion: PROTOCOL_VERSION,
        requestId: envelope.requestId,
        envelope,
      },
    );
    if (response.state === 'response' && response.event.type === 'core.command-result') {
      return response.event.result;
    }

    const code = this.#rpcErrorCode(response.state);
    const semantics = coreOperationFailureSemantics(
      code,
      response.state === 'conflict'
        ? 'The requestId already has an active Core task command.'
        : 'The task command could not be completed by Core.',
      envelope.command === 'task.cancel' ? 'mutation' : 'query',
    );
    return TaskCommandResultSchema.parse({
      ok: false,
      requestId: envelope.requestId,
      error: { code, ...semantics },
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

    const response = await this.#request(
      process,
      `core.app-data.result:${requestId}`,
      this.#commandTimeoutMs,
      (message) =>
        message.type === 'core.app-data.result' &&
        message.requestId === requestId &&
        message.result.operation === operation.operation,
      {
        type: 'core.app-data.command',
        protocolVersion: PROTOCOL_VERSION,
        requestId,
        operation,
      },
    );
    if (response.state === 'response' && response.event.type === 'core.app-data.result') {
      return response.event.result;
    }
    return CoreAppDataResultSchema.parse({
      ok: false,
      operation: operation.operation,
      errorCode: this.#rpcErrorCode(response.state),
    });
  }

  async invokeProviderOperation(
    requestId: string,
    input: CoreProviderOperation,
  ): Promise<CoreProviderResult> {
    const operation = CoreProviderOperationSchema.parse(input);
    const process = this.#process;
    if (!process || this.#state !== 'healthy') {
      return CoreProviderResultSchema.parse({
        ok: false,
        operation: operation.operation,
        errorCode: 'COMMON_INTERNAL_999',
      });
    }

    const timeout =
      operation.operation === 'provider.connection.test'
        ? Math.max(
            this.#commandTimeoutMs,
            Math.min(1_200_000, operation.config.timeoutMs * 4 + 5_000),
          )
        : this.#commandTimeoutMs;
    const response = await this.#request(
      process,
      `core.provider.result:${requestId}`,
      timeout,
      (message) =>
        message.type === 'core.provider.result' &&
        message.requestId === requestId &&
        message.result.operation === operation.operation,
      {
        type: 'core.provider.command',
        protocolVersion: PROTOCOL_VERSION,
        requestId,
        operation,
      },
    );
    if (response.state === 'response' && response.event.type === 'core.provider.result') {
      return response.event.result;
    }
    return CoreProviderResultSchema.parse({
      ok: false,
      operation: operation.operation,
      errorCode: this.#rpcErrorCode(response.state),
    });
  }

  async invokeGenerationOperation(
    requestId: string,
    input: CoreGenerationOperation,
  ): Promise<CoreGenerationResult> {
    const operation = CoreGenerationOperationSchema.parse(input);
    const process = this.#process;
    if (!process || this.#state !== 'healthy') {
      return CoreGenerationResultSchema.parse({
        ok: false,
        operation: operation.operation,
        errorCode: 'COMMON_INTERNAL_999',
      });
    }
    const response = await this.#request(
      process,
      `core.generation.result:${requestId}`,
      Math.max(this.#commandTimeoutMs, 30_000),
      (message) =>
        message.type === 'core.generation.result' &&
        message.requestId === requestId &&
        message.result.operation === operation.operation,
      {
        type: 'core.generation.command',
        protocolVersion: PROTOCOL_VERSION,
        requestId,
        operation,
      },
    );
    if (response.state === 'response' && response.event.type === 'core.generation.result') {
      return response.event.result;
    }
    return CoreGenerationResultSchema.parse({
      ok: false,
      operation: operation.operation,
      errorCode: this.#rpcErrorCode(response.state),
    });
  }

  async invokeProjectOperation(
    requestId: string,
    input: CoreProjectOperation,
  ): Promise<CoreProjectResult> {
    const operation = CoreProjectOperationSchema.parse(input);
    const process = this.#process;
    if (!process || this.#state !== 'healthy') {
      return CoreProjectResultSchema.parse({
        ok: false,
        operation: operation.operation,
        errorCode: 'COMMON_INTERNAL_999',
      });
    }

    const response = await this.#request(
      process,
      `core.project.result:${requestId}`,
      Math.max(this.#commandTimeoutMs, 120_000),
      (message) =>
        message.type === 'core.project.result' &&
        message.requestId === requestId &&
        message.result.operation === operation.operation,
      {
        type: 'core.project.command',
        protocolVersion: PROTOCOL_VERSION,
        requestId,
        operation,
      },
    );
    if (response.state === 'response' && response.event.type === 'core.project.result') {
      return response.event.result;
    }
    return CoreProjectResultSchema.parse({
      ok: false,
      operation: operation.operation,
      errorCode: this.#rpcErrorCode(response.state),
    });
  }

  async getWindowPreferences(): Promise<CoreWindowPreferencesResult> {
    const process = this.#process;
    if (!process || this.#state !== 'healthy') {
      return { ok: false, errorCode: 'COMMON_INTERNAL_999' };
    }
    const requestId = randomUUID();
    const response = await this.#request(
      process,
      `core.window-preferences-result:${requestId}`,
      this.#commandTimeoutMs,
      (message) =>
        message.type === 'core.window-preferences-result' && message.requestId === requestId,
      {
        type: 'core.window-preferences.get',
        protocolVersion: PROTOCOL_VERSION,
        requestId,
      },
    );
    if (response.state === 'response' && response.event.type === 'core.window-preferences-result') {
      return response.event.result;
    }
    return { ok: false, errorCode: this.#rpcErrorCode(response.state) };
  }

  async setWindowPreferences(input: WindowPreferences): Promise<CoreWindowPreferencesResult> {
    const process = this.#process;
    if (!process || this.#state !== 'healthy') {
      return { ok: false, errorCode: 'COMMON_INTERNAL_999' };
    }
    const preferences = WindowPreferencesSchema.parse(input);
    const requestId = randomUUID();
    const response = await this.#request(
      process,
      `core.window-preferences-result:${requestId}`,
      this.#commandTimeoutMs,
      (message) =>
        message.type === 'core.window-preferences-result' && message.requestId === requestId,
      {
        type: 'core.window-preferences.set',
        protocolVersion: PROTOCOL_VERSION,
        requestId,
        preferences,
      },
    );
    if (response.state === 'response' && response.event.type === 'core.window-preferences-result') {
      return response.event.result;
    }
    return { ok: false, errorCode: this.#rpcErrorCode(response.state) };
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
    const drained = await this.#request(
      process,
      `core.drained:${drainRequestId}`,
      this.#commandTimeoutMs,
      (message) =>
        message.type === 'core.drained' &&
        message.requestId === drainRequestId &&
        message.pendingTasks === 0,
      {
        type: 'core.drain',
        protocolVersion: PROTOCOL_VERSION,
        requestId: drainRequestId,
      },
    );
    if (drained.state !== 'response') {
      return this.#fail(
        drained.state === 'send-failed' ? 'CORE_DRAIN_SEND_FAILED' : 'CORE_DRAIN_TIMEOUT',
        drained.state === 'send-failed' ? 'core.drain.send-failed' : 'core.drain.timeout',
      );
    }

    const shutdownRequestId = randomUUID();
    const exited = this.#waitForExit(process, this.#commandTimeoutMs);
    this.#expectedExit = true;
    const completed = await this.#request(
      process,
      `core.shutdown-complete:${shutdownRequestId}`,
      this.#commandTimeoutMs,
      (message) =>
        message.type === 'core.shutdown-complete' && message.requestId === shutdownRequestId,
      {
        type: 'core.shutdown',
        protocolVersion: PROTOCOL_VERSION,
        requestId: shutdownRequestId,
      },
    );
    if (completed.state !== 'response') {
      this.#expectedExit = false;
      exited.cancel();
      return this.#fail(
        completed.state === 'send-failed' ? 'CORE_SHUTDOWN_SEND_FAILED' : 'CORE_SHUTDOWN_TIMEOUT',
        completed.state === 'send-failed' ? 'core.shutdown.send-failed' : 'core.shutdown.timeout',
      );
    }

    const processExited = await exited.promise;
    if (!processExited) {
      this.#expectedExit = false;
      return this.#fail('CORE_SHUTDOWN_TIMEOUT', 'core.shutdown.timeout');
    }

    this.#expectedExit = false;
    this.#state = 'stopped';
    await this.#safeLog('info', 'core.shutdown.complete', { processStatus: this.#state });
    return { ok: true };
  }

  #bindProcess(process: UtilityProcessHandle): void {
    this.#removeMessageListener?.();
    this.#removeExitListener?.();
    this.#removeMessageListener = process.onMessage((message) => {
      const parsed = CoreEventSchema.safeParse(message);
      if (!parsed.success) {
        void this.#safeLog('warn', 'core.message.rejected', {
          errorCode: 'CORE_PROTOCOL_INVALID',
        });
        return;
      }
      this.#rpc.accept(parsed.data);
    });
    this.#removeExitListener = process.onExit((exitCode) => {
      if (process !== this.#process) return;
      this.#process = undefined;
      this.#rpc.disconnect();
      for (const waiter of [...this.#exitWaiters]) {
        if (waiter.process === process) waiter.settle(true);
      }
      if (this.#expectedExit) {
        this.#expectedExit = false;
        this.#state = 'stopped';
        return;
      }
      this.#state = 'crashed';
      this.#lastErrorCode = 'CORE_PROCESS_EXIT';
      this.#diagnosticId = createDiagnosticId();
      void this.#safeLog('error', 'core.process.exited', {
        processStatus: this.#state,
        exitCode,
        errorCode: this.#lastErrorCode,
        diagnosticId: this.#diagnosticId,
      });
    });
  }

  #request(
    process: UtilityProcessHandle,
    key: string,
    timeoutMs: number,
    matches: (message: CoreEvent) => boolean,
    message: CoreControlMessage,
    transfer?: readonly unknown[],
  ): Promise<CoreRpcRequestResult> {
    return this.#rpc.request({
      key,
      timeoutMs,
      matches,
      send: () => process.postMessage(message, transfer),
    });
  }

  #waitForExit(process: UtilityProcessHandle, timeoutMs: number): ExitWaitHandle {
    let settled = false;
    let settlePromise!: (exited: boolean) => void;
    const promise = new Promise<boolean>((resolve) => {
      settlePromise = resolve;
    });
    const settle = (exited: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(waiter.timer);
      this.#exitWaiters.delete(waiter);
      settlePromise(exited);
    };
    const waiter: ExitWaiter = {
      process,
      settle,
      timer: setTimeout(() => settle(false), timeoutMs),
    };
    this.#exitWaiters.add(waiter);
    return { promise, cancel: () => settle(false) };
  }

  #rpcErrorCode(state: CoreRpcRequestState): ErrorCode {
    if (state === 'conflict') return 'COMMON_CONFLICT_003';
    if (state === 'timeout') return 'COMMON_TIMEOUT_005';
    return 'COMMON_INTERNAL_999';
  }

  async #safeLog(level: LogLevel, event: string, fields?: LogFields): Promise<void> {
    try {
      await this.#logger.log(level, event, fields);
    } catch {
      // Diagnostics are best effort and must never alter process or business state.
    }
  }

  #fail(errorCode: string, event: string): SupervisorOperationResult {
    this.#state = this.#process ? 'degraded' : 'crashed';
    this.#lastErrorCode = errorCode;
    this.#diagnosticId = createDiagnosticId();
    void this.#safeLog('error', event, {
      processStatus: this.#state,
      errorCode,
      diagnosticId: this.#diagnosticId,
      retryable: true,
    });
    return { ok: false, errorCode, diagnosticId: this.#diagnosticId };
  }
}
