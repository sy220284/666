# M6-04 网文节奏与连载指标

> 状态：Planned  
> 里程碑：M6 校验、搜索与交付  
> 优先级：P0  
> 建议分支：`feat/m6-genre-rhythm-serial-metrics`

## 目标

提供作者可编辑、建议级的爽点密度、章末钩子、更新节奏和黄金三章分析。

## 阶段定位

补齐校验、全项目搜索、节奏指标、DOCX和三轨备份恢复。

## 非目标

- 不使用硬编码魔法数字。
- 不阻断写作、定稿或发布。
- 不替作者判断作品质量。

## 依赖

M3-02、M6-01、M6-02

## 关联

- 需求：REQ-046
- 功能ID：RHY-001—RHY-004
- 验收：P0-073、P0-074

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/product/FUNCTION_CATALOG.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/testing/TEST_STRATEGY.md`

## 主要影响范围

- `migrations/project/`
- `packages/domain/`
- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/renderer/`
- `tests/unit/`
- `tests/integration/`

## 实施内容

1. 实现GenreRhythmProfile，按频道保存可编辑参考区间。
2. 爽点密度复用SceneBeat冲突、反转、信息释放节点，按千字统计。
3. 章末钩子使用规则+语义联合检测，输出建议级提示。
4. 更新节奏读取Draft保存历史统计当日/累计字数。
5. 黄金三章只对前3章生效，复用统一统计口径。
6. 所有结果为P3建议级，可关闭、调整阈值和标记不适用。

## 测试与证据

- 不同频道、空SceneBeat、短章、长章和自定义阈值。
- 建议不会进入阻断类ValidationIssue。
- AI不可用时规则部分仍可运行。

证据保存到：`docs/test-evidence/M6-04/`

## 完成条件

- 节奏指标透明可解释且不强迫作者。
- 新增功能有独立任务、测试和验收，不再塞入通用校验卡。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
