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

  it('handles navigation return locations and filter removal explicitly', () => {
    const initial = {
      ...createInitialRendererUiState(),
      returnLocation: { route: 'home' as const, focusKey: 'home-title' },
      filters: { query: '保留', removed: '删除' },
    };
    const retained = reduceRendererUiState(initial, {
      type: 'navigate',
      route: 'planning',
    });
    expect(retained.returnLocation).toEqual({ route: 'home', focusKey: 'home-title' });

    const replaced = reduceRendererUiState(retained, {
      type: 'navigate',
      route: 'writing',
      returnLocation: { route: 'planning', focusKey: null },
    });
    expect(replaced.returnLocation).toEqual({ route: 'planning', focusKey: null });

    const cleared = reduceRendererUiState(replaced, {
      type: 'navigate',
      route: 'project',
      returnLocation: undefined,
    });
    expect(cleared.returnLocation).toBeNull();
    expect(
      reduceRendererUiState(cleared, {
        type: 'set-filter',
        key: 'removed',
        value: null,
      }).filters,
    ).toEqual({ query: '保留' });
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

  it.each([null, undefined, 'state', 1, [], true])(
    'rejects non-object root state %#',
    (value) => {
      expect(() => assertTemporaryUiState(value)).toThrow(
        'Renderer UI state must be an object.',
      );
    },
  );

  it('rejects invalid routes, foreground requests and filters', () => {
    const state = createInitialRendererUiState();
    expect(() => assertTemporaryUiState({ ...state, route: 'invalid' })).toThrow(
      'Renderer UI state contains an invalid route.',
    );
    expect(() =>
      assertTemporaryUiState({ ...state, foregroundRequestKey: 1 }),
    ).toThrow('Renderer foreground request key must be a string or null.');
    expect(() => assertTemporaryUiState({ ...state, filters: null })).toThrow(
      'Renderer filters must be a string record.',
    );
    expect(() => assertTemporaryUiState({ ...state, filters: [] })).toThrow(
      'Renderer filters must be a string record.',
    );
    expect(() => assertTemporaryUiState({ ...state, filters: { query: 1 } })).toThrow(
      'Renderer filters must contain strings only.',
    );
  });

  it('rejects malformed selection and overlay identifier records', () => {
    const state = createInitialRendererUiState();
    for (const value of [null, [], 'selection']) {
      expect(() => assertTemporaryUiState({ ...state, selection: value })).toThrow(
        'Renderer UI identifier state must be an object.',
      );
    }
    expect(() =>
      assertTemporaryUiState({
        ...state,
        selection: { ...state.selection, draftId: 'forbidden' },
      }),
    ).toThrow('Renderer UI identifier state contains an unsupported field.');
    expect(() =>
      assertTemporaryUiState({
        ...state,
        selection: { ...state.selection, chapterId: 1 },
      }),
    ).toThrow('Renderer UI identifiers must be strings or null.');
    expect(() => assertTemporaryUiState({ ...state, overlays: [] })).toThrow(
      'Renderer UI identifier state must be an object.',
    );
    expect(() =>
      assertTemporaryUiState({
        ...state,
        overlays: { ...state.overlays, modal: 'unsupported' },
      }),
    ).toThrow('Renderer UI identifier state contains an unsupported field.');
    expect(() =>
      assertTemporaryUiState({
        ...state,
        overlays: { ...state.overlays, dialog: false },
      }),
    ).toThrow('Renderer UI identifiers must be strings or null.');
  });

  it('accepts valid return locations and feedback while rejecting malformed variants', () => {
    const state = createInitialRendererUiState();
    expect(() =>
      assertTemporaryUiState({
        ...state,
        returnLocation: { route: 'planning', focusKey: null },
        feedback: { id: 'loaded', kind: 'info', expiresAt: 1 },
      }),
    ).not.toThrow();

    for (const returnLocation of [
      [],
      'return',
      { route: 'invalid', focusKey: null },
      { route: 'home', focusKey: 1 },
      { route: 'home', focusKey: null, projectId: 'forbidden' },
    ]) {
      expect(() => assertTemporaryUiState({ ...state, returnLocation })).toThrow(
        /Renderer return location/,
      );
    }

    for (const feedback of [
      [],
      'feedback',
      { id: 1, kind: 'info', expiresAt: 1 },
      { id: 'id', kind: 'warning', expiresAt: 1 },
      { id: 'id', kind: 'info', expiresAt: 'later' },
      { id: 'id', kind: 'info', expiresAt: Number.POSITIVE_INFINITY },
      { id: 'id', kind: 'info', expiresAt: 1, content: 'forbidden' },
    ]) {
      expect(() => assertTemporaryUiState({ ...state, feedback })).toThrow(
        /Renderer feedback/,
      );
    }
  });

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
