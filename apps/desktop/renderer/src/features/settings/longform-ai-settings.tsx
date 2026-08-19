import { useEffect, useMemo, useState, type FormEvent } from 'react';

import type {
  LongformAiSettings,
  ProjectStructure,
  ProjectWorkspaceSummary,
  ProviderSummary,
  StoryDigest,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import { useUnsavedChangesGuard } from '../../runtime/unsaved-changes.js';

const TASK_TYPES = [
  'skeleton',
  'chapter',
  'rewrite',
  'merge',
  'validate',
  'state_extract',
  'idea_explore',
] as const;

type TaskType = (typeof TASK_TYPES)[number];
type StyleProfile = LongformAiSettings['styleProfiles'][number];

export interface LongformAiSettingsPanelProps {
  readonly bridge: RendererBridgeAdapter;
  readonly project: ProjectWorkspaceSummary;
  readonly providers: readonly ProviderSummary[];
  readonly readOnly: boolean;
}

export function LongformAiSettingsPanel({
  bridge,
  project,
  providers,
  readOnly,
}: LongformAiSettingsPanelProps) {
  const [settings, setSettings] = useState<LongformAiSettings | null>(null);
  const [digests, setDigests] = useState<readonly StoryDigest[]>([]);
  const [structure, setStructure] = useState<ProjectStructure | null>(null);
  const [pending, setPending] = useState<string | null>('load');
  const [message, setMessage] = useState('正在读取这部作品的长篇创作设置…');
  const [profileName, setProfileName] = useState('');
  const [profileInstructions, setProfileInstructions] = useState('');
  const { dirty, markDirty, clearDirty } = useUnsavedChangesGuard('长篇创作设置');

  useEffect(() => {
    const controller = new AbortController();
    clearDirty();
    setSettings(null);
    setDigests([]);
    setStructure(null);
    setPending('load');
    setMessage('正在读取这部作品的长篇创作设置…');
    void Promise.all([
      bridge.longformAi.getSettings(project.projectId, {
        mode: 'replace',
        laneKey: `longform-settings:${project.projectId}`,
        signal: controller.signal,
      }),
      bridge.longformAi.listDigests(
        { projectId: project.projectId, limit: 500 },
        {
          mode: 'replace',
          laneKey: `longform-digests:${project.projectId}`,
          signal: controller.signal,
        },
      ),
      bridge.planning.listStructure(project.projectId, {
        mode: 'replace',
        laneKey: `longform-structure:${project.projectId}`,
        signal: controller.signal,
      }),
    ]).then(([settingsOutcome, digestOutcome, structureOutcome]) => {
      if (controller.signal.aborted) return;
      if (settingsOutcome.state === 'success') setSettings(settingsOutcome.data);
      if (digestOutcome.state === 'success') setDigests(digestOutcome.data.digests);
      if (structureOutcome.state === 'success') setStructure(structureOutcome.data);
      const failure = [settingsOutcome, digestOutcome, structureOutcome].find(
        (outcome) => outcome.state === 'failure',
      );
      setPending(null);
      setMessage(
        failure?.state === 'failure'
          ? `部分内容读取失败 · ${authorErrorSummary(failure.error)}`
          : '长篇记忆、文风和任务分配已读取。',
      );
    });
    return () => controller.abort();
  }, [bridge, clearDirty, project.projectId]);

  const finalVersionIds = useMemo(
    () =>
      (structure?.volumes ?? [])
        .flatMap((volume) => volume.chapters)
        .map((chapter) => chapter.finalVersionId)
        .filter((versionId): versionId is string => versionId !== null)
        .slice(-12),
    [structure],
  );
  const credentialProviders = providers.filter((provider) => provider.credentialConfigured);

  const saveSettings = async (): Promise<void> => {
    if (!settings || readOnly) return;
    setPending('save');
    setMessage('正在保存长篇创作设置…');
    const outcome = await bridge.longformAi.updateSettings(
      {
        projectId: project.projectId,
        authority: 'author',
        expectedUpdatedAt: settings.updatedAt,
        settings: {
          schemaVersion: 1,
          activeStyleProfileId: settings.activeStyleProfileId,
          styleProfiles: settings.styleProfiles,
          taskRoutes: settings.taskRoutes,
        },
      },
      { mode: 'reject', requestKey: `longform-settings-save:${project.projectId}` },
    );
    setPending(null);
    if (outcome.state === 'success') {
      setSettings(outcome.data);
      if (!profileName.trim() && !profileInstructions.trim()) clearDirty();
      setMessage('长篇记忆、文风和智能任务分配已保存。');
    } else if (outcome.state === 'failure') {
      setMessage(`保存失败 · ${authorErrorSummary(outcome.error)}`);
    }
  };

  const rebuildMemory = async (): Promise<void> => {
    if (readOnly) return;
    setPending('rebuild');
    setMessage('正在根据已定稿正文重建长篇记忆…');
    const outcome = await bridge.longformAi.rebuildDigests(
      { projectId: project.projectId, scopeType: 'project', scopeId: project.projectId },
      { mode: 'reject', requestKey: `longform-rebuild:${project.projectId}` },
    );
    if (outcome.state === 'success') {
      const digestOutcome = await bridge.longformAi.listDigests(
        { projectId: project.projectId, limit: 500 },
        {
          mode: 'replace',
          laneKey: `longform-digests:${project.projectId}`,
        },
      );
      setPending(null);
      if (digestOutcome.state === 'success') {
        setDigests(digestOutcome.data.digests);
        setMessage(
          `长篇记忆已更新，共整理 ${outcome.data.rebuilt.length} 项；${outcome.data.skippedUnfinalizedChapters} 章尚未定稿，未纳入记忆。`,
        );
      } else if (digestOutcome.state === 'failure') {
        setMessage(`长篇记忆已更新，但列表刷新失败 · ${authorErrorSummary(digestOutcome.error)}`);
      }
    } else if (outcome.state === 'failure') {
      setPending(null);
      setMessage(`长篇记忆重建失败 · ${authorErrorSummary(outcome.error)}`);
    }
  };

  const addManualProfile = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!settings || !profileName.trim()) return;
    const instructions = instructionLines(profileInstructions);
    if (!instructions.length) {
      setMessage('请至少填写一条可执行的文风说明。');
      return;
    }
    const profile = createProfile({
      name: profileName.trim(),
      origin: 'manual',
      instructions,
      sampleVersionIds: [],
    });
    markDirty();
    setSettings({
      ...settings,
      activeStyleProfileId: settings.activeStyleProfileId ?? profile.id,
      styleProfiles: [...settings.styleProfiles, profile],
    });
    setProfileName('');
    setProfileInstructions('');
    setMessage('手动文风档案已加入草稿，请保存设置。');
  };

  const addPresetProfile = (): void => {
    if (!settings) return;
    const profile = createProfile({
      name: '克制叙事',
      origin: 'preset',
      instructions: [
        '减少空泛形容，优先使用动作与可观察细节。',
        '对话保持短句，避免替人物解释情绪。',
      ],
      sampleVersionIds: [],
    });
    markDirty();
    setSettings({
      ...settings,
      activeStyleProfileId: profile.id,
      styleProfiles: [...settings.styleProfiles, profile],
    });
    setMessage('“克制叙事”已设为当前文风，请保存设置。');
  };

  const addLearnedProfile = (): void => {
    if (!settings) return;
    if (finalVersionIds.length < 2) {
      setMessage('至少需要两份定稿，才能从正文学习稳定文风。');
      return;
    }
    const profile = createProfile({
      name: `正文学习 · ${new Date().toLocaleDateString('zh-CN')}`,
      origin: 'learned',
      instructions: ['延续已定稿正文的句段长度、对白密度与叙述节奏。'],
      sampleVersionIds: finalVersionIds,
    });
    markDirty();
    setSettings({
      ...settings,
      activeStyleProfileId: profile.id,
      styleProfiles: [...settings.styleProfiles, profile],
    });
    setMessage(`已选取最近 ${finalVersionIds.length} 份定稿作为学习样本，请保存设置。`);
  };

  const evaluateRecentStyle = async (): Promise<void> => {
    if (!settings?.activeStyleProfileId || !finalVersionIds.length) return;
    setPending('evaluate');
    const outcome = await bridge.longformAi.evaluateStyle(
      {
        projectId: project.projectId,
        profileId: settings.activeStyleProfileId,
        versionId: finalVersionIds.at(-1)!,
      },
      { mode: 'replace', laneKey: `longform-style-check:${project.projectId}` },
    );
    setPending(null);
    if (outcome.state === 'success') {
      setMessage(
        outcome.data.status === 'within_profile'
          ? '最近定稿与当前文风档案保持一致。'
          : outcome.data.status === 'deviated'
            ? `最近定稿有 ${outcome.data.deviations.length} 项明显偏离；这是提醒，不会阻止保存或定稿。`
            : '当前档案没有足够正文样本，暂时无法判断偏离。',
      );
    } else if (outcome.state === 'failure') {
      setMessage(`文风检查失败 · ${authorErrorSummary(outcome.error)}`);
    }
  };

  const updateTaskRoute = (
    taskType: TaskType,
    patch: Partial<LongformAiSettings['taskRoutes'][number]>,
  ): void => {
    if (!settings) return;
    const current = settings.taskRoutes.find((route) => route.taskType === taskType) ?? {
      taskType,
      primaryProviderId: null,
      fallbackProviderIds: [],
      minimumSupport: 'verified' as const,
    };
    const next = { ...current, ...patch };
    markDirty();
    setSettings({
      ...settings,
      taskRoutes: [...settings.taskRoutes.filter((route) => route.taskType !== taskType), next],
    });
  };

  const memoryCounts = memorySummary(digests);

  return (
    <section
      className="react-settings-form longform-ai-settings"
      data-settings-section="longform"
      data-unsaved={dirty ? 'true' : 'false'}
    >
      <header>
        <h2>长篇创作</h2>
        <p>
          为“{project.name}
          ”整理已定稿正文的长期记忆，并按任务选择已有智能连接。正文、人物和设定仍是最终依据。
        </p>
      </header>
      {readOnly ? (
        <p className="react-safety-banner">当前作品为只读模式，只能查看这些设置。</p>
      ) : null}
      <p aria-live="polite" className="react-operation-message" role="status">
        {message}
      </p>

      <section className="longform-ai-card" aria-labelledby="longform-memory-title">
        <div className="longform-ai-card__heading">
          <div>
            <h3 id="longform-memory-title">长篇记忆</h3>
            <p>
              已整理 {memoryCounts.chapters} 章、{memoryCounts.volumes} 卷
              {memoryCounts.project ? '和全书脉络' : ''}；有 {memoryCounts.stale} 项等待更新。
            </p>
          </div>
          <button
            className="quiet-button"
            data-rebuild-longform-memory
            disabled={readOnly || pending !== null}
            type="button"
            onClick={() => void rebuildMemory()}
          >
            {pending === 'rebuild' ? '正在重建…' : '根据定稿重建'}
          </button>
        </div>
        {digests.length ? (
          <ul className="longform-memory-list">
            {digests.slice(0, 12).map((digest) => (
              <li key={digest.id}>
                <span>
                  <strong>{memoryScopeLabel(digest.scopeType)}</strong>
                  <small>
                    {digest.sourceVersionIds.length} 个定稿来源 · {friendlyDate(digest.updatedAt)}
                  </small>
                </span>
                <em data-freshness={digest.freshness}>
                  {digest.freshness === 'fresh' ? '已更新' : '待更新'}
                </em>
                <details>
                  <summary>查看记忆内容与来源说明</summary>
                  <p>{digest.content || '当前范围没有可整理的正文。'}</p>
                  <small>本地根据定稿正文整理；生成时仍会回查正式人物、设定和连续性资料。</small>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p className="longform-ai-empty">尚无长篇记忆。章节定稿后会自动整理，也可手动重建。</p>
        )}
      </section>

      <section className="longform-ai-card" aria-labelledby="longform-style-title">
        <div className="longform-ai-card__heading">
          <div>
            <h3 id="longform-style-title">文风档案</h3>
            <p>文风检查只做提醒，不复制节奏设置，也不会阻止作者保存或定稿。</p>
          </div>
          <button
            className="quiet-button"
            disabled={!settings?.activeStyleProfileId || !finalVersionIds.length || pending !== null}
            type="button"
            onClick={() => void evaluateRecentStyle()}
          >
            检查最近定稿
          </button>
        </div>
        <label>
          <span>当前文风</span>
          <select
            data-active-style-profile
            disabled={!settings || readOnly || pending !== null}
            value={settings?.activeStyleProfileId ?? ''}
            onChange={(event) => {
              if (!settings) return;
              markDirty();
              setSettings({ ...settings, activeStyleProfileId: event.target.value || null });
            }}
          >
            <option value="">不指定</option>
            {settings?.styleProfiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name} · {profileOriginLabel(profile.origin)}
              </option>
            ))}
          </select>
        </label>
        <div className="longform-ai-actions">
          <button
            className="quiet-button"
            disabled={!settings || readOnly || pending !== null}
            type="button"
            onClick={addPresetProfile}
          >
            使用“克制叙事”预设
          </button>
          <button
            className="quiet-button"
            disabled={!settings || readOnly || pending !== null}
            type="button"
            onClick={addLearnedProfile}
          >
            从已定稿正文学习
          </button>
        </div>
        {settings?.styleProfiles.length ? (
          <ul className="longform-style-list">
            {settings.styleProfiles.map((profile) => (
              <li key={profile.id}>
                <span>
                  <strong>{profile.name}</strong>
                  <small>
                    {profileOriginLabel(profile.origin)}
                    {profile.sampleVersionIds.length
                      ? ` · ${profile.sampleVersionIds.length} 个正文样本`
                      : ''}
                  </small>
                </span>
                <p>{profile.instructions.join('；')}</p>
                <button
                  className="text-button"
                  disabled={readOnly || pending !== null}
                  type="button"
                  onClick={() => {
                    markDirty();
                    setSettings({
                      ...settings,
                      activeStyleProfileId:
                        settings.activeStyleProfileId === profile.id
                          ? null
                          : settings.activeStyleProfileId,
                      styleProfiles: settings.styleProfiles.filter(
                        (item) => item.id !== profile.id,
                      ),
                    });
                    setMessage('文风档案已从草稿中移除，请保存设置。');
                  }}
                >
                  移除
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <form className="longform-style-form" onSubmit={addManualProfile}>
          <label>
            <span>新建手动文风档案</span>
            <input
              maxLength={120}
              placeholder="例如：冷峻第三人称"
              value={profileName}
              onChange={(event) => {
                markDirty();
                setProfileName(event.target.value);
              }}
            />
          </label>
          <label>
            <span>写作说明（每行一条）</span>
            <textarea
              maxLength={4000}
              placeholder={'减少解释性心理描写\n冲突场景优先短句'}
              value={profileInstructions}
              onChange={(event) => {
                markDirty();
                setProfileInstructions(event.target.value);
              }}
            />
          </label>
          <button
            className="quiet-button"
            disabled={!settings || readOnly || pending !== null}
            type="submit"
          >
            加入文风档案
          </button>
        </form>
      </section>

      <section className="longform-ai-card" aria-labelledby="longform-routing-title">
        <h3 id="longform-routing-title">智能任务分配</h3>
        <p>只会选择已保存凭据的连接；当前模型不支持本次生成指令时，才按顺序回退。</p>
        {!credentialProviders.length ? (
          <p className="longform-ai-empty">还没有可用连接。请先到“智能连接”保存凭据并完成测试。</p>
        ) : null}
        <div className="longform-route-list">
          {TASK_TYPES.map((taskType) => {
            const route = settings?.taskRoutes.find((item) => item.taskType === taskType);
            return (
              <fieldset key={taskType}>
                <legend>{taskTypeLabel(taskType)}</legend>
                <label>
                  <span>首选连接</span>
                  <select
                    disabled={!settings || readOnly || pending !== null}
                    value={route?.primaryProviderId ?? ''}
                    onChange={(event) =>
                      updateTaskRoute(taskType, {
                        primaryProviderId: event.target.value || null,
                        fallbackProviderIds: (route?.fallbackProviderIds ?? []).filter(
                          (id) => id !== event.target.value,
                        ),
                      })
                    }
                  >
                    <option value="">自动选择</option>
                    {credentialProviders.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name} · {provider.model}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>回退连接</span>
                  <select
                    disabled={!settings || readOnly || pending !== null}
                    value={route?.fallbackProviderIds[0] ?? ''}
                    onChange={(event) =>
                      updateTaskRoute(taskType, {
                        fallbackProviderIds: event.target.value ? [event.target.value] : [],
                      })
                    }
                  >
                    <option value="">不指定</option>
                    {credentialProviders
                      .filter((provider) => provider.id !== route?.primaryProviderId)
                      .map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.name} · {provider.model}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <span>最低适配程度</span>
                  <select
                    disabled={!settings || readOnly || pending !== null}
                    value={route?.minimumSupport ?? 'verified'}
                    onChange={(event) =>
                      updateTaskRoute(taskType, {
                        minimumSupport: event.target.value as 'verified' | 'limited' | 'unverified',
                      })
                    }
                  >
                    <option value="verified">完整适配</option>
                    <option value="limited">允许有限适配</option>
                    <option value="unverified">允许尚未验证</option>
                  </select>
                </label>
              </fieldset>
            );
          })}
        </div>
      </section>

      <footer>
        <button
          className="primary-button"
          data-save-longform-settings
          disabled={!settings || readOnly || pending !== null}
          type="button"
          onClick={() => void saveSettings()}
        >
          {pending === 'save' ? '正在保存…' : '保存长篇创作设置'}
        </button>
      </footer>
    </section>
  );
}

function createProfile(input: {
  readonly name: string;
  readonly origin: StyleProfile['origin'];
  readonly instructions: readonly string[];
  readonly sampleVersionIds: readonly string[];
}): StyleProfile {
  return {
    id: globalThis.crypto.randomUUID(),
    name: input.name,
    origin: input.origin,
    instructions: [...input.instructions],
    sampleVersionIds: [...input.sampleVersionIds],
    targetMetrics: null,
    sceneMappings: [],
  };
}

function instructionLines(value: string): readonly string[] {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 32);
}

function memorySummary(digests: readonly StoryDigest[]) {
  return {
    chapters: digests.filter((digest) => digest.scopeType === 'chapter').length,
    volumes: digests.filter((digest) => digest.scopeType === 'volume').length,
    project: digests.some((digest) => digest.scopeType === 'project'),
    stale: digests.filter((digest) => digest.freshness === 'stale').length,
  };
}

function memoryScopeLabel(scopeType: StoryDigest['scopeType']): string {
  if (scopeType === 'chapter') return '章节记忆';
  if (scopeType === 'volume') return '本卷记忆';
  return '全书记忆';
}

function profileOriginLabel(origin: StyleProfile['origin']): string {
  if (origin === 'learned') return '正文学习';
  if (origin === 'preset') return '内置预设';
  return '手动配置';
}

function taskTypeLabel(taskType: TaskType): string {
  return {
    skeleton: '规划这一章',
    chapter: '生成这一章',
    rewrite: '改写选中内容',
    merge: '融合建议稿',
    validate: '智能检查',
    state_extract: '提取故事状态',
    idea_explore: '探索创作方向',
  }[taskType];
}

function friendlyDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value));
}
