# M3-04 动态状态、时间线与知情信息

> 状态：In Progress  
> 里程碑：M3 规划、设定与连续性  
> 优先级：P0  
> 建议分支：`work/m3-04-state-timeline-knowledge`

## 目标

建立按章节生效的动态状态历史、时间事件和人物知情边界。

## 阶段定位

建立规划、设定与连续性权威数据，作者确认后才改变状态。

## 非目标

- 不实现完整历法引擎。
- 不自动模拟信息传播。

## 依赖

M3-02、M3-03

## 关联

- 需求：REQ-018、REQ-019、REQ-020
- 功能ID：STA-001、TIM-001、KNO-001
- 验收：P0-037—P0-039

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/database/DATA_DICTIONARY.md`
- `docs/testing/TEST_STRATEGY.md`

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
- `docs/contracts/`
- `docs/database/`
- `docs/ui/`

## 实施内容

1. 实现EntityState的stateKey、value、validFromChapter、validUntilChapter、recordStatus、证据和来源Version。
2. 提供当前状态与历史账本查询。
3. 实现TimelineEvent起止、精度、人物、地点、章节和前置依赖。
4. 实现同一人物同一时间多地、依赖循环和顺序冲突规则。
5. 实现KnowledgeState：knows、believes、suspects、misunderstands、unknown及来源锚点。
6. 提供列表式、可搜索、可引用的最小UI。

## 测试与证据

- 状态生效/失效、历史查询、跨项目证据和来源Version。
- 不同时间精度、时间冲突、依赖循环。
- 知情变化、误解和未得知信息读取。

证据保存到：`docs/test-evidence/M3-04/`

## 完成条件

- 连续性数据可被约束包和校验可靠读取，不依赖AI临时推断。
- 当前值与历史值不会混淆。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
