import type { ResearchTargetType, SearchResultItem } from '@worldforge/contracts';

import type { RendererRouteId, RendererSelectionState } from '../state/ui-state-boundary.js';

export type AuthorNavigationTarget =
  | {
      readonly type: 'writing-action';
      readonly projectId: string;
      readonly generationMode: 'skeleton' | 'chapter' | 'rewrite';
    }
  | {
      readonly type: 'project-brief';
      readonly projectId: string;
      readonly briefId: string;
    }
  | {
      readonly type: 'plot-node';
      readonly projectId: string;
      readonly plotNodeId: string;
    }
  | {
      readonly type: 'draft-block';
      readonly projectId: string;
      readonly chapterId: string;
      readonly logicalBlockId: string | null;
      readonly query: string | null;
    }
  | {
      readonly type: 'version';
      readonly projectId: string;
      readonly chapterId: string;
      readonly versionId: string;
      readonly logicalBlockId?: string | null;
      readonly query: string | null;
    }
  | {
      readonly type: 'entity';
      readonly projectId: string;
      readonly entityId: string;
      readonly query: string | null;
    }
  | {
      readonly type: 'research-note';
      readonly projectId: string;
      readonly noteId: string;
      readonly query: string | null;
    }
  | {
      readonly type: 'research-link-target';
      readonly projectId: string;
      readonly targetType: ResearchTargetType;
      readonly targetId: string;
    }
  | {
      readonly type: 'validation-issue';
      readonly projectId: string;
      readonly issueId: string;
      readonly chapterId: string | null;
      readonly versionId: string | null;
      readonly logicalBlockId: string | null;
    }
  | {
      readonly type: 'story-todo';
      readonly projectId: string;
      readonly todoId: string;
      readonly chapterId: string | null;
      readonly sceneBeatId: string | null;
      readonly logicalBlockId: string | null;
    }
  | {
      readonly type: 'foreshadowing';
      readonly projectId: string;
      readonly foreshadowingId: string;
      readonly chapterId: string | null;
      readonly query: string | null;
    }
  | {
      readonly type: 'scene-beat';
      readonly projectId: string;
      readonly sceneBeatId: string;
      readonly chapterId: string;
    };

export interface AuthorNavigationResolution {
  readonly route: RendererRouteId;
  readonly selection: Partial<RendererSelectionState>;
  readonly filters: Readonly<Record<string, string | null>>;
}

export function authorNavigationTargetBelongsToProject(
  activeProjectId: string | null,
  target: AuthorNavigationTarget,
): boolean {
  return activeProjectId !== null && target.projectId === activeProjectId;
}

function researchLinkResolution(
  target: Extract<AuthorNavigationTarget, { type: 'research-link-target' }>,
): AuthorNavigationResolution {
  const baseSelection: Partial<RendererSelectionState> = {
    projectId: target.projectId,
    entityId: null,
    researchNoteId: null,
    chapterId: null,
    volumeId: null,
    logicalBlockId: null,
    versionId: null,
    sceneBeatId: null,
    issueId: null,
  };
  if (target.targetType === 'chapter') {
    return {
      route: 'writing',
      selection: { ...baseSelection, chapterId: target.targetId },
      filters: { 'navigation.researchTargetType': 'chapter' },
    };
  }
  if (target.targetType === 'volume') {
    return {
      route: 'structure',
      selection: { ...baseSelection, volumeId: target.targetId },
      filters: { 'navigation.researchTargetType': 'volume' },
    };
  }
  if (target.targetType === 'entity') {
    return {
      route: 'canon',
      selection: { ...baseSelection, entityId: target.targetId },
      filters: { 'navigation.researchTargetType': 'entity' },
    };
  }
  if (target.targetType === 'idea') {
    return {
      route: 'planning',
      selection: baseSelection,
      filters: {
        'navigation.researchTargetType': target.targetType,
        'navigation.ideaId': target.targetId,
      },
    };
  }
  const filterKey: Record<
    Exclude<ResearchTargetType, 'chapter' | 'volume' | 'entity' | 'idea'>,
    string
  > = {
    relationship: 'navigation.relationshipId',
    timeline: 'navigation.timelineEventId',
    foreshadowing: 'navigation.foreshadowingId',
    arc: 'navigation.characterArcId',
    milestone: 'navigation.arcMilestoneId',
  };
  return {
    route: 'canon',
    selection: baseSelection,
    filters: {
      'navigation.researchTargetType': target.targetType,
      [filterKey[target.targetType]]: target.targetId,
    },
  };
}

