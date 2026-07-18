# M3-01 作品任务书与大纲树

> 状态：In Progress  
> 里程碑：M3 规划、设定与连续性  
> 优先级：P0  
> 建议分支：`feat/m3-project-brief-outline`

## 目标

建立可跳过、可后补的作品任务书和长篇大纲树，不强迫作者遵循固定流程。

## 阶段定位

建立规划、设定与连续性权威数据，作者确认后才改变状态。

## 非目标

- 不实现SceneBeat。
- 不让规划修改自动改写正文。

## 依赖

M2

## 关联

- 需求：REQ-016
- 功能ID：PLN-001、PLN-002
- 验收：P0-033

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/product/FUNCTION_CATALOG.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/ui/SCREEN_SPECIFICATIONS.md`

## 主要影响范围

- `migrations/project/`
- `packages/domain/`
- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/renderer/`
- `apps/desktop/main/`
- `apps/desktop/preload/`
- `tests/integration/`
- `tests/e2e/`
- `tests/migration/`
- `tests/security/`
- `docs/contracts/IPC_CONTRACTS.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/ui/SCREEN_SPECIFICATIONS.md`

## 实施内容

1. 实现ProjectBrief高概念、阅读承诺、主角目标、核心冲突、终局、必须/禁止项。
2. 实现PlotNode树、父子关系、节点类型、orderKey和事务拖动。
3. 新手问题式入口与专业完整字段共用同一数据。
4. 规划字段均可跳过、后补和关闭提示。
5. 规划变化只更新规划数据，不产生正文Patch。

## 测试与证据

- 空白项目、跳过任务书、后补、树节点拖动和事务失败。
- 规划变化后Draft、Version和Candidate均不变化。

证据保存到：`docs/test-evidence/M3-01/`

## 完成条件

- 规划数据可独立维护并供后续SceneBeat和约束包读取。
- 自主写作路径不被规划表单阻塞。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
