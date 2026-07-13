# WorldForge 文档总索引

> 基线：WorldForge V6.5  
> 适用范围：V1.0 核心写作闭环；V1.5 超长篇增强  
> 文档原则：设计真源集中、工程契约独立、需求可追踪、验收有证据。

## 1. 权威基线

| 优先级 | 文档 | 用途 |
|---|---|---|
| 1 | [`../WorldForge_V6.5_实施安全并发与高分屏适配冻结最终工程设计文档.docx`](../WorldForge_V6.5_实施安全并发与高分屏适配冻结最终工程设计文档.docx) | 产品、架构、功能、UI、安全、并发、高分屏与验收总纲 |
| 2 | [`../WorldForge_Codex_全流程技术开发指南.md`](../WorldForge_Codex_全流程技术开发指南.md) | Codex 从初始化到开发、测试、审查、验收的执行路径 |
| 3 | [`../AGENTS.md`](../AGENTS.md) | 仓库级不可变规则与编码约束 |
| 4 | 当前任务卡 | 当前任务目标、非目标、影响范围与验收条件 |

冲突优先级：

```text
作者最新明确指令
> 已批准任务卡
> V6.5冻结方案与P0验收
> AGENTS.md
> Codex全流程技术开发指南
> 现有代码实现
```

## 2. P0：正式编码前必须具备

### 产品与范围

- [`product/V1_SCOPE_AND_ACCEPTANCE.md`](product/V1_SCOPE_AND_ACCEPTANCE.md)：V1.0范围、V1.5延期项、非目标与版本关闭条件。
- [`product/FUNCTION_CATALOG.md`](product/FUNCTION_CATALOG.md)：完整功能清单、设计、预期效果、实现方式、依赖关系与交互。
- [`product/V1.0_TRACEABILITY_MATRIX.md`](product/V1.0_TRACEABILITY_MATRIX.md)：需求、设计、任务、实现与验收追踪。

### 路线图

- [`roadmap/V1.0_ROADMAP.md`](roadmap/V1.0_ROADMAP.md)：M0—M5实施顺序、进入与退出条件。

### 工程架构

- [`architecture/ARCHITECTURE.md`](architecture/ARCHITECTURE.md)：Main、Preload、Renderer、Core、数据真源和并发模型。
- [`architecture/MODULE_BOUNDARIES.md`](architecture/MODULE_BOUNDARIES.md)：包职责、允许依赖和禁止跨层调用。
- [`architecture/DATA_FLOW.md`](architecture/DATA_FLOW.md)：编辑、AI、候选、定稿、导入导出和恢复的数据流。

### 架构决策

- [`decisions/README.md`](decisions/README.md)
- [`decisions/ADR-001-local-data-boundary.md`](decisions/ADR-001-local-data-boundary.md)
- [`decisions/ADR-002-sqlite-source-of-truth.md`](decisions/ADR-002-sqlite-source-of-truth.md)
- [`decisions/ADR-003-draft-candidate-version.md`](decisions/ADR-003-draft-candidate-version.md)
- [`decisions/ADR-004-ai-cannot-overwrite-draft.md`](decisions/ADR-004-ai-cannot-overwrite-draft.md)
- [`decisions/ADR-005-lock-revision-backup.md`](decisions/ADR-005-lock-revision-backup.md)

### 数据库

- [`database/DATABASE_SCHEMA.md`](database/DATABASE_SCHEMA.md)
- [`database/DATA_DICTIONARY.md`](database/DATA_DICTIONARY.md)
- [`database/MIGRATION_POLICY.md`](database/MIGRATION_POLICY.md)
- [`database/SCHEMA_COMPATIBILITY.md`](database/SCHEMA_COMPATIBILITY.md)

### IPC与事件

- [`contracts/IPC_CONTRACTS.md`](contracts/IPC_CONTRACTS.md)
- [`contracts/ERROR_CODES.md`](contracts/ERROR_CODES.md)
- [`contracts/EVENT_PROTOCOL.md`](contracts/EVENT_PROTOCOL.md)

### 本地AI接入

- [`ai/LOCAL_AI_SERVICE_SPEC.md`](ai/LOCAL_AI_SERVICE_SPEC.md)
- [`ai/PROVIDER_PROTOCOL.md`](ai/PROVIDER_PROTOCOL.md)

### 安全与隐私

- [`../SECURITY.md`](../SECURITY.md)
- [`security/THREAT_MODEL.md`](security/THREAT_MODEL.md)
- [`security/PRIVACY_AND_LOGGING.md`](security/PRIVACY_AND_LOGGING.md)

### 测试与验收

- [`testing/TEST_STRATEGY.md`](testing/TEST_STRATEGY.md)
- [`testing/P0_ACCEPTANCE_MATRIX.md`](testing/P0_ACCEPTANCE_MATRIX.md)
- [`testing/PERFORMANCE_BUDGETS.md`](testing/PERFORMANCE_BUDGETS.md)
- [`testing/SECURITY_TEST_CASES.md`](testing/SECURITY_TEST_CASES.md)

### 任务卡

- [`tasks/TASK_TEMPLATE.md`](tasks/TASK_TEMPLATE.md)
- [`tasks/TASK_INDEX.md`](tasks/TASK_INDEX.md)
- [`tasks/M0_TASKS.md`](tasks/M0_TASKS.md)
- [`tasks/M1_TASKS.md`](tasks/M1_TASKS.md)
- [`tasks/M2_TASKS.md`](tasks/M2_TASKS.md)
- [`tasks/M3_TASKS.md`](tasks/M3_TASKS.md)
- [`tasks/M4_TASKS.md`](tasks/M4_TASKS.md)
- [`tasks/M5_TASKS.md`](tasks/M5_TASKS.md)

## 3. 后续文档阶段

P0完成后，根据真实代码和UI再生成：

- UI组件、页面与交互状态规格。
- 编辑器算法、Prompt注册表和AI Eval细则。
- 本地开发、调试、构建和安装指南。
- 用户快速开始、用户手册、备份恢复指南和FAQ。
- LICENSE、CONTRIBUTING、CHANGELOG、第三方许可证和发布检查。

后续文档不得提前虚构尚未实现的页面、命令和构建结果。

## 4. 文档状态定义

| 状态 | 含义 |
|---|---|
| Draft | 内容未冻结，不得直接作为编码依据 |
| Review | 已形成完整草案，等待评审 |
| Approved | 已批准，可作为任务输入 |
| Frozen | 版本内冻结，变更必须同步更新追踪矩阵与验收 |
| Superseded | 已被新文档替代，只保留历史记录 |

本目录新增文档默认状态为 **Approved**；五项ADR、V1范围和安全硬约束为 **Frozen**。

## 5. 维护规则

1. 新增或删除P0功能时，同步修改功能清单、追踪矩阵、路线图和任务卡。
2. 数据库字段变化时，同步修改Schema、数据字典、兼容策略、Migration任务和测试。
3. IPC变化时，同步修改契约、错误码、事件协议、Preload白名单与测试。
4. Prompt、模型适配或约束包变化时，必须更新AI规格和Eval记录。
5. 文档与代码冲突时不得静默以代码为准，应先明确哪一方需要修正。
6. 不创建云部署、Kubernetes、云运维、SLA、账号后台、云同步、多人协作、插件市场和平台发布文档。
