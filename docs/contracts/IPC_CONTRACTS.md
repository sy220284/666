# WorldForge V1.0 IPC契约规格

> 状态：Frozen  
> 适用：Electron Main、Preload、Renderer与Core Service

## 1. 原则

1. Renderer只调用Preload具名白名单方法。
2. 请求、响应和事件均由`packages/contracts`中的strict Zod Schema验证。
3. 项目命令携带`projectId`，Core校验活动项目、实体归属和路径边界。
4. 普通命令使用IPC invoke；长任务增量使用MessagePort。
5. Renderer只依据稳定错误码判断业务行为。
6. 协议使用独立整数`protocolVersion`。

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

`requestId`用于命令幂等与追踪，不代替GenerationRun或Task ID。

## 3. Preload命名空间

```ts
window.worldforge = {
  app: {},
  project: {},
  planning: {},
  draft: {},
  version: {},
  candidate: {},
  entity: {},
  canon: {},
  arc: {},
  ai: {},
  validation: {},
  rhythm: {},
  todo: {},
  comment: {},
  search: {},
  dictionary: {},
  transfer: {},
  backup: {},
  trash: {},
  task: {},
  settings: {},
};

window.worldforgeContinuity = {
  list: {},
  setEntityState: {},
  invalidateEntityState: {},
  saveTimelineEvent: {},
  archiveTimelineEvent: {},
  setKnowledgeState: {},
  invalidateKnowledgeState: {},
};

window.worldforgeNarrativePlanning = {
  list: {},
  saveForeshadowing: {},
  transitionForeshadowing: {},
  saveCharacterArc: {},
  saveArcMilestone: {},
  transitionArcMilestone: {},
};

window.worldforgeStateProposal = {
  list: {},
  generate: {},
  resolve: {},
  refreshSnapshot: {},
  readSnapshot: {},
  invalidateDerived: {},
};
```

M3-04使用独立窄桥`window.worldforgeContinuity`接通连续性账本；M3-05使用`window.worldforgeNarrativePlanning`接通伏笔与人物弧光账本；M3-06使用`window.worldforgeStateProposal`接通提案裁决、尾快照和失效传播。三者均只暴露具名方法，M3-07—M3-10 Renderer架构迁移时再统一适配到正式Bridge边界。禁止暴露通用`send(channel,payload)`、Node模块、文件系统、数据库连接、环境变量和任意URL请求。

## 4. 命令目录

### 4.1 应用与项目

| 命令                           | 输入                                                            | 输出                                |
| ------------------------------ | --------------------------------------------------------------- | ----------------------------------- |
| `app.getInfo`                  | 空                                                              | 版本、平台、协议版本                |
| `app.getCoreStatus`            | 空                                                              | Core状态、PID、重启次数与安全诊断ID |
| `app.restartCore`              | 空                                                              | 接收状态与最新Core状态              |
| `app.getWindowPreferences`     | 空                                                              | 当前DIP窗口状态与显示偏好           |
| `app.setAppearancePreferences` | 工作区对齐、UI缩放、正文字号、正文宽度                          | 合并窗口状态后的完整本地偏好        |
| `app.getDisplays`              | 空                                                              | 显示器DIP信息                       |
| `project.create`               | 名称、频道、`starter/blank`初始化结构；目录由Main系统选择器提供 | 项目摘要                            |
| `project.open`                 | 项目路径                                                        | 项目摘要、兼容与只读状态            |
| `project.close`                | projectId                                                       | flush与关闭结果                     |
| `project.move`                 | projectId、目标目录                                             | 新路径与校验结果                    |
| `project.listRecent`           | 空                                                              | 最近项目列表                        |
| `project.relocateRecent`       | projectId、新路径                                               | 更新结果                            |
| `project.removeRecent`         | projectId                                                       | 更新结果                            |

### 4.2 规划与卷章

