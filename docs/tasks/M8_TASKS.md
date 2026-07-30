# WorldForge M8交付、体验与长期维护任务摘要

> 状态：Active  
> 用途：记录M8独立任务、被吸收来源和长期维护状态。

## 独立任务

| ID | 任务 | 依赖 | 核心交付 | 状态 |
|---|---|---|---|---|
| M8-02 | [完整体验、硬化与自用交付关闭](M8/M8-02_PERFORMANCE_E2E_AI_EVAL.md) | M4-04 | C8体验、安全硬化、性能、E2E、AI Eval和三平台自用便携交付 | Verified |
| M8-04 | [作者体验与开发语言统一改造](M8/M8-04_AUTHOR_EXPERIENCE_LANGUAGE.md) | M8-02 | 正式中文名称、精准跳转、写作辅助、结构化设定、差异审阅和安全关闭握手 | Verified |
| M8-05 | [运行时硬化与文档统一同步](M8/M8-05_RUNTIME_HARDENING_DOCUMENTATION_SYNC.md) | M8-04 | 搜索工具异步隔离、Provider错误语义和全量文档一致性 | Verified |
| M8-06 | [发布资格与任务治理硬化](M8/M8-06_RELEASE_QUALIFICATION_GOVERNANCE.md) | M8-05 | 动态发布资格、最终验证保持、延期账本与受检提交可达性 | Implemented |

## 被吸收的历史来源

原M7-01—M7-03、M8-01和M8-03不再独立执行，其需求由M8-02统一承接：

| 原ID | 需求来源 | 统一实施内容 |
|---|---|---|
| M7-01 | [新手/专业模式、向导与三条创作路径](M7/M7-01_ONBOARDING_MODES_PATHS.md) | 四入口、三路径、模式状态与创建事务。 |
| M7-02 | [统一工作台、沉浸视图与交互状态](M7/M7-02_UNIFIED_WORKBENCH_INTERACTIONS.md) | 工作台、状态仲裁、帮助、失败与恢复状态。 |
| M7-03 | [双视觉主题、无障碍与响应式验收](M7/M7-03_THEMES_ACCESSIBILITY_RESPONSIVE.md) | Theme A/B、键盘、焦点、视口与DPI。 |
| M8-01 | [安全、数据、Migration与隐私硬化](M8/M8-01_SECURITY_DATA_PRIVACY_HARDENING.md) | Electron、IPC、Migration、凭据、日志、诊断与恢复硬门。 |
| M8-03 | [跨平台构建、P0追踪与发布关闭](M8/M8-03_CROSS_PLATFORM_RELEASE_ACCEPTANCE.md) | Windows/macOS/Linux自用便携构建、追踪和发布判断。 |

Removed只取消原任务的独立执行形式，不取消需求与验收要求。

## 最终交付边界

M8-02已经完成V1.0自用便携交付：

- Windows、macOS、Linux原生构建、ASAR/Fuse/Hash和启动验证。
- 无AI基础写作、安全、恢复和既有项目兼容。
- Windows代码签名、macOS签名与公证、系统安装器、自动更新和安装生命周期不属于V1.0范围。
- 自用工件不得宣传或分发为适合第三方公开使用的正式产品。

M8-04、M8-05与M8-06均不扩大该边界。

## 当前维护结论

M8-05已经Verified。M8-06实现与分支验证已经完成，发布资格现由全部独立任务、最终验证保持、延期验证账本和受检提交可达性共同决定；当前等待受控合并、主分支验证与最终治理关闭。

## 长期维护规则

- 已Verified任务和历史Evidence保持冻结。
- 新发现的真实缺陷必须建立新的独立维护任务，不能改写历史结论冒充当时已经覆盖。
- 代码、测试、契约、专项规格、任务状态和Evidence必须在同一受检Head汇合。
- 当前活动状态只从`ACTIVE_TASK.json`读取；任何后续工作必须独立立项并完成受控合并与治理关闭。
