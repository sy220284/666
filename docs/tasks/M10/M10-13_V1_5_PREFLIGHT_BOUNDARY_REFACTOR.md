# M10-13 1.5前置边界重构与根因治理

> 状态：Implemented  
> 里程碑：M10 稳定性与治理续作 / V1.5 Preflight  
> 优先级：P1  
> 执行分支：`work`  
> 目标分支：`main`  
> 主线基线：`113099dff4f0a97129c6f49d850a7933a72e6b29`  
> 实施提交：`e36292cd517c763418ad12f4b0f7f3d033234260`

## 目标

在进入1.5功能开发前，保留已经通过完整验证的数据与业务内核，局部重写脆弱的进程通信、异步操作承载和Renderer命令生命周期边界；通过统一机制消除一整类问题，停止针对单个现象反复打补丁。

同时把“保留成熟内核、重写脆弱边界、从根因建立统一机制”的处理原则写入`AGENTS.md`，作为后续功能缺陷、并发问题、状态污染、错误传播和恢复异常的长期强制指导原则。

## 阶段定位

本任务是V1.5正式功能开发前的Preflight Hardening。完成前允许设计、拆分和验证1.5任务，不允许在脆弱边界上叠加新的产品状态机或异步功能。

## 非目标

- 不重写SQLite、Migration、单写队列、GenerationRun持久化、Provider地址绑定、Recovery Journal或Credential Broker；
- 不改变作者工作流和产品功能范围；
- 不增加生产依赖；
- 不修改已发布Migration；
- 不通过降低Coverage、安全或性能阈值换取通过；
- 不为缩短文件机械拆散完整状态机。

## 依赖与真实承接基线

- M10-12已通过`task-verification/M10-12=success`；
- 当前`main`已通过`main-verification=success`；
- 启动时`main == work == 113099dff4f0a97129c6f49d850a7933a72e6b29`；
- 当前来源PR为`#321`，精确使用`work → main`。

## 根因治理原则

处理问题时必须先判断问题属于局部实现错误，还是公共边界、状态所有权、事务边界、错误模型或生命周期设计缺陷。

固定决策顺序：

1. 识别成熟且已验证的不变量、数据模型和业务内核；
2. 沿完整调用链定位最早失去约束的位置；
3. 判断同类问题是否会在其他调用点重复出现；
4. 若根因位于公共边界，建立统一机制并迁移调用点；
5. 若根因仅属于单一局部逻辑，执行最小定点修复；
6. 同步补成功、失败、取消、冲突、超时、重启和旧结果失效测试；
7. 复核横向模块与纵向调用链，禁止修复当前现象后把问题转移到其他层。

禁止做法：

- 在多个调用点复制相同`try/catch/finally`补丁；
- 用日志、重试、延时或额外状态掩盖错误的所有权；
- 为通过测试增加平行真源、宽泛白名单或特殊分支；
- 在成熟数据内核中进行无收益重写；
- 只验证新路径，不验证旧功能与失败路径。

## 最新审计复核与任务修订

2026-08-07结合文件库最新全量架构审计报告与PR #321当前`work`代码复核。报告基于当时的`main`快照，不能直接替代`work`代码结论，因此逐项核对现有提交后再决定是否修改。

### 已由原`work`实现覆盖

- Core RPC精确等待者身份、单响应单消费、超时/退出/发送失败清理；
- Utility Tracked Operation、Safe Send和Drain统一生命周期；
- 显式数据库命令身份、Rewrite Block重复ID拒绝、Autosave稳定错误提示；
- 项目、Generation、Candidate、Provider主要命令已接入Command Coordinator；
- Recovery Overview已区分加载、失败、取消、真实空数据和可用数据。

### 本轮审计确认的缺口

1. Candidate/Generation命令key未绑定项目与章节，切换上下文后旧结果仍可能回写新页面；
2. Candidate多个不同命令key共用单一布尔`pending`，旧命令可能提前解锁仍在运行的操作；
3. `useBridgeQuery`在queryKey变化时仍可能暴露上一项目的数据；
4. Provider初始刷新、项目会话和生成订阅缺少完整卸载失效；
5. 结构永久删除存在Reference-aware与基础服务两套业务实现，引用阻断语义可能分叉。

### 本轮处理结果

