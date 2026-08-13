import { useEffect, useState, type FormEvent } from 'react';

import type {
  AppSettings,
  AppSettingsUpdate,
  AppearancePreferences,
  CoreStatus,
  DiagnosticPreview,
  ProviderConnectionTestResult,
  ProviderSummary,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import type { AppDisclosureMode } from '../../shell/app-shell-model.js';
import { ProviderSettings } from './provider-settings.js';
import {
  createSettingsNavigationItems,
  resolveSettingsNavigationIntent,
  type SettingsBasicSectionId,
} from '../../shell/settings-navigation-model.js';

import { authorErrorSummary } from '../../presentation/author-error-message.js';

import { authorStatusLabel } from '../../presentation/author-status-labels.js';
export interface SettingsPageProps {
  readonly bridge: RendererBridgeAdapter;
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
  readonly onOpenOnboarding: () => void;
  readonly aiReady: boolean;
  readonly onProvidersChanged: (providers: readonly ProviderSummary[]) => void;
  readonly onProviderConnectionVerified: (result: ProviderConnectionTestResult) => void;
  readonly onProviderInvalidated: (providerId: string) => void;
}

export function SettingsPage(props: SettingsPageProps) {
  const [section, setSection] = useState<SettingsBasicSectionId>('general');
  const items = createSettingsNavigationItems({
    disclosureMode: props.disclosureMode,
    currentSection: section,
    availability: {
      general: true,
      editor: true,
      appearance: true,
      providers: true,
      advanced: true,
    },
  });

  const navigate = (candidate: string): void => {
    const resolution = resolveSettingsNavigationIntent(candidate, {
      disclosureMode: props.disclosureMode,
      currentSection: section,
      availability: {
        general: true,
        editor: true,
        appearance: true,
        providers: true,
        advanced: true,
      },
    });
    if (resolution.accepted) setSection(resolution.section);
  };

  return (
    <section className="react-settings-page" data-react-settings data-settings-dialog>
      <header className="react-page-header">
        <div>
          <p className="eyebrow">本地应用设置</p>
          <h1>设置</h1>
          <p>显示偏好和应用设置保存在本机，不写入任何作品正文。</p>
        </div>
        <button
          className="quiet-button"
          data-close-settings
          disabled={Boolean(props.pendingKey)}
          type="button"
          onClick={props.onClose}
        >
          返回上一页
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
              disabled={item.disabled || Boolean(props.pendingKey)}
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
          {section === 'providers' ? (
            <ProviderSettings
              bridge={props.bridge}
              onProviderConnectionVerified={props.onProviderConnectionVerified}
              onProviderInvalidated={props.onProviderInvalidated}
              onProvidersChanged={props.onProvidersChanged}
            />
          ) : null}
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
      creativePath: draft.creativePath,
    });
  };

  return (
    <form className="react-settings-form" data-settings-section="general" onSubmit={submit}>
      <header>
        <h2>通用</h2>
        <p>选择启动行为和默认信息显示方式。切换显示方式不会改变作品数据与功能。</p>
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
          <option value="reopen-last">重新打开最近作品</option>
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
          <option value="beginner">简明模式</option>
          <option value="professional">完整模式</option>
        </select>
      </label>
      <label>
        <span>创作方式</span>
        <select
          data-creative-path
          value={draft.creativePath}
          onChange={(event) =>
            setDraft({
              ...draft,
              creativePath: event.target.value as AppSettings['creativePath'],
            })
          }
        >
          <option value="autonomous">自主创作</option>
          <option value="hybrid">人机协作</option>
          <option disabled={!props.aiReady} value="ai-first">
            智能优先{props.aiReady ? '' : '（请先完成连接测试）'}
          </option>
        </select>
        <small>
          {props.aiReady
            ? '当前会话已有智能连接通过真实连接测试；这里只调整推荐入口和说明。'
            : '智能连接尚未验证，不影响自主创作、搜索、备份、导入导出或恢复。'}
        </small>
      </label>
      <footer>
        <button className="quiet-button" type="button" onClick={props.onOpenOnboarding}>
          重新打开项目引导
        </button>
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
        <p>主题只改变视觉样式；界面缩放不会改变正文内容和导出字号。</p>
      </header>
      <label>
        <span>主题</span>
        <select
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
          <option value="theme-a">安静编辑部</option>
          <option value="theme-b">水墨印章</option>
        </select>
      </label>
      <label>
        <span>主题变体</span>
        <select
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
          data-ui-scale
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
          data-workspace-alignment
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
  const [preview, setPreview] = useState<DiagnosticPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [diagnosticStatus, setDiagnosticStatus] = useState<string | null>(null);

  const previewDiagnostics = async (): Promise<void> => {
    setDiagnosticStatus('正在生成本地安全清单…');
    const outcome = await props.bridge.app.previewDiagnostics({ mode: 'replace' });
    if (outcome.state !== 'success') {
      setDiagnosticStatus(
        outcome.state === 'failure'
          ? `预览失败 · ${authorErrorSummary(outcome.error)}`
          : '预览已取消。',
      );
      return;
    }
    setPreview(outcome.data);
    setConfirmed(false);
    setDiagnosticStatus('请核对包含项与明确排除项，再确认导出。');
  };

  const exportDiagnostics = async (): Promise<void> => {
    if (!preview || !confirmed) return;
    setDiagnosticStatus('请选择诊断包保存位置…');
    const outcome = await props.bridge.app.exportDiagnostics();
    if (outcome.state !== 'success') {
      setDiagnosticStatus(
        outcome.state === 'failure'
          ? outcome.error.code === 'COMMON_CANCELLED_004'
            ? '已取消诊断导出。'
            : `导出失败 · ${authorErrorSummary(outcome.error)}`
          : '导出已取消。',
      );
      return;
    }
    setDiagnosticStatus(
      `已导出 ${outcome.data.fileName} · ${outcome.data.bytes} 字节 · ${outcome.data.sha256.slice(0, 12)}…`,
    );
  };

  return (
    <section className="react-settings-form" data-settings-section="advanced">
      <header>
        <h2>高级与诊断</h2>
        <p>这里只显示安全诊断信息，不向应用界面暴露调用堆栈、数据库语句、密钥或完整日志。</p>
      </header>
      <dl className="react-diagnostic-list">
        <div>
          <dt>本地服务状态</dt>
          <dd>{core ? authorStatusLabel(core.status) : '状态未知'}</dd>
        </div>
        <div>
          <dt>重启次数</dt>
          <dd>{core?.restartCount ?? '—'}</dd>
        </div>
      </dl>
      {core?.lastErrorCode || core?.diagnosticId ? (
        <details className="react-technical-details">
          <summary>技术详情</summary>
          <dl className="react-diagnostic-list">
            <div>
              <dt>错误码</dt>
              <dd>{core.lastErrorCode ?? '无'}</dd>
            </div>
            <div>
              <dt>诊断编号</dt>
              <dd>{core.diagnosticId ?? '无'}</dd>
            </div>
          </dl>
        </details>
      ) : null}
      <section className="react-diagnostic-export" aria-labelledby="diagnostic-export-title">
        <h3 id="diagnostic-export-title">安全诊断包</h3>
        <p>必须先预览清单；默认不含正文、项目数据库、提示内容、凭据或绝对路径。</p>
        <button className="quiet-button" type="button" onClick={() => void previewDiagnostics()}>
          预览诊断清单
        </button>
        {preview ? (
          <div data-diagnostic-preview>
            <p>
              <strong>包含：</strong>
              {preview.manifest.included.join('、')}
            </p>
            <p>
              <strong>排除：</strong>
              {preview.manifest.excluded.join('、')}
            </p>
            <label className="react-switch-row">
              <input
                checked={confirmed}
                data-confirm-diagnostic-export
                type="checkbox"
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>我已核对清单并确认导出</span>
            </label>
            <button
              className="primary-button"
              data-export-diagnostics
              disabled={!confirmed}
              type="button"
              onClick={() => void exportDiagnostics()}
            >
              选择位置并导出
            </button>
          </div>
        ) : null}
        {diagnosticStatus ? (
          <p data-diagnostic-status role="status">
            {diagnosticStatus}
          </p>
        ) : null}
      </section>
      <footer>
        <button
          className="primary-button"
          disabled={props.pendingKey === 'app.restartCore'}
          type="button"
          onClick={props.onRestartCore}
        >
          {props.pendingKey === 'app.restartCore' ? '正在重启…' : '安全重启本地服务'}
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
