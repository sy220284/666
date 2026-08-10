import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const planningRoot = path.join(process.cwd(), 'apps/desktop/renderer/src/features/planning');

async function source(relativePath: string): Promise<string> {
  return readFile(path.join(planningRoot, relativePath), 'utf8');
}

describe('AR-06 planning boundaries', () => {
  it('keeps mode and professional roots as composition surfaces', async () => {
    const [mode, professional] = await Promise.all([
      source('planning-mode-workbench.tsx'),
      source('professional-planning-workbench.tsx'),
    ]);

    expect(mode).toContain("from './brief/beginner-planning-questions.js'");
    expect(mode).toContain("from './professional-planning-workbench.js'");
    expect(mode).not.toContain('bridge.planning.updateBrief');
    expect(professional).toContain("from './brief/project-brief-editor.js'");
    expect(professional).toContain("from './outline/plot-tree.js'");
    expect(professional).toContain("from './outline/plot-node-dialog.js'");
    expect(professional).toContain("from './scenes/scene-beat-panel.js'");
    expect(professional).toContain("from './planning-context-panel.js'");
    expect(professional).toContain("from '../structure/structure-navigator.js'");
    expect(professional).not.toContain('function PlotTree');
    expect(professional).not.toContain('function SceneBeatPanel');
  });

  it('keeps beginner and professional planning on the same authoritative brief', async () => {
    const [beginner, professional] = await Promise.all([
      source('brief/beginner-planning-questions.tsx'),
      source('brief/project-brief-editor.tsx'),
    ]);

    for (const implementation of [beginner, professional]) {
      expect(implementation).toContain('bridge.planning.updateBrief');
      expect(implementation).toContain('concept:');
      expect(implementation).toContain('readingPromise:');
      expect(implementation).toContain('protagonistGoal:');
      expect(implementation).toContain('coreConflict:');
    }
    expect(beginner).toContain('endingIntent: brief.endingIntent');
    expect(beginner).toContain('required: brief.required');
    expect(beginner).toContain('forbidden: brief.forbidden');
    expect(professional).toContain('data-save-brief');
  });

  it('preserves outline and scene-beat atomicity and explicit content boundaries', async () => {
    const [plotTree, scenePanel, sceneDialog] = await Promise.all([
      source('outline/plot-tree.tsx'),
      source('scenes/scene-beat-panel.tsx'),
      source('scenes/scene-beat-dialog.tsx'),
    ]);

    expect(plotTree).toContain('bridge.planning.movePlotNode');
    expect(plotTree).toContain('placement:');
    expect(plotTree).toContain('正文未发生变化');
    expect(scenePanel).toContain('bridge.planning.moveSceneBeat');
    expect(scenePanel).toContain('bridge.planning.previewMoveSceneBeat');
    expect(scenePanel).toContain('bridge.planning.moveSceneBeatAcrossChapters');
    expect(scenePanel).toContain('planHash: preview.planHash');
    expect(scenePanel).toContain('正文段落如需移动必须另行确认');
    expect(scenePanel).toContain('bridge.planning.setSceneBeatBlockLinks');
    expect(sceneDialog).toContain('bridge.planning.convertBlocksToSceneBeat');
    expect(sceneDialog).toContain('data-scene-beat-entity-selector="character"');
    expect(sceneDialog).toContain('data-scene-beat-entity-selector="location"');
  });
});
