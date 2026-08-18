import type { ShortcutOverride } from '@worldforge/contracts';

import type {
  PrimaryNavigationAvailability,
  PrimaryNavigationId,
} from '../../shell/app-shell-model.js';
import type { RendererRouteId } from '../../state/ui-state-boundary.js';

export type GenerationCommandMode = 'skeleton' | 'chapter' | 'rewrite';
export type CommandScope = 'global' | 'project' | 'writing';
export type SystemCommandId = 'system.commandPalette' | 'system.typewriterMode';

interface CommandMetadata {
  readonly label: string;
  readonly description: string;
  readonly keywords: readonly string[];
  readonly scope: CommandScope;
  readonly allowInEditable: boolean;
  readonly allowReadOnly: boolean;
  readonly defaultShortcut: string | null;
  readonly rebindable: boolean;
  readonly dangerous: boolean;
  readonly showInPalette: boolean;
  readonly handlerIdentity: string;
}

export type CommandCatalogEntry = CommandMetadata &
  (
    | {
        readonly id: `navigation.${PrimaryNavigationId}`;
        readonly kind: 'navigation';
        readonly navigationId: PrimaryNavigationId;
        readonly requiresProject: boolean;
      }
    | {
        readonly id: `route.${RendererRouteId}`;
        readonly kind: 'route';
        readonly route: RendererRouteId;
        readonly parentNavigationId: PrimaryNavigationId;
        readonly requiresProject: boolean;
      }
    | {
        readonly id: `generation.${GenerationCommandMode}`;
        readonly kind: 'generation';
        readonly generationMode: GenerationCommandMode;
        readonly requiresProject: true;
      }
    | {
        readonly id: SystemCommandId;
        readonly kind: 'system';
        readonly requiresProject: boolean;
      }
  );

const DEFAULT_COMMAND_METADATA = {
  allowInEditable: false,
  allowReadOnly: true,
  defaultShortcut: null,
  rebindable: true,
  dangerous: false,
  showInPalette: true,
} as const;

/**
 * 命令身份的唯一登记点。按钮、菜单、命令面板、默认快捷键与自定义快捷键
 * 只能引用这里登记的 command id，不接受任意 Renderer callback 或字符串命令总线。
 */
export const COMMAND_CATALOG: readonly CommandCatalogEntry[] = [
  systemCommandPalette(),
  systemTypewriterMode(),
  navigation('home', '回到首页', '查看最近作品与工作区状态', ['首页', '最近作品'], false),
  route('project', '打开作品概览', '查看当前作品状态', ['项目', '作品'], true),
  navigation('planning', '打开创作规划', '查看项目目标、情节与场景', ['大纲', '场景'], true),
  route('structure', '打开卷章目录', '管理卷与章节结构', ['目录', '章节', '卷'], true),
  navigation('writing', '打开正文写作', '返回当前章节编辑器', ['编辑器', '写作'], true),
  route('candidates', '打开智能创作', '生成并审阅智能建议稿', ['生成', '建议稿'], true),
  route('versions', '打开历史版本', '查看当前章节的只读版本', ['版本', '历史'], true),
  navigation('canon', '打开人物与设定', '查看人物、世界设定与伏笔', ['人物', '设定', '伏笔'], true),
  route(
    'research',
    '打开研究资料',
    '查看本地研究笔记、附件与故事关联',
    ['资料', '研究', '附件', '参考'],
    true,
  ),
  route(
    'journal',
    '打开创作日志',
    '查看今日、本周与长期项目复盘',
    ['日志', '复盘', '字数', '创作记录'],
    true,
  ),
  navigation('checks', '打开检查', '搜索、校验与故事任务', ['搜索', '校验', '任务'], true),
  route('recovery', '打开恢复与导出', '备份、恢复和导入导出', ['备份', '导出'], true),
  navigation('settings', '打开设置', '管理显示与智能连接', ['偏好', '模型', '连接'], false),
  generation('skeleton', '规划这一章', '打开智能创作并选择章节规划', ['骨架', '大纲']),
  generation('chapter', '生成这一章', '打开智能创作并选择正文生成', ['正文', '续写']),
  generation('rewrite', '改写选中内容', '打开智能创作并选择局部改写', ['润色', '重写']),
] as const;

function metadata(
  id: string,
  scope: CommandScope,
  overrides: Partial<CommandMetadata> = {},
): CommandMetadata {
  return {
    ...DEFAULT_COMMAND_METADATA,
    label: '',
    description: '',
    keywords: [],
    scope,
    handlerIdentity: id,
    ...overrides,
  };
}

