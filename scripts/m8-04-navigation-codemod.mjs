/* global console */
import { readFile, writeFile } from 'node:fs/promises';

const replacementsByFile = {
  'apps/desktop/renderer/src/app/app-shell-m3.tsx': [
    [
      `import {\n  createPrimaryNavigationItems,\n  resolvePrimaryNavigationIntent,\n  restoreAppShellRoute,\n  type AppDisclosureMode,\n  type PrimaryNavigationId,\n} from '../shell/app-shell-model.js';`,
      `import {\n  createPrimaryNavigationItems,\n  resolvePrimaryNavigationIntent,\n  restoreAppShellRoute,\n  type AppDisclosureMode,\n  type PrimaryNavigationId,\n} from '../shell/app-shell-model.js';\nimport {\n  resolveAuthorNavigationTarget,\n  type AuthorNavigationTarget,\n} from '../shell/navigation-target.js';`,
    ],
    [
      `  const route = useRendererUiStore((state) => state.route);\n  const foregroundTaskId = useRendererUiStore((state) => state.foregroundRequestKey);\n  const dispatch = useRendererUiStore((state) => state.dispatch);`,
      `  const route = useRendererUiStore((state) => state.route);\n  const selection = useRendererUiStore((state) => state.selection);\n  const navigationQuery = useRendererUiStore((state) => state.filters['navigation.query'] ?? null);\n  const foregroundTaskId = useRendererUiStore((state) => state.foregroundRequestKey);\n  const dispatch = useRendererUiStore((state) => state.dispatch);`,
    ],
    [
      `  const projectChanged = useCallback(`,
      `  const navigateToAuthorTarget = useCallback(\n    (target: AuthorNavigationTarget): void => {\n      const resolution = resolveAuthorNavigationTarget(target);\n      void (async () => {\n        if (route !== resolution.route && isWritingRoute(route) && !(await flushWriting())) {\n          setMessage('自动保存失败，已阻止离开当前写作会话。');\n          return;\n        }\n        setFailure(null);\n        setMessage(null);\n        if (target.type === 'entity') setCanonSection('entities');\n        dispatch({ type: 'select', selection: resolution.selection });\n        for (const [key, value] of Object.entries(resolution.filters)) {\n          dispatch({ type: 'set-filter', key, value });\n        }\n        dispatch({\n          type: 'navigate',\n          route: resolution.route,\n          returnLocation: { route, focusKey: null },\n        });\n      })();\n    },\n    [dispatch, flushWriting, route],\n  );\n\n  const projectChanged = useCallback(`,
    ],
    [
      `              section={canonSection}\n              onSectionChange={setCanonSection}`,
      `              section={canonSection}\n              selectedEntityId={selection.entityId}\n              onSectionChange={setCanonSection}`,
    ],
    [
      `              panel={writingPanel}\n              project={activeProject}`,
      `              panel={writingPanel}\n              project={activeProject}\n              navigationChapterId={selection.chapterId}\n              navigationLogicalBlockId={selection.logicalBlockId}\n              navigationVersionId={selection.versionId}\n              navigationQuery={navigationQuery}`,
    ],
    [
      `              readOnly={activeProject.databaseMode === 'read-only'}\n              onOpenCanon={() => {\n                setCanonSection('entities');\n                void transitionToRoute('canon');\n              }}\n              onOpenWriting={() => void transitionToRoute('writing')}`,
      `              readOnly={activeProject.databaseMode === 'read-only'}\n              onNavigate={navigateToAuthorTarget}`,
    ],
    ['Core状态读取失败', '本地服务状态读取失败'],
    ['Core需要处理', '本地服务需要处理'],
    ['直到Core恢复健康。', '直到本地服务恢复正常。'],
    ['Core将复制、校验后再切换。', '本地服务将复制、校验后再切换。'],
    ['Core重启失败', '本地服务重启失败'],
    ['Core已进入', '本地服务已进入'],
    ['Core · ', '本地服务 · '],
  ],
  'apps/desktop/renderer/src/features/checks/search-panel.tsx': [
    ["if (status === 'expired') return '预览已经过期';", "if (status === 'stale') return '预览已经过期';"],
  ],
  'apps/desktop/renderer/src/features/writing/writing-core-workbench.tsx': [
    [
      `  readonly panel: WritingPanel;\n  readonly onPanelChange: (panel: WritingPanel) => void;`,
      `  readonly panel: WritingPanel;\n  readonly navigationChapterId?: string | null;\n  readonly navigationLogicalBlockId?: string | null;\n  readonly navigationVersionId?: string | null;\n  readonly navigationQuery?: string | null;\n  readonly onPanelChange: (panel: WritingPanel) => void;`,
    ],
    [
      `  panel,\n  onPanelChange,\n  onStatus,`,
      `  panel,\n  navigationChapterId,\n  navigationLogicalBlockId,\n  navigationVersionId,\n  navigationQuery,\n  onPanelChange,\n  onStatus,`,
    ],
    [
      `  const initialChapterRequested = useRef(false);\n  const continuationTimer`,
      `  const initialChapterRequested = useRef(false);\n  const handledNavigationKey = useRef<string | null>(null);\n  const continuationTimer`,
    ],
    [
      `  useEffect(() => {\n    if (!statusNotice || panel !== 'editor' || !editorReady) return;\n    setStatus(statusNotice);\n    onStatusNoticeConsumed?.();\n  }, [editorReady, onStatusNoticeConsumed, panel, setStatus, statusNotice]);`,
      `  useEffect(() => {\n    if (!statusNotice || panel !== 'editor' || !editorReady) return;\n    setStatus(statusNotice);\n    onStatusNoticeConsumed?.();\n  }, [editorReady, onStatusNoticeConsumed, panel, setStatus, statusNotice]);\n\n  useEffect(() => {\n    if (panel !== 'editor' || !editorReady || !navigationLogicalBlockId) return;\n    const target = Array.from(\n      editorHost.current?.querySelectorAll<HTMLElement>('[data-logical-block-id]') ?? [],\n    ).find((element) => element.dataset.logicalBlockId === navigationLogicalBlockId);\n    if (!target) {\n      setStatus('目标段落已经变化，系统没有跳转到可能错误的位置。请在当前章节重新搜索。');\n      return;\n    }\n    target.scrollIntoView({ block: 'center', behavior: 'smooth' });\n    target.dataset.navigationHighlight = 'true';\n    if (navigationQuery) setFindText(navigationQuery);\n    const timer = window.setTimeout(() => {\n      delete target.dataset.navigationHighlight;\n    }, 2_400);\n    return () => window.clearTimeout(timer);\n  }, [editorReady, navigationLogicalBlockId, navigationQuery, panel, setStatus]);`,
    ],
    [
      `      const continuedChapter =\n        initialContinuation?.status === 'ready'\n          ? chapters.find((candidate) => candidate.id === initialContinuation.chapterId)\n          : undefined;\n      const nextChapter = continuedChapter ?? chapters[0];`,
      `      const requestedChapter = navigationChapterId\n        ? chapters.find((candidate) => candidate.id === navigationChapterId)\n        : undefined;\n      const continuedChapter =\n        initialContinuation?.status === 'ready'\n          ? chapters.find((candidate) => candidate.id === initialContinuation.chapterId)\n          : undefined;\n      const nextChapter = requestedChapter ?? continuedChapter ?? chapters[0];\n      if (requestedChapter) {\n        handledNavigationKey.current = navigationKey(\n          panel,\n          navigationChapterId,\n          navigationLogicalBlockId,\n          navigationVersionId,\n        );\n      }`,
    ],
    [
      `  }, [bridge, initialContinuation, onStatus, openChapter, project.projectId]);`,
      `  }, [\n    bridge,\n    initialContinuation,\n    navigationChapterId,\n    navigationLogicalBlockId,\n    navigationVersionId,\n    onStatus,\n    openChapter,\n    panel,\n    project.projectId,\n  ]);\n\n  useEffect(() => {\n    if (!navigationChapterId || !initialChapterRequested.current) return;\n    const key = navigationKey(\n      panel,\n      navigationChapterId,\n      navigationLogicalBlockId,\n      navigationVersionId,\n    );\n    if (handledNavigationKey.current === key) return;\n    handledNavigationKey.current = key;\n    if (activeChapter.current?.id === navigationChapterId) return;\n    let active = true;\n    void bridge.planning.listStructure(project.projectId, { mode: 'replace' }).then((outcome) => {\n      if (!active || outcome.state !== 'success') return;\n      const requested = outcome.data.volumes\n        .flatMap((volume) => volume.chapters)\n        .find((candidate) => candidate.id === navigationChapterId);\n      if (!requested) {\n        setStatus('目标章节已经变化，系统没有跳转到可能错误的位置。');\n        return;\n      }\n      void openChapter(requested);\n    });\n    return () => {\n      active = false;\n    };\n  }, [\n    bridge,\n    navigationChapterId,\n    navigationLogicalBlockId,\n    navigationVersionId,\n    openChapter,\n    panel,\n    project.projectId,\n    setStatus,\n  ]);`,
    ],
    [
      `              project={project}\n              flush={flush}`,
      `              project={project}\n              navigationVersionId={navigationVersionId}\n              flush={flush}`,
    ],
    [
      `  project,\n  flush,\n  onClose,`,
      `  project,\n  navigationVersionId,\n  flush,\n  onClose,`,
    ],
    [
      `  readonly project: ProjectWorkspaceSummary;\n  readonly flush: () => Promise<boolean>;`,
      `  readonly project: ProjectWorkspaceSummary;\n  readonly navigationVersionId?: string | null;\n  readonly flush: () => Promise<boolean>;`,
    ],
    [
      `  useEffect(() => void refresh(), [refresh]);`,
      `  useEffect(() => void refresh(), [refresh]);\n\n  useEffect(() => {\n    if (!navigationVersionId) return;\n    void bridge.version\n      .get(\n        {\n          projectId: project.projectId,\n          chapterId: chapter.id,\n          versionId: navigationVersionId,\n        },\n        { mode: 'replace' },\n      )\n      .then((outcome) => {\n        if (outcome.state === 'success') {\n          setSelected(outcome.data);\n          setStatus(\`正在比较：\${outcome.data.title}\`);\n        } else if (outcome.state === 'failure') {\n          setStatus('目标历史版本已经变化，请重新搜索。');\n        }\n      });\n  }, [bridge, chapter.id, navigationVersionId, project.projectId]);`,
    ],
    ["  const [status, setStatus] = useState('Version只读不可变；恢复会创建新Draft。');", "  const [status, setStatus] = useState('历史版本只读不可变；恢复会创建新的当前稿。');"],
    ["setStatus('自动保存失败，未创建Version。');", "setStatus('自动保存失败，未创建历史版本。');"],
    ["setStatus(\`Version“\${outcome.data.title}”已创建，内容不可修改。\`);", "setStatus(\`历史版本“\${outcome.data.title}”已创建，内容不可修改。\`);"],
    ["onDraftReplace(outcome.data, '已从只读版本恢复为新草稿。');", "onDraftReplace(outcome.data, '已从只读历史版本恢复为新当前稿。');"],
    ["setStatus('恢复成功；原Version与原Draft记录保持不变。');", "setStatus('恢复成功；原历史版本与原当前稿记录保持不变。');"],
    ['<h2>Version历史与比较</h2>', '<h2>历史版本与比较</h2>'],
    ['<p>Version不可变；左侧为当前已保存Draft，右侧为选中Version。</p>', '<p>历史版本不可变；左侧为当前已保存正文，右侧为选中的历史版本。</p>'],
    ['创建Version', '创建历史版本'],
    ['还没有手动Version。', '还没有手动保存的历史版本。'],
    ['Revision {version.sourceRevision}', '保存序号 {version.sourceRevision}'],
    ['恢复为新Draft', '恢复为新当前稿'],
    ['<strong>当前Draft</strong>', '<strong>当前稿</strong>'],
    ["<strong>{selected?.title ?? '选择Version比较'}</strong>", "<strong>{selected?.title ?? '选择历史版本比较'}</strong>"],
    ["setStatus('Draft已更新；返回正文后重建编辑器。');", "setStatus('当前稿已更新；返回正文后重建编辑器。');"],
    ["setStatus('正在从项目数据库读取DraftBlock…');", "setStatus('正在从作品数据库读取正文…');"],
    ['`已保存 · Revision ${activeDraft.current?.revision ?? 0}`', '`已保存 · 保存序号 ${activeDraft.current?.revision ?? 0}`'],
    ['`自动保存完成 · Revision ${activeDraft.current?.revision ?? 0}`', '`自动保存完成 · 保存序号 ${activeDraft.current?.revision ?? 0}`'],
    ['`已手动保存 · Revision ${activeDraft.current?.revision ?? 0}`', '`已手动保存 · 保存序号 ${activeDraft.current?.revision ?? 0}`'],
    ['`预览只读取已持久化Draft Revision ${draft.revision}，不会写入项目数据库。`', '`预览只读取已保存的当前稿（保存序号 ${draft.revision}），不会写入作品数据库。`'],
    ["useState('选择Provider后可生成候选。')", "useState('选择AI连接后可生成建议稿。')"],
    ["setStatus('当前章节没有Candidate。');", "setStatus('当前章节没有建议稿。');"],
    ['`可整体撤销 · 基础 Revision ${outcome.data.candidate.baseDraftRevision}`', '`可整体撤销 · 基础保存序号 ${outcome.data.candidate.baseDraftRevision}`'],
    ['`已准备采用 · 基础 Revision ${outcome.data.candidate.baseDraftRevision} · ${outcome.data.execution.strategy}`', '`已准备采用 · 基础保存序号 ${outcome.data.candidate.baseDraftRevision} · ${outcome.data.execution.strategy}`'],
    ["window.confirm('丢弃后不能再采用，Draft不会改变。继续吗？')", "window.confirm('丢弃后不能再采用，当前稿不会改变。继续吗？')"],
    ["setStatus('候选已丢弃，Draft 未改变。');", "setStatus('建议稿已丢弃，当前稿未改变。');"],
    ['`发现${outcome.data.conflictSet.conflicts.length}项冲突，Draft未改变。`', '`发现${outcome.data.conflictSet.conflicts.length}项冲突，当前稿未改变。`'],
    ['`采用成功 · Revision ${outcome.data.draft.revision}`', '`采用成功 · 保存序号 ${outcome.data.draft.revision}`'],
    ["setStatus('当前稿已变化，撤销进入冲突且未修改Draft。');", "setStatus('当前稿已变化，撤销进入冲突且未修改正文。');"],
    ["setStatus('撤销冲突，Draft未改变。');", "setStatus('撤销冲突，当前稿未改变。');"],
    ['`已撤销本次应用 · Revision ${restoredDraft.revision}`', '`已撤销本次应用 · 保存序号 ${restoredDraft.revision}`'],
    ["setGenerationStatus('所选候选没有关联到对应 SceneBeat 的正文块，请改用 Segment 融合。');", "setGenerationStatus('所选建议稿没有关联到对应场景节拍的正文块，请改用分段融合。');"],
    ['<h2>AI 创作与 Candidate 工作台</h2>', '<h2>AI创作与建议稿工作台</h2>'],
    ['            Provider\n', '            AI连接\n'],
    ['<dt>Provider / 模型</dt>', '<dt>AI连接 / 模型</dt>'],
    [
      `function CandidatePanel({`,
      `function navigationKey(\n  panel: WritingPanel,\n  chapterId: string | null | undefined,\n  logicalBlockId: string | null | undefined,\n  versionId: string | null | undefined,\n): string {\n  return [panel, chapterId ?? '', logicalBlockId ?? '', versionId ?? ''].join(':');\n}\n\nfunction CandidatePanel({`,
    ],
  ],
  'apps/desktop/renderer/src/features/canon/canon-core-workbench.tsx': [
    [
      `  readonly section: CanonSection;\n  readonly onSectionChange: (section: CanonSection) => void;`,
      `  readonly section: CanonSection;\n  readonly selectedEntityId?: string | null;\n  readonly onSectionChange: (section: CanonSection) => void;`,
    ],
    [
      `  readOnly,\n  section,\n  onSectionChange,`,
      `  readOnly,\n  section,\n  selectedEntityId,\n  onSectionChange,`,
    ],
    [
      `<EntityCanonPanel bridge={bridge} projectId={projectId} readOnly={readOnly} />`,
      `<EntityCanonPanel\n          bridge={bridge}\n          projectId={projectId}\n          readOnly={readOnly}\n          selectedEntityId={selectedEntityId}\n        />`,
    ],
    [
      `  readOnly,\n}: {\n  readonly bridge: RendererBridgeAdapter;\n  readonly projectId: string;\n  readonly readOnly: boolean;\n}) {`,
      `  readOnly,\n  selectedEntityId,\n}: {\n  readonly bridge: RendererBridgeAdapter;\n  readonly projectId: string;\n  readonly readOnly: boolean;\n  readonly selectedEntityId?: string | null;\n}) {`,
    ],
    [
      `  useEffect(() => {\n    if (!selectedId && resource.data?.entities[0]) setSelectedId(resource.data.entities[0].id);\n  }, [resource.data, selectedId]);`,
      `  useEffect(() => {\n    if (\n      selectedEntityId &&\n      resource.data?.entities.some((entity) => entity.id === selectedEntityId)\n    ) {\n      setSelectedId(selectedEntityId);\n      setNewEntity(false);\n      return;\n    }\n    if (!selectedId && resource.data?.entities[0]) setSelectedId(resource.data.entities[0].id);\n  }, [resource.data, selectedEntityId, selectedId]);`,
    ],
  ],
  'apps/desktop/renderer/src/m3.css': [
    [
      `.worldforge-editor {\n  min-height: 31rem;`,
      `.worldforge-editor [data-navigation-highlight='true'] {\n  outline: 2px solid var(--focus-ring, currentColor);\n  outline-offset: 0.25rem;\n  border-radius: 0.25rem;\n}\n\n.worldforge-editor {\n  min-height: 31rem;`,
    ],
  ],
};

