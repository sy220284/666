import { describe, expect, it } from 'vitest';

import { createPlanningBridge } from '../../apps/desktop/preload/src/planning-bridge-factory.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

type BoundaryMethod = (input: unknown) => unknown;

describe('planning preload bridge execution coverage', () => {
  it('executes every planning and canon bridge boundary through contract validation', () => {
    const bridge = createPlanningBridge();
    const planning = contractInput<Record<string, BoundaryMethod>>(bridge.planning);
    const canon = contractInput<Record<string, BoundaryMethod>>(bridge.canon);

    expect(Object.keys(planning)).toEqual([
      'getBrief',
      'updateBrief',
      'listPlotNodes',
      'createPlotNode',
      'updatePlotNode',
      'movePlotNode',
      'deletePlotNode',
      'listSceneBeats',
      'createSceneBeat',
      'updateSceneBeat',
      'moveSceneBeat',
      'previewMoveSceneBeat',
      'moveSceneBeatAcrossChapters',
      'deleteSceneBeat',
      'restoreSceneBeat',
      'setSceneBeatBlockLinks',
      'convertBlocksToSceneBeat',
      'listStructure',
      'createVolume',
      'updateVolume',
      'moveVolume',
      'deleteVolume',
      'createChapter',
      'updateChapter',
      'moveChapter',
      'deleteChapter',
      'previewSplitChapter',
      'splitChapter',
      'previewMergeChapters',
      'mergeChapters',
      'previewMoveBlocks',
      'moveBlocks',
    ]);
    expect(Object.keys(canon)).toEqual([
      'list',
      'create',
      'update',
      'archive',
      'setFact',
      'linkSceneBeat',
      'previewDelete',
      'delete',
    ]);

    for (const method of Object.values(planning)) {
      expect(() => method(undefined)).toThrow();
    }
    for (const method of Object.values(canon)) {
      expect(() => method(undefined)).toThrow();
    }
  });
});
