# WorldForge V1.0 IPC契约规格

> 状态：Frozen with M8-05 Maintenance Addendum  
> 适用：Electron Main、Preload、Renderer与Core Service  
> 更新日期：2026-07-30

## 1. 原则

1. Renderer只调用Preload具名白名单方法，禁止通用`send(channel,payload)`。
2. 请求、响应和事件均由`packages/contracts`中的strict Zod Schema验证。
3. 项目命令携带`projectId`，Core校验活动项目、实体归属和路径边界。
4. 普通命令使用IPC invoke；长任务增量使用MessagePort。
5. Renderer只依据稳定错误码判断业务行为。
6. 协议使用独立整数`protocolVersion`。
7. Main必须验证消息来源是当前受信任的`worldforge-app://renderer/`页面。
8. Renderer内部请求代次只管理展示时序，不替代IPC、项目边界、事务或幂等校验。

## 2. 通用信封

```ts
interface CommandEnvelope<T> {
  protocolVersion: 1;
  requestId: string;
  command: string;
  projectId?: string;
  payload: T;
  sentAt: string;
}

interface CommandSuccess<T> {
  ok: true;
  requestId: string;
  data: T;
}

interface CommandFailure {
  ok: false;
  requestId: string;
  error: {
    code: string;
    message: string;
    retryable: boolean;
    userAction?: string;
    details?: Record<string, unknown>;
  };
}
```

`requestId`用于命令幂等与追踪，不代替GenerationRun、Task ID、搜索请求代次或建议稿预览标识。

## 3. Preload边界

正式Bridge按业务域暴露具名方法：

```text
app / project / planning / draft / version / candidate
entity / canon / continuity / narrativePlanning / stateProposal
ai / validation / rhythm / todo / comment
searchTools / transfer / backup / recovery / trash / settings
lifecycle
```

历史窄桥可以作为兼容层存在，但必须适配到同一Core命令和strict Schema，不得形成第二套业务语义。

禁止暴露：

- Node模块、文件系统、数据库连接和环境变量；
- 任意URL请求和任意IPC频道；
- 原始Provider凭据；
- SQL、表名、权威排序键、备份ID和内部路径；
- 可绕过保存序号、内容校验、锁定或项目归属的写入口。

## 4. 应用与项目

| 命令 | 输入 | 输出 |
|---|---|---|
| `app.getInfo` | 空 | 版本、平台、协议版本 |
| `app.getCoreStatus` | 空 | Core状态、PID、重启次数与安全诊断ID |
| `app.restartCore` | 空 | 接收状态与最新Core状态 |
| `app.getWindowPreferences` | 空 | 当前DIP窗口状态与显示偏好 |
| `app.setAppearancePreferences` | 工作区对齐、UI缩放、正文字号、正文宽度 | 完整本地偏好 |
| `app.getDisplays` | 空 | 显示器DIP信息 |
| `project.create` | 名称、频道、初始化结构；目录由Main选择器提供 | 项目摘要 |
| `project.open` | 项目路径 | 项目摘要、兼容与只读状态 |
| `project.close` | projectId | 刷新与关闭结果 |
| `project.move` | projectId、目标目录 | 新路径与校验结果 |
| `project.listRecent` | 空 | 最近项目列表 |
| `project.relocateRecent` | projectId、新路径 | 更新结果 |
| `project.removeRecent` | projectId | 更新结果 |

## 5. 规划与结构

主要命令：

```text
planning.getBrief / updateBrief
planning.listPlotNodes / createPlotNode / updatePlotNode / movePlotNode / deletePlotNode
planning.listStructure
planning.createVolume / updateVolume / moveVolume / deleteVolume
planning.createChapter / updateChapter / moveChapter / deleteChapter
planning.listSceneBeats / createSceneBeat / updateSceneBeat / moveSceneBeat / deleteSceneBeat / restoreSceneBeat
planning.setSceneBeatBlockLinks / convertBlocksToSceneBeat
planning.previewMoveSceneBeat / moveSceneBeatAcrossChapters
planning.previewSplitChapter / splitChapter
planning.previewMergeChapters / mergeChapters
planning.previewMoveBlocks / moveBlocks
```

规则：

- Renderer不得传入`orderKey`、`deletedAt`、`activeDraftId`、`finalVersionId`、`backupId`或影响数量。
- 排序只传`start/end/before/after`和同级实体ID，Core计算整数键。
- 高风险结构操作先返回影响摘要和`planHash`；执行时重校验计划、保存序号、正文块Hash、归属和锁定。
- 预检通过后先创建已验证恢复点，再在单个项目库事务中提交。
- 规划变更不得自动发送正文Patch。

## 6. 当前稿与历史版本

| 命令 | 输入 | 输出 |
|---|---|---|
| `draft.open` | projectId、chapterId | 活动当前稿与有序正文块 |
| `draft.applyPatch` | draftId、baseRevision、operations | 新保存序号与正文块 |
| `draft.undoPersistentOperation` | applyRecordId | 新保存序号 |
| `version.create` | chapterId、draftRevision、类型、标签 | 历史版本摘要 |
| `version.list` | chapterId | 历史版本列表 |
| `version.get` | versionId | 历史版本与正文块 |
| `version.restoreToDraft` | versionId | 新活动当前稿与保存序号 |

`draft.applyPatch`必须校验项目、保存序号、预期Hash和锁定正文块。锁定与解锁使用受控`set-lock` Patch operation；历史版本没有业务更新路径。

## 7. 建议稿与差异审阅

主要命令：

