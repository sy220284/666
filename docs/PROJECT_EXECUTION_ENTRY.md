# WorldForge 项目执行统一入口

> 状态：Frozen  
> 面向：Codex、开发者、审查者、测试人员  
> 目的：明确开始工作时先看什么、根据任务类型查什么、按照什么顺序实施和验收。

## 1. 唯一启动顺序

任何编码、重构、修复、测试或工程文档任务开始前，必须按以下顺序读取：

```text
1. /AGENTS.md
2. /docs/PROJECT_EXECUTION_ENTRY.md
3. /docs/tasks/ACTIVE_TASK.md
4. ACTIVE_TASK指向的一任务一文件任务卡
5. 任务卡列出的专项规格
6. 现有代码、测试、Migration、IPC契约和追踪矩阵
```

`ACTIVE_TASK.md`显示`NO_ACTIVE_CODING_TASK`时，不得自行选择下一个任务编码。可以分析、复查、补充文档和制定候选计划，但必须等待作者激活任务。

`agent.md`供人工和通用代理快速查看；Codex仓库级权威指令仍是`AGENTS.md`。

## 2. 文档权威层级

```text
作者最新明确指令
> ACTIVE_TASK中已批准的范围与验收
> docs/product/WORLDFORGE_V6.5_FULL_SPEC.md
> 专项冻结规格、ADR、Schema、IPC、UI、安全与P0验收
> docs/decisions/IMPLEMENTATION_DECISIONS.md
> AGENTS.md、闭环执行手册与长篇开发指南
> 现有实现
```

发现冲突时：

1. 不自行选择一份覆盖另一份。
2. 列出冲突文件、内容和影响范围。
3. 停止相关写入。
4. 请求确认，或在任务明确授权下同步修正文档和实现。

## 3. 总览入口

| 需要理解的内容 | 首选文档 |
|---|---|
| 产品定位、V1.0边界、完整功能与架构 | `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md` |
| 全部文档位置 | `docs/INDEX.md` |
| 当前允许执行的任务 | `docs/tasks/ACTIVE_TASK.md` |
| 全任务顺序和独立任务卡 | `docs/tasks/TASK_INDEX.md` |
| 项目架构与模块职责 | `docs/architecture/ARCHITECTURE.md`、`MODULE_BOUNDARIES.md` |
| 全功能清单 | `docs/product/FUNCTION_CATALOG.md` |
| 需求到任务和验收 | `docs/product/V1.0_TRACEABILITY_MATRIX.md` |
| 固定技术选型 | `docs/decisions/IMPLEMENTATION_DECISIONS.md` |
| 完整闭环工作方法 | `docs/process/CODEX_EXECUTION_PLAYBOOK.md` |
| 长篇技术开发参考 | `WorldForge_Codex_全流程技术开发指南.md` |

## 4. 按任务类型查询文档

### 4.1 工程初始化、包结构和依赖

必须读：

- `docs/tasks/M0/M0-01_MONOREPO_FOUNDATION.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/MODULE_BOUNDARIES.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/testing/TEST_STRATEGY.md`

同时检查根目录配置、锁文件、CI和包依赖方向。

### 4.2 Electron Main、Preload、IPC和窗口

必须读：

- 对应M0独立任务卡。
- `docs/architecture/ARCHITECTURE.md`
- `docs/contracts/IPC_CONTRACTS.md`
- `docs/contracts/EVENT_PROTOCOL.md`
- `docs/contracts/ERROR_CODES.md`
- `SECURITY.md`
- `docs/security/THREAT_MODEL.md`
- `docs/ui/RESPONSIVE_AND_DPI.md`

### 4.3 SQLite、Repository、Migration和数据模型

必须读：

- 对应独立任务卡。
- `docs/database/DATABASE_SCHEMA.md`
- `docs/database/DATA_DICTIONARY.md`
- `docs/database/MIGRATION_POLICY.md`
- `docs/database/SCHEMA_COMPATIBILITY.md`
- `docs/decisions/ADR-002-sqlite-source-of-truth.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/testing/SECURITY_TEST_CASES.md`

### 4.4 编辑器、Block Patch、Revision和锁定

必须读：

- `docs/tasks/M1/M1-02_DRAFT_EDITOR.md`
- `docs/tasks/M1/M1-03_LOCK_REVISION.md`
- `docs/ui/EDITOR_INTERACTION_SPEC.md`
- `docs/decisions/ADR-003-draft-candidate-version.md`
- `docs/decisions/ADR-005-lock-revision-backup.md`
- `docs/contracts/IPC_CONTRACTS.md`
- `docs/database/DATABASE_SCHEMA.md`

### 4.5 Candidate、Version、Diff、冲突和采用

必须读：

- `docs/tasks/M1/M1-04_CANDIDATE_VERSION.md`
- `docs/tasks/M3/M3-04_CANDIDATE_REVIEW.md`
- `docs/ui/CANDIDATE_REVIEW_SPEC.md`
- `docs/decisions/ADR-003-draft-candidate-version.md`
- `docs/decisions/ADR-004-ai-cannot-overwrite-draft.md`
- `docs/contracts/IPC_CONTRACTS.md`
- `docs/contracts/ERROR_CODES.md`
- `docs/testing/PERFORMANCE_BUDGETS.md`

### 4.6 人物、设定、状态、时间线、知情和伏笔

必须读：

- 对应`docs/tasks/M2/`独立任务卡。
- `docs/product/FUNCTION_CATALOG.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/database/DATA_DICTIONARY.md`
- `docs/architecture/DATA_FLOW.md`

