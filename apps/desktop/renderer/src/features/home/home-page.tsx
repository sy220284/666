import { useRef, useState, type FormEvent } from 'react';

import type {
  ProjectCreateInput,
  ProjectWorkspaceSummary,
  RecentProject,
} from '@worldforge/contracts';

import {
  createHomeDashboardModel,
  type HomeHealthSignal,
} from '../../shell/home-dashboard-model.js';
import type { AppDisclosureMode, PrimaryNavigationId } from '../../shell/app-shell-model.js';

export interface HomePageProps {
  readonly disclosureMode: AppDisclosureMode;
  readonly activeProject: ProjectWorkspaceSummary | null;
  readonly recentProjects: readonly RecentProject[];
  readonly healthSignals: readonly HomeHealthSignal[];
  readonly activeTaskCount: number;
  readonly pendingKey: string | null;
  readonly message: string | null;
  readonly onNavigate: (navigation: PrimaryNavigationId) => void;
  readonly onCreate: (input: ProjectCreateInput) => Promise<boolean>;
  readonly onOpenSelected: (recover: boolean) => void;
  readonly onOpenRecent: (projectId: string) => void;
  readonly onRelocateRecent: (projectId: string) => void;
  readonly onRemoveRecent: (projectId: string) => void;
  readonly onCloseProject: (projectId: string) => void;
  readonly onMoveProject: (projectId: string) => void;
  readonly onOpenRecovery: () => void;
}