for (const [filePath, replacements] of Object.entries(replacementsByFile)) {
  let source = await readFile(filePath, 'utf8');
  for (const [before, after] of replacements) {
    if (!source.includes(before)) {
      throw new Error(`${filePath} 缺少预期片段：${before.slice(0, 140)}`);
    }
    source = source.replace(before, after);
  }
  await writeFile(filePath, source, 'utf8');
}

const governedPath = 'docs/product/AUTHOR_LANGUAGE_GOVERNED_PATHS.json';
const governed = JSON.parse(await readFile(governedPath, 'utf8'));
for (const filePath of [
  'apps/desktop/renderer/src/app/app-shell-m3.tsx',
  'apps/desktop/renderer/src/shell/navigation-target.ts',
  'apps/desktop/renderer/src/features/checks/search-panel.tsx',
  'apps/desktop/renderer/src/features/checks/checks-workbench.tsx',
  'apps/desktop/renderer/src/features/writing/writing-workbench.tsx',
  'apps/desktop/renderer/src/features/writing/writing-core-workbench.tsx',
  'apps/desktop/renderer/src/features/canon/canon-workbench.tsx',
  'apps/desktop/renderer/src/features/canon/canon-core-workbench.tsx',
  'tests/unit/renderer-navigation-target.test.ts',
]) {
  if (!governed.paths.includes(filePath)) governed.paths.push(filePath);
}
await writeFile(governedPath, `${JSON.stringify(governed, null, 2)}\n`, 'utf8');
console.log('内容精准跳转已接入应用壳、正文、历史版本与人物设定。');
