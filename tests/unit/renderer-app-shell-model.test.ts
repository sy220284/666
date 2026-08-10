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

describe('应用主导航', () => {
  it('按批准顺序提供六个一级入口', () => {
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

  it('切换信息显示方式时不改变页面和命令', () => {
    const beginner = createPrimaryNavigationItems(activeProjectContext);
    const professional = createPrimaryNavigationItems({
      ...activeProjectContext,
      disclosureMode: 'professional',
    });

    expect(professional.map(({ id, route }) => ({ id, route }))).toEqual(
      beginner.map(({ id, route }) => ({ id, route })),
    );
    expect(professional.find((item) => item.id === 'planning')?.description).toContain(
      '作品核心',
    );
    expect(beginner.find((item) => item.id === 'planning')?.description).not.toContain(
      '作品核心',
    );
  });

  it('没有打开本地作品时禁用依赖作品的入口', () => {
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

  it('未完成的检查功能不提供无法使用的占位入口', () => {
    expect(resolvePrimaryNavigationIntent('checks', activeProjectContext)).toEqual({
      accepted: false,
      id: 'checks',
      code: 'FEATURE_UNAVAILABLE',
      reason: '该功能尚未完成迁移，当前不会提供无法使用的占位入口。',
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

  it('拒绝未知入口和没有打开作品的写作入口', () => {
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

  it('将二级页面归入对应的一级入口', () => {
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

  it('只恢复合法且当前可用的页面', () => {
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

  it('临时界面状态允许进入检查页面', () => {
    const state = reduceRendererUiState(createInitialRendererUiState(), {
      type: 'navigate',
      route: 'checks',
    });

    expect(() => assertTemporaryUiState(state)).not.toThrow();
    expect(state.route).toBe('checks');
  });
});
