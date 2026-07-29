import type { SearchResultItem } from '@worldforge/contracts';

import type { RendererRouteId, RendererSelectionState } from '../state/ui-state-boundary.js';

export type AuthorNavigationTarget =
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
      readonly type: 'validation-issue';
      readonly projectId: string;
      readonly issueId: string;
      readonly chapterId: string | null;
      readonly versionId: string | null;
      readonly logicalBlockId: string | null;
    };

export interface AuthorNavigationResolution {
  readonly route: RendererRouteId;
  readonly selection: Partial<RendererSelectionState>;
  readonly filters: Readonly<Record<string, string | null>>;
}

export function resolveAuthorNavigationTarget(
  target: AuthorNavigationTarget,
): AuthorNavigationResolution {
  if (target.type === 'entity') {
    return {
      route: 'canon',
      selection: {
        projectId: target.projectId,
        entityId: target.entityId,
        chapterId: null,
        logicalBlockId: null,
        versionId: null,
        issueId: null,
      },
      filters: { 'navigation.query': target.query },
    };
  }

  if (target.type === 'version' || (target.type === 'validation-issue' && target.versionId)) {
    return {
      route: 'versions',
      selection: {
        projectId: target.projectId,
        chapterId: target.chapterId,
        versionId: target.type === 'version' ? target.versionId : target.versionId,
        entityId: null,
        logicalBlockId: target.logicalBlockId ?? null,
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
      issueId: target.type === 'validation-issue' ? target.issueId : null,
    },
    filters: {
      'navigation.query': target.type === 'draft-block' ? target.query : null,
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
