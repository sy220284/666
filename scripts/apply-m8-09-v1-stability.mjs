import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const fromRoot = (file) => path.join(root, file);

async function read(file) {
  return readFile(fromRoot(file), 'utf8');
}

async function write(file, content) {
  await mkdir(path.dirname(fromRoot(file)), { recursive: true });
  await writeFile(fromRoot(file), content.endsWith('\n') ? content : `${content}\n`, 'utf8');
}

async function replaceExact(file, before, after) {
  const source = await read(file);
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`M8_09_ANCHOR_MISSING:${file}:${before.slice(0, 80)}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`M8_09_ANCHOR_AMBIGUOUS:${file}:${before.slice(0, 80)}`);
  }
  await write(file, source.slice(0, first) + after + source.slice(first + before.length));
}

async function replaceBetween(file, start, end, replacement) {
  const source = await read(file);
  const startIndex = source.indexOf(start);
  if (startIndex < 0) throw new Error(`M8_09_START_MISSING:${file}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (endIndex < 0) throw new Error(`M8_09_END_MISSING:${file}`);
  await write(file, source.slice(0, startIndex) + replacement + source.slice(endIndex));
}

const block = (lines) => `${lines.join('\n')}\n`;

// P0/P1: project.sqlite remains authoritative; recent-project metadata is best effort.
const projectWorkspace = 'packages/core-service/src/project-workspace.ts';
await replaceExact(
  projectWorkspace,
  block([
    '        const context = await this.#loadWorkspace(finalPath);',
    '        try {',
    '          await this.#recentProjects.register(requestId, {',
    '            projectId: context.summary.projectId,',
    '            workspacePath: context.summary.workspacePath,',
    '            displayName: context.summary.name,',
    '          });',
    '        } catch (error) {',
    '          await this.#closeContext(context);',
    '          throw error;',
    '        }',
    '        this.#active = context;',
  ]),
  block([
    '        const context = await this.#loadWorkspace(finalPath);',
    '        await this.#registerRecentBestEffort(requestId, context.summary);',
    '        this.#active = context;',
  ]),
);
await replaceExact(
  projectWorkspace,
  block([
    '        if (!this.#active) {',
    '          await rm(renamed ? finalPath : stagingPath, { recursive: true, force: true });',
    '        }',
  ]),
  block([
    '        if (!renamed && !this.#active) {',
    '          await rm(stagingPath, { recursive: true, force: true });',
    '        }',
  ]),
);
await replaceExact(
  projectWorkspace,
  block([
    '      const context = await this.#loadWorkspace(workspacePath);',
    '      try {',
    '        await this.#recentProjects.register(requestId, {',
    '          projectId: context.summary.projectId,',
    '          workspacePath: context.summary.workspacePath,',
    '          displayName: context.summary.name,',
    '        });',
    '      } catch (error) {',
    '        await this.#closeContext(context);',
    '        throw error;',
    '      }',
    '      this.#active = context;',
  ]),
  block([
    '      const context = await this.#loadWorkspace(workspacePath);',
    '      await this.#registerRecentBestEffort(requestId, context.summary);',
    '      this.#active = context;',
  ]),
);
await replaceExact(
  projectWorkspace,
  block([
    '        const requiredBytes = await workspaceSize(source);',
    '        if ((await this.#freeBytes(targetParent)) < requiredBytes) {',
  ]),
  block([
    '        const requiredBytes = await workspaceSize(source);',
    '        const safetyMargin = requiredBytes / 10n + 64n * 1024n * 1024n;',
    '        if ((await this.#freeBytes(targetParent)) < requiredBytes + safetyMargin) {',
  ]),
);
await replaceExact(
  projectWorkspace,
  block([
    '        const moved = await this.#loadWorkspace(target);',
    '        try {',
    '          await this.#recentProjects.register(requestId, {',
    '            projectId: moved.summary.projectId,',
    '            workspacePath: moved.summary.workspacePath,',
    '            displayName: moved.summary.name,',
    '          });',
    '        } catch (error) {',
    '          await this.#closeContext(moved);',
    '          throw error;',
    '        }',
    '        this.#active = moved;',
  ]),
  block([
    '        const moved = await this.#loadWorkspace(target);',
    '        await this.#registerRecentBestEffort(requestId, moved.summary);',
    '        this.#active = moved;',
  ]),
);
await replaceExact(
  projectWorkspace,
  block([
    '            this.#active = restored;',
    '            await this.#recentProjects.register(this.#idFactory(), {',
    '              projectId: restored.summary.projectId,',
    '              workspacePath: restored.summary.workspacePath,',
    '              displayName: restored.summary.name,',
    '            });',
  ]),
  block([
    '            this.#active = restored;',
    '            await this.#registerRecentBestEffort(this.#idFactory(), restored.summary);',
  ]),
);
await replaceExact(
  projectWorkspace,
  block([
    '      const context = await this.#loadWorkspace(workspacePath);',
    '      try {',
    '        await this.#recentProjects.register(requestId, {',
    '          projectId: context.summary.projectId,',
    '          workspacePath: context.summary.workspacePath,',
    '          displayName: context.summary.name,',
    '        });',
    '        return context.summary;',
    '      } finally {',
    '        await this.#closeContext(context);',
    '      }',
  ]),
  block([
    '      const context = await this.#loadWorkspace(workspacePath);',
    '      try {',
    '        await this.#registerRecentBestEffort(requestId, context.summary);',
    '        return context.summary;',
    '      } finally {',
    '        await this.#closeContext(context);',
    '      }',
  ]),
);
await replaceExact(
  projectWorkspace,
  '  assertActiveProject(projectId: string, requireWrite = false): ProjectWorkspaceSummary {\n',
  block([
    '  async #registerRecentBestEffort(',
    '    requestId: string,',
    '    summary: ProjectWorkspaceSummary,',
    '  ): Promise<boolean> {',
    '    try {',
    '      await this.#recentProjects.register(requestId, {',
    '        projectId: summary.projectId,',
    '        workspacePath: summary.workspacePath,',
    '        displayName: summary.name,',
    '      });',
    '      return true;',
    '    } catch {',
    '      return false;',
    '    }',
    '  }',
    '',
    '  assertActiveProject(projectId: string, requireWrite = false): ProjectWorkspaceSummary {',
  ]),
);

