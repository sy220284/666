# WorldForge IPC契约规格

> 状态：Approved  
> 适用：Electron Main、Preload、Renderer与Core Service

## 1. 设计原则

1. Renderer不获得原始`ipcRenderer`，只调用Preload暴露的具名白名单方法。
2. 所有请求、响应和事件使用`packages/contracts`中的Zod Schema验证。
3. 所有项目命令携带`projectId`，Core验证活动项目和路径边界。
4. 命令与流式事件分离：普通请求使用IPC invoke；AI增量使用MessagePort。
5. IPC错误使用稳定错误码，不向Renderer暴露堆栈和内部路径。
6. 协议变更遵守独立`protocolVersion`。

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
    details?: Record<string, unknown>;
  };
}
```

`requestId`用于命令级追踪和重复提交保护，不代替GenerationRun ID。

## 3. Preload命名空间

```ts
window.worldforge = {
  app: {},
  project: {},
  draft: {},
  version: {},
  candidate: {},
  planning: {},
  continuity: {},
  ai: {},
  validation: {},
  search: {},
  transfer: {},
  backup: {},
  settings: {}
}
```

禁止暴露：

- 通用`send(channel, payload)`。
- Node模块、文件系统对象、数据库连接和环境变量。
- 任意URL请求能力。

## 4. P0命令目录

### 4.1 应用与项目

| 命令 | 输入 | 输出 | 说明 |
|---|---|---|---|
| `app.getInfo` | 空 | 版本、平台、协议版本 | 不含敏感路径 |
| `app.getDisplays` | 空 | 显示器DIP信息 | 窗口恢复使用 |
| `project.create` | 名称、目录、模式、最小初始化数据 | 项目摘要 | 创建工作空间和数据库 |
| `project.open` | 项目路径 | 项目摘要、兼容状态 | 检查Schema和完整性 |
| `project.close` | projectId | 保存与关闭结果 | 完成待提交写入 |
| `project.move` | projectId、目标目录 | 新路径 | 关闭、复制、校验、注册 |
| `project.listRecent` | 空 | 最近项目列表 | 来自`app.sqlite` |

### 4.2 Draft与编辑器

| 命令 | 输入 | 输出 |
|---|---|---|
| `draft.get` | projectId、chapterId | Draft与Blocks |
| `draft.applyPatch` | draftId、baseRevision、Patch列表 | 新Revision、修改摘要 |
| `draft.undoPersistentOperation` | applyRecordId | 新Revision |
| `draft.setBlockLock` | draftId、logicalBlockId、locked、baseRevision | 新Revision |
| `draft.searchCurrent` | chapterId、query、options | 命中锚点 |
| `draft.getWordStats` | chapterId | 字符数、纯文字字数、目标进度 |

`draft.applyPatch`必须校验Revision、`expectedHash`和锁定块。

### 4.3 Version与Candidate

| 命令 | 输入 | 输出 |
|---|---|---|
| `version.create` | chapterId、draftRevision、type、label | Version摘要 |
| `version.list` | chapterId | Version列表 |
| `version.restoreToDraft` | versionId | 新Draft/新Revision |
| `candidate.list` | chapterId、筛选 | Candidate列表 |
| `candidate.get` | candidateId | Candidate与Blocks |
| `candidate.diff` | candidateId、currentRevision、viewOptions | Diff摘要或流式任务ID |
| `candidate.apply` | candidateId、baseRevision、选择映射 | 新Revision、ApplyRecord或冲突集 |
| `candidate.discard` | candidateId | 状态更新 |

### 4.4 规划与连续性

- `planning.createVolume/updateVolume/moveVolume`
- `planning.createChapter/updateChapter/moveChapter`
- `planning.createPlotNode/updatePlotNode/movePlotNode`
- `planning.createSceneBeat/updateSceneBeat/moveSceneBeat`
- `planning.splitChapter/mergeChapters/moveSceneAcrossChapters`
- `entity.create/update/list/get`
- `canon.create/update/archive`
- `state.listCurrent/listHistory`
- `stateProposal.list/accept/editAndAccept/reject`
- `timeline.create/update/list`
- `knowledge.create/update/list`
- `foreshadowing.create/update/list`
- `snapshot.get/markStale/rebuild`

规划变更不得自动发送正文Patch。

### 4.5 AI

| 命令 | 输入 | 输出 |
|---|---|---|
| `ai.testProvider` | providerId | 连接诊断 |
| `ai.startGeneration` | runType、chapterId、baseRevision、配置 | runId、MessagePort |
| `ai.cancelGeneration` | runId | 接收取消结果 |
| `ai.listRuns` | chapterId | Run列表 |
| `ai.savePartialCandidate` | runId | partial Candidate ID |
| `ai.getModelSupport` | providerId、model | 支持档案 |

### 4.6 校验、搜索、导入导出和备份

- `validation.run/list/resolve/silence`
- `search.project/previewReplace/applyReplace`
- `dictionary.add/update/remove/list`
- `import.preview/commit/cancel`
- `export.preview/execute`
- `backup.create/list/verify/restoreToCopy/delete`
- `trash.list/restore/permanentDelete`
- `settings.get/set/reset`

## 5. 幂等与重复提交

- 写命令必须带`requestId`。
- Core保存短期命令结果，重复`requestId`返回原结果，不重复执行。
- 用户主动重新生成AI必须创建新`requestId`和新GenerationRun。
- 查询命令无需持久化幂等结果。

## 6. 权限和范围校验

每条项目命令至少验证：

1. `projectId`与当前Core上下文匹配。
2. 目标实体属于该项目。
3. 文件路径位于项目目录或用户明确选择的目标目录。
4. 操作没有越过锁定、Revision和不可变Version边界。
5. Renderer不能通过传入任意表名、SQL、路径或URL扩展能力。

## 7. 超时与取消

- 普通查询默认30秒以内；长任务返回任务ID并走事件协议。
- AI、导入、导出、备份、Diff和重建索引必须支持取消或明确不可取消阶段。
- 取消只停止未来工作，不回滚已经原子提交的事务。
- 取消前尚未提交的数据不得留下半成品。

## 8. 契约测试

- 每条Preload方法必须对应输入Schema、输出Schema和错误Schema。
- Renderer与Core运行不同协议版本时拒绝业务命令。
- 未注册命令、额外字段、非法枚举和跨项目ID必须被拒绝。
- 契约快照变化需同步更新追踪矩阵和任务卡。
