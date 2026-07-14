# M5-03 快速改写与结构性改写

> 状态：Planned  
> 里程碑：M5 AI生成与候选审阅  
> 优先级：P0  
> 建议分支：`feat/m5-rewrite-workflows`

## 目标

实现高频单段快速改写和跨段/跨场景结构性改写，保持可预览、可冲突处理和可撤销。

## 阶段定位

完成T0/T1、改写、融合、候选审阅、采用和撤销的作者可控AI闭环。

## 非目标

- 不允许模型直接替换选区。
- 不新增未经请求的剧情事件。

## 依赖

M5-02、M2-03

## 关联

- 需求：REQ-027
- 功能ID：AI-006、AI-007
- 验收：P0-027、P0-028

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/ai/PROMPT_AND_EVAL_SPEC.md`
- `docs/ui/EDITOR_INTERACTION_SPEC.md`
- `docs/ui/CANDIDATE_REVIEW_SPEC.md`

## 主要影响范围

- `packages/prompts/`
- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/renderer/`
- `evals/`
- `tests/integration/`
- `tests/e2e/`

## 实施内容

1. 快速改写输入单段选区、同段全文、邻段语境、任务指令和最小约束。
2. 内联预览支持换一个、取消、应用和整体撤销。
3. 选区含锁定内容时禁止并解释。
4. 范围超过轻量阈值时自动升级结构性Candidate。
5. 结构性改写支持跨段、跨SceneBeat和整章，完整记录baseRevision和来源。
6. 应用复用Diff、ConflictSet、Block Patch、LockGuard和ApplyRecord。

## 测试与证据

- 单段、跨段、锁定、Revision变化、取消、换一个和撤销。
- 不新增事件、专名/视角/时态保持Fixture。
- 升级结构性流程不丢用户指令。

证据保存到：`docs/test-evidence/M5-03/`

## 完成条件

- 快速操作不绕过Candidate隔离和代码硬保证。
- 结构性改写与普通Candidate采用一致。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