| 命令                            | Renderer输入                                          | 输出                                   |
| ------------------------------- | ----------------------------------------------------- | -------------------------------------- |
| `planning.listStructure`        | projectId                                             | 按orderKey排序的卷章树                 |
| `planning.createVolume`         | projectId、标题、可选锚点位置                         | 最新卷章树                             |
| `planning.updateVolume`         | projectId、volumeId、标题/状态Patch                   | 最新卷章树                             |
| `planning.moveVolume`           | projectId、volumeId、同级锚点位置                     | 最新卷章树                             |
| `planning.deleteVolume`         | projectId、volumeId                                   | 软删除后的卷章树                       |
| `planning.createChapter`        | projectId、volumeId、标题、可选锚点位置               | 最新卷章树                             |
| `planning.updateChapter`        | projectId、chapterId、标题/状态/目标字数Patch         | 最新卷章树                             |
| `planning.moveChapter`          | projectId、chapterId、targetVolumeId、锚点位置        | 最新卷章树                             |
| `planning.deleteChapter`        | projectId、chapterId                                  | 软删除后的卷章树                       |
| `trash.list`                    | projectId                                             | 最小TrashEntry列表                     |
| `trash.restore`                 | projectId、trashEntryId、原位或新锚点位置、可选目标卷 | 最新卷章树                             |
| `trash.previewPermanentDelete`  | projectId、trashEntryId                               | 影响数量、全部章节外键阻断项与planHash |
| `trash.permanentDelete`         | projectId、trashEntryId、planHash、完整标题确认       | 删除结果、影响数量与backupId           |
| `planning.previewSplitChapter`  | 源Draft/Revision、拆分锚点、新章标题                  | 块数/字符数、锁定冲突与planHash        |
| `planning.splitChapter`         | 同预览输入+planHash                                   | 新结构、两份Draft与backupId            |
| `planning.previewMergeChapters` | 源/目标章节、Draft和Revision                          | 合章影响、锁定冲突与planHash           |
| `planning.mergeChapters`        | 同预览输入+planHash                                   | 新结构、目标Draft、回收源章与backupId  |
| `planning.previewMoveBlocks`    | 源/目标Draft与Revision、logicalBlockIds、目标锚点     | 跨章移动影响与planHash                 |
| `planning.moveBlocks`           | 同预览输入+planHash                                   | 两份新Revision Draft与backupId         |

Renderer不得传入权威ID、`orderKey`、`deletedAt`、`activeDraftId`、`finalVersionId`、`backupId`或影响数量。实体ID由Core生成；排序位置只使用`start/end/before/after`及同级实体ID表达，Core在单写事务内计算64位整数键和必要的局部重排。

高风险结构执行前先重算预览并校验`planHash`、Draft Revision、块Hash、归属和LockGuard；预检通过后创建已验证恢复点，再在单个项目库事务中提交结构与Draft Revision。任一重校验失败都不修改原结构。

永久删除预览以SQLite外键元数据为权威来源。除受控Draft内部引用外，任何指向`chapters`的外键都必须返回`source=表名.字段名`、引用数量和`ON DELETE`动作；Version、Candidate及`CASCADE/RESTRICT/NO ACTION/SET NULL/SET DEFAULT`引用均阻断执行。Core在写事务内重新扫描并验证完整`planHash`，Renderer不得提交表名、引用数量或删除动作。

- `planning.getBrief/updateBrief`：读取或保存可为空的ProjectBrief；Renderer不得传入ID或更新时间。
- `planning.listPlotNodes`：读取按父级与orderKey组织的PlotNode列表。
- `planning.createPlotNode/updatePlotNode/movePlotNode/deletePlotNode`：节点ID与orderKey由Core生成；移动只传目标父级和同级锚点。
- `planning.listSceneBeats/createSceneBeat/updateSceneBeat/moveSceneBeat/deleteSceneBeat/restoreSceneBeat`：按章节维护SceneBeat，ID与orderKey由Core生成；删除为软删除并解除正文关联，不删除DraftBlock。
- `planning.setSceneBeatBlockLinks/convertBlocksToSceneBeat`：只接受活动Draft中的logicalBlockId；关联或转换不改正文内容与Revision。
- `planning.previewMoveSceneBeat/moveSceneBeatAcrossChapters`：先返回关联正文数量、字符数、警告和planHash；执行只移动规划数据。需要移动正文时另行调用`planning.previewMoveBlocks/moveBlocks`。

