# M10-11 运行时、恢复与异步安全硬化 Evidence

## 结论

M10-11 已完成运行时数据安全闭环：Provider 校验所得地址与真实 Socket 连接绑定；Recovery 的备份、恢复与清理具备确定请求身份、持久重放校验和跨文件/数据库补偿；Renderer 快速切章与正文/续写位置保存顺序得到收敛；恢复、导出和临时路径统一按 UTF-8 字节预算处理。

## 受检实现

- 实现提交：`60cd0cebe2bc9e8846a0cd726f0ce7c54425bfe3`
- 来源 PR：`#319`
- Provider：保留原始 Host 与 TLS SNI，连接只使用已批准地址；空正文响应按 Fetch 语义处理。
- Recovery：备份登记在事务内核对，恢复请求持久绑定备份与目标路径，清理日志绑定完整命令意图。
- Renderer：旧章节 Generation Sources 不再回写当前章节；正文失败时不推进续写位置。
- 路径：中文长名称按 UTF-8 字节截断并附稳定 Hash，同时规避 Windows 保留设备名。
- 安全：当前树不含测试私钥；历史合成 TLS 凭据仅按精确提交、路径与行号审批。

## 验证事实

- Task Governance、Repository Governance、PR Policy 均通过。
- Format、Lint、Typecheck、Workspace 与 Boundaries 均通过。
- Unit：145 个测试文件，819 项通过。
- Integration：62 个测试文件，173 项通过。
- Migration：26 个测试文件，50 项通过。
- Coverage：268 个测试文件，1145 项通过，永久 Coverage 门禁成功。
- Security：Secret Scan、应用安全测试与依赖审计全部成功。
- Performance：42 项预算与 AI 协议基线成功；事件循环门槛保持 100ms，未放宽。
- Electron E2E 与 Build 由最终收口 Head 的 Quality 永久检查给出权威终态，不使用手动重跑 Attempt 替代验收。

## 验收

实现提交之后仅允许 M10-11 任务卡、Runtime、任务索引和本任务 Evidence 收口。最终 Evidence manifest 使用 Schema 2，绑定完整实现提交并校验所有证据文件的字节数与 SHA-256。
