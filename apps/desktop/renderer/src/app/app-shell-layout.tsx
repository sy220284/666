import type { ReactNode, RefObject } from 'react';

import type {
  AppSettings,
  AppSettingsUpdate,
  CoreStatus,
  ProjectWorkspaceSummary,
  TaskSnapshot,
} from '@worldforge/contracts';

import { ContextHelp } from '../components/context-help.js';
import { SafetyBanner } from '../components/safety-banner.js';
import { TaskBar } from '../components/task-bar.js';
import { commandPaletteShortcutLabel } from '../features/command-palette/command-catalog.js';
import type { CapabilityMatrix } from '../runtime/capability-matrix.js';
import type { RendererStatus } from '../runtime/status-arbitrator.js';
import type {
  AppDisclosureMode,
  PrimaryNavigationId,
  PrimaryNavigationItem,
} from '../shell/app-shell-model.js';
import type { RendererRouteId } from '../state/ui-state-boundary.js';
import type { FailureView } from './app-shell-helpers.js';

interface AppShellLayoutProps {
  readonly children: ReactNode;
  readonly activeProject: ProjectWorkspaceSummary | null;
  readonly capabilities: CapabilityMatrix;
  readonly coreStatus: CoreStatus | null;
  readonly tasks: readonly TaskSnapshot[];
  readonly pendingKey: string | null;
  readonly message: string | null;
  readonly navigation: readonly PrimaryNavigationItem[];
  readonly disclosureMode: AppDisclosureMode;
  readonly route: RendererRouteId;
  readonly settings: AppSettings;
  readonly failure: FailureView | null;
  readonly globalStatus: RendererStatus | null;
  readonly globalStatusAction?: { readonly label: string; readonly run: () => void };
  readonly foregroundTaskId: string | null;
  readonly navOpen: boolean;
  readonly helpOpen: boolean;
  readonly commandPaletteOpen: boolean;
  readonly navToggle: RefObject<HTMLButtonElement | null>;
  readonly settingsTrigger: RefObject<HTMLButtonElement | null>;
  readonly helpTrigger: RefObject<HTMLButtonElement | null>;
  readonly commandPaletteTrigger: RefObject<HTMLButtonElement | null>;
  readonly mainContent: RefObject<HTMLElement | null>;
  readonly onNavOpenChange: (open: boolean) => void;
  readonly onHelpOpenChange: (open: boolean) => void;
  readonly onCommandPaletteOpenChange: (open: boolean) => void;
  readonly onNavigate: (id: PrimaryNavigationId) => void;
  readonly onTransitionToRoute: (route: RendererRouteId) => Promise<boolean>;
  readonly onOpenCanonSection: (section: 'continuity' | 'narrative' | 'proposals') => void;
  readonly onOpenDataToolsSection: (section: 'recovery' | 'import-export') => void;
  readonly onMoveProject: (projectId: string) => Promise<void>;
  readonly onCloseProject: (projectId: string) => Promise<void>;
  readonly onSaveSettings: (update: AppSettingsUpdate) => Promise<boolean>;
  readonly onOpenOnboarding: () => void;
  readonly onCancelTask: (taskId: string, projectId: string | null) => Promise<void>;
}

