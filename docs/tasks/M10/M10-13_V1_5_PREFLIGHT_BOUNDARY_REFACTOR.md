# M10-13 1.5前置边界重构与根因治理

> 状态：Implemented  
> 里程碑：M10 稳定性与治理续作 / V1.5 Preflight  
> 优先级：P1  
> 执行分支：`work`  
> 目标分支：`main`  
> 来源 PR：`#321`  
> 主线基线：`113099dff4f0a97129c6f49d850a7933a72e6b29`  
> 实施提交：`69d883525cbe0ebc0032a5cdd7cbbe2e3a85ea4f`

## 目标

在 V1.5 功能开发前，保留已验证的数据与业务内核，重构脆弱的进程通信、异步承载、Renderer 状态所有权和重复业务真源，以统一机制消除整类并发、旧结果回写和错误传播问题。

## 非目标

- 不重写 SQLite、Migration、单写队列、GenerationRun、Provider DNS Pinning、Credential Broker、Recovery Journal 与 Electron 安全边界；
- 不增加生产依赖；
- 不修改已发布 Migration、`package.json` 或锁文件；
- 不降低 Coverage、安全、性能和 E2E 阈值；
- 不改变作者工作流和产品功能范围。

## 审计输入与核对规则

2026-08-07 结合文件库最新全量架构审计报告与 PR #321 当前 `work` 代码逐项核对。报告基于较早代码快照，只用于定位风险族；最终判断以 `work` 当前实现、差异、测试和永久工作流为准。

处理顺序：

1. 识别已验证的不变量与成熟内核；
2. 沿调用链找到最早失去约束的位置；
3. 判断问题是否会跨调用点复现；
4. 公共边界问题建立统一机制并迁移调用点；
5. 局部问题执行定点修复；
6. 同步补成功、失败、取消、冲突、超时、卸载、重启和旧结果失效测试；
7. 复核横向模块与纵向调用链，禁止把问题转移到其他层。

## 原 `work` 已覆盖

- Core RPC 精确等待者身份、单响应单消费、超时/退出/发送失败清理；
- Utility Tracked Operation、Safe Send 与 Drain 统一生命周期；
- 显式数据库命令身份，禁止通过函数源码推断；
- Rewrite Block 重复 ID 拒绝；
- Autosave 稳定作者提示；
- 项目、Generation、Candidate、Provider 主要命令接入 Command Coordinator；
- Recovery Overview 区分加载、失败、取消、真实空数据和可用数据。

## 最新审计发现与完成结果

### 1. Renderer 命令所有权

发现：
- Candidate/Generation 命令 key 未绑定项目和章节；
- 不同命令 key 共用一个布尔 Pending，旧命令可能提前解锁；
- 项目、Provider 与 Generation 订阅卸载失效不完整。

完成：
- Writing 命令统一使用 `writing:<projectId>:<chapterId>:` 前缀；
- Command Coordinator 按全部活跃命令聚合 Pending；
- 项目、章节或组件卸载时按作用域失效命令；
- Candidate 列表、Undo、写操作、Generation 终态刷新和订阅提交复核 scope/epoch；
- Provider 初始刷新和项目控制器卸载时统一失效。

### 2. Resource 与 Recovery 数据归属

发现：
- `useBridgeQuery` 在 queryKey 变化或刷新时可能继续暴露旧数据。

完成：
- Resource 快照与当前 queryKey 原子绑定；
- queryKey 不匹配时只返回 loading；
- 同 key 刷新也清除旧 data；
- 异常、取消和 stale 结果收敛为确定状态。

### 3. Generation 与 Candidate 上下文

发现：
- Generation 在注册命令作用域前等待自动保存，cleanup 后可能重新启动旧章节任务；
- Candidate 多阶段读取和写操作存在跨上下文提交窗口。

完成：
- 自动保存、Intent 组装与 Generation 启动进入同一命令作用域；
- Candidate 读取、预览、采用、撤销、丢弃、骨架保存和刷新均在提交前验证当前 scope；
- 新增跨 key Pending、自动保存期间章节切换、Candidate/Generation 上下文回归。

### 4. 项目会话副作用与原子提交

发现：
- 项目切换先提交 `activeProject` 再读取 continuation，可能产生半提交；
- 打开、关闭、移动属于已发生后无法由 Renderer 撤销的 Core 副作用，不适合 `replace`。

