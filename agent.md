# WorldForge Agent工作入口

> 本文件供人工和通用AI代理快速查看。Codex仓库级权威指令文件是根目录`AGENTS.md`。

## 1. 开始工作时先读什么

任何开发、修复、测试、重构或文档同步任务，按顺序读取：

```text
1. AGENTS.md
2. docs/PROJECT_EXECUTION_ENTRY.md
3. docs/tasks/ACTIVE_TASK.md
4. ACTIVE_TASK指向的一任务一文件任务卡
5. 任务卡列出的专项文档
6. 现有代码、测试、Migration、IPC和追踪矩阵
```

`ACTIVE_TASK.md`显示`NO_ACTIVE_CODING_TASK`时，不得自行开始下一项编码。

## 2. 文档统一入口

| 需要解决的问题 | 查询文档 |
|---|---|
| 项目完整定位、架构、功能、边界 | `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md` |
| 不知道该查什么 | `docs/PROJECT_EXECUTION_ENTRY.md` |
| 当前允许做什么 | `docs/tasks/ACTIVE_TASK.md` |
| 全部任务顺序 | `docs/tasks/TASK_INDEX.md` |
| 单个任务具体要求 | `docs/tasks/M0/`至`docs/tasks/M5/` |
| 功能如何设计与交互 | `docs/product/FUNCTION_CATALOG.md` |
| 架构与模块职责 | `docs/architecture/` |
| 数据表、字段、Migration | `docs/database/` |
| IPC、事件、错误码 | `docs/contracts/` |
| Provider、Prompt、AI Eval | `docs/ai/` |
| 页面、编辑器、候选、高分屏 | `docs/ui/` |
| 安全、路径、凭据、日志 | `SECURITY.md`、`docs/security/` |
| 测试、性能、P0验收 | `docs/testing/` |
| 固定技术选择 | `docs/decisions/IMPLEMENTATION_DECISIONS.md` |
| 完整工作闭环 | `docs/process/CODEX_EXECUTION_PLAYBOOK.md` |
| 长篇技术开发参考 | `WorldForge_Codex_全流程技术开发指南.md` |

## 3. 文档权威顺序

```text
作者最新明确指令
> ACTIVE_TASK已批准范围与验收
> WORLDFORGE_V6.5_FULL_SPEC.md
> 专项冻结规格、ADR、Schema、IPC、UI、安全与P0验收
> IMPLEMENTATION_DECISIONS.md
> AGENTS.md与闭环执行手册
> 现有实现
```

发现冲突时停止相关修改，列出冲突和影响，不自行选择一份覆盖另一份。

## 4. 标准行动路径

```text
确认活动任务
→ 阅读任务与专项文档
→ 检查代码现状
→ 输出目标、非目标、影响范围和测试计划
→ 先建立失败测试或稳定复现
→ 完成最小端到端实现
→ 覆盖失败、取消、冲突、只读和恢复
→ 运行测试
→ 独立复查
→ 同步文档和追踪矩阵
→ 保存证据
→ 关闭任务并等待下一指令
```

## 5. 五项硬边界

1. 所有项目数据默认只在用户本机。
2. AI输出必须先成为Candidate，未经作者接受不能进入Draft。
3. `project.sqlite`是唯一项目数据真源。
4. 锁定、Revision、Hash、不可变Version、项目与路径边界由代码保证。
5. AI只能提议，作者拥有最终裁决权。

任一边界失败，任务不能通过。

## 6. 当前版本不做

- 云存储、云同步、账号后台。
- 模型下载、安装和运行时管理。
- 向量数据库和预建检索Adapter。
- 多人协作、CRDT、插件市场。
- 自动发布、读者运营、偏好学习。
- 无人审核批量生成。

## 7. 工作完成标准

只有同时满足以下条件才能汇报完成：

- 功能真实接通。
- 成功和主要失败路径可运行。
- 测试真实执行并记录结果。
- 数据、IPC、UI、安全和文档一致。
- `TASK_INDEX`与追踪矩阵已更新。
- 证据位于`docs/test-evidence/<TASK-ID>/`。
- 没有TODO、空实现、固定假数据和伪造成功。

任务关闭后不得自动继续下一任务。