规划变更不得自动发送正文Patch。

### 4.3 Draft与编辑器

| 命令                            | 输入                              | 输出                         |
| ------------------------------- | --------------------------------- | ---------------------------- |
| `draft.get`                     | projectId、chapterId              | 活动Draft与有序DraftBlocks   |
| `draft.applyPatch`              | draftId、baseRevision、operations | 新Revision与有序DraftBlocks  |
| `draft.flush`（规划）           | draftId、baseRevision             | 新Revision或无变化           |
| `draft.undoPersistentOperation` | applyRecordId                     | 新Revision                   |
| `draft.searchCurrent`（规划）   | chapterId、query、options         | 命中锚点                     |
| `draft.replaceCurrent`（规划）  | chapterId、query、replacement     | 新Revision                   |
| `draft.getWordStats`（规划）    | chapterId                         | 字符数、纯文字字数、目标进度 |

`draft.applyPatch`必须校验项目、Revision、expectedHash和锁定块。锁定与解锁使用受控`set-lock` Patch operation，不存在可绕过Patch校验的独立写入口。

当前Preload具名方法为`draft.open(input)`和`draft.applyPatch(input)`；前者发送冻结命令值`draft.get`。自动保存和手动保存统一生成Block Patch，成功后以Core返回的Revision、logicalBlockId和contentHash同步Renderer元数据。

Renderer只可传入严格Schema允许的Patch字段。`id`、`orderKey`、`source`和`revision`均为Core权威字段；新logicalBlockId和记录ID只能由Core生成，已有logicalBlockId必须属于当前活动Draft。修改、删除、移动与锁定操作必须携带目标块expectedHash。

锁定冲突返回`DRAFT_BLOCK_LOCKED_003`。安全详情位于`error.details.lockConflict`，包含`conflicts: { kind: 'deleted' | 'modified' | 'moved'; logicalBlockId }[]`与正整数`skippedOperationCount`。任一锁定冲突都会拒绝整批Patch，详情只用于解释，没有部分成功语义。

### 4.4 Version与Candidate

| 命令                       | 输入                                                               | 输出                                      |
| -------------------------- | ------------------------------------------------------------------ | ----------------------------------------- |
| `version.create`           | chapterId、draftRevision、type、label                              | Version摘要                               |
| `version.list`             | chapterId                                                          | Version列表                               |
| `version.get`              | versionId                                                          | Version与Blocks                           |
| `version.restoreToDraft`   | versionId                                                          | 新活动Draft与Revision                     |
| `candidate.list`           | projectId、chapterId                                               | Candidate列表                             |
| `candidate.get`            | projectId、chapterId、candidateId                                  | Candidate与Blocks                         |
| `candidate.preview`        | projectId、chapterId、candidateId                                  | Draft、Candidate、结构/字符Diff与执行策略 |
| `candidate.cancelPreview`  | previewRequestId                                                   | 是否接收取消                              |
| `candidate.apply`          | projectId、chapterId、candidateId、draftId、baseRevision、选择映射 | ApplyRecord+Checkpoint+Draft或ConflictSet |
| `candidate.findUndoRecord` | projectId、chapterId、candidateId                                  | applyRecordId                             |
| `candidate.previewUndo`    | projectId、chapterId、applyRecordId                                | 回退预览、当前Draft、Checkpoint或冲突     |
| `candidate.undoApply`      | projectId、chapterId、applyRecordId、draftId、baseRevision         | 新Revision或ConflictSet                   |
| `candidate.discard`        | projectId、chapterId、candidateId                                  | 状态更新                                  |

M2-03桌面最小审阅面使用窄桥`window.worldforgeCandidatePreview`，对应IPC频道为`worldforge:candidate:preview`、`cancel-preview`、`apply`、`find-undo-record`、`preview-undo`和`undo-apply`。Preload只暴露上述具名方法；Main同时校验strict命令Schema和可信Renderer URL，额外字段、非法ID与非可信来源在进入Core前拒绝。

