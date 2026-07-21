import { describe, expect, it } from 'vitest';

import {
  assertTemporaryUiState,
  createInitialRendererUiState,
  reduceRendererUiState,
} from '../../apps/desktop/renderer/src/state/ui-state-boundary.js';

describe('M3-07 temporary UI state boundary', () => {
  it('stores route, selected identifiers, overlays, filters and short-lived request feedback only', () => {
    let state = createInitialRendererUiState();
    state = reduceRendererUiState(state, {
      type: 'select',
      selection: {
        projectId: 'project-1',
        volumeId: 'volume-1',
        chapterId: 'chapter-1',
        entityId: 'entity-1',
      },
    });
    state = reduceRendererUiState(state, {
      type: 'set-overlay',
      kind: 'drawer',
      id: 'project-navigation',
    });
    state = reduceRendererUiState(state, {
      type: 'set-filter',
      key: 'canon-query',
      value: '主角',
    });
    state = reduceRendererUiState(state, {
      type: 'set-foreground-request',
      requestKey: 'project.open',
    });
    state = reduceRendererUiState(state, {
      type: 'set-feedback',
      feedback: { id: 'saved', kind: 'success', expiresAt: 1_000 },
    });

    expect(() => assertTemporaryUiState(state)).not.toThrow();
    expect(state).toMatchObject({
      route: 'home',
      selection: {
        projectId: 'project-1',
        chapterId: 'chapter-1',
      },
      overlays: { drawer: 'project-navigation' },
      filters: { 'canon-query': '主角' },
      foregroundRequestKey: 'project.open',
      feedback: { id: 'saved' },
    });
  });

  it.each(['draft', 'candidate', 'version', 'entityState', 'content', 'revision', 'hash'])(
    'rejects authoritative field %s at any nesting depth',
    (field) => {
      expect(() =>
        assertTemporaryUiState({
          ...createInitialRendererUiState(),
          [field]: { id: 'business-object' },
        }),
      ).toThrow(`Renderer UI state cannot contain authoritative field: ${field}.`);
    },
  );

  it('clears project-scoped identifiers without retaining a business snapshot', () => {
    const selected = reduceRendererUiState(createInitialRendererUiState(), {
      type: 'select',
      selection: {
        projectId: 'project-1',
        volumeId: 'volume-1',
        chapterId: 'chapter-1',
        entityId: 'entity-1',
      },
    });

    expect(reduceRendererUiState(selected, { type: 'reset-project-context' })).toEqual({
      ...createInitialRendererUiState(),
      route: 'project',
    });
  });
});
