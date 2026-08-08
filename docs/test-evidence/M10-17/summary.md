# M10-17 验证摘要

任务：M10-17 项目生命周期与 Renderer 状态所有权收口

实现提交：`b126aec35e2efb562634ee10a86b50da1c947a78`

本任务完成以下产品闭环：

- ProjectTaskBarrier 在既有 TaskProtocol 权威状态上增加项目级 draining；Close/Move 会先收敛同项目活动任务，可取消任务先取消，不可取消原子阶段等待 terminal，超时保持项目打开。
- Planning disclosure mode 收敛为 App Settings `defaultMode` 单一状态所有者，子工作台改为受控组件。
- Rhythm `get` 使用纯读路径，缺失 Profile 时返回内存默认投影；`run/updateProfile` 保持写路径，read-only-compatible 可读不可写。
- Startup 对 Provider、Active Task、Continuation 显式区分 `loaded / empty / degraded`；失败保留此前权威数据，Task subscription 建立后主动重拉活动任务快照。
- Timeline Event Renderer 支持选择既有事件、完整回填并沿用原 `eventId` 更新；Electron 回归锁定更新后事件总数不增加。
- 首轮 Ready 矩阵暴露 TSX 冻结覆盖预算超出 2 个未覆盖函数；修复没有调整阈值或排除，而是让 M10-17 Planning 回归真实执行受控组件与两个模式切换回调，偿还新增覆盖债。

边界保持：

- 未修改已发布 Migration、数据库 Schema、生产依赖或锁文件。
- 未建立第二套 Task、Planning、Rhythm 或 Startup 状态机。
- 未提前实施 M10-18。
- 未降低 Coverage、安全、性能、Build 或 Electron E2E 门禁。

最新实现提交的 Draft 静态验证已通过 Task Validation、Workspace、Boundary、Format、Lint、Typecheck。Ready 阶段继续使用仓库永久矩阵对 Unit、Integration、Migration、Coverage、Build、Electron E2E 及全部治理门禁进行合并前裁决。