- Command Coordinator统一聚合全部活跃命令，仅在活跃数从0到1或从1到0时改变Pending；
- Writing命令统一使用`writing:<projectId>:<chapterId>:`前缀，章节或项目切换时按前缀失效；
- Candidate列表、Undo、Generation终态刷新和订阅提交均复核当前scope或epoch；
- Bridge Resource将解析结果与queryKey绑定，不匹配时只返回加载态且不保留旧数据；
- Provider与项目控制器卸载时统一`invalidateAll()`；
- 生成前置自动保存纳入命令作用域，关闭cleanup之后旧调用重新启动Generation的窗口；
- 结构永久删除影响计算、外键引用阻断、planHash校验和执行收敛至`StructureTrashOperationService`，旧Reference-aware类型只保留兼容入口；
- 增加跨key Pending、跨上下文Resource、Candidate/Generation上下文、自动保存竞态和结构单引擎回归测试。

### 审计逻辑族归属

| 逻辑族 | M10-13处理状态 | 归属说明 |
|---|---|---|
| Core RPC等待者匹配 | 已统一 | WP1精确身份与单消费机制 |
| Core进程生命周期与诊断 | 已统一 | WP1状态机与Best Effort诊断 |
| Utility异步执行与Safe Send | 已统一 | WP2 Tracked Operation |
| Renderer命令生命周期 | 已统一关键链 | WP3项目、Generation、Candidate、Provider及公共命令Hook |
| Renderer查询与旧结果失效 | 已统一公共资源边界 | queryKey归属、scope与epoch共同约束 |
| 数据库写入命令身份 | 已统一 | AsyncLocal命令上下文，禁止源码推断 |
| 结构永久删除 | 已统一 | 单一业务引擎，兼容类型不再持有业务逻辑 |
| Main IPC注册描述 | 保留现状，后续P1 | 当前受边界与契约测试保护，本任务不扩大范围 |
| Utility协议元数据 | 保留现状，后续P1 | 本任务只治理执行与发送生命周期 |
| 异步任务会话抽象 | 保留现状，后续P1 | Generation现有持久化状态机继续作为权威真源 |
| 两阶段业务流程 | 保留现状，后续P1 | planHash、revision与事务内复核继续硬阻断 |
| 失败结果呈现 | 渐进统一 | 作者错误摘要和公共Bridge结果已覆盖关键链 |
| 结果工厂 | 有理由保留 | 各域Schema和错误语义不同，不建立无收益万能工厂 |
| 小型算法与归一化 | 域内保留 | 仅对高相似、高风险、跨域重复项继续治理 |

未在本任务统一的逻辑族必须保留现有安全约束并进入后续架构治理，不得据此宣称14类全部完成重构。

## 已确认问题与处理方式

### WP1 进程通信边界

局部重写`CoreSupervisor`内部RPC承载与生命周期控制：

- 请求关联必须绑定精确响应类型、operation和唯一correlation身份；
- 每条响应最多消费一个等待者；
- 超时、进程退出、发送失败统一清理等待者；
- 日志必须Best Effort，不能改变已经成功的启动、关闭或业务结果；
- Shutdown发送失败必须恢复预期退出状态；
- 进程状态转换集中、可测试、不可隐式跳转。

### WP2 Utility异步承载

建立统一Tracked Operation Executor与Safe Send：

- 异步拒绝必须被消费并可观测；
- Router执行、Schema构造、结果发送和Drain进入同一生命周期；
- 父端口关闭或`postMessage`失败不得形成未处理拒绝；
- Drain只在全部已追踪操作完成后报告；
- 非预期错误尽可能返回结构化失败，无法发送时记录受限诊断。

### WP3 Renderer命令协调

建立统一Command Coordinator并优先迁移项目会话、生成、Candidate、Provider、Recovery和Structure：

- Pending由Coordinator聚合活跃命令所有权，不允许单个调用点直接释放共享状态；
- 支持replace、join和reject并发策略；
- 命令key必须包含必要的项目、章节或资源上下文；
- 旧请求完成不得清除新请求状态或覆盖新页面；
- 成功、失败、取消和异常使用统一结果模型；
- 组件卸载或上下文变化后禁止旧结果回写。

### WP4 契约与可观测性

- 产品数据库写入禁止依赖`operation.toString()`推断命令身份；
- Rewrite Blocks拒绝重复ID并统一规范化来源；
- Recovery Overview区分真实空数据与读取不可用；
- Autosave异常提供稳定作者提示和受限诊断；
- 仓库合并策略继续以Squash为唯一权威方式。

### WP5 Renderer关键行为测试

为项目会话、Autosave、Generation、Candidate、Provider、Recovery和Structure建立行为测试层；新1.5 Renderer业务逻辑行与分支覆盖率不得低于75%，历史TSX继续全局不退化。

