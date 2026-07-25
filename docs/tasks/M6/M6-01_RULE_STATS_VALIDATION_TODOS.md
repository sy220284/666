# M6-01 确定性/统计校验与修订待办

> 状态：Planned  
> 里程碑：M6 校验、搜索与交付  
> 优先级：P0  
> 建议分支：`work/m6-01-rule-stats-validation-todos`

## 目标

建立可重复的规则/基础统计校验、稳定问题锚点和StoryTodo/批注闭环。

## 阶段定位

补齐校验、全项目搜索、节奏指标、DOCX和三轨备份恢复。本任务建立通用ValidationIssue与修订闭环；频道爽点、章末钩子、黄金三章和人工写作速度由M6-04承接。

## 非目标

- 不使用AI判断语义问题。
- 不把统计阈值作为强制文风裁决。
- 不实现M6-04的体裁节奏、连载和人工码字统计。
- 不自动修改正文、设定或任务状态。

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
- `tests/unit/`
- `tests/integration/`
- `tests/security/`
- `tests/e2e/`

## 问题锚点合同

```text
ValidationAnchor
├─ projectId
├─ chapterId | null
├─ versionId | null
├─ logicalBlockId | null
├─ expectedBlockHash | null
├─ textQuote | null
└─ rangeHint | null
```

锚点用于定位和判定stale，不是正文真源。跳转前必须回读权威对象；块缺失、Hash变化或Version变化时显示过期状态，不静默定位到相似文本。

## 实施内容

1. 确定性校验：必选SceneBeat、锁定、引用、时间顺序、格式和不可变Version。
2. 基础统计校验：字数、句长、段长、对话比例和重复符号；阈值来自版本化配置，不散落魔法数字。
3. ValidationIssue包含来源Version、稳定正文锚点、依据、建议、来源、严重度和状态。
4. 相同输入、规则版本和配置必须产生确定性结果；规则或配置变化记录版本，不覆盖历史证据。
5. 支持解决、忽略、静音、降级、误报和重新运行；范围及继承规则必须明确。
6. 实现StoryTodo和Comment绑定章节、SceneBeat或Block，全部通过Core、Main IPC和Preload严格合同。
7. 校验问题可转待办，待办完成后重新触发来源校验，通过则自动关闭；未通过时保留最新结果与历史关联。
8. Renderer只提交问题ID、操作和必要锚点，不提交Issue全文或正文作为权威状态。

## 测试与证据

- 相同输入结果稳定，规则版本变化可追溯，过期Version与块Hash被标记stale。
- 正文锚点跳转、块删除、文本变化、忽略/静音范围和重跑。
- 待办自动关闭和未通过保留最新结果。
- 跨项目Issue、Todo、Comment和锚点拒绝。
- 未注册命令、额外字段和Renderer伪造Issue全文安全测试。
- 通用统计与M6-04体裁指标边界回归。

证据保存到：`docs/test-evidence/M6-01/`

## 完成条件

- 规则和基础统计校验可解释、可重复、可版本追溯。
- 问题锚点过期时不误跳转、不静默改正文。
- 校验、待办和批注通过完整桌面调用链，不形成Renderer权威状态。
- 校验不会自动修改正文和设定。
- M6-04可复用ValidationIssue和统计基础，不重复建设通用校验模型。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
