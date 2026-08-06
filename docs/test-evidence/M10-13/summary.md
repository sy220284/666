# M10-13 1.5前置边界重构与根因治理 Evidence

## 受检实现

- 来源 PR：`#321`
- 实现提交：`812c52fff89688a1751387c13d42a417618460b9`
- 分支：`work → main`
- 基线：`113099dff4f0a97129c6f49d850a7933a72e6b29`

## 已完成治理

- Core RPC 使用精确请求身份、单响应单消费，并统一处理超时、发送失败、进程退出与 Shutdown 清理。
- Utility Router、结构化结果、Safe Send 与 Drain 纳入统一 Tracked Operation 生命周期。
- Renderer Command Coordinator 统一 `replace`、`join`、`reject`；共享 Pending 由全部活跃命令聚合控制。
- Candidate 与 Generation 命令绑定项目、章节作用域；项目或章节变化后旧请求、旧订阅、旧终态刷新失去提交权。
- Bridge Resource 绑定当前 `queryKey`，刷新时清除旧数据，跨项目结果不能继续作为可用状态。
- 项目会话副作用命令使用互斥策略；项目与 continuation 读取完成后原子提交。
- Autosave、flush、续写位置、章节读取与编辑器挂载绑定项目、章节、Draft、revision 和组件会话。
- WritingWorkbench 按项目重建，阻断旧编辑器、定时器、Tracker 与新项目属性混用。
- Provider 初始刷新、项目控制器和 Generation 订阅在卸载时统一失效。
- 结构永久删除的影响计算、外键引用阻断、 planHash 复核和执行收敛至单一业务引擎。
- SQLite、Migration、单写队列、GenerationRun、Provider DNS Pinning、Credential Broker、Recovery Journal 与 Electron 安全边界保持不变。

## 审计结论

本提交已处理最新文件库审计指出的高风险公共边界，并在复核中继续修复项目会话半提交、不可撤销副作用并发、Autosave/续写位置跨上下文回写、章节会话卸载后挂载旧正文等衍生问题。

Main IPC 描述、Utility 协议元数据、跨域异步任务会话和通用两阶段抽象继续沿用现有契约与事务防线，归入后续架构治理。本任务未将这些范围误报为已完成重构。

## 验收规则

永久验证以最新 Ready Head 的 GitHub Actions 为唯一权威来源。实现提交之后仅允许任务卡、Runtime、任务索引和 `docs/test-evidence/M10-13/` 收口文件变化。当前静态状态为 `IMPLEMENTED`，合并与主线验证完成前的有效状态为 `VERIFICATION_PENDING`。
