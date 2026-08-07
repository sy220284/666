import { randomUUID } from 'node:crypto';

import { PROTOCOL_VERSION, type CoreControlMessage, type CoreEvent } from '@worldforge/contracts';
import { describe, expect, it } from 'vitest';

import {
  CoreSupervisor,
  type SupervisorLogger,
  type UtilityProcessHandle,
} from '../../apps/desktop/main/src/core-supervisor.js';

class BoundaryProcess implements UtilityProcessHandle {
  readonly pid = 7_001;
  readonly #messages = new Set<(message: unknown) => void>();
  readonly #exits = new Set<(exitCode: number | null) => void>();
  throwOnShutdown = false;

  postMessage(message: CoreControlMessage): void {
    if (message.type === 'core.ping') {
      this.emit({
        type: 'core.health',
        protocolVersion: PROTOCOL_VERSION,
        requestId: message.requestId,
        status: 'healthy',
        uptimeMs: 1,
      });
    }
    if (message.type === 'core.drain') {
      this.emit({
        type: 'core.drained',
        protocolVersion: PROTOCOL_VERSION,
        requestId: message.requestId,
        pendingTasks: 0,
      });
    }
    if (message.type === 'core.shutdown') {
      if (this.throwOnShutdown) throw new Error('shutdown transport closed');
      this.emit({
        type: 'core.shutdown-complete',
        protocolVersion: PROTOCOL_VERSION,
        requestId: message.requestId,
      });
      this.exit(0);
    }
  }

  onMessage(listener: (message: unknown) => void): () => void {
    this.#messages.add(listener);
    return () => this.#messages.delete(listener);
  }

  onExit(listener: (exitCode: number | null) => void): () => void {
    this.#exits.add(listener);
    return () => this.#exits.delete(listener);
  }

  ready(): void {
    this.emit({
      type: 'core.ready',
      protocolVersion: PROTOCOL_VERSION,
      startedAt: new Date().toISOString(),
    });
  }

  emit(message: CoreEvent): void {
    for (const listener of this.#messages) listener(message);
  }

  exit(code: number): void {
    for (const listener of this.#exits) listener(code);
  }
}

function supervisorFor(process: BoundaryProcess, logger: SupervisorLogger): CoreSupervisor {
  return new CoreSupervisor({
    spawn: () => {
      queueMicrotask(() => process.ready());
      return process;
    },
    logger,
    startupTimeoutMs: 50,
    commandTimeoutMs: 50,
  });
}

describe('M10-13 CoreSupervisor boundary', () => {
  it('keeps successful lifecycle results when diagnostics storage fails', async () => {
    const process = new BoundaryProcess();
    const supervisor = supervisorFor(process, {
      log: () => Promise.reject(new Error('log directory unavailable')),
    });

    await expect(supervisor.start()).resolves.toEqual({ ok: true });
    expect(supervisor.getStatus().status).toBe('healthy');
    await expect(supervisor.ping()).resolves.toEqual({ ok: true });
    await expect(supervisor.shutdown()).resolves.toEqual({ ok: true });
    expect(supervisor.getStatus()).toMatchObject({ status: 'stopped', pid: null });
  });

  it('rejects concurrent reuse of the same app-data requestId', async () => {
    const process = new BoundaryProcess();
    const supervisor = supervisorFor(process, { log: () => undefined });
    await supervisor.start();
    const requestId = randomUUID();

    const first = supervisor.invokeAppDataOperation(requestId, {
      operation: 'project.listRecent',
    });
    const second = await supervisor.invokeAppDataOperation(requestId, {
      operation: 'project.listRecent',
    });

    expect(second).toEqual({
      ok: false,
      operation: 'project.listRecent',
      errorCode: 'COMMON_CONFLICT_003',
    });
    process.emit({
      type: 'core.app-data.result',
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      result: {
        ok: true,
        operation: 'project.listRecent',
        data: { projects: [] },
      },
    });
    await expect(first).resolves.toEqual({
      ok: true,
      operation: 'project.listRecent',
      data: { projects: [] },
    });
  });

  it('restores unexpected-exit semantics when shutdown send fails', async () => {
    const process = new BoundaryProcess();
    const supervisor = supervisorFor(process, { log: () => undefined });
    await supervisor.start();
    process.throwOnShutdown = true;

    await expect(supervisor.shutdown()).resolves.toMatchObject({
      ok: false,
      errorCode: 'CORE_SHUTDOWN_SEND_FAILED',
    });
    process.exit(9);

    expect(supervisor.getStatus()).toMatchObject({
      status: 'crashed',
      lastErrorCode: 'CORE_PROCESS_EXIT',
    });
  });
});
