import { useEffect, useState, type FormEvent } from 'react';

import type {
  AppSettings,
  AppSettingsUpdate,
  AppearancePreferences,
  CoreStatus,
} from '@worldforge/contracts';

import type { AppDisclosureMode } from '../../shell/app-shell-model.js';
import {
  createSettingsNavigationItems,
  resolveSettingsNavigationIntent,
  type SettingsBasicSectionId,
} from '../../shell/settings-navigation-model.js';

export interface SettingsPageProps {
  readonly disclosureMode: AppDisclosureMode;
  readonly settings: AppSettings;
  readonly appearance: AppearancePreferences;
  readonly coreStatus: CoreStatus | null;
  readonly pendingKey: string | null;
  readonly message: string | null;
  readonly onClose: () => void;
  readonly onSaveSettings: (update: AppSettingsUpdate) => Promise<boolean>;
  readonly onResetSettings: () => void;
  readonly onSaveAppearance: (appearance: AppearancePreferences) => Promise<boolean>;
  readonly onRestartCore: () => void;
}

export function SettingsPage(props: SettingsPageProps) {
  const [section, setSection] = useState<SettingsBasicSectionId>('general');
  const items = createSettingsNavigationItems({
    disclosureMode: props.disclosureMode,
    currentSection: section,
    availability: { general: true, editor: true, appearance: true, advanced: true },
  });

  const navigate = (candidate: string): void => {
    const resolution = resolveSettingsNavigationIntent(candidate, {
      disclosureMode: props.disclosureMode,
      currentSection: section,
      availability: { general: true, editor: true, appearance: true, advanced: true },
    });
    if (resolution.accepted) setSection(resolution.section);
  };

  return (
    <section className="react-settings-page" data-react-settings data-settings-dialog>
      <header className="react-page-header">
        <div>
          <p className="eyebrow">LOCAL PREFERENCES · APP.SQLITE</p>
          <h1>设置</h1>
          <p>显示偏好和应用设置保存在本机，不写入任何项目正文。</p>
        </div>
        <button className="quiet-button" data-close-settings type="button" onClick={props.onClose}>
          返回首页
        </button>
      </header>
      {props.message ? (
        <p
          className="react-operation-message"
          data-settings-status
          role="status"
          aria-live="polite"
        >
          {props.message}
        </p>
      ) : null}
      <div className="react-settings-layout">
        <nav className="react-settings-nav" aria-label="设置分区">
          {items.map((item) => (
            <button
              aria-current={item.current ? 'page' : undefined}
              className="react-settings-nav__item"
              data-current={item.current}
              data-settings-navigation={item.id}
              disabled={item.disabled}
              key={item.id}
              title={item.disabledReason ?? undefined}
              type="button"
              onClick={() => navigate(item.id)}
            >
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </button>
          ))}
        </nav>
        <div className="react-settings-panel">
          {section === 'general' ? <GeneralSettings {...props} /> : null}
          {section === 'editor' ? <EditorSettings {...props} /> : null}
          {section === 'appearance' ? <AppearanceSettings {...props} /> : null}
          {section === 'advanced' ? <AdvancedSettings {...props} /> : null}
        </div>
      </div>
    </section>
  );
}

function GeneralSettings(props: SettingsPageProps) {
  const [draft, setDraft] = useState(props.settings);
  useEffect(() => setDraft(props.settings), [props.settings]);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void props.onSaveSettings({
      language: draft.language,
      startupBehavior: draft.startupBehavior,
      defaultMode: draft.defaultMode,
    });
  };

  return (
    <form className="react-settings-form" data-settings-section="general" onSubmit={submit}>
      <header>
        <h2>通用</h2>
        <p>选择启动行为和默认信息披露模式。模式切换不会改变数据与命令。</p>
      </header>
      <label>
        <span>语言</span>
        <select disabled value={draft.language}>
          <option value="zh-CN">简体中文</option>
        </select>
      </label>
      <label>
        <span>启动行为</span>
        <select
          value={draft.startupBehavior}
          onChange={(event) =>
            setDraft({
              ...draft,
              startupBehavior: event.target.value as AppSettings['startupBehavior'],
            })
          }
        >
          <option value="show-home">显示首页</option>
          <option value="reopen-last">重新打开最近项目</option>
        </select>
      </label>
      <label>
        <span>默认模式</span>
        <select
          data-default-mode
          data-react-default-mode
          value={draft.defaultMode}
          onChange={(event) =>
            setDraft({ ...draft, defaultMode: event.target.value as AppSettings['defaultMode'] })
          }
        >
          <option value="beginner">新手模式</option>
          <option value="professional">专业模式</option>
        </select>
      </label>
      <footer>
        <button
          className="quiet-button"
          disabled={Boolean(props.pendingKey)}
          type="button"
          onClick={props.onResetSettings}
        >
          恢复默认
        </button>
        <button
          className="primary-button"
          data-save-settings
          disabled={Boolean(props.pendingKey)}
          type="submit"
        >
          保存通用设置
        </button>
      </footer>
    </form>
  );
}

