# M3-06 状态提案、定稿、尾快照与失效传播

> 状态：Verified  
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
- `apps/desktop/main/`
- `apps/desktop/preload/`
- `apps/desktop/renderer/`
- `tests/integration/`
- `tests/migration/`
- `tests/security/`
- `tests/e2e/`

## 实施内容

1. 章节定稿创建final Version。
2. 由规则或Provider Stub生成entity_state/arc_milestone StateProposal，包含旧值、新值、正文块证据和置信度。
3. 支持接受、编辑后接受、拒绝；pending不修改权威状态。
4. 接受后单事务更新EntityState或ArcMilestone并创建EndingSnapshot。
5. 旧章重新定稿时按变化类型标记后续Snapshot、校验和缓存stale。
6. 纯文字润色不触发状态级联。
7. 尾快照缺失时后续约束包可按DEC-016回退直查。
8. `entity_state.validUntilChapterId`必须完整保留为半开区间终点；跨项目、同章或逆序终点必须阻断，禁止静默降级为永久状态。

## 最终实现记录

- Schema 16建立StateProposal、EndingSnapshot、DerivedInvalidation；Schema 17补齐有限期终点持久化与数据库级区间约束。
- 双类型提案生成、作者批量裁决、单事务权威状态更新、快照重建及失效传播均已接通。
- `validUntilChapterId`在合同、提案、裁决与EntityState之间完整保留；同章、逆序、跨项目和失效终点被拒绝。
- M3批量复验运行`29914507812`完成最终桌面、质量、安全与性能闭环。

## 测试与证据

- 无证据提案、空提案、批量接受、编辑、拒绝和事务失败。
- arc_milestone pending不生效，接受后合法推进。
- 纯润色、位置、事件、伏笔变化的失效传播边界。
- 不可信Renderer、畸形Payload和越权作者裁决输入被阻断。
- Electron从正文Version生成pending提案，经作者界面接受后生成有效尾快照。
- 非空状态终点在提案列表、接受事务、EntityState查询和EndingSnapshot中保持一致。
- 同章、逆序和跨项目终点被拒绝，批量失败不产生部分权威写入。

证据保存到：`docs/test-evidence/M3-06/`

## 完成条件

- 尾快照可供下一章读取且来源可追溯。
- 作者始终拥有状态和弧光最终裁决权。
- 有限期EntityState严格遵循`[validFromChapterId, validUntilChapterId)`语义。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
