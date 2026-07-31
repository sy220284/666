from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    source = read(path)
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one exact anchor, found {count}: {old[:100]!r}")
    write(path, source.replace(old, new, 1))


def replace_exact_count(path: str, old: str, new: str, expected: int) -> None:
    source = read(path)
    count = source.count(old)
    if count != expected:
        raise RuntimeError(f"{path}: expected {expected} exact anchors, found {count}: {old[:100]!r}")
    write(path, source.replace(old, new))


def regex_once(path: str, pattern: str, replacement: str, flags: int = 0) -> None:
    source = read(path)
    updated, count = re.subn(pattern, replacement, source, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{path}: regex anchor count {count}: {pattern[:120]!r}")
    write(path, updated)


# ---------------------------------------------------------------------------
# M8-09 task governance
# ---------------------------------------------------------------------------

task_card = """# M8-09 V1.0稳定性与数据安全治理

> 状态：In Progress  
> 里程碑：M8 长期维护  
> 优先级：P0  
> 正式分支：`work/m8-09-v1-stability-remediation`

## 目标

修复V1.0代码级复核确认的数据安全、项目生命周期、启动行为、跨作品异步状态、退出恢复、作者错误提示、搜索替换一致性和跨进程异常边界问题。保持数据库Schema、作品格式、AI建议稿边界和本地优先架构不变。

## 必须闭环

1. 章节切换期间旧编辑器不可继续产生未绑定到权威章节的新输入；章节与当前稿在读取成功后原子切换。
2. 最近作品辅助数据库失败不得删除、关闭或回滚已经创建、打开、移动或恢复成功的权威作品目录。
3. `reopen-last`启动设置必须真实执行，并在路径失效或打开失败时安全回到首页。
4. 跨作品工作区状态请求不得把旧作品结果回写到新作品。
5. 退出流程任意异常后必须可重试，不得永久锁死关闭。
6. 正式错误码必须获得中文作者语义；英文技术消息不得进入作者主提示。
7. 批量替换条件变化必须使旧预览失效；搜索初始化失败必须明确显示。
8. Main IPC与Renderer异步异常必须进入统一结构化兜底。

## 非目标

- 不修改Migration或作品数据库Schema。
- 不新增云服务、账号、同步、模型托管或生产依赖。
- 不在稳定性PR中机械拆分巨型组件、重写CSS体系或扩展新的作品检查数据模型。
- 原生对话框整体替换、工作台大型职责拆分和当前稿快速检查作为V1.1维护改造，不阻塞本次V1.0数据安全修复。

## 主要影响范围

- `apps/desktop/renderer/src/`
- `apps/desktop/main/src/`
- `packages/core-service/src/`
- `packages/contracts/src/`
- `tests/unit/`
- `tests/integration/`
- `tests/security/`
- `tests/e2e/`
- `docs/tasks/`
- `docs/product/`
- `docs/testing/`
- `docs/test-evidence/M8-09/`
- `CHANGELOG.md`

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/tasks/TASK_AUTHORIZATION.json`
- `docs/tasks/runtime/M8-08.json`
- `docs/tasks/TASK_INDEX.md`
- `docs/product/V1.0_TRACEABILITY_MATRIX.md`
- `docs/testing/P0_ACCEPTANCE_MATRIX.md`
- `docs/process/CI_PARALLEL_TOOLCHAIN_MULTITASK.md`

## 验证命令

- `pnpm check:language`
- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm test:migration`
- `pnpm test:coverage`
- `pnpm test:security`
- `pnpm test:perf`
- `pnpm test:e2e`
- `pnpm build`
- `pnpm release:check`

## 验收

- P0章节切换和作品目录提交边界具有失败回归测试。
- 最近作品记录故障不再改变权威作品生命周期结果。
- 启动自动重开、跨作品异步隔离和退出重试均可重复验证。
- 所有正式错误码都有作者可理解的中文提示。
- 全部永久质量门通过后才能转为Implemented。
"""
write("docs/tasks/M8/M8-09_V1_STABILITY_REMEDIATION.md", task_card)

runtime = {
    "schemaVersion": 1,
    "id": "M8-09",
    "status": "IN_PROGRESS",
    "source": "docs/tasks/M8/M8-09_V1_STABILITY_REMEDIATION.md",
    "startedAt": "2026-07-31",
    "dependencies": ["M8-08"],
    "releaseBlocking": True,
    "allowedPaths": [
        "apps/desktop/renderer/src/",
        "apps/desktop/main/src/",
        "packages/core-service/src/",
        "packages/contracts/src/",
        "tests/unit/",
        "tests/integration/",
        "tests/security/",
        "tests/e2e/",
        "docs/tasks/",
        "docs/product/",
        "docs/testing/",
        "docs/test-evidence/M8-09/",
        "CHANGELOG.md",
    ],
    "exclusivePaths": [
        "apps/desktop/renderer/src/features/writing/writing-core-workbench.tsx",
        "apps/desktop/renderer/src/app/app-shell-m3.tsx",
        "packages/core-service/src/project-workspace.ts",
    ],
    "forbiddenPaths": [
        "migrations/",
        "docs/test-evidence/M0/",
        "docs/test-evidence/M1/",
        "docs/test-evidence/M2/",
        "docs/test-evidence/M3/",
        "docs/test-evidence/M4-04/",
        "docs/test-evidence/M8-02/",
        "docs/test-evidence/M8-04/",
        "docs/test-evidence/M8-05/",
        "docs/test-evidence/M8-06/",
        "docs/test-evidence/M8-07/",
        "docs/test-evidence/M8-08/",
    ],
    "verification": [
        "pnpm check:language",
        "pnpm format:check",
        "pnpm lint",
        "pnpm typecheck",
        "pnpm test:unit",
        "pnpm test:integration",
        "pnpm test:migration",
        "pnpm test:coverage",
        "pnpm test:security",
        "pnpm test:perf",
        "pnpm test:e2e",
        "pnpm build",
        "pnpm release:check",
    ],
}
write("docs/tasks/runtime/M8-09.json", json.dumps(runtime, ensure_ascii=False, indent=2) + "\n")

index_path = "docs/tasks/TASK_INDEX.md"
index = read(index_path)
index_anchor = "| M8-08 | [`V1.0最终质量治理与封版闭环`](M8/M8-08_V1_FINAL_GOVERNANCE_CLOSURE.md)                             | 开发：M8-06；封版：M8-07     | Verified |\n"
index_row = index_anchor + "| M8-09 | [`V1.0稳定性与数据安全治理`](M8/M8-09_V1_STABILITY_REMEDIATION.md)                                  | M8-08                        | In Progress |\n"
if index.count(index_anchor) != 1:
    raise RuntimeError("TASK_INDEX M8-08 anchor missing")
write(index_path, index.replace(index_anchor, index_row, 1))

# ---------------------------------------------------------------------------
# P0/P1: project workspace authority boundary
# ---------------------------------------------------------------------------

workspace = "packages/core-service/src/project-workspace.ts"
replace_once(workspace, "      let renamed = false;", "      let committed = false;")
replace_once(
    workspace,
    "        await rename(stagingPath, finalPath);\n        renamed = true;",
    "        await rename(stagingPath, finalPath);\n        committed = true;",
)
replace_once(
    workspace,
    "        if (!this.#active) {\n          await rm(renamed ? finalPath : stagingPath, { recursive: true, force: true });\n        }",
    "        if (!this.#active && !committed) {\n          await rm(stagingPath, { recursive: true, force: true });\n        }",
)

registration_block = """        try {
          await this.#recentProjects.register(requestId, {
            projectId: context.summary.projectId,
            workspacePath: context.summary.workspacePath,
            displayName: context.summary.name,
          });
        } catch (error) {
          await this.#closeContext(context);
          throw error;
        }
        this.#active = context;"""
registration_replacement = """        await this.#registerRecentBestEffort(requestId, context.summary);
        this.#active = context;"""
replace_exact_count(workspace, registration_block, registration_replacement, 2)

move_registration = """        try {
          await this.#recentProjects.register(requestId, {
            projectId: moved.summary.projectId,
            workspacePath: moved.summary.workspacePath,
            displayName: moved.summary.name,
          });
        } catch (error) {
          await this.#closeContext(moved);
          throw error;
        }
        this.#active = moved;"""
replace_once(
    workspace,
    move_registration,
    """        await this.#registerRecentBestEffort(requestId, moved.summary);
        this.#active = moved;""",
)

recovered_registration = """        await this.#recentProjects.register(requestId, {
          projectId: context.summary.projectId,
          workspacePath: context.summary.workspacePath,
          displayName: context.summary.name,
        });"""
replace_once(
    workspace,
    recovered_registration,
    "        await this.#registerRecentBestEffort(requestId, context.summary);",
)

restore_registration = """            await this.#recentProjects.register(this.#idFactory(), {
              projectId: restored.summary.projectId,
              workspacePath: restored.summary.workspacePath,
              displayName: restored.summary.name,
            });"""
replace_once(
    workspace,
    restore_registration,
    "            await this.#registerRecentBestEffort(this.#idFactory(), restored.summary);",
)

replace_once(
    workspace,
    "  async shutdown(): Promise<void> {",
    """  async #registerRecentBestEffort(
    requestId: string,
    summary: ProjectWorkspaceSummary,
  ): Promise<void> {
    try {
      await this.#recentProjects.register(requestId, {
        projectId: summary.projectId,
        workspacePath: summary.workspacePath,
        displayName: summary.name,
      });
    } catch {
      process.emitWarning('最近作品记录写入失败；作品数据保持可用。', {
        code: 'WORLDFORGE_RECENT_PROJECT_REGISTER_FAILED',
        detail: summary.projectId,
      });
    }
  }

  async shutdown(): Promise<void> {""",
)

# ---------------------------------------------------------------------------
# P0: atomic chapter session switch
# ---------------------------------------------------------------------------

writing = "apps/desktop/renderer/src/features/writing/writing-core-workbench.tsx"
replace_once(
    writing,
    "  const editorGeneration = useRef(0);",
    "  const editorGeneration = useRef(0);\n  const chapterOpenGeneration = useRef(0);",
)
replace_once(
    writing,
    "      editorGeneration.current += 1;\n      instance?.destroy();",
    "      editorGeneration.current += 1;\n      chapterOpenGeneration.current += 1;\n      instance?.destroy();",
)

open_chapter_pattern = r"  const openChapter = useCallback\(\n    async \(nextChapter: Chapter\): Promise<void> => \{.*?\n  \);\n\n  useEffect\(\(\) => \{\n    if \(initialChapterRequested\.current\) return;"
open_chapter_replacement = """  const openChapter = useCallback(
    async (nextChapter: Chapter): Promise<void> => {
      if (activeChapter.current?.id === nextChapter.id && activeDraft.current) {
        if (panel === 'editor' && !editor.current) mountEditor(activeDraft.current, nextChapter);
        return;
      }
      if (!(await flush())) {
        onStatus('自动保存失败，已阻止切换章节。');
        return;
      }

      const generation = chapterOpenGeneration.current + 1;
      chapterOpenGeneration.current = generation;
      const currentEditor = editor.current;
      if (currentEditor && !readOnly) currentEditor.setEditable(false);
      setStatus('正在从作品数据库读取正文；当前章节已暂时锁定输入。');

      const outcome = await bridge.draft.open(
        { projectId: project.projectId, chapterId: nextChapter.id },
        { mode: 'replace' },
      );
      if (chapterOpenGeneration.current !== generation) return;
      if (outcome.state !== 'success') {
        if (editor.current === currentEditor && currentEditor && !readOnly) {
          currentEditor.setEditable(true);
        }
        setStatus(
          outcome.state === 'failure'
            ? `正文读取失败 · ${authorErrorSummary(outcome.error)}`
            : outcome.state === 'cancelled'
              ? '正文读取已取消，仍停留在原章节。'
              : '正文读取已被更新请求替代。',
          outcome.state === 'failure',
        );
        return;
      }
      mountEditor(outcome.data, nextChapter);
    },
    [bridge, flush, mountEditor, onStatus, panel, project.projectId, readOnly, setStatus],
  );

  useEffect(() => {
    if (initialChapterRequested.current) return;"""
regex_once(writing, open_chapter_pattern, open_chapter_replacement, re.S)

# ---------------------------------------------------------------------------
# P1: startup behavior, cross-project async isolation, renderer error surface
# ---------------------------------------------------------------------------

app_shell = "apps/desktop/renderer/src/app/app-shell-m3.tsx"
replace_once(
    app_shell,
    "  const [dataToolsSection, setDataToolsSection] = useState<DataToolsSection>('recovery');\n\n  const disclosureMode",
    """  const [dataToolsSection, setDataToolsSection] = useState<DataToolsSection>('recovery');

  useEffect(() => {
    const onUnexpectedRendererError = (): void => {
      setFailure({
        title: '界面操作发生意外错误',
        message: '系统已经阻止异常继续扩散，当前作品内容保持不变。请重新执行刚才的操作。',
        retryable: true,
        diagnosticId: null,
      });
      setMessage(null);
    };
    window.addEventListener('worldforge:unexpected-renderer-error', onUnexpectedRendererError);
    return () =>
      window.removeEventListener('worldforge:unexpected-renderer-error', onUnexpectedRendererError);
  }, []);

  const disclosureMode""",
)

refresh_pattern = r"  const refreshWorkspace = useCallback\(async \(\): Promise<void> => \{.*?\n  \}, \[applyProviders, bridge, dispatch\]\);"
refresh_replacement = """  const refreshWorkspace = useCallback(async (): Promise<void> => {
    const [core, applicationSettings, windowPreferences, project, recent, activeTasks, providers] =
      await Promise.all([
        bridge.app.getCoreStatus({ mode: 'replace' }),
        bridge.settings.get({ mode: 'replace' }),
        bridge.app.getWindowPreferences({ mode: 'replace' }),
        bridge.project.getActive({ mode: 'replace' }),
        bridge.project.listRecent({ mode: 'replace' }),
        bridge.task.listActive(undefined, { mode: 'replace' }),
        bridge.providers.list({ mode: 'replace' }),
      ]);

    let nextFailure: FailureView | null = null;
    if (core.state === 'success') setCoreStatus(core.data);
    else nextFailure = failureFromOutcome('本地服务状态读取失败', core);

    const resolvedSettings =
      applicationSettings.state === 'success'
        ? applicationSettings.data.settings
        : DEFAULT_APP_SETTINGS;
    if (applicationSettings.state === 'success') {
      confirmedSettings.current = resolvedSettings;
      setSettings(resolvedSettings);
    } else nextFailure ??= failureFromOutcome('应用设置读取失败', applicationSettings);

    if (windowPreferences.state === 'success') {
      setAppearance({
        workspaceAlignment: windowPreferences.data.workspaceAlignment,
        uiScalePercent: windowPreferences.data.uiScalePercent,
        bodyFontSize: windowPreferences.data.bodyFontSize,
        contentWidth: windowPreferences.data.contentWidth,
      });
    } else nextFailure ??= failureFromOutcome('显示设置读取失败', windowPreferences);

    if (recent.state === 'success') setRecentProjects(recent.data.projects);
    else nextFailure ??= failureFromOutcome('最近作品读取失败', recent);

    let resolvedProject: ProjectWorkspaceSummary | null = null;
    if (project.state === 'success') resolvedProject = project.data;
    else nextFailure ??= failureFromOutcome('项目状态读取失败', project);

    const initialResolution = !initialWorkspaceResolved.current;
    if (
      initialResolution &&
      project.state === 'success' &&
      !resolvedProject &&
      resolvedSettings.startupBehavior === 'reopen-last' &&
      recent.state === 'success'
    ) {
      const candidate = recent.data.projects.find((entry) => entry.missingSince === null);
      if (candidate) {
        const reopened = await bridge.project.openRecent(candidate.projectId, { mode: 'replace' });
        if (reopened.state === 'success') {
          resolvedProject = reopened.data;
        } else if (reopened.state === 'failure') {
          nextFailure ??= failureFromOutcome('最近作品自动打开失败', reopened);
        }
      }
    }

    setActiveProject(resolvedProject);
    let nextContinuation: ProjectContinuationSnapshot | null = null;
    if (resolvedProject) {
      const continuationOutcome = await bridge.project.getContinuation(resolvedProject.projectId, {
        mode: 'replace',
      });
      if (continuationOutcome.state === 'success') {
        nextContinuation = continuationOutcome.data;
      } else if (continuationOutcome.state === 'failure') {
        nextFailure ??= failureFromOutcome('上次写作位置读取失败', continuationOutcome);
      }
    }
    setContinuation(nextContinuation);

    if (initialResolution) {
      initialWorkspaceResolved.current = true;
      const restoredRoute = resolvedProject ? continuationRoute(nextContinuation) : 'home';
      dispatch({
        type: 'navigate',
        route: restoreAppShellRoute(restoredRoute, {
          activeProjectId: resolvedProject?.projectId ?? null,
          disclosureMode: resolvedSettings.defaultMode,
        }),
      });
    }

    if (activeTasks.state === 'success') setTasks(activeTasks.data.tasks);
    if (providers.state === 'success') applyProviders(providers.data.providers);
    setFailure(nextFailure);
    setMessage(null);
    setHydrated(true);
  }, [applyProviders, bridge, dispatch]);"""
regex_once(app_shell, refresh_pattern, refresh_replacement, re.S)

attention_old = """  const refreshWorkspaceAttention = useCallback(async (): Promise<void> => {
    if (!activeProject) {
      setWorkspaceAttention(EMPTY_WORKSPACE_ATTENTION);
      return;
    }
    const next = await loadWorkspaceAttention(bridge, activeProject.projectId);
    setWorkspaceAttention(next);
  }, [activeProject, bridge]);

  useEffect(() => {
    void refreshWorkspaceAttention();
  }, [refreshWorkspaceAttention, route, tasks]);"""
attention_new = """  useEffect(() => {
    let active = true;
    if (!activeProject) {
      setWorkspaceAttention(EMPTY_WORKSPACE_ATTENTION);
      return () => {
        active = false;
      };
    }
    const projectId = activeProject.projectId;
    void loadWorkspaceAttention(bridge, projectId).then((next) => {
      if (active) setWorkspaceAttention(next);
    });
    return () => {
      active = false;
    };
  }, [activeProject, bridge, route, tasks]);"""
replace_once(app_shell, attention_old, attention_new)

# ---------------------------------------------------------------------------
# P1: shutdown lifecycle always resets after recoverable failure
# ---------------------------------------------------------------------------

main_file = "apps/desktop/main/src/electron-main.ts"
shutdown_pattern = r"  const gracefulShutdown = \(\): Promise<void> => \{.*?\n  \};\n\n  mainWindow\.on\('close'"
shutdown_replacement = """  const gracefulShutdown = (): Promise<void> => {
    if (shutdownInFlight) return shutdownInFlight;
    shutdownInFlight = (async () => {
      try {
        if (!(await flushRendererDraft())) {
          await logger.log('error', 'draft.autosave.flush.failed', {
            errorCode: 'DB_WRITE_FAILED_004',
            processStatus: supervisor.getStatus().status,
          });
          mainWindow?.show();
          return;
        }
        await flushWindowPreferences();
        const result = await supervisor.shutdown();
        if (!result.ok) {
          await logger.log('error', 'app.shutdown.blocked', {
            errorCode: result.errorCode ?? 'CORE_SHUTDOWN_FAILED',
            diagnosticId: result.diagnosticId ?? null,
            processStatus: supervisor.getStatus().status,
          });
          mainWindow?.show();
          return;
        }
        allowQuit = true;
        screen.off('display-added', restoreForCurrentDisplays);
        screen.off('display-removed', restoreForCurrentDisplays);
        screen.off('display-metrics-changed', restoreForCurrentDisplays);
        unregisterIpc?.();
        unregisterIpc = null;
        mainWindow?.destroy();
        mainWindow = null;
        app.quit();
      } catch {
        const diagnosticId = createDiagnosticId();
        try {
          await logger.log('error', 'app.shutdown.failed', {
            errorCode: 'COMMON_INTERNAL_999',
            diagnosticId,
            processStatus: supervisor.getStatus().status,
          });
        } catch {
          process.stderr.write(
            `${JSON.stringify({ event: 'app.shutdown.failed', diagnosticId })}\\n`,
          );
        }
        mainWindow?.show();
      } finally {
        if (!allowQuit) shutdownInFlight = null;
      }
    })();
    return shutdownInFlight;
  };

  mainWindow.on('close'"""
regex_once(main_file, shutdown_pattern, shutdown_replacement, re.S)

# ---------------------------------------------------------------------------
# P2: unified IPC guard
# ---------------------------------------------------------------------------

ipc_file = "apps/desktop/main/src/ipc-handlers.ts"
register_old = """    options.ipcMain.handle(channel, handler);
  };"""
register_new = """    options.ipcMain.handle(channel, async (event, input) => {
      try {
        return await handler(event, input);
      } catch {
        const requestId = requestIdFrom(input);
        const diagnosticId = createDiagnosticId();
        await options.logger
          .log('error', 'ipc.handler.failed', {
            operation: channel,
            errorCode: 'COMMON_INTERNAL_999',
            diagnosticId,
          })
          .catch(() => undefined);
        return failure(
          requestId,
          'COMMON_INTERNAL_999',
          '桌面命令执行时发生意外错误。',
          true,
          diagnosticId,
        );
      }
    });
  };"""
replace_once(ipc_file, register_old, register_new)

# ---------------------------------------------------------------------------
# P2: renderer global async diagnostics
# ---------------------------------------------------------------------------

entry = "apps/desktop/renderer/src/react-entry.tsx"
replace_once(
    entry,
    "const rootElement = document.getElementById('react-root');",
    """const publishUnexpectedRendererError = (): void => {
  window.dispatchEvent(new CustomEvent('worldforge:unexpected-renderer-error'));
};

window.addEventListener('unhandledrejection', (event) => {
  event.preventDefault();
  publishUnexpectedRendererError();
});
window.addEventListener('error', publishUnexpectedRendererError);

const rootElement = document.getElementById('react-root');""",
)

# ---------------------------------------------------------------------------
# P2: complete author-facing error coverage and prevent English fallback leaks
# ---------------------------------------------------------------------------

author_error = """export interface AuthorErrorMessage {
  readonly title: string;
  readonly message: string;
  readonly suggestedAction?: string;
}

const SPECIFIC_MESSAGES: Readonly<Record<string, AuthorErrorMessage>> = {
  DRAFT_REVISION_CONFLICT_001: {
    title: '当前稿已经发生变化',
    message: '保存所依据的正文版本已经更新，系统没有覆盖较新的内容。',
    suggestedAction: '请重新打开当前章节，核对新内容后再次保存。',
  },
  DRAFT_BLOCK_HASH_CONFLICT_002: {
    title: '正文内容与预期不一致',
    message: '目标段落在操作期间发生变化，系统已经停止本次修改。',
    suggestedAction: '请重新定位目标段落并再次确认。',
  },
  DRAFT_BLOCK_LOCKED_003: {
    title: '部分正文已经锁定',
    message: '本次操作涉及受保护段落，系统没有修改锁定内容。',
    suggestedAction: '请检查锁定范围，或只处理未锁定内容。',
  },
  VERSION_IMMUTABLE_001: {
    title: '历史版本不可直接修改',
    message: '历史版本用于留档和恢复，系统不会原地改写。',
    suggestedAction: '请恢复为新的当前稿后继续编辑。',
  },
  CANDIDATE_ALREADY_RESOLVED_001: {
    title: '这份建议稿已经处理',
    message: '建议稿已经采用或丢弃，不能重复执行。',
    suggestedAction: '请刷新建议稿列表，继续处理其他内容。',
  },
  CANDIDATE_BASE_CONFLICT_002: {
    title: '建议稿所依据的当前稿已经变化',
    message: '系统检测到生成建议稿后的新修改，因此没有覆盖正文。',
    suggestedAction: '请重新比较当前稿与建议稿后再决定。',
  },
  AI_PROVIDER_NOT_CONFIGURED_001: {
    title: '尚未配置AI连接',
    message: '当前没有可用的AI服务配置，离线写作功能仍可继续使用。',
    suggestedAction: '请在设置中选择服务预设并保存。',
  },
  AI_CREDENTIAL_MISSING_002: {
    title: 'AI服务缺少密钥',
    message: '当前服务需要密钥才能连接。',
    suggestedAction: '请补充密钥并重新测试连接。',
  },
  AI_CONNECTION_FAILED_003: {
    title: '无法连接AI服务',
    message: '模型服务没有响应，离线写作功能仍可继续使用。',
    suggestedAction: '请检查服务是否启动、地址是否正确以及网络是否可用。',
  },
  AI_AUTH_FAILED_004: {
    title: 'AI服务身份验证失败',
    message: '服务拒绝了当前密钥或访问凭据。',
    suggestedAction: '请核对密钥和服务权限后重新测试。',
  },
  AI_RATE_LIMITED_005: {
    title: 'AI服务暂时繁忙',
    message: '服务限制了当前请求频率，正文与本地数据没有受到影响。',
    suggestedAction: '请稍后重试或检查服务配额。',
  },
  AI_REQUEST_TIMEOUT_006: {
    title: 'AI请求等待超时',
    message: '服务未在设定时间内完成响应。',
    suggestedAction: '请检查模型运行状态，或延长等待时间。',
  },
  AI_CONTEXT_OVERFLOW_007: {
    title: '发送给AI的内容过长',
    message: '当前模型无法一次处理这些上下文，正文没有被修改。',
    suggestedAction: '请缩小生成范围或改用支持更长上下文的模型。',
  },
  AI_OUTPUT_INVALID_008: {
    title: 'AI返回内容无法使用',
    message: '服务返回的内容不符合当前操作要求，系统没有写入正文。',
    suggestedAction: '请重试，或更换模型与生成方式。',
  },
  AI_STREAM_INTERRUPTED_009: {
    title: 'AI输出中途断开',
    message: '已经收到的内容仍可作为未完成建议稿保存。',
    suggestedAction: '可保存现有内容后继续生成，或重新发起任务。',
  },
  AI_MODEL_UNSUPPORTED_010: {
    title: '当前模型不支持所需能力',
    message: '该模型无法完成本次生成方式，正文没有被修改。',
    suggestedAction: '请更换模型或选择其他生成方式。',
  },
  AI_ENDPOINT_UNSAFE_013: {
    title: 'AI服务地址不符合安全要求',
    message: '系统已阻止连接不安全或越过本机边界的地址。',
    suggestedAction: '请使用本机地址或有效的HTTPS服务地址。',
  },
  AI_RESPONSE_TOO_LARGE_014: {
    title: 'AI返回内容超过安全上限',
    message: '模型服务返回的数据量过大，系统已经停止接收，正文和本地数据没有被修改。',
    suggestedAction: '请缩小生成范围、降低输出长度，或检查模型服务是否异常。',
  },
};

const DOMAIN_MESSAGES: readonly (readonly [string, AuthorErrorMessage])[] = [
  ['COMMON_', { title: '操作未能安全完成', message: '系统已经停止本次操作，现有内容保持不变。', suggestedAction: '请确认输入与当前状态后重试。' }],
  ['PROJECT_', { title: '作品操作未完成', message: '作品目录、身份或打开状态不满足本次操作要求。', suggestedAction: '请检查作品位置和当前打开状态后重试。' }],
  ['DB_', { title: '作品数据库需要处理', message: '本地数据库暂时无法安全完成本次操作，系统没有继续写入。', suggestedAction: '请稍后重试；持续失败时进入恢复与导出。' }],
  ['DRAFT_', { title: '当前稿操作未完成', message: '当前稿状态已经变化或不满足安全写入条件。', suggestedAction: '请重新打开章节并核对正文状态。' }],
  ['VERSION_', { title: '历史版本操作未完成', message: '目标历史版本不存在、不可修改或未能安全创建。', suggestedAction: '请刷新版本列表后重试。' }],
  ['CANDIDATE_', { title: '建议稿操作未完成', message: '建议稿状态或所依据的当前稿已经变化。', suggestedAction: '请刷新建议稿并重新比较。' }],
  ['AI_', { title: 'AI操作未完成', message: 'AI连接或生成运行未能完成，正文和本地数据保持不变。', suggestedAction: '请检查AI连接、模型状态和生成范围。' }],
  ['IMPORT_', { title: '旧稿导入未完成', message: '文件格式、编码、内容或导入预览不满足安全导入要求。', suggestedAction: '请重新选择文件并检查导入预览。' }],
  ['EXPORT_', { title: '作品导出未完成', message: '导出版本或目标位置不满足写入要求。', suggestedAction: '请重新选择版本和空闲导出位置。' }],
  ['BACKUP_', { title: '作品备份未完成', message: '本次备份未能通过空间或完整性检查，现有作品不受影响。', suggestedAction: '请检查磁盘空间和备份位置后重试。' }],
  ['RESTORE_', { title: '作品恢复未完成', message: '恢复来源或目标未能通过安全校验，当前作品没有被覆盖。', suggestedAction: '请重新选择有效恢复点和新的目标位置。' }],
  ['SEARCH_', { title: '全文搜索操作未完成', message: '搜索索引或替换计划已经变化，系统没有执行可能过期的操作。', suggestedAction: '请刷新索引或重新预览替换范围。' }],
  ['VALIDATION_', { title: '作品检查未完成', message: '检查所依据的内容已经变化，旧结果不会写入当前状态。', suggestedAction: '请重新选择当前内容并再次运行检查。' }],
  ['TASK_', { title: '后台任务未完成', message: '任务状态已经变化、无法取消或执行失败。', suggestedAction: '请刷新任务状态后重试。' }],
  ['BRIDGE_', { title: '界面与本地服务通信失败', message: '本次请求未能安全到达本地服务，现有内容保持不变。', suggestedAction: '请重试；持续失败时重启本地服务。' }],
];

export function authorErrorMessage(code: string, fallbackMessage?: string): AuthorErrorMessage {
  const specific = SPECIFIC_MESSAGES[code];
  if (specific) return specific;
  const domain = DOMAIN_MESSAGES.find(([prefix]) => code.startsWith(prefix));
  if (domain) return domain[1];
  const fallback = fallbackMessage?.trim();
  return {
    title: '操作未完成',
    message:
      fallback && /[\\u3400-\\u9fff]/u.test(fallback)
        ? fallback
        : '系统未能完成本次操作，现有内容保持不变。',
    suggestedAction: '请查看技术详情后重试。',
  };
}

export function authorErrorSummary(error: {
  readonly code: string;
  readonly message: string;
}): string {
  const content = authorErrorMessage(error.code);
  return [content.title, content.message, content.suggestedAction].filter(Boolean).join(' ');
}
"""
write("apps/desktop/renderer/src/presentation/author-error-message.ts", author_error)

# ---------------------------------------------------------------------------
# P2: search initialization failures and replace-plan invalidation
# ---------------------------------------------------------------------------

search_panel = "apps/desktop/renderer/src/features/checks/search-panel.tsx"
init_old = """    ]).then(([stateOutcome, dictionaryOutcome]) => {
      if (!active) return;
      const indexCurrent = requests.current.isCurrent('index', indexGeneration);
      const dictionaryCurrent = requests.current.isCurrent('dictionary', dictionaryGeneration);
      if (indexCurrent && stateOutcome.state === 'success') setIndexState(stateOutcome.data);
      if (dictionaryCurrent && dictionaryOutcome.state === 'success') {
        setDictionary(dictionaryOutcome.data.entries);
      }
      if (indexCurrent && dictionaryCurrent) {
        setNotice('搜索覆盖当前稿、历史版本与人物世界设定。');
      }
    });"""
init_new = """    ]).then(([stateOutcome, dictionaryOutcome]) => {
      if (!active) return;
      const indexCurrent = requests.current.isCurrent('index', indexGeneration);
      const dictionaryCurrent = requests.current.isCurrent('dictionary', dictionaryGeneration);
      const failures: string[] = [];
      if (indexCurrent && stateOutcome.state === 'success') setIndexState(stateOutcome.data);
      else if (indexCurrent && stateOutcome.state === 'failure') {
        failures.push(`全文搜索状态读取失败：${authorErrorSummary(stateOutcome.error)}`);
      }
      if (dictionaryCurrent && dictionaryOutcome.state === 'success') {
        setDictionary(dictionaryOutcome.data.entries);
      } else if (dictionaryCurrent && dictionaryOutcome.state === 'failure') {
        failures.push(`作品词典读取失败：${authorErrorSummary(dictionaryOutcome.error)}`);
      }
      if (indexCurrent && dictionaryCurrent) {
        setNotice(
          failures.length > 0
            ? `${failures.join('；')} 请重试或重建全文搜索。`
            : '搜索覆盖当前稿、历史版本与人物世界设定。',
        );
      }
    });"""
replace_once(search_panel, init_old, init_new)

replace_once(
    search_panel,
    "  const navigateToResult = (item: SearchProjectResult['items'][number]): void => {",
    """  const invalidateReplacePlan = (): void => {
    if (!plan) return;
    setPlan(null);
    setNotice('替换条件已经变化，请重新预览替换范围。');
  };

  const navigateToResult = (item: SearchProjectResult['items'][number]): void => {""",
)
replace_once(
    search_panel,
    "            <input name=\"query\" required />",
    "            <input name=\"query\" required onChange={invalidateReplacePlan} />",
)
replace_once(
    search_panel,
    "            <input name=\"replacement\" />",
    "            <input name=\"replacement\" onChange={invalidateReplacePlan} />",
)
replace_once(
    search_panel,
    "            <input defaultChecked name=\"matchCase\" type=\"checkbox\" />",
    "            <input\n              defaultChecked\n              name=\"matchCase\"\n              type=\"checkbox\"\n              onChange={invalidateReplacePlan}\n            />",
)

# ---------------------------------------------------------------------------
# Regression tests
# ---------------------------------------------------------------------------

test_source = """import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { WORLD_FORGE_ERROR_CODES } from '@worldforge/contracts';
import { describe, expect, it } from 'vitest';

import { authorErrorMessage } from '../../apps/desktop/renderer/src/presentation/author-error-message.js';

const root = process.cwd();
const source = (file: string): Promise<string> => readFile(path.join(root, file), 'utf8');

describe('M8-09 V1.0稳定性回归', () => {
  it('为全部正式错误码提供作者语义且不泄漏英文fallback', () => {
    for (const code of WORLD_FORGE_ERROR_CODES) {
      const message = authorErrorMessage(code, 'Internal technical failure.');
      expect(message.title).not.toBe('操作未完成');
      expect(message.message).not.toContain('Internal technical failure');
      expect(message.suggestedAction).toBeTruthy();
    }
    expect(authorErrorMessage('UNKNOWN_ERROR', 'Internal technical failure.').message).not.toContain(
      'Internal technical failure',
    );
  });

  it('保持章节和当前稿在读取成功后原子切换', async () => {
    const content = await source(
      'apps/desktop/renderer/src/features/writing/writing-core-workbench.tsx',
    );
    expect(content).toContain('const chapterOpenGeneration = useRef(0);');
    expect(content).toContain("currentEditor.setEditable(false)");
    expect(content).not.toContain('setChapter(nextChapter);\\n      activeChapter.current = nextChapter;');
    expect(content).toContain('mountEditor(outcome.data, nextChapter);');
  });

  it('最近作品辅助写入失败不会删除已提交作品目录', async () => {
    const content = await source('packages/core-service/src/project-workspace.ts');
    expect(content).toContain('async #registerRecentBestEffort');
    expect(content).toContain('if (!this.#active && !committed)');
    expect(content).not.toContain('rm(renamed ? finalPath : stagingPath');
  });

  it('启动重开、跨作品隔离和退出重试具有代码级守卫', async () => {
    const [shell, main] = await Promise.all([
      source('apps/desktop/renderer/src/app/app-shell-m3.tsx'),
      source('apps/desktop/main/src/electron-main.ts'),
    ]);
    expect(shell).toContain("resolvedSettings.startupBehavior === 'reopen-last'");
    expect(shell).toContain('let active = true;');
    expect(shell).toContain("worldforge:unexpected-renderer-error");
    expect(main).toContain('finally {\\n        if (!allowQuit) shutdownInFlight = null;');
  });
});
"""
write("tests/unit/v1-stability-remediation.test.ts", test_source)

# Changelog and evidence seed
changelog = read("CHANGELOG.md")
heading = "## 1.0.0"
entry = """## 1.0.0稳定性治理补充

- 修复章节切换期间旧编辑器输入可能丢失或错误绑定的问题。
- 修复最近作品辅助数据库失败可能回滚权威作品目录的问题。
- 实现重新打开最近作品启动设置，并隔离跨作品异步状态回写。
- 统一退出、IPC、Renderer异步异常和作者错误提示边界。
- 修复批量替换旧预览与搜索初始化失败反馈。

"""
if entry not in changelog:
    if heading in changelog:
        changelog = changelog.replace(heading, entry + heading, 1)
    else:
        changelog = entry + changelog
write("CHANGELOG.md", changelog)

write(
    "docs/test-evidence/M8-09/known-risks.md",
    """# M8-09 已知限制

1. 本任务只处理V1.0确认的行为缺陷和数据安全问题，不在稳定性PR中机械拆分大型组件或重写CSS体系。
2. 原生浏览器对话框整体替换、工作台职责拆分和当前稿快速检查属于V1.1维护改造；现有定稿检查、数据安全和导出能力保持不变。
3. 没有修改数据库Schema、Migration或作品目录格式。
""",
)

print("M8-09 patches applied")