export function HomePage(props: HomePageProps) {
  const [creating, setCreating] = useState(false);
  const createTrigger = useRef<HTMLButtonElement>(null);
  const closeCreateDialog = (): void => {
    setCreating(false);
    window.requestAnimationFrame(() => createTrigger.current?.focus());
  };
  const model = createHomeDashboardModel({
    disclosureMode: props.disclosureMode,
    continuation: null,
    recentProjects: props.recentProjects,
    healthSignals: props.healthSignals,
    activeTaskCount: props.activeTaskCount,
  });

  return (
    <section className="react-home-page" data-react-home>
      <header className="react-page-header">
        <div>
          <p className="eyebrow">LOCAL FIRST · APPLICATION HOME</p>
          <h1>{props.activeProject ? props.activeProject.name : '继续你的本地写作'}</h1>
          <p>正文、设定、索引和备份保留在本机项目工作区。</p>
        </div>
        <div className="react-page-actions">
          <button
            className="primary-button"
            data-create-project
            data-react-create-project
            disabled={Boolean(props.activeProject) || Boolean(props.pendingKey)}
            ref={createTrigger}
            type="button"
            onClick={() => setCreating(true)}
          >
            新建项目
          </button>
          <button
            className="quiet-button"
            data-react-open-project
            disabled={Boolean(props.activeProject) || Boolean(props.pendingKey)}
            type="button"
            onClick={() => props.onOpenSelected(false)}
          >
            打开项目
          </button>
          <button
            className="quiet-button"
            data-recover-unreadable-project
            disabled={Boolean(props.activeProject) || Boolean(props.pendingKey)}
            type="button"
            onClick={() => props.onOpenSelected(true)}
          >
            恢复损坏项目
          </button>
        </div>
      </header>

      {props.message ? (
        <p className="react-operation-message" role="status" aria-live="polite">
          {props.message}
        </p>
      ) : null}

      {model.prompts.length > 0 ? (
        <div className="react-health-grid" aria-label="项目健康提示">
          {model.prompts.map((prompt) => (
            <article className="react-health-card" data-severity={prompt.severity} key={prompt.id}>
              <strong>{prompt.title}</strong>
              <p>{prompt.message}</p>
            </article>
          ))}
        </div>
      ) : null}

      {props.activeProject ? (
        <ActiveProjectCard
          project={props.activeProject}
          pending={Boolean(props.pendingKey)}
          onNavigate={props.onNavigate}
          onClose={() => props.onCloseProject(props.activeProject?.projectId ?? '')}
          onMove={() => props.onMoveProject(props.activeProject?.projectId ?? '')}
          onOpenRecovery={props.onOpenRecovery}
        />
      ) : null}

      <section className="react-recent-projects" aria-labelledby="react-recent-heading">
        <header>
          <div>
            <h2 id="react-recent-heading">最近项目</h2>
            <p>路径丢失时可以重新定位；移除记录不会删除项目文件。</p>
          </div>
          {model.showDetailedTaskSummary ? <span>活动任务：{model.activeTaskCount}</span> : null}
        </header>
        {model.recentProjects.length === 0 ? (
          <div className="react-empty-state" data-recent-empty>
            <strong>还没有最近项目</strong>
            <p>新建或打开一个本地项目后，它会出现在这里。</p>
          </div>
        ) : (
          <div className="react-recent-list">
            {model.recentProjects.map((project) => (
              <article
                className="react-recent-card"
                data-recent-card
                data-react-recent-card
                data-missing={project.missing}
                data-project-missing={project.missing}
                key={project.projectId}
              >
                <div>
                  <strong>{project.displayName}</strong>
                  <span title={project.workspacePath}>{project.workspacePath}</span>
                  <small>最近打开：{new Date(project.lastOpenedAt).toLocaleString('zh-CN')}</small>
                  {project.missing ? <em>路径已丢失</em> : null}
                </div>
                <div className="react-card-actions">
                  {project.primaryIntent === 'open' ? (
                    <button
                      className="quiet-button"
                      data-open-recent
                      disabled={Boolean(props.activeProject) || Boolean(props.pendingKey)}
                      type="button"
                      onClick={() => props.onOpenRecent(project.projectId)}
                    >
                      打开
                    </button>
                  ) : (
                    <button
                      className="quiet-button"
                      data-relocate-recent
                      disabled={Boolean(props.pendingKey)}
                      type="button"
                      onClick={() => props.onRelocateRecent(project.projectId)}
                    >
                      重新定位
                    </button>
                  )}
                  <button
                    className="quiet-button"
                    data-remove-recent
                    disabled={Boolean(props.pendingKey)}
                    type="button"
                    onClick={() => props.onRemoveRecent(project.projectId)}
                  >
                    移除记录
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {creating ? (
        <CreateProjectDialog
          disclosureMode={props.disclosureMode}
          pending={props.pendingKey === 'project.create'}
          onCancel={closeCreateDialog}
          onCreate={async (input) => {
            const created = await props.onCreate(input);
            if (created) closeCreateDialog();
          }}
        />
      ) : null}
    </section>
  );
}

interface ActiveProjectCardProps {
  readonly project: ProjectWorkspaceSummary;
  readonly pending: boolean;
  readonly onNavigate: (navigation: PrimaryNavigationId) => void;
  readonly onClose: () => void;
  readonly onMove: () => void;
  readonly onOpenRecovery: () => void;
}

function ActiveProjectCard({
  project,
  pending,
  onNavigate,
  onClose,
  onMove,
  onOpenRecovery,
}: ActiveProjectCardProps) {
  const readOnly = project.databaseMode === 'read-only';
  return (
    <article className="react-active-project" data-react-active-project>
      <div>
        <p className="eyebrow">CURRENT WORKSPACE</p>
        <h2>{project.name}</h2>
        <p title={project.workspacePath}>{project.workspacePath}</p>
        <span>{readOnly ? '只读兼容模式' : '可写 · 本地数据库'}</span>
      </div>
      {readOnly ? (
        <p className="react-readonly-notice" role="alert">
          项目以只读方式打开（{project.readOnlyReason ?? '兼容性保护'}
          ）。浏览与安全导出可用，写入和移动已禁用。
        </p>
      ) : null}
      <div className="react-card-actions">
        <button className="primary-button" type="button" onClick={() => onNavigate('writing')}>
          继续写作
        </button>
        <button className="quiet-button" type="button" onClick={() => onNavigate('planning')}>
          作品规划
        </button>
        <button className="quiet-button" type="button" onClick={() => onNavigate('canon')}>
          人物与设定
        </button>
        <button className="quiet-button" type="button" onClick={onOpenRecovery}>
          恢复与导出
        </button>
        <button
          className="quiet-button"
          disabled={readOnly || pending}
          type="button"
          onClick={onMove}
        >
          移动项目
        </button>
        <button className="quiet-button" disabled={pending} type="button" onClick={onClose}>
          关闭项目
        </button>
      </div>
    </article>
  );
}

interface CreateProjectDialogProps {
  readonly disclosureMode: AppDisclosureMode;
  readonly pending: boolean;
  readonly onCancel: () => void;
  readonly onCreate: (input: ProjectCreateInput) => Promise<void>;
}

function CreateProjectDialog({
  disclosureMode,
  pending,
  onCancel,
  onCreate,
}: CreateProjectDialogProps) {
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') ?? '').trim();
    const channel = String(data.get('channel') ?? '').trim();
    const initialStructure = String(data.get('initialStructure') ?? 'starter');
    if (!name || !channel || !['starter', 'blank'].includes(initialStructure)) {
      setError('请填写项目名称和创作频道。');
      return;
    }
    setError(null);
    void onCreate({
      name,
      channel,
      initialStructure: initialStructure as 'starter' | 'blank',
    });
  };

  return (
    <div className="react-dialog-backdrop" data-create-project-dialog data-react-project-dialog>
      <section
        className="react-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-title"
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }}
      >
        <header>
          <h2 id="create-title">新建本地项目</h2>
          <p>选择保存位置后，Core将原子创建工作空间、项目数据库和初始写作结构。</p>
        </header>
        <form onSubmit={submit}>
          <label>
            <span>项目名称</span>
            <input autoFocus data-project-name maxLength={240} name="name" required />
          </label>
          <label>
            <span>创作频道</span>
            <input
              data-project-channel
              defaultValue="未分类"
              maxLength={120}
              name="channel"
              required
            />
          </label>
          <label>
            <span>初始结构</span>
            <select
              defaultValue={disclosureMode === 'professional' ? 'blank' : 'starter'}
              data-project-initial-structure
              name="initialStructure"
            >
              <option value="starter">首卷、第一章与活动Draft</option>
              <option value="blank">空白项目</option>
            </select>
          </label>
          {error ? <p className="react-field-error">{error}</p> : null}
          <footer>
            <button className="quiet-button" disabled={pending} type="button" onClick={onCancel}>
              取消
            </button>
            <button
              className="primary-button"
              data-confirm-create-project
              disabled={pending}
              type="submit"
            >
              {pending ? '正在创建…' : '选择位置并创建'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
