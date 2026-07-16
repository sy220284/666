# M1-04 Draft、Tiptap与中文输入

> 状态：In Progress  
> 里程碑：M1 基础写作MVP  
> 优先级：P0  
> 建议分支：`feat/m1-draft-editor-ime`

## 目标

建立稳定的中文块级正文编辑器和Draft/DraftBlock持久化映射。

## 阶段定位

交付无AI也能长期写作、自动保存、版本、导入导出和恢复的基础产品。

## 非目标

- 不实现AI Candidate。
- 不实现锁定和复杂冲突。
- 不在此任务实现自动保存调度。

## 依赖

M1-03

## 关联

- 需求：REQ-007、REQ-008、REQ-009
- 功能ID：EDT-001、EDT-003、EDT-004
- 验收：P0-013—P0-016

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/ui/EDITOR_INTERACTION_SPEC.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/testing/PERFORMANCE_BUDGETS.md`

## 主要影响范围

- `migrations/project/`
- `packages/editor-core/`
- `packages/domain/`
- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/main/`
- `apps/desktop/preload/`
- `apps/desktop/renderer/`
- `tests/migration/`
- `tests/unit/`
- `tests/integration/`
- `tests/security/`
- `tests/e2e/`
- `docs/database/`
- `docs/contracts/`
- `docs/ui/`

## 实施内容

1. 实现Draft与DraftBlock，支持paragraph、dialogue、heading、separator。
2. 建立Tiptap节点与DraftBlock转换，logicalBlockId稳定，orderKey可排序。
3. 实现中文拼音、五笔等composition安全输入，composition期间不提交破坏性操作。
4. 实现Enter拆分、Backspace合并和logicalBlockId继承规则。
5. 实现粘贴白名单清理与纯文本粘贴。
6. 保留ProseMirror本地撤销重做和编辑位置。

## 测试与证据

- 拼音、五笔、连续输入、长段落、撤销重做、拆分合并。
- 粘贴网页、脚本、复杂样式和纯文本。
- 关闭重开后DraftBlock可完整重建编辑器正文。

证据保存到：`docs/test-evidence/M1-04/`

## 完成条件

- 编辑器无丢字、重复和半组合提交。
- 正文权威数据来自DraftBlock，Tiptap JSON不是第二真源。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
