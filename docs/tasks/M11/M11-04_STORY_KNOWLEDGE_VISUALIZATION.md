# M11-04 Story Knowledge Projection 与基础精修

> 状态：Implemented  
> 里程碑：M11 产品体验与 AI 创作协同  
> 优先级：P0  
> 执行分支：`work`  
> 目标分支：`main`

## 目标

在已 Verified 的 M11-03 基础上，先完成代码级审计确认的四项 P0 基础精修，再建立统一 `StoryKnowledgeProjectionService` 与人物卡、关系图、时间线、伏笔泳道、成长路线、历史时间轴和本章知识辅助。基础精修作为 M11-04 Phase 0，不新增正式任务 ID。

## 依赖与基线

- M11-03 有效 VERIFIED。
- 以启动时最新 verified `main` 为准；本轮实际基线：`8628d66c1155c5aa2229d16a266f4c70266fefb9`。

## Phase 0：基础精修

### Prompt Version Authority

建立唯一 `PromptIdentity = { promptId, version, taskType }`。

- `PromptDefinition` 与 `PromptBundle.metadata` 必须由同一 Identity 派生，禁止再次手写 `promptVersion`。
- `getPromptDefinition(promptId, version)` 改为真实多版本 Registry；历史版本永久可解析。
- `GenerationRun` 继续持久化 `promptId + promptVersion`。
- `(promptId, version)` 唯一；重复注册、未注册版本、Definition/metadata 不一致均 fail-closed。
- M11-03 已更新的 `validate`、`state_extract` 作为新 Prompt 版本注册；保留升级前历史版本。
- 机器测试阻断覆盖旧版本或新增未注册版本。

### Project Operation Semantics

Main 新增唯一 `project-operation-semantics.ts`：

```ts
Record<CoreProjectOperation['operation'], CoreOperationKind>
```

- 新增 Core operation 未配置 semantics 时 TypeScript 必须失败。
- `handler-guard` 删除 Query Set + 默认 Mutation。
- Continuity、NarrativePlanning 等 Main IPC 不再手写 `operationKind`。
- retry/userAction/error semantics 统一读取该权威。
- Contracts 只描述协议，不承载 Main 执行策略。

### Renderer Request Ownership

两级所有权固定为：

```text
BridgeRequestCoordinator = 单次 Bridge/IPC request
RendererCommandCoordinator = 完整 UI 业务动作，可包含多个 Bridge request
```

`BridgeRequestCoordinator` 通用支持 `requestKey`、`laneKey`、`share`、`replace`、`reject`、abort、stale、generation、`cancelAll`。

- Coordinator 禁止解析任何业务 payload；业务模块显式提供 `laneKey`。
- 相同只读 Query 统一 `mode: 'share'`；Canon、Continuity、NarrativePlanning、StoryKnowledge 不得再维护平行 Promise Map/pending coalescing。
- replace 只在同 lane 上 latest-only；旧响应只可 stale。
- 单订阅者退出不影响其他订阅者；全部退出才中止底层共享请求。

专项覆盖：相同 Query 合并、单订阅者退出、全部退出、replace stale、项目切换 stale、章节切换 stale、`cancelAll`。

### Atomic Navigation

保留 `AuthorNavigationTarget`、`resolveAuthorNavigationTarget()`、`RendererReturnLocation`；新增 Store Action `apply-navigation`，一次 reducer commit 同时提交：

```text
route + selection + filters + returnLocation
```

- 删除跨工作台 `select → set-filter → navigate` 多提交链。
- 搜索、Validation、StoryTodo、伏笔、人物、SceneBeat、本任务可视化均复用该路径。
- 跨项目目标 fail-closed。
- 写作自动保存失败时阻止导航且 UI 状态不变。
- 返回来源恢复 selection/filter/scroll/focus；目标删除/归档安全失败。

### Error Mapping

- `utility-errors.ts` 继续作为项目领域错误 → Public `ErrorCode` 主要权威。
- `projectOperationError()` 直接识别 NarrativePlanning、StateProposal、Continuity、Validation、Canon 等 ServiceError。
- 删除 Narrative/StateProposal → Continuity 的错误包装中转。
- Generation 使用独立 `generationOperationError()`，只专门处理 GenerationRun、GenerationSourceResolver、TaskProtocol、Provider/AI runtime，其余 fallback 到 `projectOperationError()`。

### Renderer 关键 Surface 覆盖

现有 Renderer TS/TSX 历史基线继续保留，但 M11 新增/重构页面不得扩大豁免。重点覆盖 AI Review、Checks、Story Knowledge、人物卡、关系图、时间线、Idea Capsule、Generation 主入口、Ctrl+K、跨工作台 Navigation；按适用场景验证 success、empty、failure、retry、cancel、stale、read-only、project/chapter switch、target archived/deleted。

