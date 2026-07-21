import { RENDERER_ROUTE_IDS, type RendererRouteId } from '../state/ui-state-boundary.js';

export const PRIMARY_NAVIGATION_IDS = [
  'home',
  'planning',
  'writing',
  'canon',
  'checks',
  'settings',
] as const;

export type PrimaryNavigationId = (typeof PRIMARY_NAVIGATION_IDS)[number];
export type AppDisclosureMode = 'beginner' | 'professional';
export type PrimaryNavigationAvailability = Readonly<Record<PrimaryNavigationId, boolean>>;

export interface AppShellNavigationContext {
  readonly activeProjectId: string | null;
  readonly currentRoute: RendererRouteId;
  readonly disclosureMode: AppDisclosureMode;
  readonly availability?: Partial<PrimaryNavigationAvailability>;
}

export interface PrimaryNavigationItem {
  readonly id: PrimaryNavigationId;
  readonly route: RendererRouteId;
  readonly label: string;
  readonly description: string;
  readonly current: boolean;
  readonly disabled: boolean;
  readonly disabledReason: string | null;
}

export type PrimaryNavigationResolution =
  | {
      readonly accepted: true;
      readonly id: PrimaryNavigationId;
      readonly route: RendererRouteId;
    }
  | {
      readonly accepted: false;
      readonly id: PrimaryNavigationId | null;
      readonly code: 'UNKNOWN_NAVIGATION' | 'PROJECT_REQUIRED' | 'FEATURE_UNAVAILABLE';
      readonly reason: string;
    };

interface PrimaryNavigationDefinition {
  readonly id: PrimaryNavigationId;
  readonly route: RendererRouteId;
  readonly label: string;
  readonly beginnerDescription: string;
  readonly professionalDescription: string;
  readonly requiresProject: boolean;
}

const DEFAULT_AVAILABILITY: PrimaryNavigationAvailability = {
  home: true,
  planning: true,
  writing: true,
  canon: true,
  checks: false,
  settings: true,
};

const PRIMARY_NAVIGATION_DEFINITIONS = [
  {
    id: 'home',
    route: 'home',
    label: '首页',
    beginnerDescription: '继续写作、最近项目和下一步建议',
    professionalDescription: '最近项目、运行任务和项目健康状态',
    requiresProject: false,
  },
  {
    id: 'planning',
    route: 'planning',
    label: '规划',
    beginnerDescription: '整理作品方向、情节和章节目标',
    professionalDescription: 'ProjectBrief、大纲树、卷章与SceneBeat',
    requiresProject: true,
  },
  {
    id: 'writing',
    route: 'writing',
    label: '写作',
    beginnerDescription: '打开当前章节继续创作',
    professionalDescription: '正文、候选、冲突与历史版本',
    requiresProject: true,
  },
  {
    id: 'canon',
    route: 'canon',
    label: '设定',
    beginnerDescription: '管理人物、地点和关键设定',
    professionalDescription: '实体、Canon、状态、时间线、知情与伏笔',
    requiresProject: true,
  },
  {
    id: 'checks',
    route: 'checks',
    label: '检查',
    beginnerDescription: '查看需要处理的高风险问题',
    professionalDescription: '连续性、人物弧光、节奏、搜索与交付检查',
    requiresProject: true,
  },
  {
    id: 'settings',
    route: 'settings',
    label: '设置',
    beginnerDescription: '调整常用写作与显示选项',
    professionalDescription: '通用、编辑器、外观、AI连接、备份与高级设置',
    requiresProject: false,
  },
] as const satisfies readonly PrimaryNavigationDefinition[];

const PRIMARY_NAVIGATION_BY_ID = new Map(
  PRIMARY_NAVIGATION_DEFINITIONS.map((definition) => [definition.id, definition]),
);

