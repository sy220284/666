# M3-06 状态提案、定稿、尾快照与失效传播

> 状态：In Progress  
> 里程碑：M3 规划、设定与连续性  
> 优先级：P0  
> 建议分支：`work/m3-06-state-proposal-snapshot`

## 目标

将章节定稿安全转换为下一章连续性入口，并在旧章返修后标记派生数据失效。

## 阶段定位

建立规划、设定与连续性权威数据，作者确认后才改变状态。

## 非目标

- 不自动改写后续正文。
- 不强制每章运行AI状态提取。

## 依赖

M3-04、M3-05、M1-07、M2-03

## 关联

- 需求：REQ-022、REQ-045
- 功能ID：STA-002、SNP-001、ARC-002
- 验收：P0-041、P0-042、P0-072

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/architecture/DATA_FLOW.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/decisions/ADR-004-ai-cannot-overwrite-draft.md`
- `docs/decisions/ADR-006-character-arc-via-state-proposal.md`

## 主要影响范围

- `migrations/project/`
- `packages/domain/`
- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/renderer/`
- `tests/integration/`
- `tests/e2e/`

## 实施内容

1. 章节定稿创建final Version。
2. 由规则或Provider Stub生成entity_state/arc_milestone StateProposal，包含旧值、新值、正文块证据和置信度。
3. 支持接受、编辑后接受、拒绝；pending不修改权威状态。
4. 接受后单事务更新EntityState或ArcMilestone并创建EndingSnapshot。
5. 旧章重新定稿时按变化类型标记后续Snapshot、校验和缓存stale。
6. 纯文字润色不触发状态级联。
7. 尾快照缺失时后续约束包可按DEC-016回退直查。

## 测试与证据

- 无证据提案、空提案、批量接受、编辑、拒绝和事务失败。
- arc_milestone pending不生效，接受后合法推进。
- 纯润色、位置、事件、伏笔变化的失效传播边界。

证据保存到：`docs/test-evidence/M3-06/`

## 完成条件

- 尾快照可供下一章读取且来源可追溯。
- 作者始终拥有状态和弧光最终裁决权。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