Preview的`requestId`同时是可取消计算标识。5001—20000字符在Core Utility Process内分片让出事件循环，20001字符以上进入Worker；取消返回后原Preview以`COMMON_CANCELLED_004`结束。Preview只读项目库，不写Draft、PatchLog或Candidate状态。

Apply选择仅允许`all`、属于当前Candidate的完整CandidateBlock集合或SceneBeat集合，未知/重复选择进入结构ConflictSet，V1不接受逐字符拼接。Apply、Checkpoint、规范Draft Patch审计日志、Revision递增、ApplyRecord和Candidate状态在同一项目库事务提交；任一失败全部回滚。成功的Apply/Undo按持久化requestId跨重启返回首次结果，同一requestId不得重新绑定到其他Candidate或Patch。Undo同样写入统一`draft_patch_log`并创建新Revision，应用后Draft已变化时只返回持久化`undo-stale` ConflictSet。

### 4.5 实体、Canon与连续性

Entity与Canon命令：

- `entity.create/update/archive/list/get`
- `canon.create/update/archive/list`

M3-04冻结的连续性命令：

| 命令                                  | IPC频道                                            | 输入                                                                                       | 输出                                           |
| ------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| `continuity.list`                     | `worldforge:continuity:list`                       | projectId、query、includeHistory、includeArchivedEvents、effectiveAtChapterId              | EntityState、TimelineEvent、KnowledgeState目录 |
| `continuity.setEntityState`           | `worldforge:continuity:set-entity-state`           | author权限、entityId、stateKey、value、章节半开区间、Evidence、sourceVersionId             | 最新连续性目录                                 |
| `continuity.invalidateEntityState`    | `worldforge:continuity:invalidate-entity-state`    | author权限、entityId、stateKey                                                             | 旧current失效后的目录                          |
| `continuity.saveTimelineEvent`        | `worldforge:continuity:save-timeline-event`        | author权限、eventId可空、时间范围/精度、章节、地点、三类人物引用、依赖                     | 最新连续性目录                                 |
| `continuity.archiveTimelineEvent`     | `worldforge:continuity:archive-timeline-event`     | author权限、eventId                                                                        | 归档后的目录                                   |
| `continuity.setKnowledgeState`        | `worldforge:continuity:set-knowledge-state`        | author权限、informationKey、characterId、认知状态、章节半开区间、Version或logicalBlock来源 | 最新连续性目录                                 |
| `continuity.invalidateKnowledgeState` | `worldforge:continuity:invalidate-knowledge-state` | author权限、informationKey、characterId                                                    | 旧current失效后的目录                          |

Main必须先校验可信Renderer URL和strict命令Schema，再把输入转换为`CoreContinuityOperationSchema`。Core返回值必须通过`CoreContinuityResultSchema`和`ContinuityCatalogResultSchema`双重校验。写命令仅接受`authority='author'`；AI权限在进入权威事务前拒绝。可比较时间才执行多地冲突、依赖循环和确定性顺序校验，`approximate/unknown`不得伪造硬裁决。

M3-05冻结的叙事规划命令：

| 命令                                        | IPC频道                                                  | 输入                                                                  | 输出               |
| ------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------- | ------------------ |
| `narrativePlanning.list`                    | `worldforge:narrative-planning:list`                     | projectId、query、includeResolved、referenceChapterId                 | 伏笔与人物弧光目录 |
| `narrativePlanning.saveForeshadowing`       | `worldforge:narrative-planning:save-foreshadowing`       | author权限、foreshadowingId可空、标题、描述、回收窗口、章节角色、关系 | 最新目录           |
| `narrativePlanning.transitionForeshadowing` | `worldforge:narrative-planning:transition-foreshadowing` | author权限、foreshadowingId、目标状态                                 | 最新目录           |
| `narrativePlanning.saveCharacterArc`        | `worldforge:narrative-planning:save-character-arc`       | author权限、arcId可空、characterId、类型、自定义类型、状态、作者意图  | 最新目录           |
| `narrativePlanning.saveArcMilestone`        | `worldforge:narrative-planning:save-arc-milestone`       | author权限、milestoneId可空、arcId、排序、计划章节、节点/时间线依赖   | 最新目录           |
| `narrativePlanning.transitionArcMilestone`  | `worldforge:narrative-planning:transition-arc-milestone` | author权限、milestoneId、planned/hit/skipped、实际章节                | 最新目录           |