function systemCommandPalette(): CommandCatalogEntry {
  const id = 'system.commandPalette' as const;
  return {
    id,
    kind: 'system',
    requiresProject: false,
    ...metadata(id, 'global', {
      label: '搜索与命令',
      description: '打开统一搜索与命令面板',
      keywords: ['命令', '搜索', '快捷键'],
      allowInEditable: true,
      defaultShortcut: 'Mod+K',
      showInPalette: false,
    }),
  };
}

function systemTypewriterMode(): CommandCatalogEntry {
  const id = 'system.typewriterMode' as const;
  return {
    id,
    kind: 'system',
    requiresProject: true,
    ...metadata(id, 'writing', {
      label: '切换打字机模式',
      description: '让当前输入位置保持在稳定视觉区域',
      keywords: ['打字机', '沉浸', '输入位置'],
      allowInEditable: true,
      defaultShortcut: null,
      showInPalette: true,
    }),
  };
}

function navigation(
  navigationId: PrimaryNavigationId,
  label: string,
  description: string,
  keywords: readonly string[],
  requiresProject: boolean,
): CommandCatalogEntry {
  const id = `navigation.${navigationId}` as const;
  return {
    id,
    kind: 'navigation',
    navigationId,
    requiresProject,
    ...metadata(id, requiresProject ? 'project' : 'global', {
      label,
      description,
      keywords,
    }),
  };
}

function generation(
  generationMode: GenerationCommandMode,
  label: string,
  description: string,
  keywords: readonly string[],
): CommandCatalogEntry {
  const id = `generation.${generationMode}` as const;
  return {
    id,
    kind: 'generation',
    generationMode,
    requiresProject: true,
    ...metadata(id, 'writing', {
      label,
      description,
      keywords,
      allowReadOnly: false,
    }),
  };
}

function route(
  route: RendererRouteId,
  label: string,
  description: string,
  keywords: readonly string[],
  requiresProject: boolean,
): CommandCatalogEntry {
  const id = `route.${route}` as const;
  return {
    id,
    kind: 'route',
    route,
    parentNavigationId:
      route === 'project'
        ? 'home'
        : route === 'structure'
          ? 'planning'
          : route === 'research' || route === 'journal'
            ? 'canon'
            : route === 'recovery'
              ? 'checks'
              : 'writing',
    requiresProject,
    ...metadata(id, requiresProject ? 'project' : 'global', {
      label,
      description,
      keywords,
    }),
  };
}

export function commandCatalogEntry(commandId: string): CommandCatalogEntry | null {
  return COMMAND_CATALOG.find((entry) => entry.id === commandId) ?? null;
}

export function shortcutForCommand(
  entry: CommandCatalogEntry,
  overrides: readonly ShortcutOverride[] = [],
): string | null {
  const override = overrides.find((item) => item.commandId === entry.id);
  return override ? override.shortcut : entry.defaultShortcut;
}

export function filterCommandCatalog(
  query: string,
  projectAvailable: boolean,
  availability?: Partial<PrimaryNavigationAvailability>,
): readonly CommandCatalogEntry[] {
  const normalized = query.trim().toLocaleLowerCase('zh-CN');
  return COMMAND_CATALOG.filter((entry) => {
    if (!entry.showInPalette) return false;
    if (entry.requiresProject && !projectAvailable) return false;
    const navigationId =
      entry.kind === 'navigation'
        ? entry.navigationId
        : entry.kind === 'route'
          ? entry.parentNavigationId
          : entry.kind === 'generation'
            ? 'writing'
            : 'home';
    if (availability?.[navigationId] === false) return false;
    if (!normalized) return true;
    return [entry.label, entry.description, ...entry.keywords]
      .join('\n')
      .toLocaleLowerCase('zh-CN')
      .includes(normalized);
  });
}

export function commandPaletteShortcutLabel(
  platform: string,
  overrides: readonly ShortcutOverride[] = [],
): string {
  const entry = commandCatalogEntry('system.commandPalette');
  const shortcut = entry ? shortcutForCommand(entry, overrides) : 'Mod+K';
  if (!shortcut) return '未绑定';
  if (shortcut === 'Mod+K') {
    return /mac|darwin|iphone|ipad/iu.test(platform) ? '⌘ K' : 'Ctrl K';
  }
  return shortcutDisplayLabel(shortcut, platform);
}

export function shortcutDisplayLabel(shortcut: string, platform: string): string {
  const mac = /mac|darwin|iphone|ipad/iu.test(platform);
  return shortcut
    .replaceAll('Mod', mac ? '⌘' : 'Ctrl')
    .replaceAll('Ctrl', mac ? '⌃' : 'Ctrl')
    .replaceAll('Alt', mac ? '⌥' : 'Alt')
    .replaceAll('Shift', mac ? '⇧' : 'Shift')
    .replaceAll('+', mac ? '' : ' + ');
}
