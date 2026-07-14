# WorldForge 项目执行统一入口

> 状态：Frozen  
> 面向：Codex、开发者、审查者、测试人员  
> 目的：明确开始工作时先看什么、根据任务类型查什么、按照什么顺序实施和验收。

## 1. 唯一启动顺序

任何编码、重构、修复、测试或文档任务开始前，必须按以下顺序读取：

```text
1. /AGENTS.md
2. /docs/PROJECT_EXECUTION_ENTRY.md
3. /docs/tasks/ACTIVE_TASK.md
4. ACTIVE_TASK 指向的任务来源与专项规格
5. 现有代码、测试、Migration、IPC契约和追踪矩阵
```

如果 `ACTIVE_TASK.md` 显示“无活动任务”，不得自行选择下一个任务开始编码。可以分析、制定候选计划，但必须等待作者明确激活任务。

`agent.md` 是便于人工查看的入口别名；Codex 的仓库级权威指令仍是 `AGENTS.md`。

## 2. 文档权威层级

唯一权威声明见 `docs/INDEX.md` §1，本文件不重复定义，避免两处顺序漂移。

发现冲突时：

1. 不自行选一份文档覆盖另一份。
2. 列出冲突文件、冲突内容和影响范围。
3. 停止相关写入。
4. 请求确认，或在任务明确授权的情况下同步修正文档和实现。

## 3. 总览文档

| 需要理解的内容 | 首选文档 |
|---|---|
| 产品定位、V1.0边界、完整功能与架构 | `docs/product/WORLDFORGE_V6.5_EXECUTABLE_SPEC.md` |
| 全部文档位置 | `docs/INDEX.md` |
| 项目架构与模块职责 | `docs/architecture/ARCHITECTURE.md`、`MODULE_BOUNDARIES.md` |
| 全功能清单 | `docs/product/FUNCTION_CATALOG.md` |
| 需求到任务和验收的关系 | `docs/product/V1.0_TRACEABILITY_MATRIX.md` |
| 里程碑顺序 | `docs/roadmap/V1.0_ROADMAP.md`、`docs/tasks/TASK_INDEX.md` |
| Codex全过程执行方法 | `WorldForge_Codex_全流程技术开发指南.md` |

## 4. 按任务类型查询文档

### 4.1 工程初始化、包结构、依赖

必须读：

- `AGENTS.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/architecture/MODULE_BOUNDARIES.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/tasks/M0_TASKS.md`
- `docs/testing/TEST_STRATEGY.md`

同时检查：根目录配置、锁文件、现有CI、包依赖方向。

### 4.2 Electron Main、Preload、IPC和窗口

必须读：

- `docs/architecture/ARCHITECTURE.md`
- `docs/contracts/IPC_CONTRACTS.md`
- `docs/contracts/EVENT_PROTOCOL.md`
- `docs/contracts/ERROR_CODES.md`
- `SECURITY.md`
- `docs/security/THREAT_MODEL.md`
- `docs/ui/RESPONSIVE_AND_DPI.md`

### 4.3 SQLite、Repository、Migration和数据模型

必须读：

- `docs/database/DATABASE_SCHEMA.md`
- `docs/database/DATA_DICTIONARY.md`
- `docs/database/MIGRATION_POLICY.md`
- `docs/database/SCHEMA_COMPATIBILITY.md`
- `docs/decisions/ADR-002-sqlite-source-of-truth.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/testing/SECURITY_TEST_CASES.md`

### 4.4 编辑器、Block Patch、Revision、锁定

必须读：

- `docs/ui/EDITOR_INTERACTION_SPEC.md`
- `docs/decisions/ADR-003-draft-candidate-version.md`
- `docs/decisions/ADR-005-lock-revision-backup.md`
- `docs/contracts/IPC_CONTRACTS.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/testing/P0_ACCEPTANCE_MATRIX.md`

### 4.5 Candidate、Version、Diff、冲突和采用

必须读：

- `docs/ui/CANDIDATE_REVIEW_SPEC.md`
- `docs/decisions/ADR-003-draft-candidate-version.md`
- `docs/decisions/ADR-004-ai-cannot-overwrite-draft.md`
- `docs/contracts/IPC_CONTRACTS.md`
- `docs/contracts/ERROR_CODES.md`
- `docs/testing/PERFORMANCE_BUDGETS.md`

### 4.6 人物、设定、状态、时间线、知情和伏笔

必须读：

- `docs/product/FUNCTION_CATALOG.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/database/DATA_DICTIONARY.md`
- `docs/architecture/DATA_FLOW.md`
- `docs/tasks/M2_TASKS.md`

### 4.7 AI Provider、约束包、Prompt、T0/T1和状态提取

必须读：

- `docs/ai/LOCAL_AI_SERVICE_SPEC.md`
- `docs/ai/PROVIDER_PROTOCOL.md`
- `docs/ai/PROMPT_AND_EVAL_SPEC.md`
- `docs/contracts/EVENT_PROTOCOL.md`
- `docs/decisions/ADR-004-ai-cannot-overwrite-draft.md`
- `docs/security/PRIVACY_AND_LOGGING.md`
- `docs/tasks/M3_TASKS.md`

