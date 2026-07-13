# WorldForge 任务卡模板

> 文件名：`<TASK-ID>_<SHORT_NAME>.md`，或收录在对应里程碑任务集中。

## 基本信息

- 任务ID：
- 里程碑：
- 状态：Planned / In Progress / Implemented / Verified / Blocked
- 优先级：P0 / P1
- 负责人：
- 分支：`feat/<milestone>-<short-name>`
- 关联需求：
- 关联功能ID：
- 设计依据：

## 背景

说明当前问题、为何需要该任务，以及与V6.5设计的关系。

## 目标

列出本任务结束时可观察、可测试的结果。

## 非目标

明确本任务不处理的功能，防止顺手扩张。

## 输入与输出

### 输入

- 数据、命令、页面或上游模块。

### 输出

- 数据变更、IPC响应、页面状态或文件。

## 影响范围

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
- 事务和恢复点。

无变化时写“无”。

## IPC与事件变化

- 命令名。
- 输入输出Schema。
- 错误码。
- 事件类型。
- Preload白名单。

无变化时写“无”。

## 安全与隐私

- 项目边界。
- 路径范围。
- 锁定、Revision与不可变Version。
- 凭据和日志。
- 外部数据发送。

## 失败、取消和冲突路径

| 场景 | 预期行为 |
|---|---|
| 输入无效 |  |
| 目标不存在 |  |
| 任务取消 |  |
| Revision/Hash冲突 |  |
| 数据库或网络失败 |  |
| 应用重启 |  |

## 实施步骤

1. 先补充失败测试或复现。
2. 更新契约与领域模型。
3. 实现Core Use Case。
4. 实现Preload与Renderer交互。
5. 补齐错误、取消和冲突路径。
6. 运行检查并保存证据。

根据任务删改，但不得跳过必要层级。

## 自动化测试

- [ ] 单元测试
- [ ] Repository/集成测试
- [ ] Migration测试
- [ ] 安全测试
- [ ] E2E
- [ ] 性能测试
- [ ] AI Eval

## 手动验收

列出可由人逐步执行的验收流程、窗口尺寸、主题和截图要求。

## 性能预算

定义本任务影响的指标和目标。无性能影响时写“无专项预算，必须不劣化现有基线”。

## 完成条件

- [ ] 目标全部实现。
- [ ] 非目标未被引入。
- [ ] 契约、Schema和文档同步。
- [ ] 成功、失败、取消、冲突路径完成。
- [ ] 需要的测试真实运行并通过。
- [ ] 证据保存到`docs/test-evidence/<TASK-ID>/`。
- [ ] 无TODO、空实现、固定假数据冒充完成。

## 回滚策略

说明如何恢复代码、数据库、配置和用户数据。

## 完成报告

完成后记录：变更摘要、文件清单、命令结果、手动验收、性能数据、已知限制与后续任务。
