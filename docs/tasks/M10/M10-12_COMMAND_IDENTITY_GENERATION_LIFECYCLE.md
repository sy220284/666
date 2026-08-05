# M10-12 命令身份与生成生命周期一致性治理

> 状态：In Progress  
> 里程碑：M10 稳定性与治理续作  
> 优先级：P1  
> 执行分支：`work`  
> 目标分支：`main`  
> 主线基线：`9d79ef921d48805c1c7227f6ee524f00ad455a2b`

## 目标

根据最新全量代码、测试与运行时审计，关闭通用写事务、项目生命周期和 Generation 流程中仅以 `requestId` 判断命令重放的问题，并修复 Generation 取消时内存任务先终止、持久状态后写入导致的状态分裂。同时收口 Provider 预取消、Recovery 补偿错误覆盖和 Renderer 终态刷新竞态。

本任务不扩展产品功能。治理目标是建立统一、可测试、可观测的命令身份和异步生命周期约束，使重复请求只能重放同一命令与同一规范化输入，冲突请求必须明确失败。

## 依赖

- M10-11 已通过 `task-verification/M10-11=success`；
- 当前 `main` 已通过 `main-verification=success`；
- 实施开始时 `main == work == 9d79ef921d48805c1c7227f6ee524f00ad455a2b`。

## 已确认缺陷

1. `BoundedIdempotentPromiseCache` 只按 `requestId` 保存 Promise，未绑定命令名称和输入指纹。
2. `ProjectWorkspaceService` 的 create、open、close、move 与 registerRecovered 共用同一请求缓存，不同命令复用 UUID 时可静默返回上一命令结果。
3. `ManagedDatabase` 的全部写事务共用仅按 `requestId` 索引的缓存，不同写命令可能被错误视作成功重放。
4. Generation 创建命中已有 `(projectId, requestId)` 后，不校验章节、Prompt、Provider、模型、Draft 基线、约束包和输入来源。
5. Generation Runtime 对重放 Run 仍可能创建第二个内存任务。
6. Generation 取消先中止 TaskProtocol，再持久化 `cancelled`；数据库写入失败时，内存任务已结束而 Run 仍可能保持 queued/running。
7. Provider 流式连接探测注册父信号监听前没有同步处理已取消信号。
8. Recovery 补偿删除失败可能覆盖原始业务错误，残留副作用缺少可观测信息。
9. Renderer 旧 Run 终态刷新解除任务锁过早，异步尾部可能覆盖新 Run 的候选选择。
10. Generation 启动桥接异常可能使 Renderer `pending` 永久保持为 true。

## 核心不变量

### 命令身份

命令重放身份固定为：

```text
commandScope + requestId + stableInputFingerprint
```

- 同一身份、同一指纹：共享进行中的 Promise 或返回首次成功结果；
- 同一命令域和 `requestId`、不同指纹：返回明确冲突；
- 不同命令域复用同一 `requestId`：不得命中另一命令结果；
- 失败结果不缓存为成功重放；
- 缓存容量继续有界，不允许因治理引入无界内存增长。

### Generation 创建与重放

- 已持久化 Run 必须完整匹配本次规范化创建输入；
- 匹配内容至少包含章节、Run 类型、Prompt、输出模式、Provider、模型、支持状态、Draft 基线、约束 Hash 和输入来源；
- 同一请求的活动重试共享原任务，不创建第二条执行协程；
- 跨进程重放返回已有 Run，不自动重复调用模型；
- 不同输入复用同一 `requestId` 必须显式冲突。

### Generation 取消

- 取消前先验证任务仍可取消；
- 持久化取消状态成功后才允许中止 Provider 与 TaskProtocol；
- 持久化期间执行协程进入取消屏障，不得继续进入解析或 Candidate 持久化；
- 持久化失败时解除屏障，任务继续运行或按真实后续错误结束；
- 取消成功后数据库、内存任务和作者可见状态一致。

### Recovery 补偿

- 原始业务错误始终保持为主错误；
- 补偿动作使用 settled 语义，单个删除失败不得中断其他清理；
- 补偿失败和残留路径以受限、非正文信息附加到错误详情或内部可观测状态；
- 不得将残留文件误识别为已验证恢复点。