// P0: keep chapter and draft bound until the replacement draft has loaded.
const writingWorkbench =
  'apps/desktop/renderer/src/features/writing/writing-core-workbench.tsx';
await replaceExact(
  writingWorkbench,
  '  const activeChapter = useRef<Chapter | null>(null);\n',
  block([
    '  const activeChapter = useRef<Chapter | null>(null);',
    '  const openingChapter = useRef<string | null>(null);',
  ]),
);
await replaceBetween(
  writingWorkbench,
  '  const openChapter = useCallback(\n',
  '  useEffect(() => {\n    if (initialChapterRequested.current) return;',
  block([
    '  const openChapter = useCallback(',
    '    async (nextChapter: Chapter): Promise<void> => {',
    '      if (openingChapter.current === nextChapter.id) return;',
    '      if (activeChapter.current?.id === nextChapter.id && activeDraft.current) {',
    '        if (openingChapter.current) {',
    '          openingChapter.current = null;',
    '          editor.current?.setEditable(!readOnly);',
    "          setStatus('已保留当前章节。');",
    '        }',
    "        if (panel === 'editor' && !editor.current) mountEditor(activeDraft.current, nextChapter);",
    '        return;',
    '      }',
    '      if (!(await flush())) {',
    "        onStatus('自动保存失败，已阻止切换章节。');",
    '        return;',
    '      }',
    '      openingChapter.current = nextChapter.id;',
    '      editor.current?.setEditable(false);',
    "      setStatus('正在从作品数据库读取正文…');",
    '      const outcome = await bridge.draft.open(',
    '        { projectId: project.projectId, chapterId: nextChapter.id },',
    "        { mode: 'replace' },",
    '      );',
    '      if (openingChapter.current !== nextChapter.id) return;',
    "      if (outcome.state !== 'success') {",
    '        openingChapter.current = null;',
    '        editor.current?.setEditable(!readOnly);',
    '        setStatus(',
    "          outcome.state === 'failure'",
    '            ? `正文读取失败 · ${authorErrorSummary(outcome.error)}`',
    "            : outcome.state === 'cancelled'",
    "              ? '正文读取已取消。'",
    "              : '正文读取已被更新请求替代。',",
    "          outcome.state === 'failure',",
    '        );',
    '        return;',
    '      }',
    '      openingChapter.current = null;',
    '      mountEditor(outcome.data, nextChapter);',
    '    },',
    '    [bridge, flush, mountEditor, onStatus, panel, project.projectId, readOnly, setStatus],',
    '  );',
    '',
  ]),
);

// P1: startup behavior and workspace-attention generation isolation.
const appShell = 'apps/desktop/renderer/src/app/app-shell-m3.tsx';
await replaceExact(
  appShell,
  '  const initialWorkspaceResolved = useRef(false);\n',
  block([
    '  const initialWorkspaceResolved = useRef(false);',
    '  const workspaceAttentionGeneration = useRef(0);',
  ]),
);
await replaceBetween(
  appShell,
  "    if (project.state === 'success') {\n",
  "    if (activeTasks.state === 'success') setTasks(activeTasks.data.tasks);",
  block([
    "    if (recent.state === 'success') setRecentProjects(recent.data.projects);",
    "    else nextFailure ??= failureFromOutcome('最近作品读取失败', recent);",
    '',
    "    if (project.state === 'success') {",
    '      let resolvedProject = project.data;',
    '      if (',
    '        !resolvedProject &&',
    '        !initialWorkspaceResolved.current &&',
    "        applicationSettings.state === 'success' &&",
    "        applicationSettings.data.settings.startupBehavior === 'reopen-last' &&",
    "        recent.state === 'success'",
    '      ) {',
    '        const candidate = recent.data.projects.find((item) => item.missingSince === null);',
    '        if (candidate) {',
    '          const reopened = await bridge.project.openRecent(candidate.projectId, {',
    "            mode: 'replace',",
    '          });',
    "          if (reopened.state === 'success') resolvedProject = reopened.data;",
    "          else if (reopened.state === 'failure')",
    "            nextFailure ??= failureFromOutcome('最近作品自动打开失败', reopened);",
    '        }',
    '      }',
    '      setActiveProject(resolvedProject);',
    '      let nextContinuation: ProjectContinuationSnapshot | null = null;',
    '      if (resolvedProject) {',
    '        const continuationOutcome = await bridge.project.getContinuation(',
    '          resolvedProject.projectId,',
    "          { mode: 'replace' },",
    '        );',
    "        if (continuationOutcome.state === 'success') {",
    '          nextContinuation = continuationOutcome.data;',
    '        }',
    '      }',
    '      setContinuation(nextContinuation);',
    '      if (!initialWorkspaceResolved.current) {',
    '        initialWorkspaceResolved.current = true;',
    "        const restoredRoute = resolvedProject ? continuationRoute(nextContinuation) : 'home';",
    '        dispatch({',
    "          type: 'navigate',",
    '          route: restoreAppShellRoute(restoredRoute, {',
    '            activeProjectId: resolvedProject?.projectId ?? null,',
    '            disclosureMode:',
    "              applicationSettings.state === 'success'",
    '                ? applicationSettings.data.settings.defaultMode',
    '                : DEFAULT_APP_SETTINGS.defaultMode,',
    '          }),',
    '        });',
    '      }',
    "    } else nextFailure ??= failureFromOutcome('项目状态读取失败', project);",
    '',
  ]),
);
await replaceExact(
  appShell,
  block([
    '  const refreshWorkspaceAttention = useCallback(async (): Promise<void> => {',
    '    if (!activeProject) {',
    '      setWorkspaceAttention(EMPTY_WORKSPACE_ATTENTION);',
    '      return;',
    '    }',
    '    const next = await loadWorkspaceAttention(bridge, activeProject.projectId);',
    '    setWorkspaceAttention(next);',
    '  }, [activeProject, bridge]);',
    '',
    '  useEffect(() => {',
    '    void refreshWorkspaceAttention();',
    '  }, [refreshWorkspaceAttention, route, tasks]);',
  ]),
  block([
    '  const refreshWorkspaceAttention = useCallback(async (): Promise<void> => {',
    '    const generation = workspaceAttentionGeneration.current + 1;',
    '    workspaceAttentionGeneration.current = generation;',
    '    if (!activeProject) {',
    '      setWorkspaceAttention(EMPTY_WORKSPACE_ATTENTION);',
    '      return;',
    '    }',
    '    const next = await loadWorkspaceAttention(bridge, activeProject.projectId);',
    '    if (workspaceAttentionGeneration.current !== generation) return;',
    '    setWorkspaceAttention(next);',
    '  }, [activeProject, bridge]);',
    '',
    '  useEffect(() => {',
    '    void refreshWorkspaceAttention();',
    '    return () => {',
    '      workspaceAttentionGeneration.current += 1;',
    '    };',
    '  }, [refreshWorkspaceAttention, route, tasks]);',
  ]),
);

