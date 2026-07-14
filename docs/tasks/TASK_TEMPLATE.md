# WorldForge 任务卡模板

> 文件名：`<TASK-ID>_<SHORT_NAME>.md`  
> 适用目录：`docs/tasks/M0/`至`docs/tasks/M8/`  
> 原则：一任务一文件；任务必须有明确依赖、边界、最小UI、失败路径和证据。

## 基本信息

- 任务ID：
- 里程碑：
- 状态：Planned / In Progress / Implemented / Verified / Blocked
- 优先级：P0 / P1
- 建议分支：`feat/<milestone>-<short-name>`
- 关联需求：
- 关联功能ID：
- 关联验收：

## 目标

说明任务完成后可观察、可测试的结果。

## 阶段定位

说明本任务在当前阶段中的价值，以及它依赖哪些已经完成的基础能力。

## 非目标

明确本任务不处理的功能，防止提前实现后续阶段或顺手扩张。

## 依赖

- 前置任务：
- 依赖的表、契约、Use Case或公共底座：
- 禁止依赖的未来任务：

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- 当前任务专项文档。

## 输入与输出

### 输入

- 上游数据、命令、页面或文件。

### 输出

- 数据变更、IPC响应、页面状态、事件或文件。

## 主要影响范围

- `apps/desktop/main`
- `apps/desktop/preload`
- `apps/desktop/renderer`
- `packages/contracts`
- `packages/domain`
- `packages/core-service`
- `packages/editor-core`
- `packages/prompts`
- `migrations`
- `tests`

只保留实际涉及项。

## 数据库变化

- 表、字段、索引、外键。
- Migration编号。
- 兼容与回填。
- 事务、幂等和恢复点。

无变化时写“无”。

## IPC与事件变化

- 命令名。
- strict输入输出Schema。
- 错误码。
- 事件类型。
- Preload白名单。

无变化时写“无”。

## 最小UI闭环

任何用户功能任务必须在本任务内完成可操作入口，至少覆盖：

- 空状态。
- 加载或进行中。
- 成功。
- 失败。
- 取消（适用时）。
- 冲突（适用时）。
- 只读或恢复（适用时）。

M7只负责统一整合，不能作为前期业务没有UI的补救阶段。

## 安全与隐私

- 项目和路径边界。
- 锁定、Revision、Hash和不可变Version。
- 凭据和日志。
- 外部数据发送。
- 本地文件与临时目录。

## 失败、取消和冲突路径

| 场景 | 预期行为 |
|---|---|
| 输入无效或额外字段 |  |
| 目标不存在/已删除/已处理 |  |
| 任务取消/超时/中断 |  |
| Revision/Hash/锁定冲突 |  |
| 数据库/磁盘/文件/网络失败 |  |
| 应用关闭与重启 |  |
| 恢复失败 |  |

## 实施步骤

1. 先补失败测试或稳定复现。
2. 更新契约与领域模型。
3. 增加Migration/Repository。
4. 实现Core Use Case。
5. 实现Main/Preload IPC。
6. 实现最小Renderer/UI闭环。
7. 补齐失败、取消、冲突、只读和恢复。
8. 运行检查并保存证据。

不涉及的层级可以省略，但必须写明“无影响”。

## 自动化测试

- [ ] 单元测试
- [ ] Repository/集成测试
- [ ] Migration测试
- [ ] 安全测试
- [ ] 桌面E2E
- [ ] 性能测试
- [ ] AI Eval

## 手动验收

列出真实用户路径、窗口尺寸、主题、重启与失败操作。

## 性能预算

定义本任务影响的指标；无专项预算时写“不得劣化当前基线”。

## 完成条件

- [ ] 目标全部真实接通。
- [ ] 非目标和未来阶段能力未被提前引入。
- [ ] 上游依赖已满足，没有引用尚未建立的模型。
- [ ] 成功、失败、取消、冲突、只读和恢复路径已覆盖。
- [ ] 最小UI可操作。
- [ ] Schema、IPC、UI、安全和文档同步。
- [ ] 测试真实运行并记录退出状态。
- [ ] 证据保存到`docs/test-evidence/<TASK-ID>/`。
- [ ] 无TODO、空实现、固定假数据和伪造成功。
- [ ] `TASK_INDEX.md`和追踪矩阵已更新。

## 回滚策略

说明如何恢复代码、数据库、配置和用户数据。

## 完成报告

记录变更摘要、文件、数据库/IPC变化、测试命令、手动验收、性能、已知限制、剩余风险和下一候选任务。
