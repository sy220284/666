import type { AppDisclosureMode } from './app-shell-model.js';

export const SETTINGS_BASIC_SECTION_IDS = ['general', 'editor', 'appearance', 'advanced'] as const;

export type SettingsBasicSectionId = (typeof SETTINGS_BASIC_SECTION_IDS)[number];
export type SettingsSectionAvailability = Readonly<Record<SettingsBasicSectionId, boolean>>;

export interface SettingsNavigationContext {
  readonly disclosureMode: AppDisclosureMode;
  readonly currentSection: SettingsBasicSectionId;
  readonly availability?: Partial<SettingsSectionAvailability>;
}

export interface SettingsNavigationItem {
  readonly id: SettingsBasicSectionId;
  readonly label: string;
  readonly description: string;
  readonly current: boolean;
  readonly disabled: boolean;
  readonly disabledReason: string | null;
}

export type SettingsNavigationResolution =
  | {
      readonly accepted: true;
      readonly section: SettingsBasicSectionId;
    }
  | {
      readonly accepted: false;
      readonly section: SettingsBasicSectionId | null;
      readonly code: 'UNKNOWN_SECTION' | 'SECTION_UNAVAILABLE';
      readonly reason: string;
    };

interface SettingsSectionDefinition {
  readonly id: SettingsBasicSectionId;
  readonly label: string;
  readonly beginnerDescription: string;
  readonly professionalDescription: string;
}

const DEFAULT_SETTINGS_AVAILABILITY: SettingsSectionAvailability = {
  general: true,
  editor: false,
  appearance: true,
  advanced: false,
};

const SETTINGS_SECTION_DEFINITIONS = [
  {
    id: 'general',
    label: '通用',
    beginnerDescription: '调整启动方式和默认使用模式',
    professionalDescription: '语言、启动行为、最近项目和默认作者模式',
  },
  {
    id: 'editor',
    label: '编辑器',
    beginnerDescription: '调整正文阅读与输入体验',
    professionalDescription: '字体、字号、宽度、行高、段距和首行缩进',
  },
  {
    id: 'appearance',
    label: '外观与显示',
    beginnerDescription: '调整主题和界面显示方式',
    professionalDescription: '主题、变体、界面缩放、减少动态和高对比',
  },
  {
    id: 'advanced',
    label: '高级',
    beginnerDescription: '查看诊断和维护信息',
    professionalDescription: '日志、诊断、数据库检查、FTS重建和开发信息',
  },
] as const satisfies readonly SettingsSectionDefinition[];

export function createSettingsNavigationItems(
  context: SettingsNavigationContext,
): readonly SettingsNavigationItem[] {
  const availability = resolveSettingsAvailability(context.availability);

  return SETTINGS_SECTION_DEFINITIONS.map((definition) => {
    const disabled = !availability[definition.id];
    return {
      id: definition.id,
      label: definition.label,
      description:
        context.disclosureMode === 'beginner'
          ? definition.beginnerDescription
          : definition.professionalDescription,
      current: context.currentSection === definition.id,
      disabled,
      disabledReason: disabled ? '该设置分区尚未接入正式命令，当前不会提供可点击占位入口。' : null,
    };
  });
}

export function resolveSettingsNavigationIntent(
  section: string,
  context: SettingsNavigationContext,
): SettingsNavigationResolution {
  if (!isSettingsBasicSectionId(section)) {
    return {
      accepted: false,
      section: null,
      code: 'UNKNOWN_SECTION',
      reason: `Unknown settings section: ${section}.`,
    };
  }

  if (!resolveSettingsAvailability(context.availability)[section]) {
    return {
      accepted: false,
      section,
      code: 'SECTION_UNAVAILABLE',
      reason: '该设置分区尚未接入正式命令，当前不会提供可点击占位入口。',
    };
  }

  return { accepted: true, section };
}

export function restoreSettingsSection(
  candidate: unknown,
  context: Omit<SettingsNavigationContext, 'currentSection'>,
): SettingsBasicSectionId {
  if (!isSettingsBasicSectionId(candidate)) return 'general';
  const resolution = resolveSettingsNavigationIntent(candidate, {
    ...context,
    currentSection: candidate,
  });
  return resolution.accepted ? candidate : 'general';
}

function resolveSettingsAvailability(
  override: Partial<SettingsSectionAvailability> | undefined,
): SettingsSectionAvailability {
  return {
    ...DEFAULT_SETTINGS_AVAILABILITY,
    ...override,
  };
}

function isSettingsBasicSectionId(value: unknown): value is SettingsBasicSectionId {
  return (
    typeof value === 'string' && (SETTINGS_BASIC_SECTION_IDS as readonly string[]).includes(value)
  );
}
