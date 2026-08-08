# M10-17 验证摘要

任务：M10-17 项目生命周期与 Renderer 状态所有权收口

实现提交：`e991ae55abc972b8b636e905ee4be73d70a056d1`

本任务完成以下产品闭环：

- ProjectTaskBarrier 在既有 TaskProtocol 权威状态上增加项目级 draining；Close/Move 会先收敛同项目活动任务，可取消任务先取消，不可取消原子阶段等待 terminal，超时保持项目打开。
- Planning disclosure mode 收敛为 App Settings `defaultMode` 单一状态所有者，子工作台改为受控组件。
- Rhythm `get` 使用纯读路径，缺失 Profile 时返回内存默认投影；`run/updateProfile` 保持写路径，read-only-compatible 可读不可写。
- Startup 对 Provider、Active Task、Continuation 显式区分 `loaded / empty / degraded`；失败保留此前权威数据，Task subscription 建立后主动重拉活动任务快照。
- Timeline Event Renderer 支持选择既有事件、完整回填并沿用原 `eventId` 更新；Electron 回归锁定更新后事件总数不增加。

边界保持：

- 未修改已发布 Migration、数据库 Schema、生产依赖或锁文件。
- 未建立第二套 Task、Planning、Rhythm 或 Startup 状态机。
- 未提前实施 M10-18。
- 未降低 Coverage、安全、性能、Build 或 Electron E2E 门禁。

实现提交的 Draft 验证已通过 Task Validation、Workspace、Boundary、Format、Lint、Typecheck、Security、Performance、Task Governance、PR Policy 与 Draft Evidence。Ready 阶段使用仓库永久矩阵对 Unit、Integration、Migration、Coverage、Build、Electron E2E 及全部治理门禁进行合并前裁决。