### Renderer 异步状态

- 旧 Run 的终态刷新只能提交到发起刷新时对应的 Run 代次；
- 新 Run 启动后，旧刷新不得改变 Candidate 选择、选中文档或任务锁；
- Generation 启动无论成功、失败、取消或抛出异常，`pending` 必须最终释放。

## 主要影响范围

- `packages/core-service/src/bounded-idempotent-promise-cache.ts`
- `packages/core-service/src/database/`
- `packages/core-service/src/project-workspace/`
- `packages/core-service/src/generation/`
- `packages/core-service/src/generation-runtime.ts`
- `packages/core-service/src/task-protocol.ts`
- `packages/core-service/src/utility-errors.ts`
- `packages/core-service/src/utility-generation-router.ts`
- `packages/core-service/src/provider-adapters.ts`
- `packages/core-service/src/recovery/`
- `apps/desktop/renderer/src/features/writing/`
- `tests/unit/`
- `tests/integration/`
- `tests/security/`
- 本任务卡、Runtime、任务索引与 Evidence

## 数据库与 Migration

优先使用现有字段完成 Generation 输入匹配，不修改已发布 Migration。若现有表无法验证全部持久化输入，允许追加向前兼容 Migration 保存稳定命令指纹，并必须补逐级升级、重复执行和未来 Schema 只读测试。

## IPC 与错误语义

- 不增加宽泛 IPC 能力；
- 命令身份冲突统一映射到现有 `COMMON_CONFLICT_003`，作者界面不得暴露内部指纹；
- 数据库与领域内部可以使用专用冲突类型，但必须在公共边界归一化；
- 原始 Recovery 错误码不得被补偿删除错误覆盖。

## 自动化测试

1. 同一 `requestId`、同一指纹共享进行中的 Promise 并重放首次成功结果；
2. 同一 `requestId`、不同指纹明确冲突；
3. Project create/open/close/move 跨命令复用 `requestId` 不会误返回旧结果；
4. 数据库不同写操作复用 `requestId` 不会静默跳过第二条操作；
5. Generation 同输入重放不创建第二个 Run 或 Task；
6. Generation 不同章节、Prompt、Provider、模型、基线、约束或来源复用 `requestId` 时冲突；
7. Generation 取消持久化失败不会先中止内存执行；
8. 取消持久化期间不进入 Candidate 持久化，成功后数据库和 Task 同时为 cancelled；
9. Provider 预取消信号不发出网络请求；
10. Recovery 主错误在清理失败时仍保持，其他补偿继续执行并记录残留；
11. 旧 Run 终态刷新不得覆盖新 Run 的候选选择；
12. Generation 启动抛出异常后 `pending=false` 且界面显示可重试失败状态。

## 验证命令

- `pnpm task:validate`
- `pnpm check:language`
- `pnpm check:workspaces`
- `pnpm check:boundaries`
- `pnpm format:check`
- `pnpm lint`
- `pnpm ci:policy`
- `pnpm typecheck`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm test:migration`
- `pnpm test:coverage`
- `pnpm test:security`
- `pnpm test:perf`
- `pnpm build`
- `pnpm test:e2e`

## Evidence

保存到：`docs/test-evidence/M10-12/`

## 回滚策略

按命令身份缓存、Project/Database 调用、Generation 创建与取消、Recovery 补偿、Provider 取消和 Renderer 代次分组回退。回滚不得恢复跨命令 `requestId` 静默重放、取消状态分裂或旧 Run 回写行为。

## 完成条件

- 通用 Promise 缓存绑定稳定输入指纹并拒绝冲突；
- Project Workspace 与 Database 写入不再跨命令误命中；
- Generation 创建、活动重试和跨进程重放语义一致；
- Generation 取消先持久化、后中止，失败路径不分裂；
- Provider 预取消、Recovery 补偿和 Renderer 终态刷新竞态关闭；
- 相关故障注入和回归测试进入永久矩阵；
- 全量永久门禁通过并形成 M10-12 Evidence；
- 合并后 `main-verification` 与 `task-verification/M10-12` 成功；
- `work` 受控同步到最新 `main`。
