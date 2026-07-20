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
- `docs/contracts/IPC_CONTRACTS.md`
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
- `tests/e2e/`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/database/DATA_DICTIONARY.md`
- `docs/contracts/IPC_CONTRACTS.md`
- `docs/tasks/ACTIVE_TASK.json`
- `docs/tasks/ACTIVE_TASK.md`
- `docs/tasks/TASK_INDEX.md`
- `docs/tasks/M3/M3-04_STATE_TIMELINE_KNOWLEDGE.md`
- `docs/product/V1.0_TRACEABILITY_MATRIX.md`
- `docs/test-evidence/M3-04/`

## 实施内容

1. 实现EntityState的stateKey、value、validFromChapter、validUntilChapter、recordStatus、证据和来源Version。
2. 提供当前状态与历史账本查询；章节生效区间采用起点包含、终点不包含的半开区间，不允许重叠。
3. 实现TimelineEvent起止、精度、人物、地点、章节、归档状态和前置依赖。
4. 仅对可比较时间执行同一人物同一时间多地、依赖循环和确定性顺序冲突阻断；不确定精度不伪造硬裁决。
5. 实现KnowledgeState：knows、believes、suspects、misunderstands、unknown、章节有效区间及稳定来源锚点。
6. 提供状态失效、时间事件归档、知情记录失效的作者命令。
7. 提供列表式、可搜索、可引用的最小UI，并贯通Renderer、Preload、Main、Core完整调用链。

## 测试与证据

- 状态生效/失效、同起点修订、历史查询、跨项目证据和来源Version。
- 不同时间精度、区间重叠、多地冲突、依赖循环及确定性顺序冲突。
- 知情变化、章节边界、误解、未得知信息、来源锚点和正文块删除安全。
- 严格IPC、Preload具名桥、Core操作联合类型和Electron E2E真实调用链。

证据保存到：`docs/test-evidence/M3-04/`

## 完成条件

- 连续性数据可被约束包和校验可靠读取，不依赖AI临时推断。
- 当前值、指定章节有效值与历史值不会混淆。
- 正式代码真实存在于最终PR Head，通用六类门禁验证同一Head。

## 质量加固记录

- 修复显式有限结束区间被后续状态错误延长的问题，合法空档期保持不变。
- 多地冲突按实际在场语义覆盖`participant`和`witness`，`subject`不自动推定在场。
- 补齐状态失效、跨项目来源、时间精度、依赖顺序、五种知情状态、逻辑块删除安全、七个IPC命令及真实Electron写入展示链路。
- 加固实现Head：`c4d27694c24f8c15080a013b32378bf61ce1b2b9`；Quality、Security、Performance、PR Policy与Evidence均已通过，最终main复验提交为`bd9a1a0db768d9be8dbaa9bb1a0543754dcac40d`。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
