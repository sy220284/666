# WorldForge 项目执行统一入口

> 状态：Frozen  
> 面向：Codex、开发者、审查者、测试人员

## 1. 唯一启动顺序

```text
AGENTS.md
→ docs/PROJECT_EXECUTION_ENTRY.md
→ docs/tasks/ACTIVE_TASK.md
→ ACTIVE_TASK指向的独立任务卡
→ 任务卡列出的专项规格
→ 现有代码、测试、Migration、IPC和追踪矩阵
```

`ACTIVE_TASK.md`为`NO_ACTIVE_CODING_TASK`时，可以分析、复查和补文档，不得自行开始生产代码。

## 2. 权威与任务路线

```text
作者最新明确指令
> ACTIVE_TASK已批准范围与验收
> docs/product/WORLDFORGE_V6.5_FULL_SPEC.md（产品、架构和功能）
> docs/product/V1_TASK_SYSTEM_REBASE.md（任务阶段、编号、依赖和阶段门）
> 专项冻结规格与实现决策
> 现有实现
```

完整规格第10章的旧M0—M5/M0.5路线已由重排基线和任务索引取代。

## 3. 九阶段

| 阶段 | 退出结果 |
|---|---|
| M0 工程、安全与运行底座 | 应用、Core、SQLite、IPC、测试和关键Spike可运行 |
| M1 基础写作MVP | 无AI完成项目、卷章、写作、保存、版本、导入导出和恢复 |
| M2 编辑安全与版本核心 | Patch、Revision、Hash、锁定、Candidate、采用、撤销和结构恢复 |
| M3 规划、设定与连续性 | 大纲、SceneBeat、Canon、状态、时间线、知情、伏笔、弧光和尾快照 |
| M4 检索与AI基础设施 | FTS、约束包、Provider、Prompt、GenerationRun和Eval |
| M5 AI生成与候选审阅 | T0/T1、改写、融合、比较、冲突、采用和partial |
| M6 校验、搜索与交付 | 校验、搜索替换、节奏、DOCX和三轨备份 |
| M7 完整UI与体验整合 | 模式、工作台、状态、主题、无障碍和响应式 |
| M8 发布硬化与验收 | 安全、数据、性能、E2E、跨平台、P0和文档关闭 |

M1未Verified前，后期AI、弧光、节奏和主题骨架不得计为主线完成度。

## 4. 总览入口

| 问题 | 文档 |
|---|---|
| 完整产品与架构 | `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md` |
| 任务为何重排 | `docs/product/V1_TASK_SYSTEM_REBASE.md` |
| 当前允许做什么 | `docs/tasks/ACTIVE_TASK.md` |
| 全部任务顺序 | `docs/tasks/TASK_INDEX.md` |
| 阶段路线 | `docs/roadmap/V1.0_ROADMAP.md` |
| 功能如何设计 | `docs/product/FUNCTION_CATALOG.md` |
| 需求如何映射 | `docs/product/V1.0_TRACEABILITY_MATRIX.md` |
| 数据库 | `docs/database/` |
| IPC和事件 | `docs/contracts/` |
| AI和Eval | `docs/ai/` |
| UI与交互 | `docs/ui/` |
| 安全与隐私 | `SECURITY.md`、`docs/security/` |
| 测试与验收 | `docs/testing/` |
| 冻结实现选择 | `docs/decisions/IMPLEMENTATION_DECISIONS.md` |
| 完整执行闭环 | `docs/process/CODEX_EXECUTION_PLAYBOOK.md` |

## 5. 标准执行流程

```text
确认活动任务与Verified依赖
→ 读取任务卡和专项文档
→ 检查真实代码、测试、Migration和最近提交
→ 输出目标、非目标、路径和影响
→ 建立失败测试或稳定复现
→ contracts/domain
→ Migration/Repository
→ Core Use Case
→ Main/Preload
→ 最小Renderer/UI
→ 失败、取消、冲突、只读和恢复
→ 自动化与人工验收
→ 独立复查
→ 文档、追踪矩阵和证据
→ 关闭任务并等待下一指令
```

## 6. 强制规则

- 不跨活动任务范围。
- 不引用尚未建立的未来表、模型、命令或恢复能力。
- 不以Mock、TODO、空函数和固定成功冒充完成。
- AI输出不得绕过Candidate进入Draft。
- Prompt不得代替锁定、Revision、项目和路径边界。
- 用户功能必须在本任务内完成最小可操作UI。
- 任务关闭后不得自动开始下一任务。

## 7. 证据

```text
docs/test-evidence/<TASK-ID>/
├── summary.md
├── commands.txt
├── test-results/
├── screenshots/
├── performance.json
└── known-risks.md
```

`Implemented`表示真实接通；只有自动化、人工验收和证据完成后才标记`Verified`。
