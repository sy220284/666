import {
  PROTOCOL_VERSION,
  PROJECT_PLANNING_COMMANDS,
  ProjectCreatePlotNodeCommandSchema,
  ProjectUpdateBriefCommandSchema,
  type CoreProjectOperation,
  type CoreProjectResult,
  type PlotNodeList,
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
  sentAt: '2026-07-18T12:50:00.000Z',
} as const;
const projectId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
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
const emptyOutline: PlotNodeList = { projectId, nodes: [] };

describe('project planning IPC contracts', () => {
  it('rejects authority fields, malformed rule lists, and renderer supplied order keys', () => {
    const brief = {
      ...base,
      command: PROJECT_PLANNING_COMMANDS.updateBrief,
      payload: {
        projectId,
        concept: '',
        readingPromise: '',
        protagonistGoal: '',
        coreConflict: '',
        endingIntent: '',
        required: ['必须保留作者选择权'],
        forbidden: [],
      },
    };
    expect(ProjectUpdateBriefCommandSchema.safeParse(brief).success).toBe(true);
    expect(
      ProjectUpdateBriefCommandSchema.safeParse({
        ...brief,
        payload: { ...brief.payload, id: projectId, updatedAt: base.sentAt },
      }).success,
    ).toBe(false);
    expect(
      ProjectUpdateBriefCommandSchema.safeParse({
        ...brief,
        payload: { ...brief.payload, required: [''] },
      }).success,
    ).toBe(false);

    const node = {
      ...base,
      command: PROJECT_PLANNING_COMMANDS.createPlotNode,
      payload: {
        projectId,
        parentId: null,
        nodeType: 'arc',
        title: '主线剧情弧',
        goal: '',
        coreConflict: '',
        expectedResult: '',
        status: 'pending',
        placement: { kind: 'end' },
      },
    };
    expect(ProjectCreatePlotNodeCommandSchema.safeParse(node).success).toBe(true);
    expect(
      ProjectCreatePlotNodeCommandSchema.safeParse({
        ...node,
        payload: { ...node.payload, id: projectId, orderKey: '1024' },
      }).success,
    ).toBe(false);
  });

  it('validates sender and payload before forwarding named planning operations to Core', async () => {
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
    const invokeProjectOperation = vi.fn(
      async (_requestId: string, operation: CoreProjectOperation): Promise<CoreProjectResult> => ({
        ok: true,
        operation: operation.operation as typeof PROJECT_PLANNING_COMMANDS.createPlotNode,
        data: emptyOutline,
      }),
    );
    const supervisor = {
      getStatus: vi.fn(),
      restart: vi.fn(),
      invokeTaskCommand: vi.fn(),
      invokeAppDataOperation: vi.fn(),
      invokeProjectOperation,
      attachTaskPort: vi.fn(() => ({ ok: true })),
    } as unknown as CoreSupervisor;

    registerIpcHandlers({
      ipcMain,
      supervisor,
      credentialBroker: {
        store: vi.fn(),
        remove: vi.fn(),
        has: vi.fn(),
      } as unknown as CredentialBroker,
      rendererUrl: 'file:///trusted/index.html',
      version: '0.1.0',
      platform: 'test',
      logger: { log: vi.fn() } as unknown as PrivacyLogger,
      getWindowPreferences: () => preferences,
      setAppearancePreferences: vi.fn(async () => preferences),
      chooseRecentLocation: vi.fn(async () => null),
      chooseProjectCreateParent: vi.fn(async () => null),
      chooseProjectToOpen: vi.fn(async () => null),
      chooseProjectMoveParent: vi.fn(async () => null),
      chooseRecoveryRestoreParent: vi.fn(async () => null),
      chooseRecoveryExportDirectory: vi.fn(async () => null),
      chooseTextImportFile: vi.fn(async () => null),
      chooseTextExportDirectory: vi.fn(async () => null),
    });

    const handler = handlers.get('worldforge:planning:create-plot-node');
    const command = {
      ...base,
      command: PROJECT_PLANNING_COMMANDS.createPlotNode,
      payload: {
        projectId,
        parentId: null,
        nodeType: 'arc',
        title: '主线剧情弧',
        goal: '',
        coreConflict: '',
        expectedResult: '',
        status: 'pending',
        placement: { kind: 'end' },
      },
    };
    await expect(
      handler?.(
        { senderFrame: { url: 'https://attacker.invalid' } } as unknown as IpcMainInvokeEvent,
        command,
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'COMMON_INVALID_INPUT_001' } });
    expect(invokeProjectOperation).not.toHaveBeenCalled();

    await expect(
      handler?.(
        { senderFrame: { url: 'file:///trusted/index.html' } } as unknown as IpcMainInvokeEvent,
        command,
      ),
    ).resolves.toEqual({ ok: true, requestId: base.requestId, data: emptyOutline });
    expect(invokeProjectOperation).toHaveBeenCalledWith(base.requestId, {
      operation: PROJECT_PLANNING_COMMANDS.createPlotNode,
      input: command.payload,
    });
  });
});
