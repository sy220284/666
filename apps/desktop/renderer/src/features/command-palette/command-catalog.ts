import type {
  PrimaryNavigationAvailability,
  PrimaryNavigationId,
} from '../../shell/app-shell-model.js';
import type { RendererRouteId } from '../../state/ui-state-boundary.js';

export type GenerationCommandMode = 'skeleton' | 'chapter' | 'rewrite';

export type CommandCatalogEntry =
  | {
      readonly id: `navigation.${PrimaryNavigationId}`;
      readonly kind: 'navigation';
      readonly label: string;
      readonly description: string;
      readonly keywords: readonly string[];
      readonly navigationId: PrimaryNavigationId;
      readonly requiresProject: boolean;
    }
  | {
      readonly id: `route.${RendererRouteId}`;
      readonly kind: 'route';
      readonly label: string;
      readonly description: string;
      readonly keywords: readonly string[];
      readonly route: RendererRouteId;
      readonly parentNavigationId: PrimaryNavigationId;
      readonly requiresProject: boolean;
    }
  | {
      readonly id: `generation.${GenerationCommandMode}`;
      readonly kind: 'generation';
      readonly label: string;
      readonly description: string;
      readonly keywords: readonly string[];
      readonly generationMode: GenerationCommandMode;
      readonly requiresProject: true;
    };

/**
 * 命令身份的唯一登记点。Ctrl+K 只筛选并执行这里登记的页面与创作动作，
 * 不接受任意 Renderer callback 或字符串拼接出来的隐藏命令。
 */
export const COMMAND_CATALOG: readonly CommandCatalogEntry[] = [
  navigation('home', '回到首页', '查看最近作品与工作区状态', ['首页', '最近作品'], false),
  route('project', '打开作品概览', '查看当前作品状态', ['项目', '作品'], true),
  navigation('planning', '打开创作规划', '查看项目目标、情节与场景', ['大纲', '场景'], true),
  route('structure', '打开卷章目录', '管理卷与章节结构', ['目录', '章节', '卷'], true),
  navigation('writing', '打开正文写作', '返回当前章节编辑器', ['编辑器', '写作'], true),
  route('candidates', '打开智能创作', '生成并审阅智能建议稿', ['生成', '建议稿'], true),
  route('versions', '打开历史版本', '查看当前章节的只读版本', ['版本', '历史'], true),
  navigation('canon', '打开人物与设定', '查看人物、世界设定与伏笔', ['人物', '设定', '伏笔'], true),
  navigation('checks', '打开检查', '搜索、校验与故事任务', ['搜索', '校验', '任务'], true),
  route('recovery', '打开恢复与导出', '备份、恢复和导入导出', ['备份', '导出'], true),
  navigation('settings', '打开设置', '管理显示与智能连接', ['偏好', '模型', '连接'], false),
  generation('skeleton', '规划这一章', '打开智能创作并选择章节规划', ['骨架', '大纲']),
  generation('chapter', '生成这一章', '打开智能创作并选择正文生成', ['正文', '续写']),
  generation('rewrite', '改写选中内容', '打开智能创作并选择局部改写', ['润色', '重写']),
] as const;

function navigation(
  navigationId: PrimaryNavigationId,
  label: string,
  description: string,
  keywords: readonly string[],
  requiresProject: boolean,
): CommandCatalogEntry {
  return {
    id: `navigation.${navigationId}`,
    kind: 'navigation',
    label,
    description,
    keywords,
    navigationId,
    requiresProject,
  };
}

function generation(
  generationMode: GenerationCommandMode,
  label: string,
  description: string,
  keywords: readonly string[],
): CommandCatalogEntry {
  return {
    id: `generation.${generationMode}`,
    kind: 'generation',
    label,
    description,
    keywords,
    generationMode,
    requiresProject: true,
  };
}

function route(
  route: RendererRouteId,
  label: string,
  description: string,
  keywords: readonly string[],
  requiresProject: boolean,
): CommandCatalogEntry {
  return {
    id: `route.${route}`,
    kind: 'route',
    label,
    description,
    keywords,
    route,
    parentNavigationId:
      route === 'project'
        ? 'home'
        : route === 'structure'
          ? 'planning'
          : route === 'recovery'
            ? 'checks'
            : 'writing',
    requiresProject,
  };
}

export function filterCommandCatalog(
  query: string,
  projectAvailable: boolean,
  availability?: Partial<PrimaryNavigationAvailability>,
): readonly CommandCatalogEntry[] {
  const normalized = query.trim().toLocaleLowerCase('zh-CN');
  return COMMAND_CATALOG.filter((entry) => {
    if (entry.requiresProject && !projectAvailable) return false;
    const navigationId =
      entry.kind === 'navigation'
        ? entry.navigationId
        : entry.kind === 'route'
          ? entry.parentNavigationId
          : 'writing';
    if (availability?.[navigationId] === false) return false;
    if (!normalized) return true;
    return [entry.label, entry.description, ...entry.keywords]
      .join('\n')
      .toLocaleLowerCase('zh-CN')
      .includes(normalized);
  });
}

export function commandPaletteShortcutLabel(platform: string): string {
  return /mac|darwin|iphone|ipad/iu.test(platform) ? '⌘ K' : 'Ctrl K';
}
