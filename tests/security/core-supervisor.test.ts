import { PROTOCOL_VERSION, type CoreControlMessage, type CoreEvent } from '@worldforge/contracts';
import { describe, expect, it } from 'vitest';

import {
  CoreSupervisor,
  type SupervisorLogger,
  type UtilityProcessHandle,
} from '../../apps/desktop/main/src/core-supervisor.js';

class FakeUtilityProcess implements UtilityProcessHandle {
  readonly pid: number;
  readonly #messageListeners = new Set<(message: unknown) => void>();
  readonly #exitListeners = new Set<(exitCode: number | null) => void>();
  respondToDrain = true;
  respondToShutdown = true;
  exited = false;

  constructor(pid: number) {
    this.pid = pid;
  }

  postMessage(message: CoreControlMessage): void {
    if (message.type === 'core.ping') {
      this.emitMessage({
        type: 'core.health',
        protocolVersion: PROTOCOL_VERSION,
        requestId: message.requestId,
        status: 'healthy',
        uptimeMs: 1,
      });
    }
    if (message.type === 'core.drain' && this.respondToDrain) {
      this.emitMessage({
        type: 'core.drained',
        protocolVersion: PROTOCOL_VERSION,
        requestId: message.requestId,
        pendingTasks: 0,
      });
    }
    if (message.type === 'core.shutdown' && this.respondToShutdown) {
      this.emitMessage({
        type: 'core.shutdown-complete',
        protocolVersion: PROTOCOL_VERSION,
        requestId: message.requestId,
      });
      this.exit(0);
    }
  }

  onMessage(listener: (message: unknown) => void): () => void {
    this.#messageListeners.add(listener);
    return () => this.#messageListeners.delete(listener);
  }

  onExit(listener: (exitCode: number | null) => void): () => void {
    this.#exitListeners.add(listener);
    return () => this.#exitListeners.delete(listener);
  }

  ready(): void {
    this.emitMessage({
      type: 'core.ready',
      protocolVersion: PROTOCOL_VERSION,
      startedAt: new Date().toISOString(),
    });
  }

  emitMessage(message: CoreEvent): void {
    for (const listener of this.#messageListeners) listener(message);
  }

  exit(code: number): void {
    this.exited = true;
    for (const listener of this.#exitListeners) listener(code);
  }
}

const quietLogger: SupervisorLogger = { log: () => undefined };

function spawnReady(processes: FakeUtilityProcess[]): () => FakeUtilityProcess {
  return () => {
    const process = new FakeUtilityProcess(1_000 + processes.length);
    processes.push(process);
    queueMicrotask(() => process.ready());
    return process;
  };
}

describe('Core Utility Process supervision', () => {
  it('performs ready/health/drain/shutdown handshakes', async () => {
    const processes: FakeUtilityProcess[] = [];
    const supervisor = new CoreSupervisor({
      spawn: spawnReady(processes),
      logger: quietLogger,
      startupTimeoutMs: 50,
      commandTimeoutMs: 50,
    });

    await expect(supervisor.start()).resolves.toEqual({ ok: true });
    expect(supervisor.getStatus()).toMatchObject({ status: 'healthy', pid: 1_000 });
    await expect(supervisor.ping()).resolves.toEqual({ ok: true });
    await expect(supervisor.shutdown()).resolves.toEqual({ ok: true });
    expect(processes[0]?.exited).toBe(true);
    expect(supervisor.getStatus()).toMatchObject({ status: 'stopped', pid: null });
  });

  it('reports crashes and starts a fresh process on controlled restart', async () => {
    const processes: FakeUtilityProcess[] = [];
    const supervisor = new CoreSupervisor({
      spawn: spawnReady(processes),
      logger: quietLogger,
      startupTimeoutMs: 50,
      commandTimeoutMs: 50,
    });

    await supervisor.start();
    processes[0]?.exit(9);
    expect(supervisor.getStatus()).toMatchObject({
      status: 'crashed',
      lastErrorCode: 'CORE_PROCESS_EXIT',
    });

    await expect(supervisor.restart()).resolves.toEqual({ ok: true });
    expect(processes).toHaveLength(2);
    expect(supervisor.getStatus()).toMatchObject({ status: 'healthy', restartCount: 1 });
  });

  it('keeps a non-draining process alive and reports a diagnostic instead of force-killing it', async () => {
    const processes: FakeUtilityProcess[] = [];
    const supervisor = new CoreSupervisor({
      spawn: spawnReady(processes),
      logger: quietLogger,
      startupTimeoutMs: 50,
      commandTimeoutMs: 10,
    });

    await supervisor.start();
    const process = processes[0];
    expect(process).toBeDefined();
    if (!process) return;
    process.respondToDrain = false;
    const result = await supervisor.shutdown();

    expect(result).toMatchObject({ ok: false, errorCode: 'CORE_DRAIN_TIMEOUT' });
    expect(result.diagnosticId).toMatch(/^diag_/);
    expect(process.exited).toBe(false);
    expect(supervisor.getStatus().status).toBe('degraded');
  });

  it('surfaces startup timeout without claiming a healthy state', async () => {
    const process = new FakeUtilityProcess(1000);
    const supervisor = new CoreSupervisor({
      spawn: () => process,
      logger: quietLogger,
      startupTimeoutMs: 10,
      commandTimeoutMs: 10,
    });

    const result = await supervisor.start();
    expect(result).toMatchObject({ ok: false, errorCode: 'CORE_START_TIMEOUT' });
    expect(supervisor.getStatus()).toMatchObject({
      status: 'degraded',
      lastErrorCode: 'CORE_START_TIMEOUT',
    });
    expect(process.exited).toBe(false);
  });
});
