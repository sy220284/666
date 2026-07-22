import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { CommandResult } from '@worldforge/contracts';

import { createRendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';

const success = <T>(requestId: string, data: T): CommandResult<T> => ({
  ok: true,
  requestId,
  data,
});

describe('M3-09 React业务工作台', () => {
  it('通过命名适配器访问规划、恢复和连续性，不让feature直读window Bridge', async () => {
    const planning = {
      getBrief: vi.fn(async (projectId: string) => success('brief', { projectId })),
    };
    const recovery = {
      getOverview: vi.fn(async (projectId: string) => success('recovery', { projectId })),
    };
    const continuity = {
      list: vi.fn(async ({ projectId }: { readonly projectId: string }) =>
        success('continuity', {
          projectId,
          entityStates: [],
          timelineEvents: [],
          knowledgeStates: [],
        }),
      ),
    };
    const adapter = createRendererBridgeAdapter(
      {
        app: {},
        settings: {},
        project: {},
        recovery,
        textIo: {},
        planning,
        canon: {},
        trash: {},
        draft: {},
        task: {},
      } as never,
      undefined,
      {
        continuity,
        narrativePlanning: {},
        stateProposal: {},
      } as never,
    );

    await expect(adapter.planning.getBrief('project-1')).resolves.toMatchObject({
      state: 'success',
      requestId: 'brief',
    });
    await expect(adapter.recovery.getOverview('project-1')).resolves.toMatchObject({
      state: 'success',
      requestId: 'recovery',
    });
    await expect(
      adapter.continuity.list({
        projectId: 'project-1',
        query: '',
        includeHistory: true,
        includeArchivedEvents: false,
        effectiveAtChapterId: null,
      }),
    ).resolves.toMatchObject({ state: 'success', requestId: 'continuity' });

    const rendererRoot = path.join(process.cwd(), 'apps/desktop/renderer/src');
    const featureSources = await Promise.all(
      [
        'features/planning/planning-workbench.tsx',
        'features/canon/canon-workbench.tsx',
        'features/data-tools/data-tools-workbench.tsx',
      ].map((file) => readFile(path.join(rendererRoot, file), 'utf8')),
    );
    for (const source of featureSources) {
      expect(source).not.toContain('window.worldforge');
      expect(source).toContain('RendererBridgeAdapter');
    }
  });

  it('删除旧业务DOM和六个独立bootstrap，只保留M3-10兼容面', async () => {
    const rendererRoot = path.join(process.cwd(), 'apps/desktop/renderer/src');
    const html = await readFile(path.join(rendererRoot, 'index.html'), 'utf8');
    for (const selector of [
      'data-planning-dialog',
      'data-canon-dialog',
      'data-structure-dialog',
      'data-trash-dialog',
      'data-recovery-dialog',
      'data-text-io-dialog',
    ]) {
      expect(html).not.toContain(selector);
    }
    for (const file of [
      'canon-ui.ts',
      'continuity-ui.ts',
      'narrative-planning-ui.ts',
      'state-proposal-ui.ts',
      'scene-beat-entity-selector.ts',
      'audit-trash-reference-guard.ts',
    ]) {
      await expect(access(path.join(rendererRoot, file))).rejects.toThrow();
    }
    expect(html).toContain('data-draft-workspace');
    expect(html).toContain('data-version-dialog');
  });

  it('保留危险操作的预览哈希、恢复点和只读阻断语义', async () => {
    const rendererRoot = path.join(process.cwd(), 'apps/desktop/renderer/src');
    const [planning, canon, dataTools, hook] = await Promise.all([
      readFile(path.join(rendererRoot, 'features/planning/planning-workbench.tsx'), 'utf8'),
      readFile(path.join(rendererRoot, 'features/canon/canon-workbench.tsx'), 'utf8'),
      readFile(path.join(rendererRoot, 'features/data-tools/data-tools-workbench.tsx'), 'utf8'),
      readFile(path.join(rendererRoot, 'bridge/use-bridge-resource.ts'), 'utf8'),
    ]);

    expect(planning).toContain('previewSplitChapter');
    expect(planning).toContain('previewMergeChapters');
    expect(planning).toContain('previewMoveBlocks');
    expect(planning).toContain('previewPermanentDelete');
    expect(planning).toContain('planHash: preview.planHash');
    expect(planning).toContain('confirmationTitle = window.prompt');
    expect(canon).toContain("selected.status !== 'archived'");
    expect(canon).toContain('输入实体名称');
    expect(canon).toContain('useBridgeQuery');
    expect(dataTools).toContain("operation: 'manual-protection'");
    expect(dataTools).toContain('预览不会写入项目');
    expect(dataTools).toContain('disabled={readOnly || command.pending}');
    expect(hook).toContain('generation.current');
    expect(hook).toContain('pendingRef.current');
  });
});
