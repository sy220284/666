# M3-09 Renderer规划、设定、结构与数据工具迁移

> 状态：Planned  
> 里程碑：M3 规划、设定与连续性  
> 优先级：P0  
> 建议分支：`refactor/m3-renderer-planning-canon-structure`

## 目标

将M1—M3已接通的规划、设定、卷章结构、回收站、恢复和TXT/Markdown导入导出迁移到React工作台，继续复用权威Core命令和安全事务链。

## 阶段定位

在React壳层稳定后迁移M3完整业务面，使M4开始前规划、设定和数据工具具备可扩展组件边界。

## 非目标

- 不修改M1—M3数据库表、业务状态机或Core Use Case。
- 不让规划变化自动修改正文，不让pending提案冒充权威状态。
- 不实现M4搜索、Provider或AI生成能力。
- 不迁移正文Tiptap、Version和Candidate工作台。

## 依赖

M3-08

## 关联

- 需求：REQ-014—REQ-022、REQ-034—REQ-037、REQ-039、REQ-040
- 功能ID：PLN-001—006、CAN-001/002、STA-001/002、TIM-001、KNO-001、FSH-001、ARC-001—004、IMP-001、EXP-001、BAK-002、RCV-001、UI-002/004/005
- 验收：P0-033—P0-042、P0-048—P0-055、P0-060—P0-062基础

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/ui/INFORMATION_ARCHITECTURE.md`
- `docs/ui/SCREEN_SPECIFICATIONS.md`
- `docs/ui/INTERACTION_STATES.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/decisions/ADR-005-lock-revision-backup.md`

## 主要影响范围

- `apps/desktop/renderer/`
- `packages/contracts/`
- `tests/unit/`
- `tests/integration/`
- `tests/security/`
- `tests/e2e/`
- `tests/performance/`
- `docs/ui/`

## 实施内容

1. 实现规划工作台：左侧卷章与大纲树，中区ProjectBrief、PlotNode、Chapter和SceneBeat，右区人物、设定、伏笔、弧光与目标摘要。
2. 实现设定工作台：实体、Canon、当前/历史状态、弧光、时间线、知情、伏笔、引用和状态提案。
3. 迁移卷章生命周期、结构操作、回收站恢复和永久删除，继续复用Patch、Revision、Hash、LockGuard和恢复点。
4. 迁移TXT/Markdown导入预览、章节调整、原子提交、Version选择和导出结果。
5. SceneBeat规划移动与正文块移动保持分步确认，规划变化不自动改正文。
6. 用统一Query/Command Hook处理读取代次、pending、错误码、只读、冲突和成功刷新。
7. 删除对应旧DOM、全局状态和bootstrap代码，各域形成独立feature目录。

## 测试与证据

- 规划、设定和结构操作覆盖空、加载、失败、只读、冲突、取消、恢复和重启。
- 大纲树支持键盘与拖动，SceneBeat跨章显示真实影响预览。
- Canon、动态状态、历史状态和pending提案保持分离。
- 拆并章、永久删除、导入和恢复继续通过现有安全回归。
- 导入预览期间项目库不变化，取消或失败无临时数据残留。

证据保存到：`docs/test-evidence/M3-09/`

## 完成条件

- 规划、设定、结构、回收站、恢复和基础导入导出完全由React工作台承载。
- Core权威数据、作者确认和恢复安全语义不变。
- 对应旧Renderer代码删除，M4新增UI有明确接入点。

任务关闭前必须同步`TASK_INDEX.md`、追踪矩阵及实际受影响的UI、IPC、安全和测试文档。
