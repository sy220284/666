# M10-12 命令身份与生成生命周期一致性治理 Evidence

## 结论

M10-12 已完成命令身份与 Generation 生命周期一致性闭环：通用幂等缓存、Project Workspace、Database 与 Generation 创建均绑定命令域和稳定输入指纹；Generation 取消与 Candidate 持久化通过同一 Run 生命周期锁串行化；Provider 预取消、Recovery 补偿、Renderer 旧 Run 终态刷新与启动清理均具备永久回归覆盖。

## 受检实现

- 实现提交：`e88c9d4dacc9fe7f3237f60a9169e37dc9f43cdc`
- 来源 PR：`#320`
- 命令身份：`commandScope + requestId + stableInputFingerprint`
- Generation：同输入安全重放，不同输入明确冲突，同一活动 Run 不创建第二条执行协程。
- 取消：取消状态持久化与 Candidate 持久化进入同一 FIFO 生命周期锁，消除最后检查后的并发窗口。
- Provider：父级 Abort 已发生时立即传播，不发起后续网络工作。
- Recovery：补偿使用 settled 语义，保留原始业务错误并记录受限残留信息。
- Renderer：旧 Run 刷新按 Generation 代次提交，启动异常始终释放忙碌标记。
- 工具链：机器清单、永久导出工作流、生成器与 Quality 调用入口形成可验证闭环，Artifact 保留 `.bin` 与 `.pnpm` 并绑定精确 Head。

## 验证事实

- Task Governance、Repository Governance 与 PR Policy 均成功。
- Format、Lint、Typecheck、Workspace 与 Boundaries 均成功。
- Unit、Integration、Migration 与永久 Coverage 门禁均成功。
- Security 与 Performance 永久检查均成功，Secret Scan 陈旧审批已清理。
- Electron E2E、Build 与 Quality 聚合门禁均成功。
- 永久工具链导出成功，Artifact 绑定实现 Head，离线入口、隐藏目录与工具版本已验证。
- Coverage 基线未降低，新增 Renderer 生命周期逻辑通过纯流程测试与结构断言获得覆盖。
- 实现提交之后仅包含当前任务 Evidence 收口文件。

## 验收

Evidence manifest 使用 Schema 2，绑定完整实现提交 `e88c9d4dacc9fe7f3237f60a9169e37dc9f43cdc`，并记录全部证据文件的 UTF-8 字节数与 SHA-256。合并后由 `main-verification` 与 `task-verification/M10-12` 给出主线终态。