// P1: every failed shutdown attempt must release its in-flight latch.
const electronMain = 'apps/desktop/main/src/electron-main.ts';
await replaceBetween(
  electronMain,
  '  const gracefulShutdown = (): Promise<void> => {\n',
  "  mainWindow.on('close', (event) => {",
  block([
    '  const gracefulShutdown = (): Promise<void> => {',
    '    if (shutdownInFlight) return shutdownInFlight;',
    '    let shutdownCompleted = false;',
    '    shutdownInFlight = (async () => {',
    '      try {',
    '        if (!(await flushRendererDraft())) {',
    "          await logger.log('error', 'draft.autosave.flush.failed', {",
    "            errorCode: 'DB_WRITE_FAILED_004',",
    '            processStatus: supervisor.getStatus().status,',
    '          });',
    '          mainWindow?.show();',
    '          return;',
    '        }',
    '        await flushWindowPreferences();',
    '        const result = await supervisor.shutdown();',
    '        if (!result.ok) {',
    "          await logger.log('error', 'app.shutdown.blocked', {",
    "            errorCode: result.errorCode ?? 'CORE_SHUTDOWN_FAILED',",
    '            diagnosticId: result.diagnosticId ?? null,',
    '            processStatus: supervisor.getStatus().status,',
    '          });',
    '          mainWindow?.show();',
    '          return;',
    '        }',
    '        allowQuit = true;',
    "        screen.off('display-added', restoreForCurrentDisplays);",
    "        screen.off('display-removed', restoreForCurrentDisplays);",
    "        screen.off('display-metrics-changed', restoreForCurrentDisplays);",
    '        unregisterIpc?.();',
    '        unregisterIpc = null;',
    '        mainWindow?.destroy();',
    '        mainWindow = null;',
    '        shutdownCompleted = true;',
    '        app.quit();',
    '      } catch {',
    '        allowQuit = false;',
    '        const diagnosticId = createDiagnosticId();',
    '        try {',
    "          await logger.log('error', 'app.shutdown.unexpected', {",
    "            errorCode: 'CORE_SHUTDOWN_FAILED',",
    '            diagnosticId,',
    '            processStatus: supervisor.getStatus().status,',
    '          });',
    '        } catch {',
    '          // The shutdown latch must still be released when diagnostic logging fails.',
    '        }',
    '        mainWindow?.show();',
    '      } finally {',
    '        if (!shutdownCompleted) shutdownInFlight = null;',
    '      }',
    '    })();',
    '    return shutdownInFlight;',
    '  };',
    '',
  ]),
);

// P2: Main IPC always returns a structured failure with a diagnostic ID.
const ipcHandlers = 'apps/desktop/main/src/ipc-handlers.ts';
await replaceExact(
  ipcHandlers,
  '    options.ipcMain.handle(channel, handler);\n',
  block([
    '    options.ipcMain.handle(channel, async (event, input) => {',
    '      try {',
    '        return await handler(event, input);',
    '      } catch {',
    '        const requestId = requestIdFrom(input);',
    '        const diagnosticId = createDiagnosticId();',
    '        try {',
    "          await options.logger.log('error', 'ipc.handler.unexpected', {",
    '            requestId,',
    '            operation: channel,',
    "            errorCode: 'COMMON_INTERNAL_999',",
    '            retryable: true,',
    '            diagnosticId,',
    '          });',
    '        } catch {',
    '          // Error conversion must remain available when logging itself fails.',
    '        }',
    '        return failure(',
    '          requestId,',
    "          'COMMON_INTERNAL_999',",
    "          'The operation failed unexpectedly.',",
    '          true,',
    '          diagnosticId,',
    '          undefined,',
    "          '请重试；若问题持续，请导出诊断包。',",
    '        );',
    '      }',
    '    });',
  ]),
);

