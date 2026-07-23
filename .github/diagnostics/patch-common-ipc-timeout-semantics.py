from pathlib import Path
import re


def literal(path: str, old: str, new: str, count: int = 1) -> None:
    file = Path(path)
    source = file.read_text()
    actual = source.count(old)
    if actual != count:
        raise SystemExit(f'{path}: expected {count} literal match(es), found {actual}: {old[:80]!r}')
    file.write_text(source.replace(old, new, count))


ipc = 'apps/desktop/main/src/ipc-handlers.ts'
literal(
    ipc,
    "import { coreOperationFailureSemantics } from './ipc-error-semantics.js';",
    "import { coreOperationFailureSemantics, type CoreOperationKind } from './ipc-error-semantics.js';",
)
literal(
    ipc,
    """function requestIdFrom(raw: unknown): string {
  if (raw && typeof raw === 'object' && 'requestId' in raw) {
    const parsed = RequestIdSchema.safeParse(raw.requestId);
    if (parsed.success) return parsed.data;
  }
  return randomUUID();
}

export function registerIpcHandlers""",
    """function requestIdFrom(raw: unknown): string {
  if (raw && typeof raw === 'object' && 'requestId' in raw) {
    const parsed = RequestIdSchema.safeParse(raw.requestId);
    if (parsed.success) return parsed.data;
  }
  return randomUUID();
}

const QUERY_PROJECT_OPERATIONS = new Set<string>([
  PROJECT_WORKSPACE_COMMANDS.getActive,
  PROJECT_PLANNING_COMMANDS.getBrief,
  PROJECT_PLANNING_COMMANDS.listPlotNodes,
  SCENE_BEAT_COMMANDS.listSceneBeats,
  SCENE_BEAT_COMMANDS.previewMoveSceneBeat,
  ENTITY_CANON_COMMANDS.listEntities,
  ENTITY_CANON_COMMANDS.previewDeleteEntity,
  PROJECT_STRUCTURE_COMMANDS.listStructure,
  PROJECT_STRUCTURE_COMMANDS.listTrash,
  PROJECT_STRUCTURE_COMMANDS.previewPermanentDelete,
  PROJECT_STRUCTURE_COMMANDS.previewSplitChapter,
  PROJECT_STRUCTURE_COMMANDS.previewMergeChapters,
  PROJECT_STRUCTURE_COMMANDS.previewMoveBlocks,
  CANDIDATE_COMMANDS.listCandidates,
  CANDIDATE_COMMANDS.getCandidate,
  VERSION_COMMANDS.listVersions,
  VERSION_COMMANDS.getVersion,
  RECOVERY_COMMANDS.getOverview,
  TEXT_IO_COMMANDS.previewImport,
  TEXT_IO_COMMANDS.listExportVersions,
]);

function projectOperationKind(operation: string): CoreOperationKind {
  return QUERY_PROJECT_OPERATIONS.has(operation) ? 'query' : 'mutation';
}

export function registerIpcHandlers""",
)
literal(
    ipc,
    """  const appDataFailure = (
    requestId: string,
    code: ErrorCode,
    details?: CommandFailure['error']['details'],
  ): CommandFailure => {
    const semantics = coreOperationFailureSemantics(
      code,
      'The local application data operation could not be completed.',
    );""",
    """  const appDataFailure = (
    requestId: string,
    code: ErrorCode,
    details?: CommandFailure['error']['details'],
    operationKind: CoreOperationKind = 'mutation',
  ): CommandFailure => {
    const semantics = coreOperationFailureSemantics(
      code,
      'The local application data operation could not be completed.',
      operationKind,
    );""",
)
literal(
    ipc,
    """    return result.ok
      ? success(parsed.data.requestId, result.data)
      : appDataFailure(parsed.data.requestId, result.errorCode);
  });

  register(IPC_CHANNELS.settingsSet""",
    """    return result.ok
      ? success(parsed.data.requestId, result.data)
      : appDataFailure(parsed.data.requestId, result.errorCode, undefined, 'query');
  });

  register(IPC_CHANNELS.settingsSet""",
)
literal(
    ipc,
    """    return result.ok
      ? success(parsed.data.requestId, result.data)
      : appDataFailure(parsed.data.requestId, result.errorCode);
  });

  register(IPC_CHANNELS.projectRelocateRecent""",
    """    return result.ok
      ? success(parsed.data.requestId, result.data)
      : appDataFailure(parsed.data.requestId, result.errorCode, undefined, 'query');
  });

  register(IPC_CHANNELS.projectRelocateRecent""",
)
literal(
    ipc,
    """      : appDataFailure(
          requestId,
          result.errorCode,
          'details' in result ? result.details : undefined,
        );""",
    """      : appDataFailure(
          requestId,
          result.errorCode,
          'details' in result ? result.details : undefined,
          projectOperationKind(operation.operation),
        );""",
)

supervisor = 'apps/desktop/main/src/core-supervisor.ts'
literal(
    supervisor,
    "import { createDiagnosticId, type LogFields, type LogLevel } from './privacy-logger.js';",
    "import { coreOperationFailureSemantics } from './ipc-error-semantics.js';\nimport { createDiagnosticId, type LogFields, type LogLevel } from './privacy-logger.js';",
)
literal(
    supervisor,
    """    if (result?.type === 'core.command-result') return result.result;
    return TaskCommandResultSchema.parse({
      ok: false,
      requestId: envelope.requestId,
      error: {
        code: 'COMMON_TIMEOUT_005',
        message:
          'Core did not return a final result before the timeout; the operation may still have completed.',
        retryable: false,
        userAction: 'Refresh authoritative state before attempting the operation again.',
      },
    });""",
    """    if (result?.type === 'core.command-result') return result.result;
    const semantics = coreOperationFailureSemantics(
      'COMMON_TIMEOUT_005',
      'The task command timed out.',
      envelope.command === 'task.cancel' ? 'mutation' : 'query',
    );
    return TaskCommandResultSchema.parse({
      ok: false,
      requestId: envelope.requestId,
      error: { code: 'COMMON_TIMEOUT_005', ...semantics },
    });""",
)

test_path = Path('tests/security/common-ipc-timeout-semantics.test.ts')
test_path.write_text("""import {
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
      invokeAppDataOperation: vi.fn(async (_requestId: string, operation: { operation: string }) => ({
        ok: false as const,
        operation: operation.operation,
        errorCode: 'COMMON_TIMEOUT_005' as const,
      })),
      invokeProjectOperation: vi.fn(async (_requestId: string, operation: { operation: string }) => ({
        ok: false as const,
        operation: operation.operation,
        errorCode: 'COMMON_TIMEOUT_005' as const,
      })),
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
""")

architecture = Path('docs/architecture/M0_M3_FINAL_REMEDIATION.md')
source = architecture.read_text()
section = """

## 通用IPC超时语义补齐

通用Main IPC注册表沿用同一读写分类：设置读取、最近项目、活动项目、规划/设定/结构预览、Version读取、恢复概览和导入预览属于`query`，超时后可安全重试；创建、更新、采用、恢复、导出和取消等`mutation`超时继续表达结果未知，必须先刷新权威状态。Task协议中的`task.getSnapshot`与`task.listActive`属于查询，`task.cancel`属于写入意图。
"""
if '## 通用IPC超时语义补齐' not in source:
    architecture.write_text(source.rstrip() + section + '\n')
