import {
  APP_COMMANDS,
  PROJECT_WORKSPACE_COMMANDS,
  PROTOCOL_VERSION,
  TaskCancelCommandSchema,
  TaskListActiveCommandSchema,
  type CoreControlMessage,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import {
  CoreSupervisor,
  type UtilityProcessHandle,
} from '../../apps/desktop/main/src/core-supervisor.js';
import type { CredentialBroker } from '../../apps/desktop/main/src/credential-broker.js';
import { registerIpcHandlers } from '../../apps/desktop/main/src/ipc-handlers.js';
import type { PrivacyLogger } from '../../apps/desktop/main/src/privacy-logger.js';

const base = {
  protocolVersion: PROTOCOL_VERSION,
  sentAt: '2026-07-23T00:00:00.000Z',
} as const;
const requestId = '550e8400-e29b-41d4-a716-446655440000';
const projectId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const taskId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const trustedEvent = {
  senderFrame: { url: 'file:///trusted/index.html' },
} as unknown as IpcMainInvokeEvent;

describe('common Main IPC timeout semantics', () => {
  it('allows safe query retries while keeping mutation outcomes unknown', async () => {
    const handlers = new Map<string, (event: IpcMainInvokeEvent, raw: unknown) => unknown>();
    const ipcMain = {
      handle: vi.fn(
        (channel: string, handler: (event: IpcMainInvokeEvent, raw: unknown) => unknown) => {
          handlers.set(channel, handler);
        },
      ),
      removeHandler: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    } as unknown as IpcMain;
    const supervisor = {
      getStatus: vi.fn(),
      restart: vi.fn(),
      invokeTaskCommand: vi.fn(),
      attachTaskPort: vi.fn(() => ({ ok: true })),
      invokeAppDataOperation: vi.fn(
        async (_requestId: string, operation: { operation: string }) => ({
          ok: false as const,
          operation: operation.operation,
          errorCode: 'COMMON_TIMEOUT_005' as const,
        }),
      ),
      invokeProjectOperation: vi.fn(
        async (_requestId: string, operation: { operation: string }) => ({
          ok: false as const,
          operation: operation.operation,
          errorCode: 'COMMON_TIMEOUT_005' as const,
        }),
      ),
    } as unknown as CoreSupervisor;
    const credentialBroker = {
      store: vi.fn(),
      remove: vi.fn(),
      has: vi.fn(),
    } as unknown as CredentialBroker;
    const chooseDirectory = vi.fn(async () => '/safe');

    registerIpcHandlers({
      ipcMain,
      supervisor,
      credentialBroker,
      rendererUrl: 'file:///trusted/index.html',
      version: '0.1.0',
      platform: 'test',
      logger: { log: vi.fn() } as unknown as PrivacyLogger,
      getWindowPreferences: () => ({
        displayId: 'display-1',
        boundsDip: { x: 0, y: 0, width: 1280, height: 800 },
        scaleFactor: 1,
        maximized: false,
        workspaceAlignment: 'center',
        uiScalePercent: 100,
        bodyFontSize: 18,
        contentWidth: 'normal',
      }),
      setAppearancePreferences: vi.fn(),
      chooseRecentLocation: chooseDirectory,
      chooseProjectCreateParent: chooseDirectory,
      chooseProjectToOpen: chooseDirectory,
      chooseProjectMoveParent: chooseDirectory,
      chooseRecoveryRestoreParent: chooseDirectory,
      chooseRecoveryExportDirectory: chooseDirectory,
      chooseTextImportFile: chooseDirectory,
      chooseTextExportDirectory: chooseDirectory,
    });

    const settingsGet = handlers.get('worldforge:settings:get');
    await expect(
      settingsGet?.(trustedEvent, {
        ...base,
        requestId,
        command: APP_COMMANDS.settingsGet,
        payload: {},
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_TIMEOUT_005', retryable: true },
    });

    const getActive = handlers.get('worldforge:project:get-active');
    await expect(
      getActive?.(trustedEvent, {
        ...base,
        requestId,
        command: PROJECT_WORKSPACE_COMMANDS.getActive,
        payload: {},
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_TIMEOUT_005', retryable: true },
    });

    const create = handlers.get('worldforge:project:create');
    await expect(
      create?.(trustedEvent, {
        ...base,
        requestId,
        command: PROJECT_WORKSPACE_COMMANDS.create,
        payload: { name: '超时语义测试', channel: '悬疑' },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'COMMON_TIMEOUT_005',
        retryable: false,
        userAction: expect.stringContaining('authoritative state'),
      },
    });
  });
});

class SilentTaskProcess implements UtilityProcessHandle {
  readonly pid = 42;
  readonly #messageListeners = new Set<(message: unknown) => void>();
  readonly #exitListeners = new Set<(exitCode: number | null) => void>();

  postMessage(_message: CoreControlMessage): void {}

  onMessage(listener: (message: unknown) => void): () => void {
    this.#messageListeners.add(listener);
    return () => this.#messageListeners.delete(listener);
  }

  onExit(listener: (exitCode: number | null) => void): () => void {
    this.#exitListeners.add(listener);
    return () => this.#exitListeners.delete(listener);
  }

  ready(): void {
    for (const listener of this.#messageListeners) {
      listener({
        type: 'core.ready',
        protocolVersion: PROTOCOL_VERSION,
        startedAt: '2026-07-23T00:00:00.000Z',
      });
    }
  }
}

describe('Core task timeout semantics', () => {
  it('classifies task reads as retryable and cancellation as result-unknown', async () => {
    const process = new SilentTaskProcess();
    const supervisor = new CoreSupervisor({
      spawn: () => {
        queueMicrotask(() => process.ready());
        return process;
      },
      logger: { log: vi.fn() },
      startupTimeoutMs: 50,
      commandTimeoutMs: 5,
    });
    await supervisor.start();

    const list = TaskListActiveCommandSchema.parse({
      ...base,
      requestId,
      command: 'task.listActive',
      payload: {},
    });
    await expect(supervisor.invokeTaskCommand(list)).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_TIMEOUT_005', retryable: true },
    });

    const cancel = TaskCancelCommandSchema.parse({
      ...base,
      requestId: '123e4567-e89b-12d3-a456-426614174000',
      command: 'task.cancel',
      payload: { taskId },
    });
    await expect(supervisor.invokeTaskCommand(cancel)).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'COMMON_TIMEOUT_005',
        retryable: false,
        userAction: expect.stringContaining('authoritative state'),
      },
    });
  });
});