## 职责、状态所有权与依赖方向

```text
Electron Main
  CoreProcessLifecycle
  CoreRpcChannel
  BestEffortDiagnostics
        ↓
Core Utility Process
  TrackedOperationExecutor
  SafeParentPort
  Domain Routers
        ↓
Renderer
  CommandCoordinator
  Feature Controller / Hook
  View Components
```

- Lifecycle只拥有进程状态；
- RPC Channel只拥有等待者与响应关联；
- Diagnostics不拥有业务状态；
- Utility Executor只拥有异步操作登记、异常收敛和安全发送；
- Renderer Coordinator只拥有命令代次、聚合Pending和并发策略；
- Feature Controller拥有业务状态迁移；
- View组件只负责展示与事件绑定。

## 数据库与Migration

不新增Migration。数据库内核保持不变。产品写入必须显式携带稳定命令身份；缺少命令上下文时禁止通过函数源码推断闭包输入。

## IPC、事件与错误码

- 不扩大Renderer能力；
- 不暴露内部堆栈、指纹或正文内容；
- 复用现有公共错误码；
- RPC内部可以增加非公开correlation字段或等待者键，但必须保持公开Bridge兼容；
- 日志和发送失败使用诊断ID，不得覆盖原始业务错误。

## UI闭环

关键命令必须覆盖空、加载、成功、失败、取消、冲突、只读、重启和旧结果失效状态。共享Pending只能由Coordinator根据全部活跃命令统一释放。

## 安全、隐私与恢复

- 保持Electron Sandbox、CSP、Navigation Policy、Provider DNS Pinning和Credential Broker不变量；
- 日志不得记录正文、Prompt、凭据和完整Provider响应；
- 进程退出与重启必须清空等待者，禁止悬挂回调；
- Recovery读取失败不得伪装成空数据；
- 项目或章节切换后，Resource数据必须与当前queryKey一致。

## 性能预算

- RPC等待者和Renderer命令记录必须有界并及时释放；
- 不为每次delta创建全局状态对象；
- 新协调层不得增加数据库往返；
- E2E总时长不得因轮询或固定延时显著增长。

## 自动化测试

1. 日志失败不改变Core启动、健康和Shutdown成功结果；
2. Shutdown发送失败恢复状态并清理等待者；
3. 同requestId不同operation不会交叉匹配；
4. 进程退出立即释放全部RPC等待者；
5. Utility Router拒绝、发送失败和父端口关闭无未处理拒绝；
6. Drain等待全部Tracked Operation终态；
7. Renderer命令成功、失败、取消、异常均释放自身所有权；
8. 多个不同key并发时，任一命令完成不得提前释放共享Pending；
9. 项目或章节切换后旧命令、旧订阅和旧Resource不能覆盖新上下文；
10. 自动保存完成前切换章节不得启动旧Generation；
11. Rewrite Blocks重复ID被Schema拒绝；
12. 产品写入缺少稳定命令身份时明确失败；
13. Recovery Overview读取失败与空列表可区分；
14. 结构永久删除只允许单一业务引擎；
15. Autosave失败产生作者可见、无敏感内容的状态；
16. 七条关键Renderer链进入行为测试或具备明确等价覆盖；
17. 全量旧功能、Security、Performance、Build和Electron E2E不退化。

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

保存到：`docs/test-evidence/M10-13/`

Evidence必须记录：

- 审计报告与`work`逐项差异核对；
- 最终实现提交；
- 新增回归测试及全量测试数量；
- 结构永久删除单一引擎证明；
- Ready Quality、Security、Performance与Electron E2E运行；
- 剩余逻辑族归属和风险说明。

## 回滚策略

按WP1—WP5独立回退公共机制和调用点，但不得恢复未消费拒绝、日志污染业务状态、requestId交叉匹配、旧命令释放新Pending、跨上下文旧结果回写、自动保存后旧Generation启动、结构永久删除双源或生产写入函数源码身份回退。

## 完成条件

- 根因治理原则进入`AGENTS.md`并由测试或治理检查锁定；
- WP1—WP4完成实现和回归测试；
- 审计确认的五项缺口全部完成重构并通过回归测试；
- 七条Renderer关键链具备行为测试或明确的等价覆盖；
- 结构永久删除只有一个业务实现；
- 现有数据与业务内核不变量保持；
- 全量永久门禁通过；
- Ready Evidence绑定最终实现提交；
- Controlled Merge完成；
- `main-verification`与`task-verification/M10-13`成功；
- `work`受控同步到最新`main`。