### 4.7 AI Provider、约束包、Prompt、T0/T1和状态提取

必须读：

- 对应`docs/tasks/M3/`独立任务卡。
- `docs/ai/LOCAL_AI_SERVICE_SPEC.md`
- `docs/ai/PROVIDER_PROTOCOL.md`
- `docs/ai/PROMPT_AND_EVAL_SPEC.md`
- `docs/contracts/EVENT_PROTOCOL.md`
- `docs/decisions/ADR-004-ai-cannot-overwrite-draft.md`
- `docs/security/PRIVACY_AND_LOGGING.md`

### 4.8 UI、页面、主题、高分屏和无障碍

必须读：

- `docs/tasks/M4/M4-05_COMPLETE_UI.md`
- `docs/ui/README.md`
- `docs/ui/UI_SYSTEM.md`
- `docs/ui/INFORMATION_ARCHITECTURE.md`
- `docs/ui/SCREEN_SPECIFICATIONS.md`
- 对应专项交互文档。
- `docs/ui/VISUAL_REFERENCE_BASELINE.md`
- `docs/ui/RESPONSIVE_AND_DPI.md`
- `docs/ui/ACCESSIBILITY.md`
- `docs/ui/UI_ACCEPTANCE_CHECKLIST.md`

### 4.9 搜索、校验、导入导出和备份恢复

- 校验：`docs/tasks/M4/M4-01_VALIDATION_REVISION.md`。
- 搜索替换：`docs/tasks/M4/M4-02_SEARCH_DICTIONARY.md`。
- 导入导出：`docs/tasks/M4/M4-03_IMPORT_EXPORT.md`、威胁模型和错误码。
- 备份恢复：`docs/tasks/M4/M4-04_BACKUP_RECOVERY.md`、ADR-005和安全测试。

### 4.10 测试、验收和发布

必须读：

- 对应`docs/tasks/M5/`独立任务卡。
- `docs/testing/TEST_STRATEGY.md`
- `docs/testing/P0_ACCEPTANCE_MATRIX.md`
- `docs/testing/PERFORMANCE_BUDGETS.md`
- `docs/testing/SECURITY_TEST_CASES.md`
- `docs/product/V1.0_TRACEABILITY_MATRIX.md`

## 5. 标准执行流程

```text
确认活动任务
→ 读取独立任务卡和专项文档
→ 检查现有代码与测试
→ 输出实施计划
→ 建立失败测试或稳定复现
→ 实现最小完整闭环
→ 覆盖失败、取消、冲突、只读和恢复
→ 运行专项与通用检查
→ 人工业务验收
→ 独立复查
→ 更新文档、任务状态和追踪矩阵
→ 保存证据
→ 提交完成报告
→ 将ACTIVE_TASK恢复为无活动任务
```

详细操作以`docs/process/CODEX_EXECUTION_PLAYBOOK.md`为准。

## 6. 开始前必须输出

- 任务ID。
- 目标与非目标。
- 允许与禁止修改路径。
- 影响模块和入口。
- 数据库、IPC、Prompt、UI、安全和性能影响。
- 风险与未决问题。
- 实施步骤。
- 预计运行命令。

## 7. 实施中必须遵守

- 不跨活动任务范围重构。
- 不新增未批准生产依赖。
- 不以Mock、TODO、空函数和固定成功返回冒充完成。
- 不以Prompt代替锁定、Revision、路径和项目边界。
- 不让AI输出绕过Candidate进入Draft。
- 不修改已发布Migration。
- 不在Renderer访问Node、数据库、文件或凭据。
- 不在任务关闭后自动开始下一任务。

## 8. 完成前必须检查

- 成功路径。
- 输入错误与目标不存在。
- 取消、超时和中断。
- Revision与Hash冲突。
- 锁定冲突。
- 项目与路径越界。
- 数据库、文件或网络失败。
- 应用关闭与重启。
- UI空、加载、失败、冲突、只读和恢复状态。

## 9. 文档同步规则

| 变更 | 必须同步 |
|---|---|
| 功能范围 | 功能清单、V1范围、追踪矩阵、任务卡 |
| 数据表或字段 | Schema、数据字典、Migration、兼容策略、测试 |
| IPC或事件 | IPC契约、错误码、事件协议、Preload和测试 |
| Prompt或输出Schema | Prompt/Eval规格、registry、契约和Eval基线 |
| UI页面或交互 | UI专项文档、验收清单和截图基线 |
| 安全边界 | SECURITY、威胁模型、安全测试、AGENTS |
| 性能目标 | 性能预算、任务卡和性能证据 |

## 10. 状态与证据

```text
Planned → In Progress → Implemented → Verified
Blocked / Deferred / Removed
```

- `Implemented`：功能真实接通，主要失败路径已实现。
- `Verified`：自动化测试、手动验收和证据完成。

证据目录：

```text
docs/test-evidence/<TASK-ID>/
├── summary.md
├── commands.txt
├── test-results/
├── screenshots/
├── performance.json
└── known-risks.md
```

## 11. 必须停止并报告

- 没有活动任务。
- 设计文档冲突。
- 需要未批准生产依赖。
- 需要修改冻结架构或范围。
- Migration或恢复存在不可逆风险。
- 测试证明硬保证无法达到。
- 工作会引入V1.0排除项。
- 必要文件或验证工具不可用。

## 12. 当前下一步

仓库仍处于文档与规格完成阶段。开始代码开发前，由作者将`ACTIVE_TASK.md`激活为`M0-01`，其唯一任务卡为：

`docs/tasks/M0/M0-01_MONOREPO_FOUNDATION.md`