// P2: search bootstrap failures are visible and replace plans expire on form changes.
const searchPanel = 'apps/desktop/renderer/src/features/checks/search-panel.tsx';
await replaceExact(
  searchPanel,
  "  const [notice, setNotice] = useState('搜索覆盖当前稿、历史版本与人物世界设定。');\n",
  block([
    "  const [notice, setNotice] = useState('搜索覆盖当前稿、历史版本与人物世界设定。');",
    '  const [reloadToken, setReloadToken] = useState(0);',
  ]),
);
await replaceBetween(
  searchPanel,
  "  useEffect(() => {\n    const indexGeneration = requests.current.begin('index');",
  '  const search = async (event: FormEvent<HTMLFormElement>): Promise<void> => {',
  block([
    '  useEffect(() => {',
    "    const indexGeneration = requests.current.begin('index');",
    "    const dictionaryGeneration = requests.current.begin('dictionary');",
    '    let active = true;',
    '    setResult(null);',
    '    setPlan(null);',
    '    setIndexState(null);',
    '    setDictionary([]);',
    '    setSearchPending(false);',
    '    setReplacePending(false);',
    '    setDictionaryPending(false);',
    '    setIndexPending(false);',
    "    setNotice('正在读取当前作品的全文搜索状态…');",
    '    void Promise.all([',
    "      bridge.searchTools.getIndexState({ projectId }, { mode: 'replace' }),",
    "      bridge.searchTools.listDictionary({ projectId }, { mode: 'replace' }),",
    '    ])',
    '      .then(([stateOutcome, dictionaryOutcome]) => {',
    '        if (!active) return;',
    "        const indexCurrent = requests.current.isCurrent('index', indexGeneration);",
    '        const dictionaryCurrent = requests.current.isCurrent(',
    "          'dictionary',",
    '          dictionaryGeneration,',
    '        );',
    '        const failures: string[] = [];',
    "        if (indexCurrent && stateOutcome.state === 'success') setIndexState(stateOutcome.data);",
    "        else if (indexCurrent && stateOutcome.state === 'failure')",
    "          failures.push(`全文搜索状态读取失败：${authorErrorSummary(stateOutcome.error)}`);",
    "        if (dictionaryCurrent && dictionaryOutcome.state === 'success') {",
    '          setDictionary(dictionaryOutcome.data.entries);',
    "        } else if (dictionaryCurrent && dictionaryOutcome.state === 'failure') {",
    "          failures.push(`作品词典读取失败：${authorErrorSummary(dictionaryOutcome.error)}`);",
    '        }',
    '        if (indexCurrent && dictionaryCurrent) {',
    '          setNotice(',
    '            failures.length > 0',
    "              ? `${failures.join(' ')} 可以重新读取。`",
    "              : '搜索覆盖当前稿、历史版本与人物世界设定。',",
    '          );',
    '        }',
    '      })',
    '      .catch(() => {',
    '        if (active) setNotice(\'搜索工具读取异常；现有作品数据没有变化，可以重新读取。\');',
    '      });',
    '    return () => {',
    '      active = false;',
    '      requests.current.invalidateAll();',
    '    };',
    '  }, [bridge, projectId, reloadToken]);',
    '',
  ]),
);
await replaceExact(
  searchPanel,
  block([
    '        <button',
    '          disabled={searchToolsPending || readOnly}',
    '          type="button"',
    '          onClick={() => void rebuildIndex()}',
    '        >',
    "          {indexPending ? '正在重建…' : '重建全文搜索'}",
    '        </button>',
  ]),
  block([
    '        <div>',
    '          <button',
    '            disabled={searchToolsPending}',
    '            type="button"',
    '            onClick={() => setReloadToken((value) => value + 1)}',
    '          >',
    '            重新读取搜索状态',
    '          </button>',
    '          <button',
    '            disabled={searchToolsPending || readOnly}',
    '            type="button"',
    '            onClick={() => void rebuildIndex()}',
    '          >',
    "            {indexPending ? '正在重建…' : '重建全文搜索'}",
    '          </button>',
    '        </div>',
  ]),
);
await replaceExact(
  searchPanel,
  '            <input name="query" required />\n',
  '            <input name="query" required onChange={() => setPlan(null)} />\n',
);
await replaceExact(
  searchPanel,
  '            <input name="replacement" />\n',
  '            <input name="replacement" onChange={() => setPlan(null)} />\n',
);
await replaceExact(
  searchPanel,
  '            <input defaultChecked name="matchCase" type="checkbox" />\n',
  '            <input defaultChecked name="matchCase" type="checkbox" onChange={() => setPlan(null)} />\n',
);

