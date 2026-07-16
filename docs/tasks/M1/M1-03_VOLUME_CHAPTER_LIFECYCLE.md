# M1-03 卷与章节基础生命周期

> 状态：In Progress  
> 里程碑：M1 基础写作MVP  
> 优先级：P0  
> 建议分支：`feat/m1-volume-chapter-lifecycle`

## 目标

在编辑器之前建立稳定的Volume和Chapter基础模型、排序、状态和软删除。

## 阶段定位

交付无AI也能长期写作、自动保存、版本、导入导出和恢复的基础产品。

## 非目标

- 不实现ProjectBrief、PlotNode和SceneBeat。
- 不实现拆章、并章和跨章正文移动。

## 依赖

M1-02

## 关联

- 需求：REQ-014
- 功能ID：PLN-003、TRS-001
- 验收：P0-034、P0-056基础部分

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/database/DATA_DICTIONARY.md`
- `docs/ui/SCREEN_SPECIFICATIONS.md`

## 主要影响范围

- `migrations/project/`
- `packages/domain/`
- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/main/`
- `apps/desktop/preload/`
- `apps/desktop/renderer/`
- `tests/migration/`
- `tests/integration/`
- `tests/security/`
- `tests/e2e/`
- `docs/database/`
- `docs/contracts/`

## 实施内容

1. 实现Volume、Chapter、orderKey、章节状态、目标字数、activeDraftId和finalVersionId。
2. 新项目可创建默认卷与第一章，也允许专业空白项目显式创建。
3. 实现卷章新增、重命名、排序、移动、状态修改和目标字数。
4. 默认软删除并建立最小TrashEntry，恢复原位置或选择新位置。
5. 所有排序使用64位整数间隔键和局部事务重排。

## 测试与证据

- 空项目、首章创建、连续插入、拖动、跨卷移动和局部重排。
- 软删除、恢复、原位置占用、重复名称和事务中断。
- 卷章顺序在重启后稳定。

证据保存到：`docs/test-evidence/M1-03/`

## 完成条件

- 编辑器可依赖真实Chapter和活动Draft引用，不再使用临时章节对象。
- 卷章基础管理形成可操作UI闭环。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