function EditorSettings(props: SettingsPageProps) {
  const [draft, setDraft] = useState(props.appearance);
  useEffect(() => setDraft(props.appearance), [props.appearance]);

  return (
    <form
      className="react-settings-form"
      data-settings-section="editor"
      onSubmit={(event) => {
        event.preventDefault();
        void props.onSaveAppearance(draft);
      }}
    >
      <header>
        <h2>编辑器</h2>
        <p>正文字号与版心宽度独立于界面缩放。</p>
      </header>
      <label>
        <span>正文字号：{draft.bodyFontSize}px</span>
        <input
          data-body-font-size
          max={28}
          min={14}
          type="range"
          value={draft.bodyFontSize}
          onChange={(event) => setDraft({ ...draft, bodyFontSize: Number(event.target.value) })}
        />
      </label>
      <label>
        <span>正文宽度</span>
        <select
          data-content-width
          value={draft.contentWidth}
          onChange={(event) =>
            setDraft({
              ...draft,
              contentWidth: event.target.value as AppearancePreferences['contentWidth'],
            })
          }
        >
          <option value="narrow">窄 · 680px</option>
          <option value="normal">标准 · 760px</option>
          <option value="wide">宽 · 860px</option>
          <option value="adaptive">自适应</option>
        </select>
      </label>
      <footer>
        <button
          className="primary-button"
          data-save-appearance
          disabled={Boolean(props.pendingKey)}
          type="submit"
        >
          保存编辑器设置
        </button>
      </footer>
    </form>
  );
}

function AppearanceSettings(props: SettingsPageProps) {
  const [settings, setSettings] = useState(props.settings);
  const [appearance, setAppearance] = useState(props.appearance);
  useEffect(() => setSettings(props.settings), [props.settings]);
  useEffect(() => setAppearance(props.appearance), [props.appearance]);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const savedSettings = await props.onSaveSettings({
      themeId: settings.themeId,
      themeVariant: settings.themeVariant,
      reduceMotion: settings.reduceMotion,
    });
    if (savedSettings) await props.onSaveAppearance(appearance);
  };

  const variants =
    settings.themeId === 'theme-b'
      ? ['light', 'dark']
      : ['light', 'dark', 'eye-care', 'high-contrast'];

  return (
    <form
      className="react-settings-form"
      data-settings-section="appearance"
      onSubmit={(event) => void submit(event)}
    >
      <header>
        <h2>外观与显示</h2>
        <p>主题只替换视觉Token；界面缩放不会改变正文内容和导出字号。</p>
      </header>
      <label>
        <span>主题</span>
        <select
          data-ui-scale
          data-theme-id
          value={settings.themeId}
          onChange={(event) => {
            const themeId = event.target.value as AppSettings['themeId'];
            setSettings({
              ...settings,
              themeId,
              themeVariant:
                themeId === 'theme-b' && !['light', 'dark'].includes(settings.themeVariant)
                  ? 'light'
                  : settings.themeVariant,
            });
          }}
        >
          <option value="theme-a">Theme A · 安静编辑部</option>
          <option value="theme-b">Theme B</option>
        </select>
      </label>
      <label>
        <span>主题变体</span>
        <select
          data-workspace-alignment
          data-theme-variant
          value={settings.themeVariant}
          onChange={(event) =>
            setSettings({
              ...settings,
              themeVariant: event.target.value as AppSettings['themeVariant'],
            })
          }
        >
          {variants.map((variant) => (
            <option key={variant} value={variant}>
              {variantLabel(variant)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>界面缩放</span>
        <select
          value={appearance.uiScalePercent}
          onChange={(event) =>
            setAppearance({ ...appearance, uiScalePercent: Number(event.target.value) })
          }
        >
          {[90, 100, 110, 120, 130, 140, 150].map((value) => (
            <option key={value} value={value}>
              {value}%
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>超宽屏工作区位置</span>
        <select
          value={appearance.workspaceAlignment}
          onChange={(event) =>
            setAppearance({
              ...appearance,
              workspaceAlignment: event.target.value as AppearancePreferences['workspaceAlignment'],
            })
          }
        >
          <option value="left">偏左</option>
          <option value="center">居中</option>
          <option value="right">偏右</option>
        </select>
      </label>
      <label className="react-switch-row">
        <input
          checked={settings.reduceMotion}
          data-reduce-motion
          type="checkbox"
          onChange={(event) => setSettings({ ...settings, reduceMotion: event.target.checked })}
        />
        <span>减少动态效果</span>
      </label>
      <footer>
        <button
          className="primary-button"
          data-save-appearance
          data-save-settings
          disabled={Boolean(props.pendingKey)}
          type="submit"
        >
          保存外观设置
        </button>
      </footer>
    </form>
  );
}

function AdvancedSettings(props: SettingsPageProps) {
  const core = props.coreStatus;
  return (
    <section className="react-settings-form" data-settings-section="advanced">
      <header>
        <h2>高级与诊断</h2>
        <p>这里只显示安全诊断信息，不通过Renderer暴露堆栈、SQL、密钥或完整日志。</p>
      </header>
      <dl className="react-diagnostic-list">
        <div>
          <dt>Core状态</dt>
          <dd>{core?.status ?? '未知'}</dd>
        </div>
        <div>
          <dt>重启次数</dt>
          <dd>{core?.restartCount ?? '—'}</dd>
        </div>
        <div>
          <dt>错误码</dt>
          <dd>{core?.lastErrorCode ?? '无'}</dd>
        </div>
        <div>
          <dt>诊断ID</dt>
          <dd>{core?.diagnosticId ?? '无'}</dd>
        </div>
      </dl>
      <footer>
        <button
          className="primary-button"
          disabled={props.pendingKey === 'app.restartCore'}
          type="button"
          onClick={props.onRestartCore}
        >
          {props.pendingKey === 'app.restartCore' ? '正在重启…' : '安全重启Core'}
        </button>
      </footer>
    </section>
  );
}

function variantLabel(variant: string): string {
  return (
    {
      light: '浅色',
      dark: '深色',
      'eye-care': '护眼',
      'high-contrast': '高对比',
    }[variant] ?? variant
  );
}
