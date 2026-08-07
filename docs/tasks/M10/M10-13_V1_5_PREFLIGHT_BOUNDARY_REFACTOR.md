# M10-13 1.5前置边界重构与根因治理

> 状态：Implemented  
> 里程碑：M10 稳定性与治理续作 / V1.5 Preflight  
> 优先级：P1  
> 执行分支：`work`  
> 目标分支：`main`  
> 来源 PR：`#321`  
> 主线基线：`113099dff4f0a97129c6f49d850a7933a72e6b29`  
> 实施提交：`75fffa5eddb5c564398ee5a1bbda42d7c1d31231`

## 目标

在 V1.5 功能开发前，保留已验证的数据、安全与持久化内核，重构脆弱的进程通信、异步承载、Renderer 状态所有权和重复业务真源，以统一机制消除整类并发、旧结果回写、错误传播和生命周期问题。

## 审计输入与裁决规则

2026-08-07 结合文件库最新全量架构审计报告与 PR #321 当前全量代码逐项核对。报告基于较早快照，只用于定位风险族；最终判断以 `work` 当前实现、完整差异、回归测试和永久工作流为准。

固定处理顺序：

1. 识别并保留已验证不变量、事务与成熟内核；
2. 沿完整调用链定位最早失去约束、所有权或原子性的位置；
3. 检查同类问题是否跨调用点、失败路径和功能域复现；
4. 公共边界问题建立单一机制并迁移所有受影响调用点；
5. 局部问题执行最小且完整的定点修复；
6. 同步覆盖成功、失败、取消、冲突、超时、卸载、重启、恢复和旧结果失效；
7. 横向与纵向复核，禁止把问题转移到其他层。

## 非目标与冻结边界

- 不重写 SQLite、Migration、单写队列、GenerationRun、Provider DNS Pinning、Credential Broker、Recovery Journal 与 Electron 安全边界；
- 不增加生产依赖，不修改已发布 Migration、`package.json` 或锁文件；
- 不降低 Coverage、安全、性能、Build 或 Electron E2E 阈值；
- 不改变作者工作流与产品功能范围；
- 文件行数只作观察指标，禁止为满足视觉长度机械拆分完整业务引擎。

## 完成结果

### 1. Core RPC 与 Utility 生命周期

- Core RPC 使用精确请求身份、单响应单消费；
- 超时、发送失败、进程退出、Drain 与 Shutdown 统一清理；
- Utility Router、结果构造、Safe Send 与 Drain 纳入 Tracked Operation；
- 诊断保持 Best Effort，日志失败不改变业务结果。

### 2. Renderer 命令所有权

- Command Coordinator 统一 `replace`、`join`、`reject`；
- 共享忙碌状态由全部活跃命令聚合，旧命令不能释放新命令状态；
- Candidate 与 Generation 使用 `writing:<projectId>:<chapterId>:` 作用域；
- 项目、章节、Draft、组件或订阅失效后，旧请求和旧终态失去提交权；
- Provider、项目控制器与 Generation 订阅补齐卸载失效。

### 3. Resource、项目会话与 Recovery

- Bridge Resource 快照与当前 `queryKey` 原子绑定；
- queryKey 变化或同 key 刷新时清除旧数据并进入真实 Loading；
- 项目打开、关闭、移动等不可撤销副作用使用 `reject` 互斥；
- 项目与 Continuation 读取完成后原子提交，消除半提交；
- Recovery 区分加载、失败、取消、真实空数据和可用数据。

### 4. Writing 生命周期

- Generation 自动保存、Intent 组装与启动位于同一命令作用域；
- Candidate 读取、预览、采用、撤销、丢弃、骨架保存和刷新均在提交前复核上下文；
- Autosave、Flush 与反馈绑定项目、章节、Draft、编辑器代次和精确 Revision；
- 旧 Draft 不触发新上下文续写保存或反馈；
- Continuation Tracker 按项目、章节、Draft 隔离；
- 章节会话卸载或 Reset 后失效在途 Flush、正文读取和编辑器挂载；
- WritingWorkbench 按 `projectId` 重建生命周期。

### 5. 契约与业务单一真源

- 数据库写入使用显式稳定命令身份，禁止通过函数源码推断；
- Rewrite Blocks 拒绝重复 ID；
- 结构永久删除的目标解析、影响计算、动态外键阻断、`planHash`、事务内复核和执行统一由 `StructureTrashOperationService` 承担；
- 永久删除错误明确区分影响变化、确认标题变化和章节引用阻断；
- Reference-aware 类型仅保留兼容依赖注入名称，不再持有平行业务逻辑。

## 全量影响复核

- PR 改动未触碰 Migration、锁文件或生产依赖；
- Core RPC、Utility Drain、数据库命令身份、Recovery 与结构删除事务边界保持原子性；
- 全仓模式扫描未发现产品路径残留的函数源码命令身份推断、结构删除平行实现或旧命令直接释放共享忙碌状态；
- Main IPC 描述、Utility 协议元数据、通用跨域任务会话和通用两阶段抽象继续沿用现有契约与事务防线，列入后续架构治理，不计入本任务完成声明。

## 权威验证

实施提交 `75fffa5eddb5c564398ee5a1bbda42d7c1d31231` 已通过永久矩阵：

- Quality Run `31135208977`
- Security Run `31135208731`
- Performance Run `31135208771`
- Task Governance Run `31135208696`
- PR Policy Run `31135208694`
- 171 个单测文件、899 个单元测试；
- 63 个集成文件、174 个集成测试；
- 27 个迁移文件、52 个迁移测试；
- 33 个 Electron E2E；
- Coverage：Statements 72.20%、Branches 60.29%、Functions 65.86%、Lines 74.25%；
- Build、工作区边界、格式、Lint、Typecheck、安全与性能门均通过。

## Evidence

Evidence 保存于 `docs/test-evidence/M10-13/`，使用 Schema 2 绑定最终实施提交、验证运行、测试数量、Coverage、Artifact、已知风险和回退边界。

## 完成条件

- [x] 实现、重构与回归测试完成；
- [x] 文件库审计指出的确定性缺口完成治理；
- [x] 二次全量复核发现的衍生竞态完成治理；
- [x] 成熟数据、安全和持久化内核保持；
- [x] 最终实施提交完整永久矩阵通过；
- [ ] Evidence 收口 Head 全部门禁通过；
- [ ] Controlled Merge 完成；
- [ ] `main-verification` 与 `task-verification/M10-13` 成功；
- [ ] `work` 受控同步至最新 `main`。

合并、主线验证和 `work == main` 完成前，静态状态保持 Implemented。
