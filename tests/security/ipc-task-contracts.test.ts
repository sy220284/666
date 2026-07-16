import { randomUUID } from 'node:crypto';

import {
  AppSetAppearancePreferencesCommandSchema,
  ErrorCodeSchema,
  PROTOCOL_VERSION,
  RegisteredCommandSchema,
  TaskEventEnvelopeSchema,
  TaskListActiveCommandSchema,
  type WindowPreferences,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import type { CoreSupervisor } from '../../apps/desktop/main/src/core-supervisor.js';
import type { CredentialBroker } from '../../apps/desktop/main/src/credential-broker.js';
import { registerIpcHandlers } from '../../apps/desktop/main/src/ipc-handlers.js';
import type { PrivacyLogger } from '../../apps/desktop/main/src/privacy-logger.js';

const base = {
  protocolVersion: PROTOCOL_VERSION,
  requestId: '550e8400-e29b-41d4-a716-446655440000',
  sentAt: '2026-07-15T00:00:00.000Z',
} as const;

const windowPreferences: WindowPreferences = {
  displayId: 'display-1',
  boundsDip: { x: 40, y: 30, width: 1_280, height: 800 },
  scaleFactor: 1.25,
  maximized: false,
  workspaceAlignment: 'center',
  uiScalePercent: 100,
  bodyFontSize: 18,
  contentWidth: 'normal',
};

describe('frozen command and error contracts', () => {
  it('rejects unregistered commands, version mismatches, and extra fields', () => {
    expect(
      RegisteredCommandSchema.safeParse({
        ...base,
        command: 'system.executeSql',
        payload: { sql: 'DROP TABLE projects' },
      }).success,
    ).toBe(false);
    expect(
      TaskListActiveCommandSchema.safeParse({
        ...base,
        protocolVersion: 2,
        command: 'task.listActive',
        payload: {},
      }).success,
    ).toBe(false);
    expect(
      TaskListActiveCommandSchema.safeParse({
        ...base,
        command: 'task.listActive',
        payload: {},
        path: '/private/project.sqlite',
      }).success,
    ).toBe(false);
  });

  it('accepts only documented stable error codes and strict event payloads', () => {
    expect(ErrorCodeSchema.safeParse('TASK_EVENT_GAP_002').success).toBe(true);
    expect(ErrorCodeSchema.safeParse('ARBITRARY_PROVIDER_ERROR').success).toBe(false);
    expect(
      TaskEventEnvelopeSchema.safeParse({
        protocolVersion: PROTOCOL_VERSION,
        eventId: randomUUID(),
        taskId: randomUUID(),
        sequence: 1,
        type: 'task.started',
        payload: { taskType: 'backup.verify', stage: 'queued', secret: 'leak' },
        emittedAt: '2026-07-15T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('allows only appearance fields and frozen value ranges through the Renderer command', () => {
    const command = {
      ...base,
      command: 'app.setAppearancePreferences',
      payload: {
        workspaceAlignment: 'center',
        uiScalePercent: 100,
        bodyFontSize: 18,
        contentWidth: 'normal',
      },
    };
    expect(AppSetAppearancePreferencesCommandSchema.safeParse(command).success).toBe(true);
    expect(
      AppSetAppearancePreferencesCommandSchema.safeParse({
        ...command,
        payload: { ...command.payload, displayId: 'attacker-controlled' },
      }).success,
    ).toBe(false);
    expect(
      AppSetAppearancePreferencesCommandSchema.safeParse({
        ...command,
        payload: { ...command.payload, uiScalePercent: 105 },
      }).success,
    ).toBe(false);
    expect(
      AppSetAppearancePreferencesCommandSchema.safeParse({
        ...command,
        payload: { ...command.payload, bodyFontSize: 42 },
      }).success,
    ).toBe(false);
  });
});

describe('Main IPC task whitelist', () => {
  it('rejects untrusted and malformed task commands before they reach Core', async () => {
    const handlers = new Map<string, (event: IpcMainInvokeEvent, input: unknown) => unknown>();
    const listeners = new Map<string, (event: IpcMainEvent, input: unknown) => void>();
    const ipcMain = {
      handle: vi.fn(
        (channel: string, handler: (event: IpcMainInvokeEvent, input: unknown) => unknown) => {
          handlers.set(channel, handler);
        },
      ),
      removeHandler: vi.fn(),
      on: vi.fn((channel: string, listener: (event: IpcMainEvent, input: unknown) => void) => {
        listeners.set(channel, listener);
      }),
      removeListener: vi.fn(),
    } as unknown as IpcMain;
    const invokeTaskCommand = vi.fn(async (command: { readonly requestId: string }) => ({
      ok: true as const,
      requestId: command.requestId,
      data: { tasks: [] },
    }));
    const supervisor = {
      getStatus: vi.fn(),
      restart: vi.fn(),
      invokeTaskCommand,
      attachTaskPort: vi.fn(() => ({ ok: true })),
    } as unknown as CoreSupervisor;
    const credentialBroker = {
      store: vi.fn(),
      remove: vi.fn(),
      has: vi.fn(),
    } as unknown as CredentialBroker;
    const logger = { log: vi.fn() } as unknown as PrivacyLogger;
    const setAppearancePreferences = vi.fn(async () => windowPreferences);

    registerIpcHandlers({
      ipcMain,
      supervisor,
      credentialBroker,
      rendererUrl: 'file:///trusted/index.html',
      version: '0.1.0',
      platform: 'test',
      logger,
      getWindowPreferences: () => windowPreferences,
      setAppearancePreferences,
      chooseRecentLocation: vi.fn(async () => null),
    });

    const handler = handlers.get('worldforge:task:list-active');
    expect(handler).toBeDefined();
    const command = {
      ...base,
      command: 'task.listActive',
      payload: {},
    };
    const untrusted = await handler?.(
      { senderFrame: { url: 'https://attacker.invalid' } } as unknown as IpcMainInvokeEvent,
      command,
    );
    expect(untrusted).toMatchObject({
      ok: false,
      error: { code: 'COMMON_INVALID_INPUT_001' },
    });
    expect(invokeTaskCommand).not.toHaveBeenCalled();

    const malformed = await handler?.(
      { senderFrame: { url: 'file:///trusted/index.html' } } as unknown as IpcMainInvokeEvent,
      { ...command, table: 'projects' },
    );
    expect(malformed).toMatchObject({
      ok: false,
      error: { code: 'COMMON_INVALID_INPUT_001' },
    });
    expect(invokeTaskCommand).not.toHaveBeenCalled();

    const accepted = await handler?.(
      { senderFrame: { url: 'file:///trusted/index.html' } } as unknown as IpcMainInvokeEvent,
      command,
    );
    expect(accepted).toEqual({ ok: true, requestId: base.requestId, data: { tasks: [] } });
    expect(invokeTaskCommand).toHaveBeenCalledOnce();
    expect(listeners.has('worldforge:task:connect-events')).toBe(true);

    const appearanceHandler = handlers.get('worldforge:app:set-appearance-preferences');
    expect(appearanceHandler).toBeDefined();
    const appearanceCommand = {
      ...base,
      command: 'app.setAppearancePreferences',
      payload: {
        workspaceAlignment: 'right',
        uiScalePercent: 120,
        bodyFontSize: 20,
        contentWidth: 'wide',
      },
    };
    const rejectedAppearance = await appearanceHandler?.(
      { senderFrame: { url: 'file:///trusted/index.html' } } as unknown as IpcMainInvokeEvent,
      { ...appearanceCommand, payload: { ...appearanceCommand.payload, boundsDip: command } },
    );
    expect(rejectedAppearance).toMatchObject({
      ok: false,
      error: { code: 'COMMON_INVALID_INPUT_001' },
    });
    expect(setAppearancePreferences).not.toHaveBeenCalled();

    const acceptedAppearance = await appearanceHandler?.(
      { senderFrame: { url: 'file:///trusted/index.html' } } as unknown as IpcMainInvokeEvent,
      appearanceCommand,
    );
    expect(acceptedAppearance).toEqual({
      ok: true,
      requestId: base.requestId,
      data: windowPreferences,
    });
    expect(setAppearancePreferences).toHaveBeenCalledWith(appearanceCommand.payload);
  });
});
