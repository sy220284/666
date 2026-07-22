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

const rendererRoot = path.join(process.cwd(), 'apps/desktop/renderer/src');

describe('M3 final React business workbenches', () => {
  it('uses named adapters without direct feature access to the Window preload bridge', async () => {
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
        version: {},
        candidate: {},
        task: {},
      } as never,
      undefined,
      {
        continuity,
        narrativePlanning: {},
        stateProposal: {},
        candidateAction: {},
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

    const featureSources = await Promise.all(
      [
        'features/planning/planning-mode-workbench.tsx',
        'features/planning/professional-planning-workbench.tsx',
        'features/canon/canon-workbench.tsx',
        'features/canon/continuity-relationship-editor.tsx',
        'features/canon/narrative-relationship-editor.tsx',
        'features/data-tools/data-tools-workbench.tsx',
        'features/writing/writing-workbench.tsx',
        'features/writing/writing-core-workbench.tsx',
      ].map((file) => readFile(path.join(rendererRoot, file), 'utf8')),
    );
    for (const source of featureSources) {
      expect(source).not.toContain('window.worldforge');
    }
  });

  it('has one static React root and physically removes every retired business bootstrap', async () => {
    const html = await readFile(path.join(rendererRoot, 'index.html'), 'utf8');
    const packageEntry = await readFile(path.join(rendererRoot, 'index.ts'), 'utf8');
    expect(html).toContain('id="react-root"');
    expect(html).toContain('./m3.css');
    expect(html).not.toContain('legacy-root');
    expect(html).not.toContain('data-draft-workspace');
    expect(html).not.toContain('data-version-dialog');
    expect(packageEntry).not.toContain("import './main.js'");

    for (const file of [
      'main.ts',
      'entry.ts',
      'candidate-preview-bootstrap.ts',
      'candidate-preview-ui.ts',
      'candidate-apply-bootstrap.ts',
      'candidate-apply-ui.ts',
      'canon-ui.ts',
      'continuity-ui.ts',
      'narrative-planning-ui.ts',
      'state-proposal-ui.ts',
      'scene-beat-entity-selector.ts',
      'audit-trash-reference-guard.ts',
    ]) {
      await expect(access(path.join(rendererRoot, file))).rejects.toThrow();
    }
  });

  it('keeps safety hashes, complete relationship fields and independent cancellation state', async () => {
    const [planning, canonCore, continuity, narrative, dataTools, hook, writing] =
      await Promise.all([
        readFile(
          path.join(rendererRoot, 'features/planning/professional-planning-workbench.tsx'),
          'utf8',
        ),
        readFile(path.join(rendererRoot, 'features/canon/canon-core-workbench.tsx'), 'utf8'),
        readFile(
          path.join(rendererRoot, 'features/canon/continuity-relationship-editor.tsx'),
          'utf8',
        ),
        readFile(
          path.join(rendererRoot, 'features/canon/narrative-relationship-editor.tsx'),
          'utf8',
        ),
        readFile(path.join(rendererRoot, 'features/data-tools/data-tools-workbench.tsx'), 'utf8'),
        readFile(path.join(rendererRoot, 'bridge/use-bridge-resource.ts'), 'utf8'),
        readFile(path.join(rendererRoot, 'features/writing/writing-core-workbench.tsx'), 'utf8'),
      ]);

    expect(planning).toContain('previewSplitChapter');
    expect(planning).toContain('previewMergeChapters');
    expect(planning).toContain('previewMoveBlocks');
    expect(planning).toContain('previewPermanentDelete');
    expect(planning).toContain('planHash: preview.planHash');
    expect(planning).toContain('confirmationTitle = window.prompt');
    expect(canonCore).toContain("selected.status !== 'archived'");
    expect(canonCore).toContain('输入实体名称');
    expect(continuity).toContain('participantIds');
    expect(continuity).toContain('witnessIds');
    expect(continuity).toContain('subjectIds');
    expect(continuity).toContain('dependencyIds');
    expect(continuity).toContain('evidence');
    expect(narrative).toContain('chapterLinks');
    expect(narrative).toContain('relations');
    expect(narrative).toContain('dependencyMilestoneIds');
    expect(narrative).toContain('dependencyTimelineEventIds');
    expect(dataTools).toContain("operation: 'manual-protection'");
    expect(dataTools).toContain('预览不会写入项目');
    expect(hook).toContain("BridgeResourceState = 'loading' | 'success' | 'failure' | 'cancelled'");
    expect(hook).toContain("outcome.state === 'cancelled'");
    expect(writing).toContain('DraftAutosaveCoordinator');
    expect(writing).toContain('candidateAction.preview');
    expect(writing).toContain('candidateAction.apply');
    expect(writing).toContain('candidateAction.undo');
  });

  it('keeps existing planning, Canon, import, recovery and Candidate scenarios in desktop regression', async () => {
    const config = await readFile(
      path.join(process.cwd(), 'tests/e2e/playwright.config.ts'),
      'utf8',
    );
    for (const spec of [
      'project-planning.spec.ts',
      'm1-09-import-export.spec.ts',
      'm1-deferred-acceptance.spec.ts',
      'narrative-planning-ledger.spec.ts',
      'state-proposal-valid-until.spec.ts',
      'state-proposal-workflow.spec.ts',
      'candidate-preview.spec.ts',
      'candidate-action.spec.ts',
      'candidate-protection.spec.ts',
      'candidate-undo.spec.ts',
    ]) {
      expect(config).toContain(spec);
    }
  });
});
