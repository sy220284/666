# WorldForge 项目执行统一入口

> 状态：Active  
> 面向：Codex、开发者、审查者、测试人员

## 1. 唯一启动顺序

```text
AGENTS.md
→ docs/PROJECT_EXECUTION_ENTRY.md
→ docs/tasks/ACTIVE_TASK.json
→ docs/tasks/ACTIVE_TASK.md
→ M4-04唯一整体任务卡
→ 任务卡列出的原需求来源与专项真源
→ 现有代码、测试、Migration、IPC和追踪矩阵
```

`ACTIVE_TASK.json`是机器可读真源，`ACTIVE_TASK.md`是生成镜像。

作者最新指令已将V1剩余功能收口为单一任务：`M4-04 WorldForge V1剩余功能整体实施与发布闭环`。原M4-05—M8-03保留为详细需求来源，不再单独激活、建立分支、PR或关闭。

## 2. 当前执行模式

```text
一个活动任务：M4-04
→ 一个正式分支：work/m4-04-v1-integrated-delivery
→ 一个长期Draft PR
→ 先完成全量代码与需求审计
→ 完成整体实施规划
→ 按内部阶段连续实现
→ 每阶段原子提交、代码审计与受影响回归
→ 全部V1功能完成后一次转Ready
→ 六项永久门禁通过后一次受控合并
→ 一次整体Verified关闭
```

内部阶段不属于独立任务，不改变`ACTIVE_TASK`。任何代码、测试、安全、数据边界、Migration或恢复失败立即阻断。

## 3. 权威顺序

```text
作者最新明确指令
> ACTIVE_TASK批准范围与M4-04任务卡
> docs/product/WORLDFORGE_V6.5_FULL_SPEC.md
> 冻结的专项规格、ADR、Schema、契约、UI、安全与P0验收
> docs/decisions/IMPLEMENTATION_DECISIONS.md
> 现有实现
```

发现冲突时必须在M4-04整体规划中记录冲突来源、受影响代码、数据兼容和解决方案，禁止静默选择。

## 4. 已完成基线与剩余交付

### 已完成并冻结

| 范围 | 结果 |
|---|---|
| M0 | 工程、安全、SQLite、IPC、TaskProtocol、测试和AI Spike |
| M1 | 无AI基础写作、保存、Version、文本导入导出和恢复 |
| M2 | Patch、Revision、Hash、LockGuard、Candidate、采用、撤销和结构恢复 |
| M3 | 规划、设定、状态、连续性、StateProposal、快照和React Renderer |
| M4-01 | FTS5公共索引、队列和项目词典 |
| M4-02 | 可追溯P0—P4约束包与裁剪 |
| M4-03 | Provider、凭据、端点安全和连接测试 |

历史任务卡、证据和Migration不回写。扩展由M4-04以追加兼容方式承接。

### M4-04内部阶段

```text
1. 全量基线审计与整体规划
2. AI公共合同、Prompt与GenerationRun
3. 作者体验、T0/T1、改写、融合、审阅与采用
4. 状态提取、确定性校验、AI语义与人物弧光校验
5. 搜索替换、写作统计、DOCX、导出与三轨恢复
6. 向导、统一工作台、主题、无障碍、硬化与发布关闭
```

## 5. 总览入口

| 问题 | 文档 |
|---|---|
| 当前唯一任务与整体规划 | `docs/tasks/M4/M4-04_PROMPT_REGISTRY_OUTPUT.md` |
| 当前授权 | `docs/tasks/ACTIVE_TASK.json`、`docs/tasks/ACTIVE_TASK.md` |
| 独立任务与吸收关系 | `docs/tasks/TASK_INDEX.md` |
| 产品原则与完整边界 | `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md` |
| V1.0范围 | `docs/product/V1_SCOPE_AND_ACCEPTANCE.md` |
| 功能ID | `docs/product/FUNCTION_CATALOG.md` |
| 任务体系变化 | `docs/product/V1_TASK_SYSTEM_REBASE.md` |
| 路线与内部阶段 | `docs/roadmap/V1.0_ROADMAP.md` |
| 需求追踪 | `docs/product/V1.0_TRACEABILITY_MATRIX.md` |
| 数据库 | `docs/database/` |
| IPC和事件 | `docs/contracts/` |
| AI和Eval | `docs/ai/` |
| UI与交互 | `docs/ui/` |
| 安全与隐私 | `SECURITY.md`、`docs/security/` |
| 测试与验收 | `docs/testing/` |
| 实现选择 | `docs/decisions/IMPLEMENTATION_DECISIONS.md` |
| 执行闭环 | `docs/process/CODEX_EXECUTION_PLAYBOOK.md` |
| 自动化与门禁 | `docs/process/DEVELOPMENT_AUTOMATION.md` |

## 6. 标准实施闭环

```text
读取全部被吸收要求和专项真源
→ 审计全量现有代码、测试、Migration和最近提交
→ 填写M4-04整体规划执行附件
→ 冻结共享合同、Migration、IPC、用户路径和测试矩阵
→ 失败测试或稳定复现
→ Contracts / Domain
→ Migration / Repository
→ Core Use Case
→ Main / Preload
→ Renderer可操作闭环
→ 失败、取消、冲突、只读、恢复与重启
→ 受影响自动化与人工验收
→ 横向、纵向独立复查
→ 更新任务卡计划、文档、追踪与统一证据
→ 进入下一内部阶段
```

M4-04最终阶段完成后运行全量矩阵并一次关闭，不自动激活下一任务。

## 7. 强制规则

- 编码前必须完成M4-04整体规划执行附件。
- 不修改已完成任务卡和历史Migration。
- 不建立第二套Prompt、TaskProtocol、Candidate采用、导入协调器、RecoveryService、模式状态或主题状态。
- 每项用户功能必须形成Contracts→Core→Main→Preload→Renderer→测试纵向闭环。
- 未完整接通的功能不得显示可用，不得写入半成品权威数据。
- AI输出不得绕过Candidate或StateProposal进入权威数据。
- Prompt不得替代LockGuard、Revision、Hash、项目和路径边界。
- 无AI写作、保存、Version、导出和恢复始终必须可用。
- 所有声明通过的测试、构建和发布结论必须有真实记录。

## 8. 证据

统一目录：

```text
docs/test-evidence/M4-04/
├─ summary.md
├─ commands.txt
├─ known-risks.md
├─ manifest.json
├─ implementation-plan.md
├─ test-matrix.md
├─ migration-report.md
├─ security-report.md
├─ performance-report.md
└─ release-report.md
```

原被吸收任务不再独立建立Evidence关闭。其目标必须映射到M4-04统一证据、追踪矩阵和P0验收。