```text
candidate.list / get / preview / cancelPreview
candidate.apply / discard
candidate.findUndoRecord / previewUndo / undoApply
```

规则：

- Preview只读项目库，不写当前稿、Patch日志或建议稿状态。
- 预览标识可用于取消长差异计算。
- 采用只允许整稿、属于当前建议稿的完整正文块集合或场景节拍集合。
- 应用、恢复点、当前稿Patch、保存序号递增、ApplyRecord和建议稿状态在同一事务提交。
- 任何锁定、保存序号、Hash、类型或项目冲突都不能静默覆盖。

## 8. 设定与连续性

正式命令域：

```text
entity.create / update / archive / list / get
canon.create / update / archive / list
continuity.list / setEntityState / invalidateEntityState
continuity.saveTimelineEvent / archiveTimelineEvent
continuity.setKnowledgeState / invalidateKnowledgeState
narrativePlanning.list / saveForeshadowing / transitionForeshadowing
narrativePlanning.saveCharacterArc / saveArcMilestone / transitionArcMilestone
stateProposal.list / generate / resolve / refreshSnapshot / readSnapshot / invalidateDerived
```

所有权威写命令只接受作者权限；项目、章节、人物、事件、历史版本和正文证据引用均在进入单写事务前校验。AI只能创建pending设定更新建议，不能直接写权威状态。

## 9. AI与Provider

主要命令：

```text
ai.provider.create / update / remove / list / get
ai.provider.setCredential
ai.testProvider
ai.startGeneration / cancelGeneration / listRuns
ai.savePartialCandidate
ai.getModelSupport
```

- 凭据只由Main凭据代理解析，Renderer和数据库不接收真实值。
- Provider错误通过稳定错误码返回。
- 原始响应总量或单SSE事件超限返回`AI_RESPONSE_TOO_LARGE_014`。
- 超限、取消、断流或解析失败不能伪装为成功建议稿或设定更新建议。

## 10. 校验、搜索与交付

```text
validation.run / list / resolve / ignore / silence / downgrade / markFalsePositive
rhythm.getProfile / updateProfile / run / getResults
todo.create / update / complete / reopen / list / delete
comment.create / update / list / delete
searchTools.search / previewReplace / applyReplace / getIndexState / rebuildIndex
searchTools.listDictionary / upsertDictionary / deleteDictionary
transfer.importPreview / importCommit / importCancel
transfer.exportPreview / exportExecute
backup.create / list / verify / restoreToCopy / delete
recovery.createCheckpoint / getOverview / restoreCheckpoint / exportVersion
trash.list / restore / permanentDelete
settings.get / set / reset
```

搜索和词典规则：

- 全项目搜索只读当前稿、历史版本和实体。
- 批量替换只修改活动当前稿正文块，先生成ReplacePlan并在提交时重校验。
- 词典写入使用专用命令，不通过搜索结果间接修改实体。
- Renderer内搜索、替换、词典和索引使用独立请求代次；这是展示层时序控制，不改变IPC命令和Core事务。

## 11. 具名关闭刷新握手

关闭应用前，Main与Renderer通过专用生命周期通道刷新当前稿：

```ts
const RENDERER_SHUTDOWN_CHANNELS = {
  prepare: 'worldforge:lifecycle:shutdown-prepare',
  result: 'worldforge:lifecycle:shutdown-result',
} as const;

interface RendererShutdownPrepare {
  protocolVersion: 1;
  requestId: string;
}

interface RendererShutdownResult {
  protocolVersion: 1;
  requestId: string;
  saved: boolean;
}
```

Preload只暴露：

```ts
interface RendererLifecycleBridge {
  onShutdownPrepare(listener): () => void;
  acknowledgeShutdown(result): void;
}
```

安全规则：

1. Main只接受当前应用页面返回的结果。
2. `protocolVersion`、`requestId`和`saved`通过strict Schema；多余字段拒绝。
3. 只接受与当前请求标识一致的首个合法响应。
4. 保存失败、Renderer无响应或超时都返回关闭失败，不静默退出。
5. 完成、失败和超时后移除监听器，避免跨关闭请求复用。
6. 操作系统级强制结束仍依赖既有自动保存和恢复机制，不视为握手成功。

## 12. 幂等、权限与范围

- 所有写命令必须带`requestId`；重复标识返回首次结果，不重复执行。
- 查询命令不持久化幂等结果，但Renderer可以用请求代次忽略过期响应。
- 每条项目命令验证活动项目、对象归属、真实路径、只读状态、锁定、保存序号和内容Hash。
- Renderer不能传入SQL、表名、任意路径、任意URL或代码扩展能力。

## 13. 超时、取消与重启

- 普通查询默认30秒以内；长任务返回taskId。
- AI、导入、导出、备份、差异和索引重建支持取消或明确不可取消阶段。
- 取消只停止未来工作，不回滚已经原子提交的事务。
- 应用关闭前按任务类型处理取消、等待或保留持久化结果。
- 重启后只查询真实持久化任务状态，不伪装恢复已经消失的网络流。

## 14. 契约测试

必须覆盖：

- 每条Preload方法的输入、输出和错误Schema。
- 可信Renderer来源、多余字段、非法UUID和错误命令名拒绝。
- Core项目操作联合类型覆盖全部公开命令。
- 建议稿预览取消、应用事务、重启幂等和冲突路径。
- 生命周期关闭握手的来源校验、请求标识、strict Schema、保存失败和超时。
- Provider响应超限错误码通过IPC后保持稳定且不泄露原始响应。
- 搜索、替换、词典和索引的请求代次隔离在Renderer单元与Electron端到端中验证。
