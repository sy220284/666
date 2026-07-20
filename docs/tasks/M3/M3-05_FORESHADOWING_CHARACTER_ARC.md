# M3-05 伏笔生命周期与人物弧光

> 状态：Planned  
> 里程碑：M3 规划、设定与连续性  
> 优先级：P0  
> 建议分支：`feat/m3-foreshadowing-character-arc`

## 目标

建立伏笔承诺追踪和人物弧光计划/里程碑模型。

## 阶段定位

建立规划、设定与连续性权威数据，作者确认后才改变状态。

## 非目标

- 不让AI直接命中弧光节点。
- 不把弧光做成心理学分类体系。

## 依赖

M3-04

## 关联

- 需求：REQ-021、REQ-045
- 功能ID：FSH-001、ARC-001—ARC-004
- 验收：P0-040、P0-071、P0-072基础

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/product/FUNCTION_CATALOG.md`
- `docs/decisions/ADR-006-character-arc-via-state-proposal.md`

## 主要影响范围

- `migrations/project/`
- `packages/domain/`
- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/renderer/`
- `tests/integration/`

## 实施内容

1. 实现伏笔planned/planted/reinforced/partially_revealed/revealed/cancelled生命周期。
2. 实现回收窗口、依赖、阻塞、互斥、增强和关联章节。
3. 实现CharacterArc标题、类型、状态和作者意图。
4. 实现ArcMilestone planned/hit/skipped、章节、依赖其他节点或TimelineEvent。
5. 弧光节点状态只能由作者操作或后续StateProposal确认。
6. 提供列表式入口和超期/依赖提示。

## 测试与证据

- 伏笔状态流转、回收窗口、关系循环和软删除引用。
- 弧光节点依赖、章节移动、planned/hit/skipped合法转换。
- pending提案尚未实现时不应出现自动状态改变路径。

证据保存到：`docs/test-evidence/M3-05/`

## 完成条件

- 伏笔和弧光均有权威数据模型。
- 弧光状态推进接口为M3-06预留统一StateProposal路径。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
