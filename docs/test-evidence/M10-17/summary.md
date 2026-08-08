# M10-17 验证摘要

任务：M10-17 项目生命周期与 Renderer 状态所有权收口

实现提交：`92fe88c8b39de748d180d21636a93bb7a272c1d3`

本任务完成以下产品闭环：

- ProjectTaskBarrier 改为组合式协调层，包装同一个权威 `TaskProtocol` 实例；Close/Move 会先收敛同项目活动任务，可取消任务先取消，不可取消原子阶段等待 terminal，超时保持项目打开。
- 全局 Core drain/shutdown 恢复并保持原生 `TaskProtocol` 所有权，项目级 Barrier 不替换、不继承生产全局 TaskProtocol；新增回归锁定项目屏障存在时 `beginDrain()/close()` 仍独立正常收敛。
- Planning disclosure mode 收敛为 App Settings `defaultMode` 单一状态所有者，子工作台改为受控组件。
- Rhythm `get` 使用纯读路径，缺失 Profile 时返回内存默认投影；`run/updateProfile` 保持写路径，read-only-compatible 可读不可写。
- Startup 对 Provider、Active Task、Continuation 显式区分 `loaded / empty / degraded`；失败保留此前权威数据，Task subscription 建立后主动重拉活动任务快照。
- Timeline Event Renderer 支持选择既有事件、完整回填并沿用原 `eventId` 更新；Electron 回归锁定更新后事件总数不增加。
- 首轮 Ready Coverage 暴露 TSX 冻结预算超出 2 个未覆盖函数；修复没有调整阈值或排除，而是让 M10-17 Planning 回归真实执行受控组件与两个模式切换回调，偿还新增覆盖债。
- 首轮 Ready Electron E2E 暴露窗口关闭后应用不退出，业务断言未先失败；最终修复撤销“项目 Task 子类替换全局 TaskProtocol”的拓扑，改为组合式 ProjectTaskBarrier，恢复成熟全局关闭链。

边界保持：

- 未修改已发布 Migration、数据库 Schema、生产依赖或锁文件。
- 未建立第二套 Task、Planning、Rhythm 或 Startup 状态机。
- 未提前实施 M10-18。
- 未提高 Coverage 预算，也未降低安全、性能、Build 或 Electron E2E 门禁。

实现提交 `92fe88c8b39de748d180d21636a93bb7a272c1d3` 的 Draft 静态验证已通过 Task Validation、Workspace、Boundary、Format、Lint、Typecheck；其后只允许任务卡、Runtime、Evidence 与 PR 元数据治理闭包。Ready 阶段继续使用仓库永久矩阵对 Unit、Integration、Migration、Coverage、Build、Electron E2E 及全部治理门禁进行合并前裁决。