const PRIMARY_NAVIGATION_BY_ROUTE: Readonly<Partial<Record<RendererRouteId, PrimaryNavigationId>>> =
  {
    home: 'home',
    project: 'home',
    planning: 'planning',
    structure: 'planning',
    writing: 'writing',
    versions: 'writing',
    candidates: 'writing',
    canon: 'canon',
    checks: 'checks',
    recovery: 'checks',
    settings: 'settings',
  };

export function createPrimaryNavigationItems(
  context: AppShellNavigationContext,
): readonly PrimaryNavigationItem[] {
  const availability = resolveAvailability(context.availability);
  const currentPrimaryId = primaryNavigationIdForRoute(context.currentRoute);

  return PRIMARY_NAVIGATION_DEFINITIONS.map((definition) => {
    const projectMissing = definition.requiresProject && context.activeProjectId === null;
    const featureUnavailable = !availability[definition.id];
    const disabled = projectMissing || featureUnavailable;
    const disabledReason = projectMissing
      ? '请先新建或打开一个本地项目。'
      : featureUnavailable
        ? '该工作台尚未完成迁移，当前不会提供可点击占位入口。'
        : null;

    return {
      id: definition.id,
      route: definition.route,
      label: definition.label,
      description:
        context.disclosureMode === 'beginner'
          ? definition.beginnerDescription
          : definition.professionalDescription,
      current: currentPrimaryId === definition.id,
      disabled,
      disabledReason,
    };
  });
}

export function resolvePrimaryNavigationIntent(
  navigationId: string,
  context: AppShellNavigationContext,
): PrimaryNavigationResolution {
  if (!isPrimaryNavigationId(navigationId)) {
    return {
      accepted: false,
      id: null,
      code: 'UNKNOWN_NAVIGATION',
      reason: `Unknown primary navigation entry: ${navigationId}.`,
    };
  }

  const definition = PRIMARY_NAVIGATION_BY_ID.get(navigationId);
  if (!definition) {
    return {
      accepted: false,
      id: navigationId,
      code: 'UNKNOWN_NAVIGATION',
      reason: `Unknown primary navigation entry: ${navigationId}.`,
    };
  }

  if (definition.requiresProject && context.activeProjectId === null) {
    return {
      accepted: false,
      id: navigationId,
      code: 'PROJECT_REQUIRED',
      reason: '请先新建或打开一个本地项目。',
    };
  }

  if (!resolveAvailability(context.availability)[navigationId]) {
    return {
      accepted: false,
      id: navigationId,
      code: 'FEATURE_UNAVAILABLE',
      reason: '该工作台尚未完成迁移，当前不会提供可点击占位入口。',
    };
  }

  return {
    accepted: true,
    id: navigationId,
    route: definition.route,
  };
}

export function primaryNavigationIdForRoute(route: RendererRouteId): PrimaryNavigationId {
  return PRIMARY_NAVIGATION_BY_ROUTE[route] ?? 'home';
}

export function restoreAppShellRoute(
  candidate: unknown,
  context: Omit<AppShellNavigationContext, 'currentRoute'>,
): RendererRouteId {
  if (!isRendererRouteId(candidate)) return 'home';

  const primaryId = primaryNavigationIdForRoute(candidate);
  const resolution = resolvePrimaryNavigationIntent(primaryId, {
    ...context,
    currentRoute: candidate,
  });
  return resolution.accepted ? candidate : 'home';
}

function resolveAvailability(
  override: Partial<PrimaryNavigationAvailability> | undefined,
): PrimaryNavigationAvailability {
  return {
    ...DEFAULT_AVAILABILITY,
    ...override,
  };
}

function isPrimaryNavigationId(value: string): value is PrimaryNavigationId {
  return (PRIMARY_NAVIGATION_IDS as readonly string[]).includes(value);
}

function isRendererRouteId(value: unknown): value is RendererRouteId {
  return typeof value === 'string' && (RENDERER_ROUTE_IDS as readonly string[]).includes(value);
}