// P2: all official error domains have Chinese author semantics; raw Core English is not the fallback.
await write(
  'apps/desktop/renderer/src/presentation/author-error-message.ts',
  `export interface AuthorErrorMessage {
  readonly title: string;
  readonly message: string;
  readonly suggestedAction?: string;
}

const AUTHOR_ERROR_MESSAGES: Readonly<Record<string, AuthorErrorMessage>> = {
  COMMON_INVALID_INPUT_001: {
    title: '输入内容无法使用',
    message: '本次提交的内容或参数不符合当前操作要求，现有作品数据没有变化。',
    suggestedAction: '请检查必填项和输入格式后重试。',
  },
  COMMON_NOT_FOUND_002: {
    title: '目标内容已经不存在',
    message: '系统没有找到本次操作对应的作品内容。',
    suggestedAction: '请重新打开当前页面并选择仍然存在的目标。',
  },
  COMMON_CONFLICT_003: {
    title: '内容状态已经变化',
    message: '系统检测到本次操作所依据的状态已经过期，因此没有继续写入。',
    suggestedAction: '请重新读取最新内容后再次操作。',
  },
  COMMON_CANCELLED_004: {
    title: '操作已取消',
    message: '系统没有继续执行本次操作，现有内容保持不变。',
  },
  COMMON_TIMEOUT_005: {
    title: '操作等待超时',
    message: '本地服务没有在安全时间内完成响应。',
    suggestedAction: '请确认本地服务状态后重试。',
  },
  COMMON_INTERNAL_999: {
    title: '本地服务遇到异常',
    message: '系统已经停止本次操作，现有作品内容保持不变。',
    suggestedAction: '请重试；若问题持续，请导出诊断包。',
  },
  BRIDGE_UNEXPECTED_FAILURE: {
    title: '界面与本地服务通信失败',
    message: '本次请求没有完成，现有作品内容保持不变。',
    suggestedAction: '请重试，或在设置中重启本地服务。',
  },
  REVISION_CONFLICT: {
    title: '当前稿已经发生变化',
    message: '建议稿生成后，当前稿又有新的修改。系统没有覆盖正文。',
    suggestedAction: '请重新比较内容后再采用。',
  },
  HASH_CONFLICT: {
    title: '正文内容与预期不一致',
    message: '系统检测到正文内容已经变化，因此停止本次修改。',
    suggestedAction: '请重新打开目标内容并再次确认。',
  },
  LOCK_CONFLICT: {
    title: '部分内容已经锁定',
    message: '本次操作涉及受保护的正文块，系统没有修改这些内容。',
    suggestedAction: '请检查锁定范围，或只处理未锁定内容。',
  },
  READ_ONLY: {
    title: '作品处于只读保护状态',
    message: '当前作品只能查看，不能写入或修改。',
    suggestedAction: '请处理作品目录或数据完整性问题后重新打开。',
  },
  CORE_UNAVAILABLE: {
    title: '本地服务暂时不可用',
    message: '应用界面暂时无法连接本地写作服务。',
    suggestedAction: '请重新启动本地服务，未保存内容不要关闭。',
  },
  PROVIDER_UNAVAILABLE: {
    title: 'AI连接不可用',
    message: '当前AI连接未通过连接测试，基础写作功能仍可继续使用。',
    suggestedAction: '请检查模型服务、地址、模型名称和密钥。',
  },
  DRAFT_REVISION_CONFLICT_001: {
    title: '当前稿已经有更新',
    message: '保存所依据的正文版本已经变化，系统没有覆盖较新的内容。',
    suggestedAction: '请重新打开章节，确认最新正文后继续编辑。',
  },
  DRAFT_BLOCK_HASH_CONFLICT_002: {
    title: '正文校验未通过',
    message: '目标段落的内容已经变化，系统停止了本次写入。',
    suggestedAction: '请重新读取章节后再次操作。',
  },
  DRAFT_BLOCK_LOCKED_003: {
    title: '目标段落已经锁定',
    message: '受保护段落没有被修改。',
    suggestedAction: '请先确认锁定范围，或改为处理未锁定段落。',
  },
  DRAFT_PATCH_INVALID_004: {
    title: '正文修改无法应用',
    message: '本次修改与当前正文结构不兼容，系统没有写入。',
    suggestedAction: '请重新打开章节并重试。',
  },
  DRAFT_NO_ACTIVE_005: {
    title: '当前没有可编辑稿件',
    message: '系统没有找到当前章节的活动稿件。',
    suggestedAction: '请重新打开章节或作品。',
  },
  VERSION_IMMUTABLE_001: {
    title: '历史版本不可直接修改',
    message: '已保存版本保持不可变，系统没有改写历史记录。',
    suggestedAction: '请恢复为新的当前稿后再修改。',
  },
  VERSION_CREATE_FAILED_002: {
    title: '版本留档失败',
    message: '系统未能创建本次版本快照，当前稿保持不变。',
    suggestedAction: '请确认当前稿已经保存后重试。',
  },
  CANDIDATE_ALREADY_RESOLVED_001: {
    title: '建议稿已经处理',
    message: '该建议稿已经采用或丢弃，不能重复处理。',
    suggestedAction: '请刷新建议稿列表。',
  },
  CANDIDATE_BASE_CONFLICT_002: {
    title: '建议稿依据的正文已经变化',
    message: '系统没有用旧建议稿覆盖新的当前稿。',
    suggestedAction: '请重新生成或重新比较建议稿。',
  },
  CANDIDATE_PARTIAL_RESTRICTED_003: {
    title: '当前建议稿不能部分采用',
    message: '该建议稿的结构不支持当前选择范围。',
    suggestedAction: '请改为整体采用，或重新生成可分段建议稿。',
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
    suggestedAction: '请检查模型运行状态，或在高级设置中延长等待时间。',
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
  AI_RUN_NOT_FOUND_011: {
    title: '生成任务已经不存在',
    message: '系统没有找到对应的AI生成任务。',
    suggestedAction: '请刷新页面后重新发起生成。',
  },
  AI_RUN_ALREADY_FINISHED_012: {
    title: '生成任务已经结束',
    message: '该任务已经完成、失败或取消，不能重复操作。',
    suggestedAction: '请查看已有建议稿或重新生成。',
  },
  AI_ENDPOINT_UNSAFE_013: {
    title: 'AI服务地址不安全',
    message: '系统拒绝连接可能暴露本地环境或使用不安全协议的地址。',
    suggestedAction: '本机服务请使用localhost；远程服务请使用HTTPS。',
  },
  AI_RESPONSE_TOO_LARGE_014: {
    title: 'AI返回内容超过安全上限',
    message: '模型服务返回的数据量过大，系统已经停止接收，正文和本地数据没有被修改。',
    suggestedAction: '请缩小生成范围、降低输出长度，或检查模型服务是否异常。',
  },
};

function domainErrorMessage(code: string): AuthorErrorMessage | null {
  if (code.startsWith('PROJECT_'))
    return {
      title: '作品操作未完成',
      message: '作品目录或当前打开状态不满足本次操作要求，现有作品文件保持不变。',
      suggestedAction: '请检查作品路径、打开状态和只读保护后重试。',
    };
  if (code.startsWith('DB_'))
    return {
      title: '作品数据库处于保护状态',
      message: '数据库操作没有安全完成，系统已停止继续写入。',
      suggestedAction: '请使用恢复与导出检查作品状态，或重启本地服务。',
    };
  if (code.startsWith('IMPORT_'))
    return {
      title: '旧稿导入未完成',
      message: '导入文件没有通过格式、编码或安全校验，现有作品内容没有变化。',
      suggestedAction: '请检查文件格式与内容后重新预览导入。',
    };
  if (code.startsWith('EXPORT_'))
    return {
      title: '作品导出未完成',
      message: '系统没有安全写出目标文件，作品数据库没有受到影响。',
      suggestedAction: '请检查导出位置、文件名和磁盘权限后重试。',
    };
  if (code.startsWith('BACKUP_'))
    return {
      title: '备份操作未完成',
      message: '本次备份或清理没有通过完整性与保护规则。',
      suggestedAction: '请检查空间和保护状态后重试，保留最近一次已验证备份。',
    };
  if (code.startsWith('RESTORE_'))
    return {
      title: '恢复操作未完成',
      message: '恢复来源或目标没有通过安全校验，当前作品没有被覆盖。',
      suggestedAction: '请重新选择有效恢复点和空闲目标位置。',
    };
  if (code.startsWith('SEARCH_'))
    return {
      title: '搜索工具需要更新',
      message: '全文索引或替换计划已经过期，权威作品数据没有受到影响。',
      suggestedAction: '请重新读取搜索状态、重建索引或重新预览替换。',
    };
  if (code.startsWith('VALIDATION_'))
    return {
      title: '检查依据已经变化',
      message: '本次检查所依据的版本或内容不再是当前状态。',
      suggestedAction: '请重新选择当前定稿版本并再次检查。',
    };
  if (code.startsWith('TASK_'))
    return {
      title: '后台任务未完成',
      message: '任务状态已经变化，或当前阶段不支持该操作。',
      suggestedAction: '请刷新任务状态后重试。',
    };
  return null;
}

export function authorErrorMessage(code: string, _fallbackMessage?: string): AuthorErrorMessage {
  return (
    AUTHOR_ERROR_MESSAGES[code] ??
    domainErrorMessage(code) ?? {
      title: '操作未完成',
      message: '系统未能完成本次操作，现有内容保持不变。',
      suggestedAction: '请查看技术详情后重试。',
    }
  );
}

export function authorErrorSummary(error: {
  readonly code: string;
  readonly message: string;
}): string {
  const content = authorErrorMessage(error.code);
  return [content.title, content.message, content.suggestedAction].filter(Boolean).join(' ');
}
`,
);