完成：
- continuation 读取完成后一次性提交项目与 continuation；
- 项目副作用命令使用 `reject` 互斥策略；
- rejected 命令不改变当前命令 Pending；
- 新增原子切换与互斥策略回归。

### 5. Autosave、续写位置与章节会话

发现：
- 旧章节保存失败、异常和 flush 反馈可能覆盖新章节状态；
- 旧 Draft 完成后可能触发新上下文续写保存；
- Continuation Tracker 仅按项目区分，无法隔离同项目不同章节和 Draft；
- 章节读取在组件卸载后仍可能挂载旧编辑器；
- WritingWorkbench 跨项目复用会混合旧编辑器 Ref 与新项目属性。

完成：
- Autosave、flush 与反馈绑定项目、章节、Draft、editor generation 和精确 revision；
- 上下文失效前后均禁止续写副作用和状态写入；
- Continuation Tracker 按项目、章节、Draft 隔离；
- 续写位置提交验证项目、章节、Draft 与 revision；
- 章节会话在卸载和 reset 时失效在途 flush 与正文读取；
- WritingWorkbench 按 projectId 强制重建生命周期；
- DraftAutosaveCoordinator 销毁后抑制在途保存的状态回调。

### 6. 结构永久删除单一真源

发现：
- `reference-aware-structure-operations.ts` 与 `structure-trash-operation-service.ts` 同时拥有永久删除业务逻辑。

完成：
- 目标解析、影响计算、动态外键阻断、planHash、事务内复核和执行统一由 `StructureTrashOperationService` 承担；
- Reference-aware 类型仅保留兼容依赖注入名称；
- 新增单一业务引擎永久守卫。

## 工作包

### WP1 Core RPC 与进程生命周期

- 精确 correlation 身份；
- 每条响应最多消费一个等待者；
- 超时、发送失败、进程退出和 Shutdown 统一清理；
- 诊断为 Best Effort，不改变业务成功结果。

### WP2 Utility 异步承载

- Router、结果构造、Safe Send 与 Drain 进入统一 Tracked Operation；
- 父端口关闭和 `postMessage` 失败无未处理拒绝；
- Drain 只在全部追踪操作终态后报告。

### WP3 Renderer 命令与资源

- Command Coordinator 统一 `replace`、`join`、`reject`；
- Pending 由 token/active ownership 控制；
- 命令和 Resource 必须包含正确上下文；
- 组件卸载、项目、章节、Draft 或 revision 变化后禁止旧结果提交。

### WP4 契约、业务真源与可观测性

- 数据库命令身份显式传递；
- Rewrite Blocks 拒绝重复 ID；
- Recovery 错误不伪装为空数据；
- 结构永久删除仅保留一个业务实现；
- 作者错误与受限诊断保持分层。

### WP5 行为验证

覆盖项目会话、Autosave、Continuation、Chapter Session、Generation、Candidate、Provider、Recovery、Structure 的成功、失败、取消、冲突、卸载和旧结果失效。

## 逻辑族归属

| 逻辑族 | M10-13 状态 |
|---|---|
| Core RPC 等待者与生命周期 | 已统一 |
| Utility 执行与 Safe Send | 已统一 |
| Renderer 关键命令生命周期 | 已统一 |
| Renderer Query/Resource 归属 | 已统一 |
| 数据库命令身份 | 已统一 |
| 结构永久删除 | 已统一 |
| Writing Autosave/Continuation/Chapter 生命周期 | 已统一 |
| Main IPC 描述 | 保留现状，后续 P1 |
| Utility 协议元数据 | 保留现状，后续 P1 |
| 通用跨域任务会话 | 保留现状，后续 P1 |
| 通用两阶段抽象 | 保留现状，后续 P1 |
| 结果工厂与小型算法 | 按域保留，禁止无收益统一 |

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

Evidence 保存于 `docs/test-evidence/M10-13/`，必须绑定实施提交、Ready 完整矩阵、测试数量、Coverage、Artifact、剩余风险与回退边界。

## 完成条件

- 实现与回归测试完成；
- 最新文件库审计指出的确定性缺口完成治理；
- 复核发现的衍生竞态完成治理；
- 成熟数据和安全内核保持；
- Ready 完整永久矩阵通过；
- Evidence 绑定最终实现与运行；
- Controlled Merge 完成；
- `main-verification` 与 `task-verification/M10-13` 成功；
- `work` 受控同步至最新 `main`。

当前仅满足静态 `IMPLEMENTED`；合并、主线验证和 `work == main` 完成前，有效状态保持 `VERIFICATION_PENDING`。