export function AppShellLayout(props: AppShellLayoutProps) {
  return (
    <div className="react-app-shell" data-react-runtime="running" data-react-shell>
      <header className="react-top-bar">
        <button
          aria-expanded={props.navOpen}
          aria-label="打开一级导航"
          className="icon-button react-nav-toggle"
          ref={props.navToggle}
          type="button"
          onClick={() => props.onNavOpenChange(!props.navOpen)}
        >
          ☰
        </button>
        <button className="react-brand" type="button" onClick={() => props.onNavigate('home')}>
          <strong>WorldForge</strong>
          <span>{props.activeProject?.name ?? '本地写作工作台'}</span>
        </button>
        <div className="react-top-bar__status" aria-live="polite">
          <span data-status={props.coreStatus?.status ?? 'starting'}>
            本地服务 · {props.coreStatus?.status ?? '正在连接'}
          </span>
          <span>{props.activeProject?.databaseMode === 'read-only' ? '只读' : '本地'}</span>
          <span>任务 {props.tasks.length}</span>
        </div>
        <button
          aria-expanded={props.commandPaletteOpen}
          data-command-id="system.commandPalette"
          className="quiet-button react-command-palette-trigger"
          data-open-command-palette
          ref={props.commandPaletteTrigger}
          type="button"
          onClick={() => props.onCommandPaletteOpenChange(true)}
        >
          搜索与命令{' '}
          <kbd>
            {commandPaletteShortcutLabel(
              globalThis.navigator?.platform ?? '',
              props.settings.shortcutOverrides,
            )}
          </kbd>
        </button>
        <button
          aria-expanded={props.helpOpen}
          className="quiet-button"
          data-open-context-help
          ref={props.helpTrigger}
          type="button"
          onClick={() => props.onHelpOpenChange(!props.helpOpen)}
        >
          帮助
        </button>
        <button
          className="quiet-button"
          data-command-id="navigation.settings"
          data-open-settings
          ref={props.settingsTrigger}
          type="button"
          onClick={() => props.onNavigate('settings')}
        >
          设置
        </button>
      </header>

      {props.activeProject ? <ProjectContext {...props} /> : null}

      <div className="react-shell-grid" data-nav-open={props.navOpen}>
        <nav className="react-primary-nav" aria-label="一级导航">
          {props.navigation.map((item) => (
            <button
              aria-current={item.current ? 'page' : undefined}
              className="react-primary-nav__item"
              data-command-id={`navigation.${item.id}`}
              data-current={item.current}
              data-open-canon={item.id === 'canon' ? '' : undefined}
              data-open-planning={item.id === 'planning' ? '' : undefined}
              data-primary-navigation={item.id}
              disabled={item.disabled}
              key={item.id}
              title={item.disabledReason ?? undefined}
              type="button"
              onClick={() => props.onNavigate(item.id)}
            >
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </button>
          ))}
        </nav>
        {props.navOpen ? (
          <button
            aria-label="关闭一级导航"
            className="react-nav-scrim"
            type="button"
            onClick={() => props.onNavOpenChange(false)}
          />
        ) : null}

        <main className="react-main" ref={props.mainContent}>
          {props.globalStatus ? (
            <SafetyBanner
              action={props.globalStatusAction}
              diagnosticId={
                props.globalStatus.id === 'failure' ? (props.failure?.diagnosticId ?? null) : null
              }
              kind={
                props.globalStatus.id === 'failure' || props.globalStatus.id === 'core'
                  ? 'danger'
                  : props.globalStatus.priority === 'P0' || props.globalStatus.priority === 'P2'
                    ? 'warning'
                    : 'info'
              }
              message={props.globalStatus.message}
              title={
                props.globalStatus.id === 'failure'
                  ? (props.failure?.title ?? '操作失败')
                  : props.globalStatus.priority === 'P0'
                    ? '保护状态'
                    : '工作区状态'
              }
            />
          ) : null}
          {props.helpOpen ? (
            <ContextHelp
              disclosureMode={props.disclosureMode}
              route={props.route}
              seenTips={props.settings.onboardingTipsSeen}
              onClose={() => {
                props.onHelpOpenChange(false);
                window.requestAnimationFrame(() => props.helpTrigger.current?.focus());
              }}
              onDismissTip={(tip) =>
                void props.onSaveSettings({
                  onboardingTipsSeen: [...new Set([...props.settings.onboardingTipsSeen, tip])],
                })
              }
              onOpenOnboarding={props.onOpenOnboarding}
            />
          ) : null}
          {props.children}
        </main>
      </div>

      <TaskBar
        foregroundTaskId={props.foregroundTaskId}
        tasks={props.tasks}
        onCancel={(taskId, projectId) => void props.onCancelTask(taskId, projectId)}
      />
    </div>
  );
}

function ProjectContext(props: AppShellLayoutProps) {
  const project = props.activeProject;
  if (!project) return null;
  return (
    <section className="react-project-context" data-active-project data-react-project-context>
      <div>
        <strong data-active-project-name>{project.name}</strong>
        <span data-active-project-path title={project.workspacePath}>
          {project.workspacePath}
        </span>
      </div>
      <span data-active-project-mode>
        {project.databaseMode === 'read-only' ? '只读兼容模式' : '可写 · 本地数据库'}
      </span>
      {project.databaseMode === 'read-only' ? (
        <span data-active-project-readonly>{project.readOnlyReason ?? '兼容性保护'}</span>
      ) : null}
      {props.message ? (
        <span data-project-operation-status role="status">
          {props.message}
        </span>
      ) : null}
      <div className="react-project-context__actions">
        {[
          ['continuity', '连续性账本', '当前作品处于恢复保护状态，连续性账本暂不可读取。'],
          ['narrative', '伏笔与弧光', '当前作品处于恢复保护状态，伏笔与弧光暂不可读取。'],
          ['proposals', '智能审阅', '当前作品处于恢复保护状态，智能审阅暂不可读取。'],
        ].map(([section, label, title]) => (
          <button
            className="quiet-button"
            data-open-continuity={section === 'continuity' ? '' : undefined}
            data-open-narrative-planning={section === 'narrative' ? '' : undefined}
            data-open-state-proposals={section === 'proposals' ? '' : undefined}
            disabled={!props.capabilities.project.canonReadable || Boolean(props.pendingKey)}
            key={section}
            title={props.capabilities.project.canonReadable ? undefined : title}
            type="button"
            onClick={() =>
              props.onOpenCanonSection(section as 'continuity' | 'narrative' | 'proposals')
            }
          >
            {label}
          </button>
        ))}
        <button
          className="quiet-button"
          data-open-recovery
          disabled={
            (!props.capabilities.project.restoreAvailable &&
              !props.capabilities.project.exportAvailable) ||
            Boolean(props.pendingKey)
          }
          type="button"
          onClick={() => props.onOpenDataToolsSection('recovery')}
        >
          恢复与导出
        </button>
        <button
          className="quiet-button"
          data-open-text-io
          disabled={!props.capabilities.project.exportAvailable || Boolean(props.pendingKey)}
          title={
            props.capabilities.project.exportAvailable ? undefined : '当前作品无法安全导入或导出。'
          }
          type="button"
          onClick={() => props.onOpenDataToolsSection('import-export')}
        >
          导入导出
        </button>
        <button
          className="quiet-button"
          data-move-project
          disabled={!props.capabilities.project.moveAvailable || Boolean(props.pendingKey)}
          type="button"
          onClick={() => void props.onMoveProject(project.projectId)}
        >
          移动项目
        </button>
        <button
          className="quiet-button"
          data-close-project
          disabled={Boolean(props.pendingKey)}
          type="button"
          onClick={() => void props.onCloseProject(project.projectId)}
        >
          关闭项目
        </button>
      </div>
    </section>
  );
}
