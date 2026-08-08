# M10-17 验证摘要

任务：M10-17 项目生命周期与 Renderer 状态所有权收口

实现提交：`d7216870d93c22070dc85ce46a1f44b1aa90f27d`

本任务完成以下产品闭环：

- ProjectTaskBarrier 改为组合式协调层，包装同一个权威 `TaskProtocol` 实例；Close/Move 会先收敛同项目活动任务，可取消任务先取消，不可取消原子阶段等待 terminal，超时保持项目打开。
- 全局 Core drain/shutdown 保持原生 `TaskProtocol` 所有权，项目级 Barrier 不替换、不继承生产全局 TaskProtocol；专项回归锁定项目屏障存在时 `beginDrain()/close()` 仍独立正常收敛。
- Planning disclosure mode 收敛为 App Settings `defaultMode` 单一状态所有者，子工作台改为受控组件。
- Rhythm `get` 使用纯读路径，缺失 Profile 时返回内存默认投影；`run/updateProfile` 保持写路径，read-only-compatible 可读不可写。
- Startup 对 Provider、Active Task、Continuation 显式区分 `loaded / empty / degraded`；失败保留此前权威数据。
- Task 事件 MessagePort 保持应用会话级稳定订阅，不随 `projectId` 切换销毁重建；项目切换与 Task event 后通过 `listActive(projectId)` 拉取当前项目权威活动任务快照。
- Timeline Event Renderer 支持选择既有事件、完整回填并沿用原 `eventId` 更新；Electron 回归锁定更新后事件总数不增加。
- 首轮 Ready Coverage 暴露 TSX 冻结预算超出 2 个未覆盖函数；修复没有调整阈值或排除，而是让 M10-17 Planning 回归真实执行受控组件与两个模式切换回调，偿还新增覆盖债。
- 前两轮 Ready Electron E2E 均在 30 分钟硬预算被取消。第二轮 Artifact 还原出真正首错：新建项目后多个项目内 UI selector 先超时，`closeGracefully()` 是 finally 中的第二错误。与 M10-16 同日同工具链 33/33、约 14 分钟基线对照后，排除 Runner/Node/Electron/Playwright 环境漂移。
- 进一步定位到 M10-17 把 Task subscription effect 绑定 `projectId`，使每次创建/打开项目都销毁并重建 Electron MessagePort。最终实现拆分生命周期：稳定 Task port + scoped snapshot resync，并更新永久 Unit 禁止再次把 projectId 作为 Task subscription 重建条件。

边界保持：

- 未修改已发布 Migration、数据库 Schema、生产依赖或锁文件。
- 未建立第二套 Task、Planning、Rhythm 或 Startup 状态机。
- 未提前实施 M10-18。
- 未提高 Coverage 预算，也未降低安全、性能、Build 或 Electron E2E 门禁。

实现提交 `d7216870d93c22070dc85ce46a1f44b1aa90f27d` 的 Draft 验证已通过 Task Validation、Workspace、Boundary、Format、Lint、Typecheck；同一 Head 的 Evidence、Security、Performance、Task Governance、PR Policy 与 Draft Quality 均成功。Ready 阶段继续使用仓库永久矩阵对 Unit、Integration、Migration、Coverage、Build、Electron E2E 及全部治理门禁进行合并前裁决。
