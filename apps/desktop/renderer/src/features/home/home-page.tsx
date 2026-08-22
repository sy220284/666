import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

import {
  type AppSettings,
  type AppSettingsUpdate,
  type CreativePath,
  type ProjectCreateInput,
  type ProjectContinuationSnapshot,
  type ProjectWorkspaceSummary,
  type RecentProject,
} from '@worldforge/contracts';

import {
  createHomeDashboardModel,
  type HomeHealthSignal,
} from '../../shell/home-dashboard-model.js';
import type { ProjectCapabilities } from '../../runtime/capability-matrix.js';
import type { AppDisclosureMode, PrimaryNavigationId } from '../../shell/app-shell-model.js';
import type { AuthorNavigationTarget } from '../../shell/navigation-target.js';

export interface HomePageProps {
  readonly disclosureMode: AppDisclosureMode;
  readonly activeProject: ProjectWorkspaceSummary | null;
  readonly continuation: ProjectContinuationSnapshot | null;
  readonly recentProjects: readonly RecentProject[];
  readonly healthSignals: readonly HomeHealthSignal[];
  readonly activeTaskCount: number;
  readonly pendingKey: string | null;
  readonly message: string | null;
  readonly settings: AppSettings;
  readonly providerAvailable: boolean;
  readonly projectCapabilities: ProjectCapabilities;
  readonly onboardingRequest: number;
  readonly onNavigate: (navigation: PrimaryNavigationId) => void;
  readonly onCreate: (plan: OnboardingProjectPlan) => Promise<boolean>;
  readonly onSaveSettings: (update: AppSettingsUpdate) => Promise<boolean>;
  readonly onContinue: () => void;
  readonly onWritingAction?: (target: AuthorNavigationTarget) => void;
  readonly onOpenSelected: (recover: boolean) => void;
  readonly onOpenRecent: (projectId: string) => void;
  readonly onRelocateRecent: (projectId: string) => void;
  readonly onRemoveRecent: (projectId: string) => void;
  readonly onCloseProject: (projectId: string) => void;
  readonly onMoveProject: (projectId: string) => void;
  readonly onOpenRecovery: () => void;
}

export interface OnboardingProjectPlan {
  readonly project: ProjectCreateInput;
  readonly creativePath: CreativePath;
  readonly destination: 'writing' | 'planning' | 'import-export';
}

type OnboardingEntry = 'quick' | 'complete' | 'import' | 'blank';

