# M6-01 确定性/统计校验与修订待办

> 状态：Planned  
> 里程碑：M6 校验、搜索与交付  
> 优先级：P0  
> 建议分支：`feat/m6-rule-stats-validation-todos`

## 目标

建立可重复的规则/统计校验、问题锚点和StoryTodo/批注闭环。

## 阶段定位

补齐校验、全项目搜索、节奏指标、DOCX和三轨备份恢复。

## 非目标

- 不使用AI判断语义问题。
- 不把统计阈值作为强制文风裁决。

## 依赖

M5、M3

## 关联

- 需求：REQ-031
- 功能ID：VAL-001、VAL-002、REV-001
- 验收：P0-043、P0-044基础

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

1. 确定性校验：必选SceneBeat、锁定、引用、时间顺序、格式和不可变Version。
2. 统计校验：字数、句长、段长、对话比例、重复符号和文风区间。
3. ValidationIssue包含Version、正文锚点、依据、建议、来源和状态。
4. 支持解决、忽略、静音、降级和重新运行。
5. 实现StoryTodo和Comment绑定章节、SceneBeat或Block。
6. 校验问题可转待办，待办完成后重新触发来源校验，通过则自动关闭。

## 测试与证据

- 相同输入结果稳定，过期Version被标记stale。
- 正文锚点跳转、忽略/静音范围和重跑。
- 待办自动关闭和未通过保留最新结果。

证据保存到：`docs/test-evidence/M6-01/`

## 完成条件

- 规则和统计校验可解释、可重复。
- 校验不会自动修改正文和设定。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
