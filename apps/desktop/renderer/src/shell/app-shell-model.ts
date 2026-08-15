import { authorTerm } from '../presentation/author-terms.js';
import { currentRuntimeNavigationAvailability } from '../runtime/capability-runtime.js';
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
    beginnerDescription: '继续写作、最近作品和下一步建议',
    professionalDescription: '最近作品、进行中的任务和作品健康状态',
    requiresProject: false,
  },
  {
    id: 'planning',
    route: 'planning',
    label: '规划',
    beginnerDescription: '整理作品方向、情节和章节目标',
    professionalDescription: `${authorTerm('projectBrief')}、大纲树、卷章与${authorTerm('sceneBeat')}`,
    requiresProject: true,
  },
  {
    id: 'writing',
    route: 'writing',
    label: '写作',
    beginnerDescription: '打开当前章节继续创作',
    professionalDescription: `正文、${authorTerm('candidate')}、冲突与${authorTerm('version')}`,
    requiresProject: true,
  },
  {
    id: 'canon',
    route: 'canon',
    label: authorTerm('canon'),
    beginnerDescription: '管理人物、地点、关系、世界设定、研究资料和创作复盘',
    professionalDescription:
      '人物、地点、组织、动态状态、时间线、知情状态、伏笔、人物成长线、研究资料与创作日志',
    requiresProject: true,
  },
  {
    id: 'checks',
    route: 'checks',
    label: '检查',
    beginnerDescription: '查看需要处理的高风险问题',
    professionalDescription: '前后文、人物成长线、连载节奏、全文搜索与交付检查',
    requiresProject: true,
  },
  {
    id: 'settings',
    route: 'settings',
    label: '设置',
    beginnerDescription: '调整常用写作与显示选项',
    professionalDescription: `通用、编辑器、外观、${authorTerm('provider')}、备份与高级设置`,
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
    research: 'canon',
    journal: 'canon',
    checks: 'checks',
    recovery: 'checks',
    settings: 'settings',
  };

export function createPrimaryNavigationItems(
  context: AppShellNavigationContext,
): readonly PrimaryNavigationItem[] {
  const availability = resolveAvailability(context.availability);
  const runtimeAvailability = currentRuntimeNavigationAvailability();
  const currentPrimaryId = primaryNavigationIdForRoute(context.currentRoute);

  return PRIMARY_NAVIGATION_DEFINITIONS.map((definition) => {
    const projectMissing = definition.requiresProject && context.activeProjectId === null;
    const featureUnavailable = !availability[definition.id];
    const protectedByRuntime = runtimeAvailability?.[definition.id] === false;
    const disabled = projectMissing || featureUnavailable;
    const disabledReason = projectMissing
      ? '请先新建或打开一部本地作品。'
      : featureUnavailable
        ? protectedByRuntime
          ? '当前作品或本地服务处于保护状态，请先使用恢复与导出或恢复本地服务。'
          : '该功能尚未完成迁移，当前不会提供无法使用的占位入口。'
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
      reason: `无法识别的主导航入口：${navigationId}。`,
    };
  }

  const definition = PRIMARY_NAVIGATION_BY_ID.get(navigationId);
  if (!definition) {
    return {
      accepted: false,
      id: navigationId,
      code: 'UNKNOWN_NAVIGATION',
      reason: `无法识别的主导航入口：${navigationId}。`,
    };
  }

  if (definition.requiresProject && context.activeProjectId === null) {
    return {
      accepted: false,
      id: navigationId,
      code: 'PROJECT_REQUIRED',
      reason: '请先新建或打开一部本地作品。',
    };
  }

  if (!resolveAvailability(context.availability)[navigationId]) {
    const protectedByRuntime = currentRuntimeNavigationAvailability()?.[navigationId] === false;
    return {
      accepted: false,
      id: navigationId,
      code: 'FEATURE_UNAVAILABLE',
      reason: protectedByRuntime
        ? '当前作品或本地服务处于保护状态，请先使用恢复与导出或恢复本地服务。'
        : '该功能尚未完成迁移，当前不会提供无法使用的占位入口。',
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
  const requested = {
    ...DEFAULT_AVAILABILITY,
    ...override,
  };
  const runtime = currentRuntimeNavigationAvailability();
  if (!runtime) return requested;
  return {
    home: requested.home && runtime.home,
    planning: requested.planning && runtime.planning,
    writing: requested.writing && runtime.writing,
    canon: requested.canon && runtime.canon,
    checks: requested.checks && runtime.checks,
    settings: requested.settings && runtime.settings,
  };
}

function isPrimaryNavigationId(value: string): value is PrimaryNavigationId {
  return (PRIMARY_NAVIGATION_IDS as readonly string[]).includes(value);
}

function isRendererRouteId(value: unknown): value is RendererRouteId {
  return typeof value === 'string' && (RENDERER_ROUTE_IDS as readonly string[]).includes(value);
}
