# M1-06 自动保存、字数与当前章查找

> 状态：Planned  
> 里程碑：M1 基础写作MVP  
> 优先级：P0  
> 建议分支：`feat/m1-autosave-stats-find`

## 目标

完成基础写作所需的自动保存、保存状态、统一字数统计和当前章查找。

## 阶段定位

交付无AI也能长期写作、自动保存、版本、导入导出和恢复的基础产品。

## 非目标

- 不实现全项目FTS5。
- 不实现批量替换。

## 依赖

M1-05

## 关联

- 需求：REQ-008、REQ-009
- 功能ID：EDT-002、SRC-001
- 验收：P0-013—P0-016、P0-045

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/ui/EDITOR_INTERACTION_SPEC.md`
- `docs/testing/PERFORMANCE_BUDGETS.md`

## 主要影响范围

- `packages/editor-core/`
- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/renderer/`
- `tests/integration/`
- `tests/e2e/`
- `tests/performance/`

## 实施内容

1. 默认800ms空闲自动保存，composition期间不提交。
2. 前一保存未完成时合并后续本地修改，不并行写同一Draft。
3. 切章、手动Version、定稿和正常关闭前强制flush。
4. 实现保存中、已保存、失败、重试和复制未保存文本状态。
5. 统一字符数、纯文字字数和目标进度算法。
6. 实现当前章普通查找与安全替换，不依赖FTS5。

## 测试与证据

- 持续输入、快速切章、保存失败、重试、关闭重开和崩溃恢复。
- 字数在编辑器、目录、导出预览中一致。
- 2K键入P95≤50ms，自动保存P95≤150ms。

证据保存到：`docs/test-evidence/M1-06/`

## 完成条件

- 基础写作过程中不丢稿，保存状态只在Core事务确认后改变。
- AI未配置时编辑、保存、字数和查找完整可用。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
