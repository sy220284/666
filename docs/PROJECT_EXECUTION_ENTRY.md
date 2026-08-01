# WorldForge 项目执行统一入口

> 状态：M9 V1.1 架构治理 Active
> 面向：Codex、开发者、审查者、测试人员

## 1. 启动顺序

```text
AGENTS.md
→ docs/PROJECT_EXECUTION_ENTRY.md
→ docs/tasks/TASK_AUTHORIZATION.json
→ docs/tasks/ACTIVE_TASK.json（V1.0终态兼容锚点）
→ docs/tasks/TASK_INDEX.md
→ 当前任务Runtime与独立任务卡
→ 任务卡列出的专项真源、现有代码、测试、Migration、IPC与Evidence
```

`TASK_AUTHORIZATION.json`定义并行任务PR与main串行写入规则；`docs/tasks/runtime/`是M9活动任务机器真源。`ACTIVE_TASK.json`继续保存M8-09的V1.0 `VERIFIED_HOLD`，不再承担M9并行任务状态。

## 2. 当前基线

M8-09已经完成V1.0稳定性与生命周期治理并建立Verified锚点。M9在不改变产品行为、持久化格式、IPC协议、错误码和发布边界的前提下执行V1.1架构拆分：

```text
M8-09 Verified
→ M9-01 / AR-01 重构安全网（Verified）
→ M9-02 / AR-02 Shared Structure（In Progress）
→ M9-03—M9-14 按冻结依赖逐包激活
```

## 3. 当前执行模式

```text
授权模式：parallel-pr
基线分支：main
main写入：serialized
直接main提交：禁止
任务状态：docs/tasks/runtime/<TASK_ID>.json
PR绑定：<!-- worldforge-task: Mx-yy -->
```

互不重叠的任务可同时开放PR；每个PR只绑定一个任务和一个受检Head。main合并、Main Verification及Verified关闭必须串行完成。

## 4. 权威顺序

```text
作者最新明确指令
> TASK_AUTHORIZATION、任务Runtime与TASK_INDEX
> 当前独立任务卡
> docs/product/WORLDFORGE_V6.5_FULL_SPEC.md
> 冻结专项规格、ADR、Schema、契约、UI、安全与P0验收
> docs/decisions/IMPLEMENTATION_DECISIONS.md
> 现有实现
```

发现冲突时必须记录冲突来源、数据兼容、影响范围和解决方案，禁止静默选择。

## 5. M9治理边界

- M9只做保持行为的架构拆分，不新增产品功能。
- 不修改历史Migration；重构PR不新增数据库Schema。
- IPC Channel字符串、`PROTOCOL_VERSION`、正式错误码和公开Bridge方法保持不变。
- AI输出继续先进入建议稿，设定更新建议继续由作者裁决，`project.sqlite`继续是作品唯一权威真源。
- Renderer不得获得Node、文件系统、SQLite、环境变量或凭据能力。
- 每个AR工作包独立任务、独立PR、独立回退；禁止跨包混改。
- AR-04、AR-10、AR-12和AR-13是高风险包，合并前必须保存独立回退说明。
- AR-14只做Legacy、CSS和预算收敛，不承载前序未完成的核心拆分。

M9方案入口：[`docs/tasks/M9/README.md`](tasks/M9/README.md)。

## 6. 标准实施闭环

```text
读取任务卡、Runtime、冻结工作包与现有实现
→ 核对依赖、允许路径、行为不变量和结构预算
→ 建立行为测试或稳定复现
→ 最小完整职责拆分
→ 专项回归与全量质量矩阵
→ 更新任务卡和Runtime为Implemented
→ Draft转Ready
→ 六项永久门禁全部成功
→ 使用expected_head_sha受控合并
→ 等待main-verification成功
→ 独立治理关闭为Verified
```

## 7. 强制规则

- 不修改已Verified任务卡、历史Migration和历史Evidence Manifest。
- 不建立第二套Prompt、任务协议、建议稿采用、导入、恢复、模式、主题或搜索数据真源。
- 未接通能力不得显示可用，不得写入半成品权威数据。
- 无AI写作、保存、历史版本、导出和恢复始终必须可用。
- 测试、构建、发布和平台结论必须来自真实运行。
- PR Head检查成功不等于main验证成功；合并后必须复核最终main SHA及`main-verification`。
