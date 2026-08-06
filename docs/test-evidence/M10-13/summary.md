# M10-13 1.5前置边界重构与根因治理 Evidence

## 结论

M10-13 已完成 V1.5 前置公共边界治理：Core RPC、Utility 异步承载、Renderer 命令协调、项目与章节上下文、Autosave/Continuation 生命周期、Bridge Resource 数据归属及结构永久删除业务真源均已收敛到明确的状态所有权和事务边界。

## 受检实现

- 来源 PR：`#321`
- 实现提交：`812c52fff89688a1751387c13d42a417618460b9`
- 分支：`work → main`
- 基线：`113099dff4f0a97129c6f49d850a7933a72e6b29`
- 实现提交之后仅包含任务卡、Runtime、任务索引与 M10-13 Evidence 收口文件。

## 已完成治理

- Core RPC 使用精确请求身份、单响应单消费，并统一处理超时、发送失败、进程退出与 Shutdown 清理。
- Utility Router、结构化结果、Safe Send 与 Drain 纳入统一 Tracked Operation 生命周期。
- Renderer Command Coordinator 统一 `replace`、`join`、`reject`；共享忙碌状态由全部活跃命令聚合控制。
- Candidate 与 Generation 命令绑定项目、章节作用域；上下文变化后旧请求、旧订阅和旧终态刷新失去提交权。
- Bridge Resource 绑定当前 `queryKey`，刷新时清除旧数据，跨项目结果不能继续作为可用状态。
- 项目会话副作用命令使用互斥策略；项目与 Continuation 读取完成后原子提交。
- Autosave、Flush、续写位置、章节读取与编辑器挂载绑定项目、章节、Draft、Revision 和组件会话。
- WritingWorkbench 按项目重建，阻断旧编辑器、定时器、Tracker 与新项目属性混用。
- Provider 初始刷新、项目控制器和 Generation 订阅在卸载时统一失效。
- 结构永久删除的影响计算、外键引用阻断、`planHash` 复核和执行收敛至单一业务引擎。
- 数据库写入使用显式稳定命令身份，禁止通过函数源码推断业务身份。
- SQLite、Migration、单写队列、GenerationRun、Provider DNS Pinning、Credential Broker、Recovery Journal 与 Electron 安全边界保持原有成熟实现。

## 审计复核

本实现处理文件库审计指出的高风险公共边界，并在横向复核中继续修复项目会话半提交、不可撤销副作用并发、Autosave/续写位置跨上下文回写、章节会话卸载后挂载旧正文等衍生问题。

Main IPC 描述、Utility 协议元数据、跨域异步任务会话和通用两阶段抽象继续沿用现有契约与事务防线，作为后续架构治理范围，不计入本任务的完成声明。

## 验收约束

永久验证以绑定本 PR Head 的 GitHub Actions 结果为权威来源，覆盖 Quality、Security、Performance、Evidence、Task Governance、PR Policy、Coverage、Build 与 Electron E2E。Evidence manifest 使用 Schema 2，绑定受检实现提交并记录全部证据文件的 UTF-8 字节数与 SHA-256；合并后由 `main-verification` 与 `task-verification/M10-13` 给出主线终态。