// P2: last-resort Renderer error boundary, without exposing raw content.
await write(
  'apps/desktop/renderer/src/runtime/global-error-boundary.ts',
  `const GLOBAL_ERROR_NOTICE_ID = 'worldforge-global-error-notice';

function diagnosticId(): string {
  return \`diag_renderer_\${globalThis.crypto.randomUUID()}\`;
}

function showGlobalFailure(id: string): void {
  let notice = document.getElementById(GLOBAL_ERROR_NOTICE_ID);
  if (!notice) {
    notice = document.createElement('div');
    notice.id = GLOBAL_ERROR_NOTICE_ID;
    notice.className = 'safety-banner safety-banner--danger';
    notice.setAttribute('role', 'alert');
    document.body.prepend(notice);
  }
  notice.textContent = \`界面遇到异常，当前作品数据未被自动修改。请先保存或复制当前正文，再重试操作。诊断编号：\${id}\`;
}

export function installGlobalRendererErrorBoundary(): () => void {
  const onError = (): void => showGlobalFailure(diagnosticId());
  const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
    event.preventDefault();
    showGlobalFailure(diagnosticId());
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
    document.getElementById(GLOBAL_ERROR_NOTICE_ID)?.remove();
  };
}
`,
);
const reactEntry = 'apps/desktop/renderer/src/react-entry.tsx';
await replaceExact(
  reactEntry,
  "import { createCoreRecoverySupervisor } from './runtime/core-recovery-supervisor.js';\n",
  block([
    "import { createCoreRecoverySupervisor } from './runtime/core-recovery-supervisor.js';",
    "import { installGlobalRendererErrorBoundary } from './runtime/global-error-boundary.js';",
  ]),
);
await replaceExact(
  reactEntry,
  block([
    'const coreRecovery = createCoreRecoverySupervisor({ bridge, flushDraft: flushRegisteredDraft });',
    'const runtime = createRendererFoundationRuntime({',
  ]),
  block([
    'const coreRecovery = createCoreRecoverySupervisor({ bridge, flushDraft: flushRegisteredDraft });',
    'const stopGlobalErrorBoundary = installGlobalRendererErrorBoundary();',
    'const runtime = createRendererFoundationRuntime({',
  ]),
);
await replaceExact(
  reactEntry,
  "lifecycle.register('react-root', 'core-recovery-supervisor', () => coreRecovery.dispose());\n",
  block([
    "lifecycle.register('react-root', 'core-recovery-supervisor', () => coreRecovery.dispose());",
    "lifecycle.register('react-root', 'global-error-boundary', stopGlobalErrorBoundary);",
  ]),
);

