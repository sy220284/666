# M10-10 当前工作空间工具链权威文档治理

> 状态：Implemented  
> 里程碑：M10 稳定性与治理续作  
> 优先级：P1  
> 执行分支：`work`  
> 目标分支：`main`  
> 主线基线：`e71b6b3f58ed4d048fd57ede191687b138da25f9`

## 目标

将当前ChatGPT持久化工作空间中666项目的工具版本、存储位置、激活方式、依赖恢复、调用命令、验证方式和环境边界整理为单一权威文档，并由项目执行入口显式路由。

同时修复文档型Ready PR在Performance工作流成功跳过性能预算后，Controlled Merge仍将其误判为永久未就绪的问题，保证文档治理变更能够按永久门禁闭环。

## 阶段定位

本任务属于仓库治理、开发环境说明与永久门禁一致性修复，不改变产品功能、业务契约、数据库或发布内容。

## 非目标

- 不提交`/mnt/data`中的工具二进制、缓存、`node_modules`或软链接；
- 不修改`package.json`、`pnpm-lock.yaml`或依赖版本；
- 不把当前工作空间绝对路径写入产品运行时或CI硬依赖；
- 不增加云服务、远程存储或新的工具来源；
- 不跳过非文档变更的真实性能预算；
- 不修复与本次文档和Controlled Merge阻断无关的产品代码问题。

## 依赖

- M10-09已通过`task-verification/M10-09=success`；
- 当前main已通过`main-verification=success`；
- 实施开始时`main`与`work`一致。

## 真实承接基线

- 仓库主线：`e71b6b3f58ed4d048fd57ede191687b138da25f9`；
- 最新实现提交：`0c4d347dc9700ef547ab98db51c7b86c2fd8b314`；
- 当前工具资产以`/mnt/data`真实目录、锁定清单和实际命令验证为准；
- 门禁缺陷以PR #318中Performance成功、Controlled Merge持续未就绪的真实运行行为为依据。

## 关联

- 需求：仓库开发环境和工具链治理；
- 功能ID：不适用；
- 验收：PR永久门禁、文档路径与真实工具调用一致，文档型Ready PR能够由Controlled Merge闭环。

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/tasks/TASK_AUTHORIZATION.json`
- `docs/tasks/TASK_INDEX.md`
- `.github/workflows/toolchain-export.yml`
- `.github/workflows/performance.yml`
- `.github/workflows/automerge.yml`
- `scripts/automerge.mjs`
- `package.json`

## 主要影响范围

- `docs/process/CURRENT_WORKSPACE_TOOLCHAIN.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `.github/workflows/performance.yml`
- `docs/tasks/M10/M10-10_CURRENT_WORKSPACE_TOOLCHAIN_AUTHORITY.md`
- `docs/tasks/runtime/M10-10.json`
- `docs/tasks/TASK_INDEX.md`
- `docs/test-evidence/M10-10/`

## 职责、状态所有权与依赖方向

- 仓库锁文件、`package.json`和永久工作流继续拥有工具版本真源；
- 工作空间权威文档只记录当前`/mnt/data`资产及调用路径；
- 激活、恢复和验证脚本属于工作空间操作入口，不进入产品运行时依赖；
- Performance工作流拥有“是否执行真实预算”的路由状态；
- Controlled Merge只消费确定的成功、失败或等待终态，不得把设计内的文档跳过误判为永久等待；
- 版本冲突时始终以仓库配置和锁文件为准。

## 数据库与Migration

不涉及。

## IPC、事件与错误码

不涉及。

## UI闭环

不涉及用户界面。

## 安全、隐私与恢复

- 文档不记录密钥、账号、令牌或私人数据；
- 锁文件不匹配时恢复脚本必须拒绝执行；
- 工具损坏或版本变化时通过受控GitHub Actions重新导出；
- Performance完整路由继续执行真实性能预算与AI协议基线；
- 回退不影响产品数据。

## 性能预算

文档变更不增加运行时开销。Draft或文档型变更的性能预算步骤以明确成功空操作结束；其他变更继续运行真实性能预算，预算阈值不变。

## 实施内容

1. 新增`docs/process/CURRENT_WORKSPACE_TOOLCHAIN.md`；
2. 登记Node、npm、pnpm、Prettier、ESLint、TypeScript、Electron、Vitest、Playwright和esbuild版本；
3. 登记工具链、workspace依赖、锁定清单和脚本的持久化位置；
4. 登记激活、依赖恢复、质量检查、浏览器冒烟和缓存维护命令；
5. 明确Playwright系统Chromium替代路径和Electron无头环境边界；
6. 更新项目执行入口，将工作空间工具任务路由到该文档；
7. 记录锁文件优先、旧快照拒绝和重新导出规则；
8. 修正Performance文档路由，使`Run performance budgets`在不适用时执行明确成功空操作；
9. 保留完整路由的真实性能预算和AI协议基线，不降低门禁质量；
10. 将M10-10登记到任务索引并绑定最终Evidence。

## 自动化测试

- `/mnt/data/verify-project-tools.sh full`
- `/mnt/data/run-666-playwright-chromium-smoke.sh`
- PR Policy
- Task Governance
- Evidence
- Quality
- Security
- Performance
- Controlled Merge
- Main Verification

## 人工验收

- 核对文档中的每个绝对路径真实存在；
- 核对工具版本与仓库`package.json`和工作流一致；
- 核对文档没有将`/mnt/data`提升为产品或CI硬依赖；
- 核对文档型Performance步骤结论为`success`，完整路由仍运行真实预算；
- 核对最终PR只包含本任务允许路径。

## Evidence

保存到：`docs/test-evidence/M10-10/`

## 回滚策略

回退权威清单、执行入口、Performance文档路由修复及M10-10任务治理文件。产品代码、锁文件、数据库和用户数据保持不变。

若回退Performance修复，必须同时提供等价的明确成功终态，禁止恢复会导致Controlled Merge永久等待的`skipped`语义。

## 完成条件

- 权威清单覆盖工具版本、位置、调用、恢复、验证和边界；
- 执行入口已建立唯一链接；
- Runtime、任务索引与Evidence一致；
- 文档型Performance步骤以成功终态完成，完整路由继续执行真实预算；
- Ready Evidence绑定实现提交`0c4d347dc9700ef547ab98db51c7b86c2fd8b314`；
- PR永久门禁通过，Controlled Merge完成；
- 合并后Main Verification与`task-verification/M10-10`成功；
- `work`受控同步到最新`main`。
