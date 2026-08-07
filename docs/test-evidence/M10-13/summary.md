# M10-13 1.5前置边界重构与根因治理 Evidence

## 结论

M10-13 已完成 V1.5 前置公共边界治理。Core RPC、Utility 异步承载、Renderer 命令协调、项目与章节上下文、Autosave/Continuation 生命周期、Bridge Resource 数据归属及结构永久删除业务真源均已收敛到明确的状态所有权和事务边界。

## 受检实现

- 来源 PR：`#321`
- 实施提交：`75fffa5eddb5c564398ee5a1bbda42d7c1d31231`
- 分支：`work → main`
- 基线：`113099dff4f0a97129c6f49d850a7933a72e6b29`
- 实施提交之后只允许任务卡、Runtime、任务索引与 M10-13 Evidence 收口文件变化。

## 已完成治理

- Core RPC 使用精确请求身份、单响应单消费，统一处理超时、发送失败、进程退出和 Shutdown 清理。
- Utility Router、结构化结果、Safe Send 与 Drain 纳入统一 Tracked Operation 生命周期。
- Renderer Command Coordinator 统一 `replace`、`join`、`reject`，共享忙碌状态由全部活跃命令聚合控制。
- Candidate 与 Generation 绑定项目、章节作用域；上下文变化后旧请求、旧订阅和旧终态刷新失去提交权。
- Bridge Resource 绑定当前 `queryKey`，刷新时清除旧数据，跨项目结果不能继续作为可用状态。
- 项目会话副作用命令互斥，项目与 Continuation 完成读取后原子提交。
- Autosave、Flush、续写位置、章节读取与编辑器挂载绑定项目、章节、Draft、Revision 和组件会话。
- WritingWorkbench 按项目重建，阻断旧编辑器、定时器、Tracker 与新项目属性混用。
- Provider 初始刷新、项目控制器和 Generation 订阅在卸载时统一失效。
- 结构永久删除的影响计算、外键引用阻断、`planHash` 复核和执行收敛至单一业务引擎。
- 数据库写入使用显式稳定命令身份，禁止通过函数源码推断业务身份。
- SQLite、Migration、单写队列、GenerationRun、Provider DNS Pinning、Credential Broker、Recovery Journal 与 Electron 安全边界保持原有成熟实现。

## 权威验证结果

- Quality Run：`31135208977`，成功；
- Security Run：`31135208731`，成功；
- Performance Run：`31135208771`，成功；
- Task Governance Run：`31135208696`，成功；
- PR Policy Run：`31135208694`，成功；
- 单元测试：171 个文件、899 个测试通过；
- 集成测试：63 个文件、174 个测试通过；
- 迁移测试：27 个文件、52 个测试通过；
- Electron E2E：33 个测试通过；
- Coverage：Statements 72.20%、Branches 60.29%、Functions 65.86%、Lines 74.25%；
- Build、格式、Lint、Typecheck、工作区边界、安全和性能门全部通过。

## Artifact

- Product Tests and Coverage：`8977735359`
- Product Artifact SHA-256：`f072c48ab873dd9276d028260bec625b419aa33fa92dd0ff6e063dc63a5e4e44`
- Electron E2E Evidence：`8977971781`
- Electron E2E Artifact SHA-256：`ab7528446591a67fa5f5d0c48207b7e2526241e778df7bdce1a764c990ff55db`

## 审计复核

本实现处理文件库审计指出的高风险公共边界，并在横向复核中继续修复项目会话半提交、不可撤销副作用并发、Autosave/续写位置跨上下文回写、章节会话卸载后挂载旧正文、旧测试硬编码内部措辞及 TSX 覆盖债务等衍生问题。

Main IPC 描述、Utility 协议元数据、跨域异步任务会话和通用两阶段抽象继续沿用现有契约与事务防线，作为后续架构治理范围，不计入本任务完成声明。
