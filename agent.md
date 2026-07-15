# WorldForge Agent工作入口

> 本文件供人工和通用AI代理快速查看。Codex仓库级权威指令文件是根目录`AGENTS.md`。

## 1. 开始工作时先读什么

```text
AGENTS.md
→ docs/PROJECT_EXECUTION_ENTRY.md
→ docs/tasks/ACTIVE_TASK.json
→ docs/tasks/ACTIVE_TASK.md
→ ACTIVE_TASK指向的独立任务卡
→ 任务卡列出的专项文档
→ 现有代码、测试、Migration、IPC和追踪矩阵
```

`ACTIVE_TASK.json`是机器真源，`ACTIVE_TASK.md`是其镜像。当前作者已授权`continuous-mainline`模式：一张任务Verified后可自动激活下一张依赖已满足的任务，失败时必须阻断。

## 2. V1.0任务阶段

```text
M0 工程、安全与运行底座
→ M1 基础写作MVP
→ M2 编辑安全与版本核心
→ M3 规划、设定与连续性
→ M4 检索与AI基础设施
→ M5 AI生成与候选审阅
→ M6 校验、搜索与交付
→ M7 完整UI与体验整合
→ M8 发布硬化与验收
```

共48张独立任务卡，详见`docs/tasks/TASK_INDEX.md`。

M1必须先交付无AI基础产品：

```text
创建项目
→ 建卷建章
→ 中文写作
→ 自动保存
→ 字数与当前章查找
→ 手动版本与定稿
→ TXT/Markdown导入导出
→ 只读与恢复副本
```

基础产品未完成时，不得将后期Prompt、AI Schema、人物弧光或主题骨架视为主线完成度。

## 3. 文档入口

| 问题 | 文档 |
|---|---|
| 完整产品、架构和边界 | `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md` |
| 不知道该查什么 | `docs/PROJECT_EXECUTION_ENTRY.md` |
| 当前允许做什么 | `docs/tasks/ACTIVE_TASK.md` |
| 全部任务与顺序 | `docs/tasks/TASK_INDEX.md` |
| 路线图 | `docs/roadmap/V1.0_ROADMAP.md` |
| 功能如何设计 | `docs/product/FUNCTION_CATALOG.md` |
| 需求如何映射任务 | `docs/product/V1.0_TRACEABILITY_MATRIX.md` |
| 架构与模块职责 | `docs/architecture/` |
| 数据库与Migration | `docs/database/` |
| IPC、事件与错误码 | `docs/contracts/` |
| Provider、Prompt与Eval | `docs/ai/` |
| UI与交互 | `docs/ui/` |
| 安全与隐私 | `SECURITY.md`、`docs/security/` |
| 测试与验收 | `docs/testing/` |
| 固定实现选择 | `docs/decisions/IMPLEMENTATION_DECISIONS.md` |
| 完整工作闭环 | `docs/process/CODEX_EXECUTION_PLAYBOOK.md` |

## 4. 五项硬边界

1. 项目数据、索引、日志和备份默认只在用户本机。
2. AI输出先成为Candidate，未经作者接受不能进入Draft。
3. `project.sqlite`是唯一项目数据真源。
4. 锁定、Revision、Hash、不可变Version、项目与路径边界由代码保证。
5. AI只能提议，作者拥有最终裁决权。

任一边界失败，任务不能通过。

## 5. 标准行动路径

```text
确认活动任务与依赖
→ 阅读任务和专项文档
→ 检查真实代码与测试
→ 输出目标、非目标、路径和验证计划
→ 先建立失败测试或稳定复现
→ 完成最小端到端实现和最小UI
→ 覆盖失败、取消、冲突、只读和恢复
→ 运行测试
→ 独立复查
→ 同步文档和追踪矩阵
→ 保存证据
→ 关闭任务并等待下一指令
```

## 6. 当前版本不做

- 云存储、云同步、账号后台。
- 模型下载、安装和运行时管理。
- 向量数据库、Embedding和Rerank。
- 多人协作、CRDT、插件市场。
- 自动发布、读者运营和偏好学习。
- 无人审核批量生成。

## 7. 完成标准

只有同时满足以下条件才能汇报完成：

- 前置依赖已Verified。
- 功能真实接通且有最小可操作UI。
- 成功和主要失败路径可运行。
- 测试真实执行并记录。
- 数据、IPC、UI、安全和文档一致。
- `TASK_INDEX`与追踪矩阵已更新。
- 证据位于`docs/test-evidence/<TASK-ID>/`。
- 没有TODO、空实现、固定假数据和伪造成功。

任务关闭后不得自动继续下一项。
