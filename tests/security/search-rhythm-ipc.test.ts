import { randomUUID } from 'node:crypto';

import {
  DRAFT_COMMANDS,
  DraftApplyPatchCommandSchema,
  RHYTHM_COMMANDS,
  RHYTHM_IPC_CHANNELS,
  SEARCH_TOOLS_COMMANDS,
  SEARCH_TOOLS_IPC_CHANNELS,
  type CoreProjectOperation,
  type CoreProjectResult,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import type { CoreSupervisor } from '../../apps/desktop/main/src/core-supervisor.js';
import { registerNarrativePlanningIpc } from '../../apps/desktop/main/src/narrative-planning-ipc.js';

const trustedEvent = {
  senderFrame: { url: 'file:///trusted/index.html' },
} as unknown as IpcMainInvokeEvent;
const untrustedEvent = {
  senderFrame: { url: 'https://attacker.invalid' },
} as unknown as IpcMainInvokeEvent;

describe('M4-04 search, replacement and rhythm IPC boundary', () => {
  it('routes strict commands and never lets Renderer set mutationOrigin or ReplacePlan items', async () => {
    const handlers = new Map<
      string,
      (event: IpcMainInvokeEvent, raw: unknown) => Promise<unknown> | unknown
    >();
    const ipcMain = {
      handle: vi.fn(
        (
          channel: string,
          handler: (event: IpcMainInvokeEvent, raw: unknown) => Promise<unknown> | unknown,
        ) => handlers.set(channel, handler),
      ),
      removeHandler: vi.fn(),
    } as unknown as IpcMain;
    const projectId = randomUUID();
    const planId = randomUUID();
    const createdAt = '2026-07-26T09:30:00.000Z';
    const emptyPlan = {
      planId,
      projectId,
      query: '旧名',
      replacement: '新名',
      matchCase: true,
      status: 'preview',
      itemCount: 0,
      eligibleCount: 0,
      lockedCount: 0,
      checkpointId: null,
      items: [],
      createdAt,
      updatedAt: createdAt,
      appliedAt: null,
    };
    const invokeProjectOperation = vi.fn(
      async (_requestId: string, operation: CoreProjectOperation): Promise<CoreProjectResult> => {
        let data: unknown;
        if (operation.operation === SEARCH_TOOLS_COMMANDS.search) {
          data = {
            projectId,
            query: '旧名',
            normalizedQuery: '旧名',
            strategy: 'authoritative-like',
            indexStatus: 'ready',
            items: [],
          };
        } else if (operation.operation === SEARCH_TOOLS_COMMANDS.getIndexState) {
          data = {
            projectId,
            status: 'ready',
            pendingCount: 0,
            failedCount: 0,
            lastIndexedAt: null,
            staleAt: null,
            lastErrorCode: null,
            updatedAt: createdAt,
          };
        } else if (operation.operation === SEARCH_TOOLS_COMMANDS.rebuildIndex) {
          data = {
            projectId,
            draftCount: 0,
            versionCount: 0,
            entityCount: 0,
            failedCount: 0,
            status: 'ready',
          };
        } else if (operation.operation === SEARCH_TOOLS_COMMANDS.previewReplace) {
          data = emptyPlan;
        } else if (operation.operation === SEARCH_TOOLS_COMMANDS.applyReplace) {
          data = {
            plan: {
              ...emptyPlan,
              status: 'applied',
              checkpointId: randomUUID(),
              appliedAt: createdAt,
            },
            checkpoint: {
              backupId: randomUUID(),
              projectId,
              operation: 'replace',
              backupFileName: 'replace.sqlite',
              sizeBytes: 1,
              sha256: 'a'.repeat(64),
              createdAt,
              verifiedAt: createdAt,
            },
            changedDrafts: [],
            skippedLockedCount: 0,
          };
        } else if (new Set<string>(Object.values(RHYTHM_COMMANDS)).has(operation.operation)) {
          data = {
            projectId,
            profile: {
              projectId,
              channel: '长篇',
              enabled: true,
              excitementMinPer1000: 0.5,
              excitementMaxPer1000: 3,
              hookEnabled: true,
              goldenThreeEnabled: true,
              targetDailyCharacters: 3_000,
              idleThresholdSeconds: 300,
              timeZone: 'Asia/Singapore',
              statisticsStartedAt: createdAt,
              updatedAt: createdAt,
            },
            today: { day: '2026-07-26', manualNetCharacters: 0, effectiveSeconds: 0 },
            cumulativeManualNetCharacters: 0,
            cumulativeEffectiveSeconds: 0,
            days: [],
            chapters: [],
            suggestions: [],
            calculatedAt: createdAt,
          };
        } else {
          data = { projectId, entries: [] };
        }
        return { ok: true, operation: operation.operation, data } as CoreProjectResult;
      },
    );
    const unregister = registerNarrativePlanningIpc({
      ipcMain,
      supervisor: { invokeProjectOperation } as unknown as CoreSupervisor,
      rendererUrl: 'file:///trusted/index.html',
    });
    const cases = [
      {
        channel: SEARCH_TOOLS_IPC_CHANNELS.search,
        operation: SEARCH_TOOLS_COMMANDS.search,
        payload: { projectId, query: '旧名', sourceTypes: ['draft'], limit: 50 },
      },
      {
        channel: SEARCH_TOOLS_IPC_CHANNELS.getIndexState,
        operation: SEARCH_TOOLS_COMMANDS.getIndexState,
        payload: { projectId },
      },
      {
        channel: SEARCH_TOOLS_IPC_CHANNELS.rebuildIndex,
        operation: SEARCH_TOOLS_COMMANDS.rebuildIndex,
        payload: { projectId },
      },
      {
        channel: SEARCH_TOOLS_IPC_CHANNELS.previewReplace,
        operation: SEARCH_TOOLS_COMMANDS.previewReplace,
        payload: {
          projectId,
          query: '旧名',
          replacement: '新名',
          matchCase: true,
          maxMatches: 100,
        },
      },
      {
        channel: SEARCH_TOOLS_IPC_CHANNELS.applyReplace,
        operation: SEARCH_TOOLS_COMMANDS.applyReplace,
        payload: { projectId, planId },
      },
      {
        channel: SEARCH_TOOLS_IPC_CHANNELS.listDictionary,
        operation: SEARCH_TOOLS_COMMANDS.listDictionary,
        payload: { projectId },
      },
      {
        channel: SEARCH_TOOLS_IPC_CHANNELS.upsertDictionary,
        operation: SEARCH_TOOLS_COMMANDS.upsertDictionary,
        payload: {
          projectId,
          authority: 'author',
          term: '旧名',
          category: 'terminology',
          action: 'replace',
          replacementTerm: '新名',
          notes: '',
        },
      },
      {
        channel: SEARCH_TOOLS_IPC_CHANNELS.deleteDictionary,
        operation: SEARCH_TOOLS_COMMANDS.deleteDictionary,
        payload: { projectId, authority: 'author', term: '旧名' },
      },
      {
        channel: RHYTHM_IPC_CHANNELS.get,
        operation: RHYTHM_COMMANDS.get,
        payload: { projectId },
      },
      {
        channel: RHYTHM_IPC_CHANNELS.run,
        operation: RHYTHM_COMMANDS.run,
        payload: { projectId },
      },
      {
        channel: RHYTHM_IPC_CHANNELS.updateProfile,
        operation: RHYTHM_COMMANDS.updateProfile,
        payload: {
          projectId,
          authority: 'author',
          enabled: true,
          excitementMinPer1000: 0.5,
          excitementMaxPer1000: 3,
          hookEnabled: true,
          goldenThreeEnabled: true,
          targetDailyCharacters: 3_000,
          idleThresholdSeconds: 300,
          timeZone: 'Asia/Singapore',
        },
      },
    ] as const;

    for (const item of cases) {
      const handler = handlers.get(item.channel);
      const requestId = randomUUID();
      const command = {
        protocolVersion: 1,
        requestId,
        sentAt: createdAt,
        command: item.operation,
        payload: item.payload,
      };
      const callsBefore = invokeProjectOperation.mock.calls.length;
      await expect(handler?.(untrustedEvent, command)).resolves.toMatchObject({
        ok: false,
        error: { code: 'COMMON_INVALID_INPUT_001' },
      });
      await expect(
        handler?.(trustedEvent, {
          ...command,
          payload: { ...item.payload, forged: true },
        }),
      ).resolves.toMatchObject({
        ok: false,
        error: { code: 'COMMON_INVALID_INPUT_001' },
      });
      expect(invokeProjectOperation).toHaveBeenCalledTimes(callsBefore);
      await expect(handler?.(trustedEvent, command)).resolves.toMatchObject({
        ok: true,
        requestId,
      });
    }

    expect(
      DraftApplyPatchCommandSchema.safeParse({
        protocolVersion: 1,
        requestId: randomUUID(),
        sentAt: createdAt,
        command: DRAFT_COMMANDS.applyPatch,
        payload: {
          projectId,
          chapterId: randomUUID(),
          draftId: randomUUID(),
          baseRevision: 0,
          operations: [
            {
              type: 'update',
              logicalBlockId: randomUUID(),
              expectedHash: 'a'.repeat(64),
              content: '正文',
            },
          ],
          mutationOrigin: 'manual_edit',
        },
      }).success,
    ).toBe(false);
    unregister();
    expect(ipcMain.removeHandler).toHaveBeenCalledTimes(32);
  });
});