## Phase 1：Story Knowledge Projection

新增统一只读 `StoryKnowledgeProjectionService`：

- 人物卡聚合
- 人物关系邻域与章节有效关系
- Story Timeline Window / Character Timeline Window
- Foreshadowing Lane
- Arc Route
- History Projection
- 本章知识辅助

设计约束：

1. 全部来自权威数据，不建立第二份故事知识真源。
2. 所有查询 bounded、分页/窗口有硬上限、稳定排序由 Core 定义。
3. 1000 章作品不得一次加载全部故事数据。
4. Renderer 可视化不得自行组合多个全量 Catalog。
5. 关系图默认中心人物 + 一级邻居，更深邻域按需查询。
6. History 只读聚合既有 Version/Candidate/checkpoint/Recovery 元数据。
7. 所有异步读取使用 Phase 0 的 share/replace/stale 生命周期。
8. 所有编辑导航回现有领域编辑器并使用原子 Navigation。

## UI 输出

- 人物卡
- 人物关系图
- 故事时间线
- 人物时间线
- 伏笔泳道
- 成长路线
- 历史时间轴
- 本章知识辅助
- 原列表/表单继续作为精确编辑与窄屏降级入口

## 数据、IPC 与安全

- 默认零新增业务表；允许有真实性能证据支撑的只读索引。
- 禁止图谱快照、可视状态、Projection cache 成为平行持久真源。
- Projection 通过 Contracts → Core → Main → Preload → Renderer 具名只读接口。
- Projection 无 INSERT/UPDATE/DELETE 所有权。
- Renderer 不增加 Node、SQLite、文件系统、环境变量或凭据能力。
- 只读项目可查看，编辑动作禁用；导航目标必须验证 project scope。

## 性能预算

提供 100 / 300 / 1000 章项目专项：首屏只读当前窗口/必要邻域，关系图节点硬上限，大列表分页/虚拟化，记录查询 P95 与 Renderer 资源消耗，不允许 Renderer 常驻整本书数据。

## 主要影响范围

- `migrations/project/`（仅必要索引）
- `packages/contracts/`
- `packages/core-service/`
- `packages/prompts/`
- `apps/desktop/main/`
- `apps/desktop/preload/`
- `apps/desktop/renderer/`
- `tests/`
- AI、架构、IPC、UI、测试与任务文档

## 自动化测试

```text
pnpm task:validate
pnpm check:language
pnpm check:workspaces
pnpm check:boundaries
pnpm check:docs
pnpm check:governance
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:migration
pnpm test:coverage
pnpm test:security
pnpm test:reliability
pnpm test:perf
pnpm build
pnpm test:e2e
```

专项必须包含 Prompt 多版本与唯一性、Operation Semantics 穷尽性、Bridge lifecycle、Atomic Navigation、跨项目拒绝、自动保存失败阻断、Projection 只读、章节有效关系、1000 章窗口查询、项目/章节切换 stale、目标归档/删除安全失败。

## Evidence

保存到：`docs/test-evidence/M11-04/`

冻结实现基线：`adb3cf4f2e1de1d15cad00286e937e53b67b4f37`。

- Quality `31557200227`：Static、Unit、Integration、Migration、Coverage、Reliability、Windows native IME 已通过；该 pre-closure Head 的 Release Audit 仅因 M11-04 Schema 2 Evidence 缺失拒绝。
- Security `31557200176`：成功。
- Performance `31557200110`：成功；100/300/1000 章查询与 Renderer payload 均低于预算。
- Schema 2 Evidence：`summary.md`、`commands.txt`、`known-risks.md`、`manifest.json`。
- Runtime：`IMPLEMENTED`，绑定 PR #364 / `task-verification/M11-04`。
- 最终有效 `VERIFIED` 由来源 PR 合并提交上的 `main-verification` 与 `task-verification/M11-04` 决定。

## 回滚策略

整体回滚调用点迁移与 StoryKnowledge Projection；不得通过回滚重新覆盖历史 Prompt 版本、恢复多套 operation semantics 或恢复业务参数解析型 request coordinator。新增 Migration 保持 append-only。

## 完成条件

- [x] Prompt Version Authority、Project Operation Semantics、Renderer Request Ownership、Atomic Navigation 成为唯一公共机制。
- [x] Error Mapping 与 M11 新 Surface coverage 约束收敛。
- [x] Story Knowledge 全部来自权威数据或可重建只读投影，无第二真源。
- [x] 1000 章性能、请求生命周期、只读与失效目标路径通过专项测试。
- [x] Contracts → Core → Main → Preload → Renderer → 测试闭环完成。
- [x] Ready Evidence、Runtime、TASK_INDEX 与 PR #364 绑定进入 Implemented 收口状态。
- [ ] 合并后 `main-verification` 与 `task-verification/M11-04` 成功。
