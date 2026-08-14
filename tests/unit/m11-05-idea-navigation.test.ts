import { describe, expect, it } from 'vitest';

import {
  authorNavigationTargetBelongsToProject,
  resolveAuthorNavigationTarget,
} from '../../apps/desktop/renderer/src/shell/navigation-target.js';

describe('M11-05 Idea conversion atomic navigation', () => {
  it('routes converted project briefs and plot nodes back into the existing planning workbench', () => {
    expect(
      resolveAuthorNavigationTarget({
        type: 'project-brief',
        projectId: 'project-1',
        briefId: 'brief-1',
      }),
    ).toEqual({
      route: 'planning',
      selection: {
        projectId: 'project-1',
        entityId: null,
        chapterId: null,
        logicalBlockId: null,
        versionId: null,
        sceneBeatId: null,
        issueId: null,
        researchNoteId: null,
      },
      filters: { 'navigation.projectBriefId': 'brief-1' },
    });
    expect(
      resolveAuthorNavigationTarget({
        type: 'plot-node',
        projectId: 'project-1',
        plotNodeId: 'plot-1',
      }),
    ).toMatchObject({
      route: 'planning',
      filters: { 'navigation.plotNodeId': 'plot-1' },
    });
  });

  it('keeps cross-project conversion targets fail-closed before apply-navigation', () => {
    expect(
      authorNavigationTargetBelongsToProject('project-1', {
        type: 'plot-node',
        projectId: 'project-2',
        plotNodeId: 'plot-2',
      }),
    ).toBe(false);
  });
});