Main先校验可信Renderer URL和strict命令Schema，再转换为`CoreNarrativePlanningOperationSchema`；Core返回值同时通过Core与IPC结果Schema校验。所有写命令只接受`authority='author'`，项目、章节、人物、伏笔、节点和TimelineEvent引用都在进入单写事务前校验。Core负责状态机、回收窗口、依赖环、互斥冲突和节点命中前置条件。

M3-06冻结的状态提案与尾快照命令：

| 命令                              | IPC频道                                        | 输入                                                | 输出                          |
| --------------------------------- | ---------------------------------------------- | --------------------------------------------------- | ----------------------------- |
| `stateProposal.list`              | `worldforge:state-proposal:list`               | projectId、可选chapterId、includeResolved           | 提案、快照与失效记录目录      |
| `stateProposal.generate`          | `worldforge:state-proposal:generate`           | chapterId、final Version、来源、带正文证据的提案数组 | 只新增pending后的目录         |
| `stateProposal.resolve`           | `worldforge:state-proposal:resolve`            | author权限、接受/编辑接受/拒绝批量裁决               | 权威状态与快照提交后的目录    |
| `stateProposal.refreshSnapshot`   | `worldforge:state-proposal:refresh-snapshot`   | author权限、chapterId、final Version                 | 重建后的EndingSnapshot        |
| `stateProposal.readSnapshot`      | `worldforge:state-proposal:read-snapshot`      | projectId、chapterId                                | snapshot或fallback_live_query |
| `stateProposal.invalidateDerived` | `worldforge:state-proposal:invalidate-derived` | author权限、来源章节/Version、变化类型               | 失效快照ID与排队范围          |

Main先校验可信Renderer URL和strict命令Schema，再转换为`CoreStateProposalOperationSchema`。生成只接受属于当前项目、当前章节final Version的正文Evidence；空提取合法。`resolve`、`refreshSnapshot`和`invalidateDerived`只接受author权限。批量裁决、EntityState或ArcMilestone更新和快照重建使用同一项目库事务；pending、拒绝或失败批次不得产生权威写入。`prose`变化返回空失效结果，语义变化只标记后续快照stale，不自动修改后文。

### 4.6 人物弧光

M3-05已实现CharacterArc创建/更新、ArcMilestone创建/更新/移动计划章节和作者显式状态转换。`confirmationSource='state_proposal'`由M3-06统一入口使用；没有AI直写权威状态的IPC命令。

### 4.7 AI与Provider

| 命令                                        | 输入                                   | 输出                       |
| ------------------------------------------- | -------------------------------------- | -------------------------- |
| `ai.provider.create/update/remove/list/get` | Provider元数据                         | 配置摘要                   |
| `ai.provider.setCredential`                 | providerId、凭据                       | credentialRef，不返回凭据  |
| `ai.testProvider`                           | providerId                             | 连接诊断                   |
| `ai.startGeneration`                        | runType、chapterId、baseRevision、配置 | runId、taskId、MessagePort |
| `ai.cancelGeneration`                       | runId                                  | 取消接收状态               |
| `ai.listRuns`                               | chapterId                              | Run列表                    |
| `ai.savePartialCandidate`                   | runId                                  | partial Candidate ID       |
| `ai.getModelSupport`                        | providerId、model、taskType、promptId  | 支持档案                   |

### 4.8 校验、节奏、待办与批注

- `validation.run/list/resolve/ignore/silence/downgrade/markFalsePositive`
- `rhythm.getProfile/updateProfile/run/getResults`
- `todo.create/update/complete/reopen/list/delete`
- `comment.create/update/list/delete`

RHY结果为建议级，不能通过IPC标记为发布阻断。

### 4.9 搜索、导入导出与备份