### 4.8 UI、页面、主题、高分屏和无障碍

必须读：

- `docs/ui/README.md`
- `docs/ui/UI_SYSTEM.md`
- `docs/ui/INFORMATION_ARCHITECTURE.md`
- `docs/ui/SCREEN_SPECIFICATIONS.md`
- 对应专项交互文档
- `docs/ui/VISUAL_REFERENCE_BASELINE.md`
- `docs/ui/RESPONSIVE_AND_DPI.md`
- `docs/ui/ACCESSIBILITY.md`
- `docs/ui/UI_ACCEPTANCE_CHECKLIST.md`

### 4.9 搜索、校验、导入导出、备份恢复

按功能分别读取：

- 搜索与校验：`FUNCTION_CATALOG.md`、`DATABASE_SCHEMA.md`、`TEST_STRATEGY.md`
- 导入导出：`THREAT_MODEL.md`、`ERROR_CODES.md`、`M4_TASKS.md`
- 备份恢复：ADR-005、`DATABASE_SCHEMA.md`、`SECURITY_TEST_CASES.md`

### 4.10 测试、验收和发布

必须读：

- `docs/testing/TEST_STRATEGY.md`
- `docs/testing/P0_ACCEPTANCE_MATRIX.md`
- `docs/testing/PERFORMANCE_BUDGETS.md`
- `docs/testing/SECURITY_TEST_CASES.md`
- `docs/product/V1.0_TRACEABILITY_MATRIX.md`
- `docs/tasks/M5_TASKS.md`

## 5. 标准执行流程

```text
确认活动任务
→ 读取任务所需文档
→ 检查现有代码与测试
→ 输出实施计划
→ 先补失败测试或稳定复现
→ 实现最小完整闭环
→ 运行专项与通用检查
→ 人工复查成功/失败/取消/冲突路径
→ 更新文档、ACTIVE_TASK和追踪矩阵
→ 保存证据
→ 提交完成报告
```

### 5.1 开始前必须输出

- 任务ID。
- 目标与非目标。
- 允许修改的模块和文件。
- 数据库、IPC、Prompt、UI和安全影响。
- 风险与未决问题。
- 预计运行的测试命令。

### 5.2 实施中必须遵守

- 不跨活动任务范围顺手重构。
- 不新增生产依赖，除非任务明确批准。
- 不以Mock、TODO、空函数和固定成功返回冒充实现。
- 不以Prompt代替锁定、Revision、路径和项目边界校验。
- 不让AI输出绕过Candidate进入Draft。
- 不修改已发布Migration。
- 不在Renderer访问Node、数据库、文件或凭据。

### 5.3 完成前必须检查

- 成功路径。
- 输入错误。
- 目标不存在。
- 取消。
- Revision与Hash冲突。
- 锁定冲突。
- 项目与路径越界。
- 数据库或网络失败。
- 应用关闭与重启。
- UI空状态、加载、失败和只读状态。

## 6. 文档同步规则

| 变更 | 必须同步 |
|---|---|
| 功能范围 | `FUNCTION_CATALOG`、V1范围、追踪矩阵、任务卡 |
| 数据表或字段 | Schema、数据字典、Migration、兼容策略、测试 |
| IPC或事件 | IPC契约、错误码、事件协议、Preload和测试 |
| Prompt或输出Schema | Prompt/Eval规格、registry、契约和Eval基线 |
| UI页面或交互 | UI专项文档、验收清单和截图基线 |
| 安全边界 | SECURITY、威胁模型、安全测试、AGENTS |
| 性能目标 | 性能预算、任务卡和性能证据 |

代码和文档不得长期处于互相矛盾的状态。

## 7. 任务状态与证据

任务状态：

```text
Planned → In Progress → Implemented → Verified
Blocked / Deferred / Removed
```

- `Implemented`：功能真实接通，成功和主要失败路径已实现。
- `Verified`：任务验收、自动化测试、手动检查和证据完成。
- 测试未运行或结果未知时不得标记`Verified`。

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

## 8. 必须停止并报告的情况

- `ACTIVE_TASK.md`没有活动任务。
- 设计文档互相冲突。
- 需要新增生产依赖但未批准。
- 需要修改冻结架构或产品范围。
- Migration或数据恢复存在不可逆风险。
- 测试证明当前方案无法达到硬保证。
- 需要接入云端、向量数据库、运行时管理或其他V1.0排除项。
- 无法读取必要文件或无法运行任务要求的验证命令。

## 9. 当前下一步

仓库当前仍处于文档与规格完成阶段。代码开发开始前，应由作者将 `docs/tasks/ACTIVE_TASK.md` 激活为 `M0-01 Monorepo与质量工具`，随后Codex只执行该任务。
