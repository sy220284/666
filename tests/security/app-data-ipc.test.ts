import {
  APP_COMMANDS,
  PROJECT_WORKSPACE_COMMANDS,
  PROTOCOL_VERSION,
  ProjectCreateCommandSchema,
  ProjectRelocateRecentCommandSchema,
  SettingsSetCommandSchema,
  type CoreAppDataOperation,
  type CoreAppDataResult,
  type CoreProjectOperation,
  type CoreProjectResult,
  type WindowPreferences,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import type { CoreSupervisor } from '../../apps/desktop/main/src/core-supervisor.js';
import type { CredentialBroker } from '../../apps/desktop/main/src/credential-broker.js';
import { registerIpcHandlers } from '../../apps/desktop/main/src/ipc-handlers.js';
import type { PrivacyLogger } from '../../apps/desktop/main/src/privacy-logger.js';

const base = {
  protocolVersion: PROTOCOL_VERSION,
  requestId: '550e8400-e29b-41d4-a716-446655440000',
  sentAt: '2026-07-16T06:00:00.000Z',
} as const;
const projectId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const selectedPath = '/safe/selected/project';
const preferences: WindowPreferences = {
  displayId: 'display-1',
  boundsDip: { x: 0, y: 0, width: 1_280, height: 800 },
  scaleFactor: 1,
  maximized: false,
  workspaceAlignment: 'center',
  uiScalePercent: 100,
  bodyFontSize: 18,
  contentWidth: 'normal',
};

function successFor(operation: CoreAppDataOperation): CoreAppDataResult {
  switch (operation.operation) {
    case APP_COMMANDS.settingsGet:
    case APP_COMMANDS.settingsSet:
    case APP_COMMANDS.settingsReset:
      return {
        ok: true,
        operation: operation.operation,
        data: {
          source: 'default',
          settings: {
            schemaVersion: 1,
            language: 'zh-CN',
            startupBehavior: 'show-home',
            defaultMode: 'beginner',
            themeId: 'theme-a',
            themeVariant: 'light',
            reduceMotion: false,
          },
        },
      };
    case APP_COMMANDS.projectListRecent:
      return { ok: true, operation: operation.operation, data: { projects: [] } };
    case APP_COMMANDS.projectRelocateRecent:
      return {
        ok: true,
        operation: operation.operation,
        data: {
          projectId: operation.projectId,
          workspacePath: operation.workspacePath,
          displayName: '真实项目',
          lastOpenedAt: '2026-07-16T05:00:00.000Z',
          missingSince: null,
        },
      };
    case APP_COMMANDS.projectRemoveRecent:
      return { ok: true, operation: operation.operation, data: { removed: true } };
  }
}

describe('application-data IPC contracts', () => {
  it('accepts only strict settings fields and keeps relocation paths out of Renderer input', () => {
    const settings = {
      ...base,
      command: APP_COMMANDS.settingsSet,
      payload: { defaultMode: 'professional', themeId: 'theme-b', themeVariant: 'dark' },
    };
    expect(SettingsSetCommandSchema.safeParse(settings).success).toBe(true);
    expect(
      SettingsSetCommandSchema.safeParse({
        ...settings,
        payload: { ...settings.payload, schemaVersion: 99 },
      }).success,
    ).toBe(false);

    const relocation = {
      ...base,
      command: APP_COMMANDS.projectRelocateRecent,
      payload: { projectId },
    };
    expect(ProjectRelocateRecentCommandSchema.safeParse(relocation).success).toBe(true);
    expect(
      ProjectRelocateRecentCommandSchema.safeParse({
        ...relocation,
        payload: { projectId, workspacePath: '/renderer/injected/path' },
      }).success,
    ).toBe(false);
  });

  it('validates the sender, selects relocation paths in Main, and forwards named operations', async () => {
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
    const invokeAppDataOperation = vi.fn(
      async (_requestId: string, operation: CoreAppDataOperation) => successFor(operation),
    );
    const invokeProjectOperation = vi.fn(
      async (_requestId: string, operation: CoreProjectOperation): Promise<CoreProjectResult> => {
        if (operation.operation !== PROJECT_WORKSPACE_COMMANDS.create) {
          return { ok: false, operation: operation.operation, errorCode: 'COMMON_INTERNAL_999' };
        }
        return {
          ok: true,
          operation: operation.operation,
          data: {
            projectId,
            name: operation.input.name,
            channel: operation.input.channel,
            workspacePath: `${operation.parentDirectory}/真实项目.worldforge`,
            schemaVersion: 1,
            databaseMode: 'read-write',
            compatibility: 'current',
            readOnlyReason: null,
            createdAt: '2026-07-16T06:00:00.000Z',
          },
        };
      },
    );
    const supervisor = {
      getStatus: vi.fn(),
      restart: vi.fn(),
      invokeTaskCommand: vi.fn(),
      invokeAppDataOperation,
      invokeProjectOperation,
      attachTaskPort: vi.fn(() => ({ ok: true })),
    } as unknown as CoreSupervisor;
    const credentialBroker = {
      store: vi.fn(),
      remove: vi.fn(),
      has: vi.fn(),
    } as unknown as CredentialBroker;
    const chooseRecentLocation = vi.fn(async () => selectedPath);

    registerIpcHandlers({
      ipcMain,
      supervisor,
      credentialBroker,
      rendererUrl: 'file:///trusted/index.html',
      version: '0.1.0',
      platform: 'test',
      logger: { log: vi.fn() } as unknown as PrivacyLogger,
      getWindowPreferences: () => preferences,
      setAppearancePreferences: vi.fn(async () => preferences),
      chooseRecentLocation,
      chooseProjectCreateParent: vi.fn(async () => selectedPath),
      chooseProjectToOpen: vi.fn(async () => null),
      chooseProjectMoveParent: vi.fn(async () => null),
    });

    const listHandler = handlers.get('worldforge:project:list-recent');
    expect(listHandler).toBeDefined();
    const listCommand = {
      ...base,
      command: APP_COMMANDS.projectListRecent,
      payload: {},
    };
    await expect(
      listHandler?.(
        { senderFrame: { url: 'https://attacker.invalid' } } as unknown as IpcMainInvokeEvent,
        listCommand,
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'COMMON_INVALID_INPUT_001' } });
    expect(invokeAppDataOperation).not.toHaveBeenCalled();

    await expect(
      listHandler?.(
        { senderFrame: { url: 'file:///trusted/index.html' } } as unknown as IpcMainInvokeEvent,
        listCommand,
      ),
    ).resolves.toEqual({ ok: true, requestId: base.requestId, data: { projects: [] } });

    const relocateHandler = handlers.get('worldforge:project:relocate-recent');
    const relocation = {
      ...base,
      command: APP_COMMANDS.projectRelocateRecent,
      payload: { projectId },
    };
    await expect(
      relocateHandler?.(
        { senderFrame: { url: 'file:///trusted/index.html' } } as unknown as IpcMainInvokeEvent,
        { ...relocation, payload: { ...relocation.payload, workspacePath: '/injected' } },
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'COMMON_INVALID_INPUT_001' } });
    expect(chooseRecentLocation).not.toHaveBeenCalled();

    await expect(
      relocateHandler?.(
        { senderFrame: { url: 'file:///trusted/index.html' } } as unknown as IpcMainInvokeEvent,
        relocation,
      ),
    ).resolves.toMatchObject({
      ok: true,
      data: { projectId, workspacePath: selectedPath, missingSince: null },
    });
    expect(chooseRecentLocation).toHaveBeenCalledOnce();
    expect(invokeAppDataOperation).toHaveBeenLastCalledWith(base.requestId, {
      operation: APP_COMMANDS.projectRelocateRecent,
      projectId,
      workspacePath: selectedPath,
    });

    const createHandler = handlers.get('worldforge:project:create');
    const createCommand = {
      ...base,
      command: PROJECT_WORKSPACE_COMMANDS.create,
      payload: { name: '真实项目', channel: '悬疑' },
    };
    expect(ProjectCreateCommandSchema.safeParse(createCommand).success).toBe(true);
    await expect(
      createHandler?.(
        { senderFrame: { url: 'file:///trusted/index.html' } } as unknown as IpcMainInvokeEvent,
        { ...createCommand, payload: { ...createCommand.payload, parentDirectory: '/injected' } },
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'COMMON_INVALID_INPUT_001' } });
    expect(invokeProjectOperation).not.toHaveBeenCalled();

    await expect(
      createHandler?.(
        { senderFrame: { url: 'file:///trusted/index.html' } } as unknown as IpcMainInvokeEvent,
        createCommand,
      ),
    ).resolves.toMatchObject({
      ok: true,
      data: { projectId, name: '真实项目', workspacePath: `${selectedPath}/真实项目.worldforge` },
    });
    expect(invokeProjectOperation).toHaveBeenCalledWith(base.requestId, {
      operation: PROJECT_WORKSPACE_COMMANDS.create,
      input: createCommand.payload,
      parentDirectory: selectedPath,
    });
  });
});