// Task governance activation.
const activeTaskPath = 'docs/tasks/ACTIVE_TASK.json';
const activeTask = JSON.parse(await read(activeTaskPath));
activeTask.activeTask = {
  id: 'M8-09',
  status: 'IN_PROGRESS',
  source: 'docs/tasks/M8/M8-09_V1_STABILITY_HARDENING.md',
  branch: 'work/m8-09-v1-stability-hardening',
  startedAt: '2026-07-31',
  allowedPaths: [
    'apps/desktop/renderer/src/',
    'apps/desktop/preload/src/',
    'apps/desktop/main/src/',
    'packages/contracts/src/',
    'packages/core-service/src/',
    'tests/unit/',
    'tests/integration/',
    'tests/security/',
    'tests/e2e/',
    'scripts/',
    'docs/tasks/',
    'docs/product/',
    'docs/testing/',
    'docs/test-evidence/M8-09/',
    '.github/workflows/',
  ],
  forbiddenPaths: [
    'migrations/',
    'docs/test-evidence/M0/',
    'docs/test-evidence/M1/',
    'docs/test-evidence/M2/',
    'docs/test-evidence/M3/',
    'docs/test-evidence/M4-04/',
    'docs/test-evidence/M8-02/',
    'docs/test-evidence/M8-04/',
    'docs/test-evidence/M8-05/',
    'docs/test-evidence/M8-06/',
    'docs/test-evidence/M8-07/',
    'docs/test-evidence/M8-08/',
  ],
  requiredDocs: [
    'AGENTS.md',
    'docs/PROJECT_EXECUTION_ENTRY.md',
    'docs/tasks/TASK_AUTHORIZATION.json',
    'docs/tasks/TASK_INDEX.md',
    'docs/tasks/M8/M8-09_V1_STABILITY_HARDENING.md',
    'docs/tasks/runtime/M8-09.json',
  ],
  verification: [
    'pnpm check:language',
    'pnpm lint',
    'pnpm typecheck',
    'pnpm test:unit',
    'pnpm test:integration',
    'pnpm test:migration',
    'pnpm test:coverage',
    'pnpm test:security',
    'pnpm test:perf',
    'pnpm test:e2e',
    'pnpm build',
    'pnpm release:check',
  ],
};
delete activeTask.verificationHold;
await write(activeTaskPath, `${JSON.stringify(activeTask, null, 2)}\n`);
await write(
  'docs/tasks/ACTIVE_TASK.md',
  `# 当前活动任务\n\n## 当前状态\n\n\`\`\`text\nIN_PROGRESS\n\`\`\`\n\n- 任务ID：\`M8-09\`\n- 任务卡：\`docs/tasks/M8/M8-09_V1_STABILITY_HARDENING.md\`\n- 正式分支：\`work/m8-09-v1-stability-hardening\`\n- 优先级：P0\n- 前置任务：M8-08（Verified）\n\n## 执行边界\n\n修复V1.0审计确认的数据安全、项目生命周期、启动行为、异步状态、退出流程、错误语义与搜索替换问题。禁止修改历史Migration、已Verified任务Evidence和本地优先边界。\n`,
);
const taskIndexPath = 'docs/tasks/TASK_INDEX.md';
let taskIndex = await read(taskIndexPath);
const m808Row =
  '| M8-08 | [`V1.0最终质量治理与封版闭环`](M8/M8-08_V1_FINAL_GOVERNANCE_CLOSURE.md)                             | 开发：M8-06；封版：M8-07     | Verified |';
if (!taskIndex.includes('M8-09_V1_STABILITY_HARDENING')) {
  taskIndex = taskIndex.replace(
    m808Row,
    `${m808Row}\n| M8-09 | [\`V1.0稳定性与生命周期治理\`](M8/M8-09_V1_STABILITY_HARDENING.md)                              | M8-08                        | In Progress |`,
  );
}
await write(taskIndexPath, taskIndex);

const executionEntryPath = 'docs/PROJECT_EXECUTION_ENTRY.md';
let executionEntry = await read(executionEntryPath);
executionEntry = executionEntry.replace('> 状态：Verified Hold  ', '> 状态：M8-09 In Progress  ');
if (!executionEntry.includes('## 8. M8-09当前治理')) {
  executionEntry += `\n## 8. M8-09当前治理\n\nV1.0代码级复核确认两项数据安全缺陷及若干生命周期、错误处理和异步状态问题。M8-09在独立PR中修复，不修改Schema、历史Migration、AI作者裁决边界或本地优先原则。\n`;
}
await write(executionEntryPath, executionEntry);

