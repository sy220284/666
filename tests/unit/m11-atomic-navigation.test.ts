import { describe, expect, it } from 'vitest';

import {
  authorNavigationTargetBelongsToProject,
  resolveAuthorNavigationTarget,
  type AuthorNavigationTarget,
} from '../../apps/desktop/renderer/src/shell/navigation-target.js';
import {
  createInitialRendererUiState,
  reduceRendererUiState,
  type RendererReturnLocation,
} from '../../apps/desktop/renderer/src/state/ui-state-boundary.js';

const projectId = '00000000-0000-4000-8000-000000000001';
const otherProjectId = '00000000-0000-4000-8000-000000000002';
const chapterId = '00000000-0000-4000-8000-000000000101';
const versionId = '00000000-0000-4000-8000-000000000201';
const blockId = '00000000-0000-4000-8000-000000000301';

function sourceLocation(): RendererReturnLocation {
  return {
    route: 'checks',
    focusKey: 'validation-row:issue-1',
    selection: {
      projectId,
      volumeId: null,
      chapterId: null,
      entityId: null,
      logicalBlockId: null,
      versionId: null,
      sceneBeatId: null,
      issueId: 'issue-1',
    },
    filters: { severity: 'high', 'navigation.query': '旧查询' },
    scrollTop: 640,
  };
}

describe('M11 atomic author navigation', () => {
  it('commits route, selection, filters and return location in one reducer action', () => {
    const target: AuthorNavigationTarget = {
      type: 'version',
      projectId,
      chapterId,
      versionId,
      logicalBlockId: blockId,
      query: '关键句',
    };
    const resolution = resolveAuthorNavigationTarget(target);
    const initial = {
      ...createInitialRendererUiState(),
      route: 'checks' as const,
      selection: { ...createInitialRendererUiState().selection, projectId, issueId: 'issue-1' },
      filters: { severity: 'high', 'navigation.query': '旧查询' },
    };
    const source = sourceLocation();

    const next = reduceRendererUiState(initial, {
      type: 'apply-navigation',
      route: resolution.route,
      selection: resolution.selection,
      filters: resolution.filters,
      returnLocation: source,
    });

    expect(next.route).toBe('versions');
    expect(next.selection).toMatchObject({
      projectId,
      chapterId,
      versionId,
      logicalBlockId: blockId,
      issueId: null,
    });
    expect(next.filters).toEqual({ severity: 'high', 'navigation.query': '关键句' });
    expect(next.returnLocation).toEqual(source);
  });

  it('removes stale navigation filters atomically when a target resolves them to null', () => {
    const initial = {
      ...createInitialRendererUiState(),
      selection: { ...createInitialRendererUiState().selection, projectId },
      filters: {
        'navigation.query': '旧查询',
        'navigation.todoId': 'todo-1',
        persistent: '保留',
      },
    };
    const resolution = resolveAuthorNavigationTarget({
      type: 'draft-block',
      projectId,
      chapterId,
      logicalBlockId: blockId,
      query: null,
    });

    const next = reduceRendererUiState(initial, {
      type: 'apply-navigation',
      route: resolution.route,
      selection: resolution.selection,
      filters: resolution.filters,
      returnLocation: sourceLocation(),
    });

    expect(next.filters).toEqual({ 'navigation.todoId': 'todo-1', persistent: '保留' });
  });

  it('restores route, selection and filters from the captured source in one return action', () => {
    const source = sourceLocation();
    const navigated = reduceRendererUiState(createInitialRendererUiState(), {
      type: 'apply-navigation',
      route: 'versions',
      selection: { projectId, chapterId, versionId, logicalBlockId: blockId },
      filters: { 'navigation.query': '关键句' },
      returnLocation: source,
    });
    const restored = reduceRendererUiState(navigated, { type: 'return-to-source' });

    expect(restored.route).toBe(source.route);
    expect(restored.selection).toEqual(source.selection);
    expect(restored.filters).toEqual(source.filters);
    expect(restored.returnLocation).toBeNull();
  });

  it('rejects cross-project and missing-active-project targets before navigation resolution is applied', () => {
    const target: AuthorNavigationTarget = {
      type: 'draft-block',
      projectId: otherProjectId,
      chapterId,
      logicalBlockId: blockId,
      query: null,
    };
    expect(authorNavigationTargetBelongsToProject(projectId, target)).toBe(false);
    expect(authorNavigationTargetBelongsToProject(null, target)).toBe(false);
    expect(authorNavigationTargetBelongsToProject(otherProjectId, target)).toBe(true);
  });
});
