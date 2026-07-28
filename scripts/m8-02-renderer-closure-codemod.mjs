import { readFile, rm, writeFile } from 'node:fs/promises';

async function read(path) {
  return readFile(path, 'utf8');
}

async function write(path, content) {
  await writeFile(path, content, 'utf8');
}

function replaceExact(content, before, after, label) {
  const count = content.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, received ${count}`);
  return content.replace(before, after);
}

await write(
  'apps/desktop/renderer/src/runtime/ai-readiness.ts',
  `import type { ProviderSummary } from '@worldforge/contracts';

export type AiReadinessStatus = 'ready' | 'not-configured' | 'not-verified';

export interface AiReadiness {
  readonly status: AiReadinessStatus;
  readonly providerId: string | null;
  readonly message: string;
}

export function resolveAiReadiness(
  providers: readonly ProviderSummary[],
  verifiedProviderIds: ReadonlySet<string>,
): AiReadiness {
  const verified = providers.find((provider) => verifiedProviderIds.has(provider.id));
  if (verified) {
    return {
      status: 'ready',
      providerId: verified.id,
      message: \`“\${verified.name}”已在当前会话完成连接验证。\`,
    };
  }
  if (providers.length === 0) {
    return {
      status: 'not-configured',
      providerId: null,
      message: '尚未配置AI服务；自主写作和全部离线功能保持可用。',
    };
  }
  return {
    status: 'not-verified',
    providerId: null,
    message: '已有AI配置，但本次会话尚未完成真实连接测试。',
  };
}
`,
);

await write(
  'apps/desktop/renderer/src/runtime/workspace-attention.ts',
  `import type { SearchIndexStatus } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../bridge/renderer-bridge-adapter.js';
import type { BridgeRequestOutcome } from '../bridge/request-lifecycle.js';

export type WorkspaceAttentionSource = 'candidate' | 'proposal' | 'validation' | 'search';

export interface WorkspaceAttention {
  readonly pendingCandidateCount: number;
  readonly partialCandidateCount: number;
  readonly pendingProposalCount: number;
  readonly openValidationCount: number;
  readonly highValidationCount: number;
  readonly searchStatus: SearchIndexStatus | 'unknown';
  readonly searchFailedCount: number;
  readonly unavailableSources: readonly WorkspaceAttentionSource[];
}

export const EMPTY_WORKSPACE_ATTENTION: WorkspaceAttention = {
  pendingCandidateCount: 0,
  partialCandidateCount: 0,
  pendingProposalCount: 0,
  openValidationCount: 0,
  highValidationCount: 0,
  searchStatus: 'unknown',
  searchFailedCount: 0,
  unavailableSources: [],
};

interface WorkspaceAttentionInput {
  readonly candidates: readonly {
    readonly status: string;
    readonly completeness: string;
  }[];
  readonly proposals: readonly { readonly status: string }[];
  readonly validationIssues: readonly {
    readonly status: string;
    readonly severity: string;
  }[];
  readonly searchState: {
    readonly status: SearchIndexStatus;
    readonly failedCount: number;
  } | null;
  readonly unavailableSources?: readonly WorkspaceAttentionSource[];
}

export function summarizeWorkspaceAttention(input: WorkspaceAttentionInput): WorkspaceAttention {
  const pendingCandidates = input.candidates.filter((candidate) => candidate.status === 'pending');
  const openIssues = input.validationIssues.filter((issue) => issue.status === 'open');
  return {
    pendingCandidateCount: pendingCandidates.length,
    partialCandidateCount: pendingCandidates.filter(
      (candidate) => candidate.completeness === 'partial',
    ).length,
    pendingProposalCount: input.proposals.filter((proposal) => proposal.status === 'pending').length,
    openValidationCount: openIssues.length,
    highValidationCount: openIssues.filter((issue) => issue.severity === 'high').length,
    searchStatus: input.searchState?.status ?? 'unknown',
    searchFailedCount: input.searchState?.failedCount ?? 0,
    unavailableSources: input.unavailableSources ?? [],
  };
}

async function guarded<Data>(
  run: () => Promise<BridgeRequestOutcome<Data>>,
): Promise<BridgeRequestOutcome<Data> | null> {
  try {
    return await run();
  } catch {
    return null;
  }
}

export async function loadWorkspaceAttention(
  bridge: RendererBridgeAdapter,
  projectId: string,
  chapterId: string | null,
): Promise<WorkspaceAttention> {
  const [candidateOutcome, proposalOutcome, validationOutcome, searchOutcome] = await Promise.all([
    chapterId
      ? guarded(() => bridge.candidate.list(projectId, chapterId, { mode: 'replace' }))
      : Promise.resolve(null),
    guarded(() =>
      bridge.stateProposal.list(
        { projectId, chapterId: null, includeResolved: false },
        { mode: 'replace' },
      ),
    ),
    guarded(() =>
      bridge.validation.list(
        { projectId, chapterId: null, includeClosed: false },
        { mode: 'replace' },
      ),
    ),
    guarded(() => bridge.searchTools.getIndexState({ projectId }, { mode: 'replace' })),
  ]);

  const unavailableSources: WorkspaceAttentionSource[] = [];
  if (chapterId && candidateOutcome?.state !== 'success') unavailableSources.push('candidate');
  if (proposalOutcome?.state !== 'success') unavailableSources.push('proposal');
  if (validationOutcome?.state !== 'success') unavailableSources.push('validation');
  if (searchOutcome?.state !== 'success') unavailableSources.push('search');

  return summarizeWorkspaceAttention({
    candidates: candidateOutcome?.state === 'success' ? candidateOutcome.data.candidates : [],
    proposals: proposalOutcome?.state === 'success' ? proposalOutcome.data.proposals : [],
    validationIssues: validationOutcome?.state === 'success' ? validationOutcome.data.issues : [],
    searchState: searchOutcome?.state === 'success' ? searchOutcome.data : null,
    unavailableSources,
  });
}
`,
);

await write(
  'tests/unit/ai-readiness.test.ts',
  `import { describe, expect, it } from 'vitest';

import type { ProviderSummary } from '@worldforge/contracts';

import { resolveAiReadiness } from '../../apps/desktop/renderer/src/runtime/ai-readiness.js';

const provider = {
  id: 'local',
  name: '本地模型',
  protocol: 'openai_compatible',
  baseUrl: 'http://127.0.0.1:11434/v1',
  model: 'writer',
  timeoutMs: 30_000,
  options: {},
  credentialConfigured: false,
  endpoint: {
    scope: 'loopback',
    origin: 'http://127.0.0.1:11434',
    secureTransport: false,
    warnings: [],
  },
  createdAt: '2026-07-28T00:00:00.000Z',
  updatedAt: '2026-07-28T00:00:00.000Z',
} satisfies ProviderSummary;

describe('AI readiness', () => {
  it('keeps AI-first unavailable until a configured provider passes a real session test', () => {
    expect(resolveAiReadiness([], new Set()).status).toBe('not-configured');
    expect(resolveAiReadiness([provider], new Set()).status).toBe('not-verified');
    expect(resolveAiReadiness([provider], new Set(['local']))).toMatchObject({
      status: 'ready',
      providerId: 'local',
    });
  });

  it('does not trust a verification marker for a removed provider', () => {
    expect(resolveAiReadiness([], new Set(['local'])).status).toBe('not-configured');
  });
});
`,
);

await write(
  'tests/unit/workspace-attention.test.ts',
  `import { describe, expect, it } from 'vitest';

import { summarizeWorkspaceAttention } from '../../apps/desktop/renderer/src/runtime/workspace-attention.js';

describe('workspace attention summary', () => {
  it('derives pending author decisions from authoritative domain snapshots', () => {
    expect(
      summarizeWorkspaceAttention({
        candidates: [
          { status: 'pending', completeness: 'partial' },
          { status: 'pending', completeness: 'complete' },
          { status: 'accepted', completeness: 'complete' },
        ],
        proposals: [{ status: 'pending' }, { status: 'accepted' }],
        validationIssues: [
          { status: 'open', severity: 'high' },
          { status: 'open', severity: 'low' },
          { status: 'resolved', severity: 'high' },
        ],
        searchState: { status: 'stale', failedCount: 2 },
      }),
    ).toEqual({
      pendingCandidateCount: 2,
      partialCandidateCount: 1,
      pendingProposalCount: 1,
      openValidationCount: 2,
      highValidationCount: 1,
      searchStatus: 'stale',
      searchFailedCount: 2,
      unavailableSources: [],
    });
  });

  it('keeps unavailable domains explicit instead of treating them as successful empty results', () => {
    expect(
      summarizeWorkspaceAttention({
        candidates: [],
        proposals: [],
        validationIssues: [],
        searchState: null,
        unavailableSources: ['proposal', 'search'],
      }).unavailableSources,
    ).toEqual(['proposal', 'search']);
  });
});
`,
);

let providerSettings = await read(
  'apps/desktop/renderer/src/features/settings/provider-settings.tsx',
);
providerSettings = replaceExact(
  providerSettings,
  `export interface ProviderSettingsProps {
  readonly bridge: RendererBridgeAdapter;
}`,
  `export interface ProviderSettingsProps {
  readonly bridge: RendererBridgeAdapter;
  readonly onProvidersChanged: (providers: readonly ProviderSummary[]) => void;
  readonly onProviderConnectionVerified: (result: ProviderConnectionTestResult) => void;
  readonly onProviderInvalidated: (providerId: string) => void;
}`,
  'provider props',
);
providerSettings = replaceExact(
  providerSettings,
  `export function ProviderSettings({ bridge }: ProviderSettingsProps) {`,
  `export function ProviderSettings({
  bridge,
  onProvidersChanged,
  onProviderConnectionVerified,
  onProviderInvalidated,
}: ProviderSettingsProps) {`,
  'provider destructuring',
);
providerSettings = replaceExact(
  providerSettings,
  `      setProviders(outcome.data.providers);
      setMessage(`,
  `      setProviders(outcome.data.providers);
      onProvidersChanged(outcome.data.providers);
      setMessage(`,
  'provider refresh callback',
);
providerSettings = replaceExact(
  providerSettings,
  `    if (outcome.state === 'success') {
      setDraft({`,
  `    if (outcome.state === 'success') {
      onProviderInvalidated(outcome.data.id);
      setDraft({`,
  'provider save invalidation',
);
providerSettings = replaceExact(
  providerSettings,
  `    if (outcome.state === 'success') {
      if (draft.id === provider.id) reset();`,
  `    if (outcome.state === 'success') {
      onProviderInvalidated(provider.id);
      if (draft.id === provider.id) reset();`,
  'provider remove invalidation',
);
providerSettings = replaceExact(
  providerSettings,
  `    if (outcome.state === 'success') {
      setTestResult(outcome.data);
      setMessage(\`连接成功：\${outcome.data.actualModel}，\${outcome.data.latencyMs}ms。\`);`,
  `    if (outcome.state === 'success') {
      setTestResult(outcome.data);
      onProviderConnectionVerified(outcome.data);
      setMessage(\`连接成功：\${outcome.data.actualModel}，\${outcome.data.latencyMs}ms。\`);`,
  'provider verification callback',
);
await write('apps/desktop/renderer/src/features/settings/provider-settings.tsx', providerSettings);

let settingsPage = await read('apps/desktop/renderer/src/features/settings/settings-page.tsx');
settingsPage = replaceExact(
  settingsPage,
  `  DiagnosticPreview,
} from '@worldforge/contracts';`,
  `  DiagnosticPreview,
  type ProviderConnectionTestResult,
  type ProviderSummary,
} from '@worldforge/contracts';`,
  'settings imports',
);
settingsPage = replaceExact(
  settingsPage,
  `  readonly onOpenOnboarding: () => void;
}`,
  `  readonly onOpenOnboarding: () => void;
  readonly aiReady: boolean;
  readonly onProvidersChanged: (providers: readonly ProviderSummary[]) => void;
  readonly onProviderConnectionVerified: (result: ProviderConnectionTestResult) => void;
  readonly onProviderInvalidated: (providerId: string) => void;
}`,
  'settings props',
);
settingsPage = replaceExact(
  settingsPage,
  `          {section === 'providers' ? <ProviderSettings bridge={props.bridge} /> : null}`,
  `          {section === 'providers' ? (
            <ProviderSettings
              bridge={props.bridge}
              onProviderConnectionVerified={props.onProviderConnectionVerified}
              onProviderInvalidated={props.onProviderInvalidated}
              onProvidersChanged={props.onProvidersChanged}
            />
          ) : null}`,
  'provider settings wiring',
);
settingsPage = replaceExact(
  settingsPage,
  `          <option value="ai-first">AI优先</option>
        </select>
        <small>只调整推荐入口和说明；项目数据、命令与安全边界保持一致。</small>`,
  `          <option disabled={!props.aiReady} value="ai-first">
            AI优先{props.aiReady ? '' : '（请先完成连接测试）'}
          </option>
        </select>
        <small>
          {props.aiReady
            ? '当前会话已有Provider通过真实连接测试；只调整推荐入口和说明。'
            : 'AI未验证不影响自主创作、搜索、备份、导入导出或恢复。'}
        </small>`,
  'AI path setting',
);
await write('apps/desktop/renderer/src/features/settings/settings-page.tsx', settingsPage);

let appShell = await read('apps/desktop/renderer/src/app/app-shell-m3.tsx');
appShell = replaceExact(
  appShell,
  `  type ProjectWorkspaceSummary,
  type RecentProject,
  type TaskSnapshot,`,
  `  type ProjectWorkspaceSummary,
  type ProviderConnectionTestResult,
  type ProviderSummary,
  type RecentProject,
  type TaskSnapshot,`,
  'app shell contract imports',
);
appShell = replaceExact(
  appShell,
  `import { RendererStatusArbitrator } from '../runtime/status-arbitrator.js';`,
  `import { resolveAiReadiness } from '../runtime/ai-readiness.js';
import { RendererStatusArbitrator } from '../runtime/status-arbitrator.js';
import {
  EMPTY_WORKSPACE_ATTENTION,
  loadWorkspaceAttention,
  type WorkspaceAttention,
} from '../runtime/workspace-attention.js';`,
  'app shell runtime imports',
);
appShell = replaceExact(
  appShell,
  `  const [tasks, setTasks] = useState<readonly TaskSnapshot[]>([]);
  const [providerAvailable, setProviderAvailable] = useState(false);`,
  `  const [tasks, setTasks] = useState<readonly TaskSnapshot[]>([]);
  const [providers, setProviders] = useState<readonly ProviderSummary[]>([]);
  const [verifiedProviderIds, setVerifiedProviderIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [workspaceAttention, setWorkspaceAttention] = useState<WorkspaceAttention>(
    EMPTY_WORKSPACE_ATTENTION,
  );`,
  'app shell states',
);
appShell = replaceExact(
  appShell,
  `  const writingPanel: WritingPanel =
    route === 'versions' ? 'versions' : route === 'candidates' ? 'candidates' : 'editor';

  const refreshTasks = useCallback`,
  `  const writingPanel: WritingPanel =
    route === 'versions' ? 'versions' : route === 'candidates' ? 'candidates' : 'editor';
  const aiReadiness = useMemo(
    () => resolveAiReadiness(providers, verifiedProviderIds),
    [providers, verifiedProviderIds],
  );

  const applyProviders = useCallback((nextProviders: readonly ProviderSummary[]): void => {
    setProviders(nextProviders);
    const currentIds = new Set(nextProviders.map((provider) => provider.id));
    setVerifiedProviderIds(
      (current) => new Set([...current].filter((providerId) => currentIds.has(providerId))),
    );
  }, []);

  const refreshTasks = useCallback`,
  'AI readiness setup',
);
appShell = replaceExact(
  appShell,
  `    if (activeTasks.state === 'success') setTasks(activeTasks.data.tasks);
    if (providers.state === 'success') setProviderAvailable(providers.data.providers.length > 0);`,
  `    if (activeTasks.state === 'success') setTasks(activeTasks.data.tasks);
    if (providers.state === 'success') applyProviders(providers.data.providers);`,
  'provider refresh readiness',
);
appShell = replaceExact(
  appShell,
  `  }, [bridge, dispatch]);`,
  `  }, [applyProviders, bridge, dispatch]);`,
  'refresh workspace dependencies',
);
appShell = replaceExact(
  appShell,
  `  useEffect(() => {
    const unsubscribe = bridge.task.subscribe(() => void refreshTasks());
    return unsubscribe;
  }, [bridge, refreshTasks]);

  useEffect(() => {
    document.body.dataset.theme = settings.themeId;`,
  `  useEffect(() => {
    const unsubscribe = bridge.task.subscribe(() => void refreshTasks());
    return unsubscribe;
  }, [bridge, refreshTasks]);

  const refreshWorkspaceAttention = useCallback(async (): Promise<void> => {
    if (!activeProject) {
      setWorkspaceAttention(EMPTY_WORKSPACE_ATTENTION);
      return;
    }
    const next = await loadWorkspaceAttention(
      bridge,
      activeProject.projectId,
      continuation?.chapterId ?? null,
    );
    setWorkspaceAttention(next);
  }, [activeProject, bridge, continuation?.chapterId]);

  useEffect(() => {
    void refreshWorkspaceAttention();
  }, [refreshWorkspaceAttention, route, tasks]);

  useEffect(() => {
    document.body.dataset.theme = settings.themeId;`,
  'workspace attention refresh',
);
appShell = replaceExact(
  appShell,
  `  const saveSettings = (update: AppSettingsUpdate): Promise<boolean> => {
    const write = settingsWriteQueue.current.then(async () => {`,
  `  const saveSettings = (update: AppSettingsUpdate): Promise<boolean> => {
    if (update.creativePath === 'ai-first' && aiReadiness.status !== 'ready') {
      setMessage('AI优先需要先在本次会话完成真实连接测试；离线创作功能保持可用。');
      return Promise.resolve(false);
    }
    const write = settingsWriteQueue.current.then(async () => {`,
  'AI setting guard',
);
appShell = replaceExact(
  appShell,
  `    if (tasks.length > 0) {
      arbitrator.publish({
        id: 'tasks',
        priority: 'P1',
        message: \`\${tasks.length}个后台任务正在运行，可在底部任务栏查看真实阶段或取消。\`,
        persistence: 'transient',
        createdAt: 2,
      });
    }
    const missing = recentProjects.filter((project) => project.missingSince !== null).length;`,
  `    if (tasks.length > 0) {
      arbitrator.publish({
        id: 'tasks',
        priority: 'P1',
        message: \`\${tasks.length}个后台任务正在运行，可在底部任务栏查看真实阶段或取消。\`,
        persistence: 'transient',
        createdAt: 70,
      });
    }
    if (workspaceAttention.searchStatus === 'rebuilding') {
      arbitrator.publish({
        id: 'search-rebuilding',
        priority: 'P1',
        message: '全文索引正在重建；写作保持可用，搜索结果将在完成后恢复完整。',
        persistence: 'transient',
        createdAt: 69,
      });
    }
    if (workspaceAttention.partialCandidateCount > 0) {
      arbitrator.publish({
        id: 'candidate-partial',
        priority: 'P2',
        message: \`当前章节有\${workspaceAttention.partialCandidateCount}份中断候选待处理，不能直接定稿。\`,
        persistence: 'sticky',
        createdAt: 60,
      });
    } else if (workspaceAttention.pendingCandidateCount > 0) {
      arbitrator.publish({
        id: 'candidate-pending',
        priority: 'P2',
        message: \`当前章节有\${workspaceAttention.pendingCandidateCount}份候选待作者审阅。\`,
        persistence: 'sticky',
        createdAt: 59,
      });
    }
    if (workspaceAttention.pendingProposalCount > 0) {
      arbitrator.publish({
        id: 'proposal-pending',
        priority: 'P2',
        message: \`有\${workspaceAttention.pendingProposalCount}条状态提案等待作者裁决；尚未写入权威状态。\`,
        persistence: 'sticky',
        createdAt: 58,
      });
    }
    if (workspaceAttention.openValidationCount > 0) {
      arbitrator.publish({
        id: 'validation-open',
        priority: 'P2',
        message: workspaceAttention.highValidationCount
          ? \`有\${workspaceAttention.openValidationCount}项校验问题待处理，其中\${workspaceAttention.highValidationCount}项为高优先级。\`
          : \`有\${workspaceAttention.openValidationCount}项校验问题待处理。\`,
        persistence: 'sticky',
        createdAt: 57,
      });
    }
    if (workspaceAttention.searchFailedCount > 0) {
      arbitrator.publish({
        id: 'search-failed',
        priority: 'P2',
        message: \`全文索引有\${workspaceAttention.searchFailedCount}项失败；权威数据未受影响，可重建索引。\`,
        persistence: 'sticky',
        createdAt: 56,
      });
    } else if (workspaceAttention.searchStatus === 'stale') {
      arbitrator.publish({
        id: 'search-stale',
        priority: 'P2',
        message: '全文索引已过期；搜索可降级读取权威数据，建议重建索引。',
        persistence: 'sticky',
        createdAt: 55,
      });
    }
    if (settings.creativePath === 'ai-first' && aiReadiness.status !== 'ready') {
      arbitrator.publish({
        id: 'ai-readiness',
        priority: 'P2',
        message: aiReadiness.message,
        persistence: 'sticky',
        createdAt: 54,
      });
    }
    if (workspaceAttention.unavailableSources.length > 0) {
      arbitrator.publish({
        id: 'attention-unavailable',
        priority: 'P3',
        message: '部分工作区状态暂不可读取；未将失败查询误报为空状态。',
        persistence: 'transient',
        createdAt: 10,
      });
    }
    const missing = recentProjects.filter((project) => project.missingSince !== null).length;`,
  'business status arbitration',
);
appShell = replaceExact(
  appShell,
  `        createdAt: 1,`,
  `        createdAt: 53,`,
  'missing status order',
);
appShell = replaceExact(
  appShell,
  `  }, [activeProject, coreStatus, failure, message, recentProjects, tasks]);

  const createProject`,
  `  }, [
    activeProject,
    aiReadiness,
    coreStatus,
    failure,
    message,
    recentProjects,
    settings.creativePath,
    tasks,
    workspaceAttention,
  ]);

  const globalStatusAction = useMemo(() => {
    if (!globalStatus) return undefined;
    if (globalStatus.id === 'failure' && failure?.retryable) {
      return { label: '重新读取', run: () => void refreshWorkspace() };
    }
    if (globalStatus.id === 'read-only') {
      return { label: '恢复与导出', run: () => void transitionToRoute('recovery') };
    }
    if (globalStatus.id === 'missing') {
      return { label: '查看最近项目', run: () => navigate('home') };
    }
    if (globalStatus.id === 'candidate-partial' || globalStatus.id === 'candidate-pending') {
      return { label: '审阅候选', run: () => void transitionToRoute('candidates') };
    }
    if (globalStatus.id === 'proposal-pending') {
      return {
        label: '裁决提案',
        run: () => {
          setCanonSection('continuity');
          void transitionToRoute('canon');
        },
      };
    }
    if (
      globalStatus.id === 'validation-open' ||
      globalStatus.id === 'search-failed' ||
      globalStatus.id === 'search-stale'
    ) {
      return { label: '打开检查', run: () => void transitionToRoute('checks') };
    }
    if (globalStatus.id === 'ai-readiness') {
      return { label: '检查AI连接', run: () => navigate('settings') };
    }
    return undefined;
  }, [failure, globalStatus, navigate, refreshWorkspace, transitionToRoute]);

  const createProject`,
  'status actions',
);
appShell = replaceExact(
  appShell,
  `              action={
                globalStatus.id === 'failure' && failure?.retryable
                  ? { label: '重新读取', run: () => void refreshWorkspace() }
                  : globalStatus.id === 'read-only'
                    ? { label: '恢复与导出', run: () => void transitionToRoute('recovery') }
                    : globalStatus.id === 'missing'
                      ? { label: '查看最近项目', run: () => navigate('home') }
                      : undefined
              }`,
  `              action={globalStatusAction}`,
  'safety banner action',
);
appShell = replaceExact(
  appShell,
  `              providerAvailable={providerAvailable}`,
  `              providerAvailable={aiReadiness.status === 'ready'}`,
  'home AI readiness',
);
appShell = replaceExact(
  appShell,
  `              settings={settings}
              onClose={() => {`,
  `              settings={settings}
              aiReady={aiReadiness.status === 'ready'}
              onProvidersChanged={applyProviders}
              onProviderConnectionVerified={(result: ProviderConnectionTestResult) => {
                setVerifiedProviderIds((current) => new Set([...current, result.providerId]));
              }}
              onProviderInvalidated={(providerId) => {
                setVerifiedProviderIds((current) => {
                  const next = new Set(current);
                  next.delete(providerId);
                  return next;
                });
              }}
              onClose={() => {`,
  'settings readiness props',
);
appShell = replaceExact(
  appShell,
  `              onStatus={setMessage}`,
  `              onStatus={(nextMessage) => {
                setMessage(nextMessage);
                void refreshWorkspaceAttention();
              }}`,
  'writing status refresh',
);
await write('apps/desktop/renderer/src/app/app-shell-m3.tsx', appShell);

await rm('scripts/m8-02-renderer-closure-codemod.mjs');
await rm('.github/workflows/m8-02-renderer-closure-codemod.yml');
