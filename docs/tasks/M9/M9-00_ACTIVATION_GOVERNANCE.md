# M9-00 WorldForge V1.1激活治理与权威文档同步

> 状态：Implemented
> 里程碑：M9 V1.1架构治理  
> 优先级：P0  
> 正式分支：`policy/m9-activation-sync`

## 1. 目标

修复M9机器Runtime与仓库权威文档之间的状态漂移，正式登记M9-00—M9-14的依赖和当前状态，使已经完成的M9-01、正在实施的M9-02及后续工作包拥有一致、可执行、可审计的授权入口。

## 2. 基线冲突

- `main`已经包含M9-01 Verified任务卡和Runtime，M9-02也已建立In Progress Runtime。
- `AGENTS.md`仍只允许活动任务指向M0—M8。
- `PROJECT_EXECUTION_ENTRY.md`和`TASK_INDEX.md`仍停留在M8-09实施阶段。
- M9 README和冻结方案仍写着“未激活、禁止生产代码”。

上述状态互相冲突；本任务只同步治理真源，不修改产品代码或历史Evidence。

## 3. 必须实施

1. 将活动任务路径扩展到M9。
2. 将执行入口切换为`parallel-pr`Runtime模型，同时保留M8-09为V1.0兼容锚点。
3. 在任务索引登记M9-00—M9-14、依赖和真实状态。
4. 将M9 README、治理方案和工作包状态同步为已激活。
5. 保持AR-03—AR-14为Planned；建立独立任务卡和Runtime前不得修改对应生产代码。

## 4. 允许修改范围

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/tasks/`

## 5. 禁止范围

- `apps/`
- `packages/`
- `migrations/`
- `.github/`
- `scripts/`
- `tests/`
- 历史Evidence目录

## 6. 不变量

- 不改变产品功能、UI、数据、Schema、Migration、IPC、错误码或发布实现。
- 不改写M8-09及更早任务卡和Evidence。
- 不解除main串行写入、Ready永久门禁或Main Verification要求。
- 不绕过工作包依赖，不一次激活全部后续生产代码任务。

## 7. 验证矩阵

```text
pnpm task:validate
pnpm check:language
pnpm format:check
pnpm lint
```

## 8. 基线偏差

主线`pnpm release:check`因Release工作流与发布工具的`package_smoke`静态期望不一致而失败。该缺陷不由本纯文档治理任务重复修改；修复、单测和成功证据统一由M9-02 PR #265承接。M9-00永久门禁不得出现其他失败。

## 9. 完成条件

- 权威入口、任务索引、M9目录与Runtime状态一致。
- M9-01显示Verified，M9-02显示In Progress，M9-03—M9-14显示Planned。
- 独立PR永久门禁成功。
- 受控合并和main验证成功后，M9-00关闭为Verified。

## 10. 实施结果

- 实施提交：`d37db39f7d18a4160b99a6bec94a1b31b291ccdd`。
- `AGENTS.md`、执行入口、任务索引、M9 README、治理方案和工作包状态已同步。
- `AGENTS.md`已区分`parallel-pr`任务Runtime与`ACTIVE_TASK`兼容锚点，明确任务可并行、main写入与关闭串行。
- M8-09保留为V1.0验证锚点，`verificationHold`切换为非最终状态并指向M9-00 Runtime。
- M9-01登记为Verified，M9-02登记为In Progress，M9-03—M9-14按冻结依赖登记为Planned。
- 任务校验、正式中文名称检查、格式检查和Lint均成功。
