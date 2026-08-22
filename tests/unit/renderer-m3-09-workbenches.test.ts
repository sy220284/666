import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { CommandResult } from '@worldforge/contracts';

import { createRendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { contractInput, strictTestDouble } from '../testkit/strict-test-doubles.js';

const success = <T>(requestId: string, data: T): CommandResult<T> => ({
  ok: true,
  requestId,
  data,
});

const rendererRoot = path.join(process.cwd(), 'apps/desktop/renderer/src');
type BaseBridge = Parameters<typeof createRendererBridgeAdapter>[0];
type ExtendedBridge = Parameters<typeof createRendererBridgeAdapter>[2];

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
    const baseBridge = strictTestDouble<BaseBridge>(
      'RendererBaseBridge',
      contractInput({
        app: {},
        settings: {},
        providers: {},
        generation: {},
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
      }),
    );
    const extendedBridge = strictTestDouble<NonNullable<ExtendedBridge>>(
      'RendererExtendedBridge',
      contractInput({
        continuity,
        narrativePlanning: {},
        stateProposal: {},
        validation: {},
        searchTools: {},
        rhythm: {},
        storyKnowledge: {
          project: vi.fn(async () => success('story-knowledge', {})),
        },
        longformAi: {},
        research: {},
        candidateAction: {},
      }),
    );
    const adapter = createRendererBridgeAdapter(baseBridge, undefined, extendedBridge);

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
        'features/canon/canon-core-workbench.tsx',
        'features/canon/entity-canon-panel.tsx',
        'features/canon/continuity-panel.tsx',
        'features/canon/narrative-planning-panel.tsx',
        'features/canon/state-proposal-panel.tsx',
        'features/canon/story-knowledge-panel.tsx',
        'features/canon/story-knowledge-history-metadata.tsx',
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
    expect(html).toContain('./styles/base.css');
    expect(html).toContain('./styles/layout.css');
    expect(html).toContain('./styles/components/01-shell.css');
    expect(html).toContain('./styles/themes.css');
    expect(html).not.toContain('./m3.css');
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
      'styles.css',
      'm3.css',
      'm8-07.css',
      'compat/legacy-surface.ts',
    ]) {
      await expect(access(path.join(rendererRoot, file))).rejects.toThrow();
    }
  });

  it('keeps safety hashes, complete relationship fields and independent cancellation state', async () => {
    const [
      planning,
      structure,
      canonCore,
      entityCanon,
      continuityPanel,
      narrativePanel,
      stateProposalPanel,
      continuity,
      narrative,
      dataTools,
      hook,
      writing,
    ] = await Promise.all([
      readFile(
        path.join(rendererRoot, 'features/planning/professional-planning-workbench.tsx'),
        'utf8',
      ),
      Promise.all(
        [
          'structure-navigator.tsx',
          'structure-tree.tsx',
          'volume-editor-dialog.tsx',
          'chapter-editor-dialog.tsx',
          'structure-operation-dialog.tsx',
          'trash-panel.tsx',
          'structure-formatters.ts',
        ].map((file) => readFile(path.join(rendererRoot, 'features/structure', file), 'utf8')),
      ).then((sources) => sources.join('\n')),
      readFile(path.join(rendererRoot, 'features/canon/canon-core-workbench.tsx'), 'utf8'),
      readFile(path.join(rendererRoot, 'features/canon/entity-canon-panel.tsx'), 'utf8'),
      readFile(path.join(rendererRoot, 'features/canon/continuity-panel.tsx'), 'utf8'),
      readFile(path.join(rendererRoot, 'features/canon/narrative-planning-panel.tsx'), 'utf8'),
      readFile(path.join(rendererRoot, 'features/canon/state-proposal-panel.tsx'), 'utf8'),
      readFile(
        path.join(rendererRoot, 'features/canon/continuity-relationship-editor.tsx'),
        'utf8',
      ),
      readFile(path.join(rendererRoot, 'features/canon/narrative-relationship-editor.tsx'), 'utf8'),
      readFile(path.join(rendererRoot, 'features/data-tools/data-tools-workbench.tsx'), 'utf8'),
      readFile(path.join(rendererRoot, 'bridge/use-bridge-resource.ts'), 'utf8'),
      Promise.all(
        [
          'writing-core-workbench.tsx',
          'candidate-review-panel.tsx',
          'candidate-review-loader.ts',
        ].map((file) => readFile(path.join(rendererRoot, 'features/writing', file), 'utf8')),
      ).then((sources) => sources.join('\n')),
    ]);

    expect(planning).toContain("from '../structure/structure-navigator.js'");
    expect(structure).toContain('previewSplitChapter');
    expect(structure).toContain('previewMergeChapters');
    expect(structure).toContain('previewMoveBlocks');
    expect(structure).toContain('previewPermanentDelete');
    expect(structure).toContain('planHash: preview.planHash');
    expect(structure).toContain('await authorConfirmName');
    expect(canonCore).toContain("from './entity-canon-panel.js'");
    expect(canonCore).toContain("from './continuity-panel.js'");
    expect(canonCore).toContain("from './narrative-planning-panel.js'");
    expect(canonCore).toContain("from './state-proposal-panel.js'");
    expect(canonCore).toContain("from './story-knowledge-panel.js'");
    expect(canonCore).not.toContain('useBridgeQuery');
    expect(canonCore).not.toContain('useState');
    expect(entityCanon).toContain("selected.status !== 'archived'");
    expect(entityCanon).toContain('await authorConfirmName');
    expect(continuityPanel).toContain('export function ContinuityPanel');
    expect(narrativePanel).toContain('export function NarrativePlanningPanel');
    expect(stateProposalPanel).toContain('export function StateProposalPanel');
    expect(continuity).toContain('participantIds');
    expect(continuity).toContain('witnessIds');
    expect(continuity).toContain('subjectIds');
    expect(continuity).toContain('dependencyIds');
    expect(continuity).toContain('evidence');
    expect(narrative).toContain('chapterLinks');
    expect(narrative).toContain('relations');
    expect(narrative).toContain('dependencyMilestoneIds');
    expect(narrative).toContain('dependencyTimelineEventIds');
    expect(dataTools).toContain('createDailyBackup');
    expect(dataTools).toContain('createNamedSnapshot');
    expect(dataTools).toContain('previewCleanup');
    expect(dataTools).toContain('预览不会写入作品');
    expect(hook).toContain("BridgeResourceState = 'loading' | 'success' | 'failure' | 'cancelled'");
    expect(hook).toContain("outcome.state === 'cancelled'");
    expect(writing).toContain('DraftAutosaveCoordinator');
    expect(writing).toContain('candidateAction.preview');
  });
});
