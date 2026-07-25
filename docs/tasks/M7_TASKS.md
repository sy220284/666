# WorldForge 原M7 完整UI与体验整合需求摘要

> 状态：Absorbed by M4-04  
> 用途：保留向导、工作台、主题、无障碍与显示环境需求；不得作为独立任务执行入口。

## 执行归属

原M7-01—M7-03全部由[M4-04 V1剩余功能整体实施与发布闭环](M4/M4-04_PROMPT_REGISTRY_OUTPUT.md)吸收。体验整合必须建立在同一任务内已经真实接通的业务功能上，不得把首次业务接线拖到最终UI阶段。

## 需求范围

| 原ID | 需求来源 | 统一实施内容 |
|---|---|---|
| M7-01 | [新手/专业模式、向导与三条创作路径](M7/M7-01_ONBOARDING_MODES_PATHS.md) | 四个首次使用入口、自主/混合/AI初稿路径及单一模式状态。 |
| M7-02 | [统一工作台、沉浸视图与交互状态](M7/M7-02_UNIFIED_WORKBENCH_INTERACTIONS.md) | 全功能接入、StatusArbiter、跨工作台返回、帮助与状态一致性。 |
| M7-03 | [双视觉主题、无障碍与响应式验收](M7/M7-03_THEMES_ACCESSIBILITY_RESPONSIVE.md) | Theme A/B、减少动态、键盘、焦点、读屏、响应式与DPI终验。 |

## 统一退出要求

- 向导和三条创作路径共用同一项目、数据、命令和业务组件。
- AI未配置或不可用时，自主写作路径完整可用。
- 所有已实现功能通过正式入口可达，未完成或受限功能不伪装可用。
- StatusArbiter只组合真实Core、TaskProtocol和Use Case状态，不形成Renderer权威真源。
- 主题只改变Design Token和表现资源，不改变业务命令、事务或数据模型。
- 1280×800、2K、21:9、混合DPI、键盘、焦点、读屏和减少动态矩阵通过。
- 相关验收统一进入`docs/test-evidence/M4-04/`和P0矩阵。
