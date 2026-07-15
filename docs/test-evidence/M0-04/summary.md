# M0-04 验证摘要

日期：2026-07-15  
状态：Verified；提交`ad3770f`的本地门禁、GitHub Task Governance、Quality与真实Electron MessagePort E2E均通过。

## 已实现

- `packages/contracts`冻结65个文档错误码并建立strict Zod命令、结果、事件、快照、端口连接与ACK Schema；未注册命令、协议版本错误、额外字段和非法枚举均被拒绝。
- Preload只暴露`task.getSnapshot`、`task.cancel`、`task.listActive`和`task.subscribe`具名方法；MessagePort、`ipcRenderer`和任意通道不会进入Renderer能力面。
- Main校验可信主Frame、命令Schema、端口数量和连接Schema，再把Renderer MessagePort直接转移给受监管Utility Process。
- Core命令路由支持任务快照、项目范围校验、活动任务列表、取消及短期`requestId`幂等；重复取消返回首次结果，不重复改变状态。
- 同一`taskId`的`eventId`唯一、`sequence`从1递增；消费游标去重、拒绝陈旧事件、检测缺号并由Preload自动调用`task.getSnapshot`恢复。
- AI与通用任务事件覆盖started、stage、progress、delta、usage、candidateSaved、completed、cancelled、failed；任务之间按`taskId`独立。
- Provider增量默认按30 ms或512字符批量；每个端口最多保留32条未ACK事件，慢消费者只保留每个任务的最新待恢复事件并通过序号缺口触发快照，不无限积压。
- Core保留最多2,000,000字符的内存预览；快照可恢复实际流式文本，超限时显式返回`previewTruncated=true`，不伪装完整。
- 取消同步设置AbortSignal、清除未发送增量并禁止未来delta；不可取消原子阶段返回稳定错误码，Core排空会停止接单、取消可取消任务并等待原子阶段完成。

## 自动化结果

- Vitest全量：15个测试文件、53项测试通过。
- Integration专项：5个测试文件、12项测试通过，覆盖完整AI事件、批量、取消、快照、缺号、跨项目、多任务、背压、幂等与排空。
- Security专项：4个测试文件、18项测试通过，覆盖命令白名单、strict Schema、稳定错误码、可信Sender、最小Preload和Utility Process路由。
- 错误码审计：`ERROR_CODES.md`文档65个，实现65个，missing=0、extra=0。
- 协议量化：10,000个逐字符输入合并为20个delta批次，10,000字符全部交付且快照全部恢复；取消确认1.012 ms，取消后0事件；慢消费者产生10,001个事件但无ACK时只投递32个。原始结果见`protocol-metrics.json`。
- Typecheck：所有可检查workspace包通过。
- Build：Contracts、Main、沙箱Preload、Renderer与Core Utility Process通过。
- Package：9个编译入口进入基础构建清单。
- Playwright Electron E2E：GitHub Ubuntu/Xvfb下真实窗口测试通过；`task.listActive`穿过Preload→Main→Utility Process，MessagePort创建、转移和销毁后Core仍为healthy。
- GitHub Task Governance：<https://github.com/sy220284/666/actions/runs/29389389684>。
- GitHub Quality：<https://github.com/sy220284/666/actions/runs/29389389683>。

## 验收边界

M0-04交付协议与任务运行底座，不实现具体业务Use Case或真实Provider。未来任务只能通过受控TaskProtocol控制器发送增量和完成状态；权威AI结果仍由后续GenerationRun/Candidate任务持久化，内存预览不冒充正文或已保存结果。
