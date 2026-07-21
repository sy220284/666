import { describe, expect, it } from 'vitest';

import {
  PRIMARY_NAVIGATION_IDS,
  createPrimaryNavigationItems,
  primaryNavigationIdForRoute,
  resolvePrimaryNavigationIntent,
  restoreAppShellRoute,
} from '../../apps/desktop/renderer/src/shell/app-shell-model.js';
import {
  assertTemporaryUiState,
  createInitialRendererUiState,
  reduceRendererUiState,
} from '../../apps/desktop/renderer/src/state/ui-state-boundary.js';

const activeProjectContext = {
  activeProjectId: 'project-1',
  currentRoute: 'home',
  disclosureMode: 'beginner',
} as const;

describe('M3-08 app shell primary navigation model', () => {
  it('freezes the six V1 primary entries in the approved order', () => {
    const items = createPrimaryNavigationItems(activeProjectContext);

    expect(items.map((item) => item.id)).toEqual(PRIMARY_NAVIGATION_IDS);
    expect(items.map((item) => item.label)).toEqual([
      '首页',
      '规划',
      '写作',
      '设定',
      '检查',
      '设置',
    ]);
  });

  it('changes disclosure copy without changing routes or commands', () => {
    const beginner = createPrimaryNavigationItems(activeProjectContext);
    const professional = createPrimaryNavigationItems({
      ...activeProjectContext,
      disclosureMode: 'professional',
    });

    expect(professional.map(({ id, route }) => ({ id, route }))).toEqual(
      beginner.map(({ id, route }) => ({ id, route })),
    );
    expect(professional.find((item) => item.id === 'planning')?.description).toContain(
      'ProjectBrief',
    );
    expect(beginner.find((item) => item.id === 'planning')?.description).not.toContain(
      'ProjectBrief',
    );
  });

  it('keeps project workspaces unavailable until a local project is active', () => {
    const items = createPrimaryNavigationItems({
      ...activeProjectContext,
      activeProjectId: null,
    });

    expect(items.filter((item) => item.disabled).map((item) => item.id)).toEqual([
      'planning',
      'writing',
      'canon',
      'checks',
    ]);
    expect(items.find((item) => item.id === 'home')?.disabled).toBe(false);
    expect(items.find((item) => item.id === 'settings')?.disabled).toBe(false);
  });

  it('does not expose an unfinished check workspace as a clickable placeholder', () => {
    expect(resolvePrimaryNavigationIntent('checks', activeProjectContext)).toEqual({
      accepted: false,
      id: 'checks',
      code: 'FEATURE_UNAVAILABLE',
      reason: '该工作台尚未完成迁移，当前不会提供可点击占位入口。',
    });

    expect(
      resolvePrimaryNavigationIntent('checks', {
        ...activeProjectContext,
        availability: { checks: true },
      }),
    ).toEqual({
      accepted: true,
      id: 'checks',
      route: 'checks',
    });
  });

  it('rejects unknown entries and project routes without an active project', () => {
    expect(resolvePrimaryNavigationIntent('unknown', activeProjectContext)).toMatchObject({
      accepted: false,
      code: 'UNKNOWN_NAVIGATION',
    });
    expect(
      resolvePrimaryNavigationIntent('writing', {
        ...activeProjectContext,
        activeProjectId: null,
      }),
    ).toMatchObject({
      accepted: false,
      id: 'writing',
      code: 'PROJECT_REQUIRED',
    });
  });

  it('maps secondary routes to their owning primary workspace', () => {
    expect(primaryNavigationIdForRoute('project')).toBe('home');
    expect(primaryNavigationIdForRoute('structure')).toBe('planning');
    expect(primaryNavigationIdForRoute('versions')).toBe('writing');
    expect(primaryNavigationIdForRoute('recovery')).toBe('checks');

    const items = createPrimaryNavigationItems({
      ...activeProjectContext,
      currentRoute: 'candidates',
    });
    expect(items.find((item) => item.current)?.id).toBe('writing');
  });

  it('restores only legal and currently available routes', () => {
    expect(
      restoreAppShellRoute('versions', {
        activeProjectId: 'project-1',
        disclosureMode: 'professional',
      }),
    ).toBe('versions');
    expect(
      restoreAppShellRoute('versions', {
        activeProjectId: null,
        disclosureMode: 'professional',
      }),
    ).toBe('home');
    expect(
      restoreAppShellRoute('checks', {
        activeProjectId: 'project-1',
        disclosureMode: 'professional',
      }),
    ).toBe('home');
    expect(
      restoreAppShellRoute('checks', {
        activeProjectId: 'project-1',
        disclosureMode: 'professional',
        availability: { checks: true },
      }),
    ).toBe('checks');
    expect(
      restoreAppShellRoute('invalid-route', {
        activeProjectId: 'project-1',
        disclosureMode: 'professional',
      }),
    ).toBe('home');
  });

  it('allows the checks route inside the temporary UI state boundary', () => {
    const state = reduceRendererUiState(createInitialRendererUiState(), {
      type: 'navigate',
      route: 'checks',
    });

    expect(() => assertTemporaryUiState(state)).not.toThrow();
    expect(state.route).toBe('checks');
  });
});