export function HomePage(props: HomePageProps) {
  const [creating, setCreating] = useState(false);
  const [entry, setEntry] = useState<OnboardingEntry>('quick');
  const createTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (props.onboardingRequest <= 0) return;
    setEntry('complete');
    setCreating(true);
  }, [props.onboardingRequest]);
  const closeCreateDialog = (): void => {
    setCreating(false);
    window.requestAnimationFrame(() => createTrigger.current?.focus());
  };
  const model = createHomeDashboardModel({
    disclosureMode: props.disclosureMode,
    continuation:
      props.activeProject && props.continuation?.status === 'ready'
        ? {
            projectId: props.activeProject.projectId,
            projectName: props.activeProject.name,
            chapterId: props.continuation.chapterId,
            chapterTitle: props.continuation.chapterTitle,
          }
        : null,
    recentProjects: props.recentProjects,
    healthSignals: props.healthSignals,
    activeTaskCount: props.activeTaskCount,
  });

  return (
    <section className="react-home-page" data-react-home>
      <header className="react-page-header">
        <div>
          <p className="eyebrow">本地写作首页</p>
          <h1>{props.activeProject ? props.activeProject.name : '继续你的本地写作'}</h1>
          <p>正文、设定、索引和备份均保留在本机作品目录。</p>
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
            新建作品
          </button>
          <button
            className="quiet-button"
            data-react-open-project
            disabled={Boolean(props.activeProject) || Boolean(props.pendingKey)}
            type="button"
            onClick={() => props.onOpenSelected(false)}
          >
            打开作品
          </button>
          <button
            className="quiet-button"
            data-recover-unreadable-project
            disabled={Boolean(props.activeProject) || Boolean(props.pendingKey)}
            type="button"
            onClick={() => props.onOpenSelected(true)}
          >
            恢复受损作品
          </button>
        </div>
      </header>

      {props.message ? (
        <p className="react-operation-message" role="status" aria-live="polite">
          {props.message}
        </p>
      ) : null}

      {model.prompts.length > 0 ? (
        <div className="react-health-grid" aria-label="作品状态提示">
          {model.prompts.map((prompt) => (
            <article className="react-health-card" data-severity={prompt.severity} key={prompt.id}>
              <strong>{prompt.title}</strong>
              <p>{prompt.message}</p>
            </article>
          ))}
        </div>
      ) : null}

      {props.activeProject ? (
        <>
          {props.settings.onboardingCompleted && !props.settings.onboardingScaffoldDismissed ? (
            <aside className="react-onboarding-scaffold" aria-label="下一步建议">
              <div>
                <strong>下一步建议</strong>
                <p>可先补充作品规划和人物边界，也可以直接继续正文；作品功能不会受影响。</p>
              </div>
              <button
                className="quiet-button"
                type="button"
                onClick={() => void props.onSaveSettings({ onboardingScaffoldDismissed: true })}
              >
                知道了
              </button>
            </aside>
          ) : null}
          <ActiveProjectCard
            project={props.activeProject}
            continuation={props.continuation}
            creativePath={props.settings.creativePath}
            pending={Boolean(props.pendingKey)}
            projectCapabilities={props.projectCapabilities}
            providerAvailable={props.providerAvailable}
            onContinue={props.onContinue}
            onNavigate={props.onNavigate}
            {...(props.onWritingAction ? { onWritingAction: props.onWritingAction } : {})}
            onClose={() => props.onCloseProject(props.activeProject?.projectId ?? '')}
            onMove={() => props.onMoveProject(props.activeProject?.projectId ?? '')}
            onOpenRecovery={props.onOpenRecovery}
            onSaveSettings={props.onSaveSettings}
          />
        </>
      ) : (
        <section className="react-onboarding-entry" aria-labelledby="onboarding-entry-title">
          <header>
            <h2 id="onboarding-entry-title">选择开始方式</h2>
            <p>四种入口共用同一套本地作品与安全边界，之后可以随时调整创作方式。</p>
          </header>
          <div className="react-onboarding-entry__grid">
            {onboardingEntries.map((item) => (
              <button
                className="react-onboarding-entry__card"
                data-onboarding-entry={item.id}
                key={item.id}
                type="button"
                onClick={() => {
                  setEntry(item.id);
                  setCreating(true);
                }}
              >
                <strong>{item.title}</strong>
                <span>{item.description}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="react-recent-projects" aria-labelledby="react-recent-heading">
        <header>
          <div>
            <h2 id="react-recent-heading">最近作品</h2>
            <p>路径丢失时可以重新定位；移除记录不会删除作品文件。</p>
          </div>
          {model.showDetailedTaskSummary ? <span>活动任务：{model.activeTaskCount}</span> : null}
        </header>
        {model.recentProjects.length === 0 ? (
          <div className="react-empty-state" data-recent-empty>
            <strong>还没有最近作品</strong>
            <p>新建或打开一部本地作品后，它会出现在这里。</p>
          </div>
        ) : (
          <div className="react-recent-list">
            {model.recentProjects.map((project, index) => (
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
                      onClick={() =>
                        index === 0 ? props.onContinue() : props.onOpenRecent(project.projectId)
                      }
                    >
                      {index === 0 ? '继续写作' : '打开'}
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

      {creating
        ? createPortal(
            <CreateProjectDialog
              disclosureMode={props.disclosureMode}
              entry={entry}
              pending={props.pendingKey === 'project.create'}
              providerAvailable={props.providerAvailable}
              onCancel={closeCreateDialog}
              onCreate={async (plan) => {
                const created = await props.onCreate(plan);
                if (created) closeCreateDialog();
              }}
              onEntryChange={setEntry}
            />,
            document.body,
          )
        : null}
    </section>
  );
}

interface ActiveProjectCardProps {
  readonly project: ProjectWorkspaceSummary;
  readonly continuation: ProjectContinuationSnapshot | null;
  readonly pending: boolean;
  readonly creativePath: CreativePath;
  readonly providerAvailable: boolean;
  readonly projectCapabilities: ProjectCapabilities;
  readonly onContinue: () => void;
  readonly onNavigate: (navigation: PrimaryNavigationId) => void;
  readonly onWritingAction?: (target: AuthorNavigationTarget) => void;
  readonly onClose: () => void;
  readonly onMove: () => void;
  readonly onOpenRecovery: () => void;
  readonly onSaveSettings: (update: AppSettingsUpdate) => Promise<boolean>;
}

function ActiveProjectCard({
  project,
  continuation,
  pending,
  creativePath,
  providerAvailable,
  projectCapabilities,
  onContinue,
  onNavigate,
  onWritingAction,
  onClose,
  onMove,
  onOpenRecovery,
  onSaveSettings,
}: ActiveProjectCardProps) {
  const readOnly = project.databaseMode === 'read-only';
  const intelligentActionAvailable = providerAvailable && Boolean(onWritingAction);
  const primaryLabel =
    creativePath === 'ai-first' && intelligentActionAvailable
      ? '生成本章建议稿'
      : creativePath === 'hybrid'
        ? intelligentActionAvailable
          ? '规划本章并协作'
          : '先规划本章'
        : '继续写作';
  const runPrimaryAction = (): void => {
    if (creativePath === 'hybrid') {
      if (!intelligentActionAvailable) {
        onNavigate('planning');
        return;
      }
      onWritingAction?.({
        type: 'writing-action',
        projectId: project.projectId,
        generationMode: 'skeleton',
      });
      return;
    }
    if (creativePath === 'ai-first' && intelligentActionAvailable) {
      onWritingAction?.({
        type: 'writing-action',
        projectId: project.projectId,
        generationMode: 'chapter',
      });
      return;
    }
    onContinue();
  };
  const recommendations =
    creativePath === 'ai-first'
      ? (['canon', 'planning'] as const)
      : (['planning', 'canon'] as const);
  return (
    <article className="react-active-project" data-react-active-project>
      <div>
        <p className="eyebrow">当前作品</p>
        <h2>{project.name}</h2>
        <p title={project.workspacePath}>{project.workspacePath}</p>
        <span>{readOnly ? '只读保护' : '可以写作 · 本地保存'}</span>
        {continuation?.status === 'ready' ? (
          <p data-continuation-summary>上次写到：{continuation.chapterTitle}</p>
        ) : continuation?.status === 'stale' ? (
          <p data-continuation-stale>上次位置已变化，将打开首个可用章节。</p>
        ) : null}
      </div>
      {readOnly ? (
        <p className="react-readonly-notice" role="alert">
          作品以只读方式打开（{project.readOnlyReason ?? '兼容性保护'}
          ）。浏览与安全导出可用，写入和移动已禁用。
        </p>
      ) : null}
      <label className="react-inline-setting">
        <span>创作路径</span>
        <select
          aria-describedby="creative-path-note"
          disabled={pending}
          value={creativePath}
          onChange={(event) =>
            void onSaveSettings({ creativePath: event.target.value as CreativePath })
          }
        >
          <option value="autonomous">自主创作</option>
          <option value="hybrid">人机协作</option>
          <option disabled={!providerAvailable} value="ai-first">
            智能优先{providerAvailable ? '' : '（需先配置智能连接）'}
          </option>
        </select>
        <small id="creative-path-note">
          {creativePath === 'autonomous'
            ? '先继续正文，需要时再查看作品规划和人物设定。'
            : creativePath === 'hybrid'
              ? '先确定本章规划，再由你决定是否生成和采用建议稿。'
              : '先生成本章建议稿，再由你审阅、修改并决定是否采用。'}
        </small>
      </label>
      <div className="react-card-actions">
        <button
          className="primary-button"
          data-continue-writing={creativePath === 'autonomous' ? '' : undefined}
          data-creative-path-primary={creativePath}
          disabled={!projectCapabilities.draftReadable || pending}
          title={
            projectCapabilities.draftReadable
              ? undefined
              : '当前作品仅允许恢复与安全导出，正文暂不可读取。'
          }
          type="button"
          onClick={runPrimaryAction}
        >
          {primaryLabel}
        </button>
        {creativePath !== 'autonomous' ? (
          <button
            className="quiet-button"
            data-continue-writing
            disabled={!projectCapabilities.draftReadable || pending}
            type="button"
            onClick={onContinue}
          >
            继续写作
          </button>
        ) : null}
        {recommendations.map((navigation) => (
          <button
            className="quiet-button"
            data-creative-path-recommendation={navigation}
            disabled={
              navigation === 'planning'
                ? !projectCapabilities.structureReadable || pending
                : !projectCapabilities.canonReadable || pending
            }
            key={navigation}
            type="button"
            onClick={() => onNavigate(navigation)}
          >
            {navigation === 'planning' ? '作品规划' : '人物与设定'}
          </button>
        ))}
        <button
          className="quiet-button"
          disabled={
            (!projectCapabilities.restoreAvailable && !projectCapabilities.exportAvailable) ||
            pending
          }
          type="button"
          onClick={onOpenRecovery}
        >
          恢复中心
        </button>
        <button
          className="quiet-button"
          disabled={!projectCapabilities.moveAvailable || pending}
          type="button"
          onClick={onMove}
        >
          移动作品目录
        </button>
        <button className="quiet-button" disabled={pending} type="button" onClick={onClose}>
          关闭作品
        </button>
      </div>
    </article>
  );
}

interface CreateProjectDialogProps {
  readonly disclosureMode: AppDisclosureMode;
  readonly entry: OnboardingEntry;
  readonly pending: boolean;
  readonly providerAvailable: boolean;
  readonly onCancel: () => void;
  readonly onCreate: (plan: OnboardingProjectPlan) => Promise<void>;
  readonly onEntryChange: (entry: OnboardingEntry) => void;
}

function CreateProjectDialog({
  disclosureMode,
  entry,
  pending,
  providerAvailable,
  onCancel,
  onCreate,
  onEntryChange,
}: CreateProjectDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') ?? '').trim();
    const channel = String(data.get('channel') ?? '').trim() || '未指定';
    const initialStructure =
      entry === 'blank' ? 'blank' : String(data.get('initialStructure') ?? 'starter');
    if (!name || !channel || !['starter', 'blank'].includes(initialStructure)) {
      setError('请填写作品名称。');
      return;
    }
    const creativePath = String(data.get('creativePath') ?? 'autonomous') as CreativePath;
    if (creativePath === 'ai-first' && !providerAvailable) {
      setError('智能优先需要先配置智能连接；自主创作和人机协作可直接使用。');
      return;
    }
    setError(null);
    const concept = field(data, 'concept');
    const readingPromise = field(data, 'readingPromise');
    const protagonistGoal = field(data, 'protagonistGoal');
    const coreConflict = field(data, 'coreConflict');
    const endingIntent = field(data, 'endingIntent');
    const required = lines(field(data, 'required'));
    const forbidden = lines(field(data, 'forbidden'));
    const protagonistName = field(data, 'protagonistName');
    const chapterTitle = field(data, 'chapterTitle');
    const sceneGoals = lines(field(data, 'sceneGoals')).slice(0, 20);
    const brief = [
      concept,
      readingPromise,
      protagonistGoal,
      coreConflict,
      endingIntent,
      ...required,
      ...forbidden,
    ].some(Boolean)
      ? {
          concept,
          readingPromise,
          protagonistGoal,
          coreConflict,
          endingIntent,
          required,
          forbidden,
        }
      : null;
    void onCreate({
      project: {
        name,
        channel,
        initialStructure: initialStructure as 'starter' | 'blank',
        onboarding:
          entry === 'blank'
            ? undefined
            : {
                brief,
                protagonist: protagonistName
                  ? {
                      name: protagonistName,
                      identity: field(data, 'protagonistIdentity'),
                      goal: protagonistGoal,
                      boundary: field(data, 'protagonistBoundary'),
                    }
                  : null,
                firstChapter: chapterTitle
                  ? {
                      title: chapterTitle,
                      targetWordMin: optionalNumber(data, 'targetWordMin'),
                      targetWordMax: optionalNumber(data, 'targetWordMax'),
                    }
                  : null,
                sceneGoals,
              },
      },
      creativePath,
      destination:
        entry === 'import' ? 'import-export' : entry === 'complete' ? 'planning' : 'writing',
    });
  };

  return (
    <div className="react-dialog-backdrop" data-create-project-dialog data-react-project-dialog>
      <section
        className="react-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-title"
        aria-describedby="create-description"
        onKeyDown={(event) => handleDialogKeyDown(event, dialogRef.current, onCancel)}
      >
        <header>
          <h2 id="create-title">{entryTitle(entry)}</h2>
          <p id="create-description">
            选择保存位置后，应用会一次完成作品创建和必要准备；取消不会留下半成品。
          </p>
        </header>
        <nav className="react-onboarding-tabs" aria-label="开始方式">
          {onboardingEntries.map((item) => (
            <button
              aria-current={entry === item.id ? 'step' : undefined}
              className="quiet-button"
              data-onboarding-dialog-entry={item.id}
              key={item.id}
              type="button"
              onClick={() => onEntryChange(item.id)}
            >
              {item.title}
            </button>
          ))}
        </nav>
        <form key={entry} onSubmit={submit}>
          <fieldset>
            <legend>{entry === 'complete' ? '1. 作品基础' : '作品基础'}</legend>
            <label>
              <span>作品名称</span>
              <input autoFocus data-project-name maxLength={240} name="name" required />
            </label>
            {entry !== 'quick' ? (
              <>
                <label>
                  <span>创作频道（可跳过）</span>
                  <input
                    data-project-channel
                    defaultValue="未指定"
                    maxLength={120}
                    name="channel"
                  />
                </label>
                <label>
                  <span>初始结构</span>
                  <select
                    defaultValue={
                      entry === 'blank' || disclosureMode === 'professional' ? 'blank' : 'starter'
                    }
                    data-project-initial-structure
                    disabled={entry === 'blank'}
                    name="initialStructure"
                  >
                    <option value="starter">首卷、第一章与当前稿</option>
                    <option value="blank">空白作品</option>
                  </select>
                </label>
              </>
            ) : null}
          </fieldset>
          {entry === 'import' ? (
            <p className="react-dialog-note">
              创建安全作品目录后进入导入预览；只有确认预览才会写入稿件内容。
            </p>
          ) : null}
          {entry !== 'blank' && entry !== 'quick' ? (
            <>
              <fieldset>
                <legend>
                  {entry === 'complete' ? '2. 故事核心（均可跳过）' : '故事起点（可跳过）'}
                </legend>
                <label>
                  <span>这个故事大概讲什么？</span>
                  <textarea name="concept" maxLength={4000} />
                </label>
                <label>
                  <span>主角现在最想得到什么？</span>
                  <textarea name="protagonistGoal" maxLength={4000} />
                </label>
                {entry === 'complete' ? (
                  <>
                    <label>
                      <span>希望读者持续期待什么？</span>
                      <textarea name="readingPromise" maxLength={4000} />
                    </label>
                    <label>
                      <span>核心冲突</span>
                      <textarea name="coreConflict" maxLength={4000} />
                    </label>
                    <label>
                      <span>终局方向</span>
                      <textarea name="endingIntent" maxLength={4000} />
                    </label>
                    <label>
                      <span>必须兑现（每行一条）</span>
                      <textarea name="required" />
                    </label>
                    <label>
                      <span>禁止事项（每行一条）</span>
                      <textarea name="forbidden" />
                    </label>
                  </>
                ) : null}
              </fieldset>
              {entry === 'complete' ? (
                <fieldset>
                  <legend>3. 关键人物（可跳过）</legend>
                  <label>
                    <span>姓名</span>
                    <input name="protagonistName" maxLength={240} />
                  </label>
                  <label>
                    <span>身份</span>
                    <input name="protagonistIdentity" maxLength={500} />
                  </label>
                  <label>
                    <span>不能突破的边界</span>
                    <input name="protagonistBoundary" maxLength={500} />
                  </label>
                </fieldset>
              ) : null}
              <fieldset>
                <legend>{entry === 'complete' ? '4. 第一章（可跳过）' : '第一章（可跳过）'}</legend>
                <label>
                  <span>章节标题</span>
                  <input name="chapterTitle" maxLength={240} />
                </label>
                {entry === 'complete' ? (
                  <div className="react-inline-fields">
                    <label>
                      <span>最低字数</span>
                      <input min={0} max={1000000} name="targetWordMin" type="number" />
                    </label>
                    <label>
                      <span>最高字数</span>
                      <input min={0} max={1000000} name="targetWordMax" type="number" />
                    </label>
                  </div>
                ) : null}
                <label>
                  <span>想先发生什么？（每行一个场景）</span>
                  <textarea name="sceneGoals" />
                </label>
              </fieldset>
            </>
          ) : null}
          {entry === 'complete' ? (
            <fieldset>
              <legend>5. 创作方式</legend>
              <label>
                <span>默认推荐方式</span>
                <select defaultValue="autonomous" name="creativePath">
                  <option value="autonomous">自主创作</option>
                  <option value="hybrid">人机协作</option>
                  <option disabled={!providerAvailable} value="ai-first">
                    智能优先
                  </option>
                </select>
              </label>
              <small>
                {providerAvailable
                  ? '智能功能只在你明确触发后向已配置连接发送必要上下文。'
                  : '尚未配置智能连接；自主创作完整可用，智能优先暂不可选。'}
              </small>
            </fieldset>
          ) : null}
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
              {pending ? '正在创建…' : '选择位置并创建作品'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

const onboardingEntries: readonly {
  readonly id: OnboardingEntry;
  readonly title: string;
  readonly description: string;
}[] = [
  { id: 'quick', title: '快速开始', description: '只填写作品名称，立即进入第一章。' },
  { id: 'complete', title: '完整流程', description: '按五步准备故事、人物与第一章。' },
  { id: 'import', title: '导入已有作品', description: '先建安全工作区，再进入受控导入预览。' },
  { id: 'blank', title: '空白作品', description: '只填名称并选择位置，自由搭建。' },
];

function entryTitle(entry: OnboardingEntry): string {
  return onboardingEntries.find((item) => item.id === entry)?.title ?? '新建本地作品';
}

function field(data: FormData, name: string): string {
  return String(data.get(name) ?? '').trim();
}

function lines(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 100);
}

function optionalNumber(data: FormData, name: string): number | null {
  const value = field(data, name);
  if (!value) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 1_000_000 ? number : null;
}

function handleDialogKeyDown(
  event: KeyboardEvent<HTMLElement>,
  dialog: HTMLElement | null,
  onCancel: () => void,
): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    onCancel();
    return;
  }
  if (event.key !== 'Tab' || !dialog) return;
  const controls = [
    ...dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
    ),
  ].filter((control) => control.tabIndex >= 0);
  const first = controls[0];
  const last = controls.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