- `search.project/previewReplace/applyReplace/getIndexStatus/rebuildIndex`
- `dictionary.add/update/remove/list`
- `transfer.importPreview/importCommit/importCancel`
- `transfer.exportPreview/exportExecute`
- `backup.create/list/verify/restoreToCopy/delete`
- `recovery.createCheckpoint/getOverview/restoreCheckpoint/exportVersion`
- `trash.list/restore/permanentDelete`
- `settings.get/set/reset`

`recovery.getOverview`在项目数据库仍可读取时直接返回只读Version目录；`project.sqlite`物理不可读且`readOnlyReason=integrity-failed`时，只允许从外部Checkpoint回退。Checkpoint必须通过路径边界、普通文件且非符号链接、大小、SHA-256、SQLite完整性、外键和项目ID校验，才能向Renderer暴露Version。`recovery.exportVersion`按已验证Checkpoint顺序查找并原子写入用户选择目录，不修改损坏源库或Checkpoint。

### 4.10 通用长任务

| 命令               | 输入         | 输出         |
| ------------------ | ------------ | ------------ |
| `task.getSnapshot` | taskId       | TaskSnapshot |
| `task.cancel`      | taskId       | 接收取消状态 |
| `task.listActive`  | 可选项目筛选 | 活动任务列表 |

### 4.11 窗口偏好边界

Renderer只允许写入以下外观字段：

```ts
interface AppearancePreferences {
  workspaceAlignment: 'center' | 'left' | 'right';
  uiScalePercent: 90 | 100 | 110 | 120 | 130 | 140 | 150;
  bodyFontSize: number; // 14—28，整数
  contentWidth: 'narrow' | 'normal' | 'wide' | 'adaptive';
}
```

`displayId`、DIP坐标、`scaleFactor`和最大化状态由Electron Main读取操作系统窗口后生成，Renderer不能传入或覆盖。Main不连接SQLite；它通过私有、同样由strict Zod Schema验证的`core.window-preferences.get/set`消息委托Core读写`app.sqlite`。Preload只暴露`getWindowPreferences()`和`setAppearancePreferences()`具名方法。

## 5. 幂等与重复提交

- 所有写命令必须带`requestId`。
- Core保存短期命令结果；重复requestId返回原结果，不重复执行。
- 用户主动重新生成AI创建新requestId和GenerationRun。
- 查询命令无需持久化幂等结果。

## 6. 权限和范围校验

每条项目命令至少验证：

1. projectId与当前Core上下文匹配。
2. 目标实体属于该项目且未被无效引用。
3. 文件路径位于项目目录或用户明确选择的目标目录。
4. 操作没有越过锁定、Revision、Hash和不可变Version。
5. Renderer不能传入表名、SQL、任意路径、URL或代码扩展能力。

## 7. 超时、取消与重启

- 普通查询默认30秒以内；长任务返回taskId。
- AI、导入、导出、备份、Diff和索引重建支持取消或明确不可取消阶段。
- 取消只停止未来工作，不回滚已原子提交的事务。
- 应用关闭前按任务类型处理取消、等待或保留已持久化结果。

## 8. 契约测试

- 每条Preload方法对应输入Schema、输出Schema和错误Schema。
- Main对可信Renderer来源、额外字段、非法UUID和错误命令名执行拒绝测试。
- Core项目操作联合类型必须覆盖所有公开命令，并拒绝无法识别的operation。
- M3-04由`tests/security/continuity-ipc.test.ts`和真实Electron `tests/e2e/continuity-ledger.spec.ts`验证完整调用链。
- M3-05由`tests/security/narrative-planning-ipc.test.ts`、`tests/security/candidate-preview-ipc.test.ts`和真实Electron `tests/e2e/narrative-planning-ledger.spec.ts`验证六个具名命令、可信来源边界及桌面写入展示链路。
- M3-06由`tests/security/state-proposal-ipc.test.ts`、`tests/integration/state-proposal-snapshot.test.ts`和真实Electron `tests/e2e/state-proposal-workflow.spec.ts`验证六个具名命令、作者最终裁决、事务回滚、快照回退与桌面接受链路。