export function resolveAuthorNavigationTarget(
  target: AuthorNavigationTarget,
): AuthorNavigationResolution {
  if (target.type === 'writing-action') {
    return {
      route: 'candidates',
      selection: {
        projectId: target.projectId,
        entityId: null,
        researchNoteId: null,
        logicalBlockId: null,
        versionId: null,
        sceneBeatId: null,
        issueId: null,
      },
      filters: { 'navigation.generationMode': target.generationMode },
    };
  }

  if (target.type === 'project-brief') {
    return {
      route: 'planning',
      selection: {
        projectId: target.projectId,
        entityId: null,
        researchNoteId: null,
        chapterId: null,
        logicalBlockId: null,
        versionId: null,
        sceneBeatId: null,
        issueId: null,
      },
      filters: { 'navigation.projectBriefId': target.briefId },
    };
  }

  if (target.type === 'plot-node') {
    return {
      route: 'planning',
      selection: {
        projectId: target.projectId,
        entityId: null,
        researchNoteId: null,
        chapterId: null,
        logicalBlockId: null,
        versionId: null,
        sceneBeatId: null,
        issueId: null,
      },
      filters: { 'navigation.plotNodeId': target.plotNodeId },
    };
  }

  if (target.type === 'research-note') {
    return {
      route: 'research',
      selection: {
        projectId: target.projectId,
        researchNoteId: target.noteId,
        entityId: null,
        chapterId: null,
        logicalBlockId: null,
        versionId: null,
        sceneBeatId: null,
        issueId: null,
      },
      filters: { 'navigation.query': target.query },
    };
  }

  if (target.type === 'research-link-target') {
    return researchLinkResolution(target);
  }

  if (target.type === 'entity') {
    return {
      route: 'canon',
      selection: {
        projectId: target.projectId,
        entityId: target.entityId,
        researchNoteId: null,
        chapterId: null,
        logicalBlockId: null,
        versionId: null,
        sceneBeatId: null,
        issueId: null,
      },
      filters: { 'navigation.query': target.query },
    };
  }

  if (target.type === 'foreshadowing') {
    return {
      route: 'canon',
      selection: {
        projectId: target.projectId,
        entityId: null,
        researchNoteId: null,
        chapterId: target.chapterId,
        logicalBlockId: null,
        versionId: null,
        sceneBeatId: null,
        issueId: null,
      },
      filters: {
        'navigation.query': target.query,
        'navigation.foreshadowingId': target.foreshadowingId,
      },
    };
  }

  if (target.type === 'scene-beat') {
    return {
      route: 'planning',
      selection: {
        projectId: target.projectId,
        chapterId: target.chapterId,
        sceneBeatId: target.sceneBeatId,
        entityId: null,
        researchNoteId: null,
        logicalBlockId: null,
        versionId: null,
        issueId: null,
      },
      filters: { 'navigation.sceneBeatId': target.sceneBeatId },
    };
  }

  if (target.type === 'story-todo' && !target.chapterId) {
    return {
      route: 'checks',
      selection: {
        projectId: target.projectId,
        chapterId: null,
        sceneBeatId: target.sceneBeatId,
        logicalBlockId: target.logicalBlockId,
        versionId: null,
        entityId: null,
        researchNoteId: null,
        issueId: null,
      },
      filters: { 'navigation.todoId': target.todoId },
    };
  }

  if (target.type === 'version' || (target.type === 'validation-issue' && target.versionId)) {
    return {
      route: 'versions',
      selection: {
        projectId: target.projectId,
        chapterId: target.chapterId,
        versionId: target.versionId,
        entityId: null,
        researchNoteId: null,
        logicalBlockId: target.logicalBlockId ?? null,
        sceneBeatId: null,
        issueId: target.type === 'validation-issue' ? target.issueId : null,
      },
      filters: { 'navigation.query': target.type === 'version' ? target.query : null },
    };
  }

  return {
    route: 'writing',
    selection: {
      projectId: target.projectId,
      chapterId: target.chapterId,
      logicalBlockId: target.logicalBlockId,
      versionId: null,
      entityId: null,
      researchNoteId: null,
      sceneBeatId: target.type === 'story-todo' ? target.sceneBeatId : null,
      issueId: target.type === 'validation-issue' ? target.issueId : null,
    },
    filters: {
      'navigation.query': target.type === 'draft-block' ? target.query : null,
      'navigation.todoId': target.type === 'story-todo' ? target.todoId : null,
    },
  };
}

export function searchResultNavigationTarget(
  projectId: string,
  item: SearchResultItem,
  query: string,
): AuthorNavigationTarget | null {
  if (item.sourceType === 'entity') {
    return {
      type: 'entity',
      projectId,
      entityId: item.targetId,
      query,
    };
  }
  if (item.sourceType === 'research') {
    return {
      type: 'research-note',
      projectId,
      noteId: item.targetId,
      query,
    };
  }
  if (!item.chapterId) return null;
  if (item.sourceType === 'version') {
    return {
      type: 'version',
      projectId,
      chapterId: item.chapterId,
      versionId: item.targetId,
      logicalBlockId: item.anchorId,
      query,
    };
  }
  return {
    type: 'draft-block',
    projectId,
    chapterId: item.chapterId,
    logicalBlockId: item.anchorId,
    query,
  };
}
