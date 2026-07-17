# M1-07 手动Version、定稿与历史恢复

> 状态：Verified  
> 里程碑：M1 基础写作MVP  
> 优先级：P0  
> 建议分支：`feat/m1-manual-version-finalize`

## 目标

提供无AI场景下的不可变历史版本、章节定稿和恢复为新当前稿能力。

## 阶段定位

交付无AI也能长期写作、自动保存、版本、导入导出和恢复的基础产品。

## 非目标

- 不实现Candidate。
- 不实现AI状态提案。
- 不实现DOCX导出。

## 依赖

M1-06

## 关联

- 需求：REQ-012、REQ-035
- 功能ID：VER-001、EXP-001基础
- 验收：P0-020、P0-021、P0-050基础

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/decisions/ADR-003-draft-candidate-version.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/ui/SCREEN_SPECIFICATIONS.md`

## 主要影响范围

- `migrations/project/`
- `packages/domain/`
- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/renderer/`
- `tests/integration/`
- `tests/e2e/`

## 实施内容

1. 实现Version与VersionBlock不可变Repository。
2. 支持作者手动保存版本、章节定稿和版本标签。
3. 创建Version前强制flush并校验Draft Revision。
4. 查看版本列表与只读正文。
5. 恢复历史Version时创建新Draft/新Revision，不修改历史Version。
6. 章节finalVersionId只指向明确的定稿Version。

## 测试与证据

- Version不可变、事务失败回滚、重复创建、恢复后继续编辑。
- 恢复不会覆盖历史记录，重启后版本列表一致。
- 导出入口只允许选择Version。

证据保存到：`docs/test-evidence/M1-07/`

## 完成条件

- 作者无需AI即可保存阶段版本、定稿和恢复。
- Version和VersionBlock不存在业务UPDATE/DELETE路径。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
