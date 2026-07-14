# M7-01 新手/专业模式、向导与三条创作路径

> 状态：Planned  
> 里程碑：M7 完整UI与体验整合  
> 优先级：P0  
> 建议分支：`feat/m7-onboarding-modes-paths`

## 目标

将基础写作、规划和AI能力组织为可切换的新手/专业披露模式和自主/混合/AI初稿路径。

## 阶段定位

统一工作台、新手/专业模式、主题、无障碍和目标显示环境。

## 非目标

- 不分裂数据模型和业务能力。
- 不强迫用户配置AI。

## 依赖

M1—M6

## 关联

- 需求：REQ-038
- 功能ID：UI-001
- 验收：P0-057—P0-059

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/ui/ONBOARDING_SPEC.md`
- `docs/ui/INFORMATION_ARCHITECTURE.md`
- `docs/ui/SCREEN_SPECIFICATIONS.md`

## 主要影响范围

- `apps/desktop/renderer/`
- `packages/contracts/`
- `packages/core-service/`
- `tests/e2e/`

## 实施内容

1. 提供快速开始、完整流程、导入、空白项目四个入口。
2. 空白项目只要求名称和有效保存位置，其他非安全字段可跳过。
3. 新手与专业模式只改变字段显隐、帮助和默认布局，共用数据和命令。
4. 自主写作、混合创作、AI初稿三条路径可随时切换。
5. AI未配置时自主写作完整可用。
6. 向导中断不留下误认成正常项目的半成品。

## 测试与证据

- 五分钟进入第一章、跳过规划、模式切换和向导中断。
- 三条路径切换不改变已有数据。
- AI不可用的自主写作E2E。

证据保存到：`docs/test-evidence/M7-01/`

## 完成条件

- 新手降低认知负担，专业作者保留完整控制。
- 模式与路径不形成业务逻辑分叉。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