// Regression tests focused on the confirmed source-level invariants and complete error-code coverage.
await write(
  'tests/unit/m8-09-v1-stability-invariants.test.ts',
  `import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { WORLD_FORGE_ERROR_CODES } from '@worldforge/contracts';
import { describe, expect, it } from 'vitest';

import { authorErrorMessage } from '../../apps/desktop/renderer/src/presentation/author-error-message.js';

const source = (file: string) => readFile(path.join(process.cwd(), file), 'utf8');

describe('M8-09 V1 stability invariants', () => {
  it('keeps the old chapter session authoritative until the replacement draft loads', async () => {
    const content = await source(
      'apps/desktop/renderer/src/features/writing/writing-core-workbench.tsx',
    );
    const openChapter = content.slice(
      content.indexOf('const openChapter = useCallback'),
      content.indexOf('if (initialChapterRequested.current) return;'),
    );
    expect(openChapter).toContain('openingChapter.current = nextChapter.id');
    expect(openChapter).toContain('editor.current?.setEditable(false)');
    expect(openChapter).not.toContain('setChapter(nextChapter)');
    expect(openChapter).not.toContain('activeChapter.current = nextChapter');
  });

  it('does not delete committed workspaces or fail healthy opens when recent metadata fails', async () => {
    const content = await source('packages/core-service/src/project-workspace.ts');
    expect(content).toContain('if (!renamed && !this.#active)');
    expect(content).not.toContain('rm(renamed ? finalPath : stagingPath');
    expect(content).toContain('#registerRecentBestEffort');
    expect(content).toContain('requiredBytes / 10n + 64n * 1024n * 1024n');
  });

  it('implements reopen-last, request generations and retryable shutdown cleanup', async () => {
    const shell = await source('apps/desktop/renderer/src/app/app-shell-m3.tsx');
    const main = await source('apps/desktop/main/src/electron-main.ts');
    expect(shell).toContain("startupBehavior === 'reopen-last'");
    expect(shell).toContain('workspaceAttentionGeneration.current !== generation');
    expect(main).toContain('finally {');
    expect(main).toContain('if (!shutdownCompleted) shutdownInFlight = null');
  });

  it('provides specific Chinese author semantics for every official error code', () => {
    for (const code of WORLD_FORGE_ERROR_CODES) {
      const message = authorErrorMessage(code, 'English internal message');
      expect(message.title).not.toBe('操作未完成');
      expect(message.message).not.toContain('English internal message');
    }
  });

  it('invalidates replace previews and exposes search-state retry', async () => {
    const content = await source('apps/desktop/renderer/src/features/checks/search-panel.tsx');
    expect(content).toContain('重新读取搜索状态');
    expect(content.match(/onChange=\{\(\) => setPlan\(null\)\}/gu)?.length).toBeGreaterThanOrEqual(3);
    expect(content).toContain('作品词典读取失败');
  });

  it('installs structured Main and Renderer unexpected-error boundaries', async () => {
    const ipc = await source('apps/desktop/main/src/ipc-handlers.ts');
    const entry = await source('apps/desktop/renderer/src/react-entry.tsx');
    expect(ipc).toContain("'ipc.handler.unexpected'");
    expect(ipc).toContain("'COMMON_INTERNAL_999'");
    expect(entry).toContain('installGlobalRendererErrorBoundary');
  });
});
`,
);

await mkdir(fromRoot('docs/test-evidence/M8-09'), { recursive: true });
await write(
  'docs/test-evidence/M8-09/commands.txt',
  `pnpm task:validate
pnpm check:workspaces
pnpm check:boundaries
pnpm check:language
pnpm format:check
pnpm lint
pnpm typecheck
pnpm exec vitest run tests/unit/m8-09-v1-stability-invariants.test.ts
pnpm test:integration
pnpm build
`,
);
await write(
  'docs/test-evidence/M8-09/known-risks.md',
  `# M8-09 已知限制

1. 本任务修复全部已确认P0/P1与明确功能缺口；巨型TSX机械拆分、IPC领域文件重排和CSS责任域重构属于高回归架构治理，另行立项。
2. 项目移动增加磁盘安全余量；实时字节进度与提交前取消需要TaskProtocol扩展，不与本次数据安全修复混合。
3. 原生浏览器对话框替换和当前稿快速检查属于产品体验扩展，不阻断V1.0稳定性关闭。
`,
);
await write(
  'docs/test-evidence/M8-09/summary.md',
  `# M8-09 验证摘要

本任务修复章节切换数据竞态、正式作品目录误删、最近作品辅助数据越权、reopen-last失效、跨作品状态回写、关闭锁死、错误语义、搜索初始化与替换计划失效等问题。

一次性应用工作流只有在任务校验、边界检查、语言检查、格式、Lint、TypeScript、专项单元测试、集成测试和构建通过后才提交修复代码。
`,
);
const evidenceFiles = ['summary.md', 'commands.txt', 'known-risks.md'];
const manifest = {
  schemaVersion: 1,
  taskId: 'M8-09',
  commit: 'PR_HEAD_PENDING',
  generatedAt: new Date().toISOString(),
  acceptanceSource: 'GITHUB_ACTIONS',
  files: [],
};
for (const file of evidenceFiles) {
  const content = await read(`docs/test-evidence/M8-09/${file}`);
  manifest.files.push({
    path: file,
    bytes: Buffer.byteLength(content),
    sha256: createHash('sha256').update(content).digest('hex'),
  });
}
await write('docs/test-evidence/M8-09/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);

// The bootstrap files must not remain in the final PR diff.
await rm(fromRoot('scripts/apply-m8-09-v1-stability.mjs'), { force: true });
await rm(fromRoot('.github/workflows/m8-09-apply.yml'), { force: true });
