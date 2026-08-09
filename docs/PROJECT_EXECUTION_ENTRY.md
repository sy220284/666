# WorldForge 项目执行统一入口

> 状态：Active  
> 面向：Codex、开发者、审查者、测试人员

## 1. 固定启动顺序

```text
AGENTS.md
→ docs/PROJECT_EXECUTION_ENTRY.md
→ docs/tasks/TASK_AUTHORIZATION.json
→ docs/tasks/TASK_INDEX.md
→ 解析当前有效任务状态
→ 当前任务Runtime与任务卡
→ 专项真源、现有代码、测试、Migration、IPC与Evidence
```

`TASK_AUTHORIZATION.json`只定义唯一`work`分支、单一work PR与main串行写入等仓库形态；它不承担任务预授权。`docs/tasks/runtime/`保存任务静态声明、边界、验证命令和合并后状态绑定。`ACTIVE_TASK.json/.md`和旧`taskctl`已经退役，任何流程不得重新读取或生成。

代码格式、结构与维护性治理必须同步读取 [`architecture/CODE_QUALITY_GOVERNANCE.md`](architecture/CODE_QUALITY_GOVERNANCE.md)。文件行数只作为观察指标，不参与合并资格；结构判断统一依据职责内聚、依赖方向、状态所有权、事务边界和公共接口。

在当前ChatGPT持久化工作空间中执行工具安装、离线恢复、格式化、Lint、TypeScript、Vitest、Playwright、Electron或全仓验证时，必须同步读取 [`process/CURRENT_WORKSPACE_TOOLCHAIN.md`](process/CURRENT_WORKSPACE_TOOLCHAIN.md)和机器清单 [`process/CURRENT_WORKSPACE_TOOLCHAIN.json`](process/CURRENT_WORKSPACE_TOOLCHAIN.json)。它们只约束`/mnt/data`工作空间资产和永久工具导出入口，不替代仓库锁文件。

## 2. 动态状态解析

本文件不固化活动PR、瞬时任务状态或“最新提交SHA”。每次工作开始时必须从真实仓库状态解析：

```text
读取main与work Ref
→ 查询开放的work → main PR
→ 有开放PR且存在worldforge-task marker：读取对应Schema 2 Runtime
→ 无任务marker：按维护PR处理，不伪造任务ID
→ 无开放PR：读取main Commit Status
→ 用effective-task-status计算任务有效状态
→ 核对main-verification
→ 核对main与work是否identical
→ 核对远端是否只剩main/work
```

Schema 2状态语义：

```text
Runtime IN_PROGRESS
→ IN_PROGRESS

Runtime IMPLEMENTED
+ task-verification/<TASK-ID>未成功
→ VERIFICATION_PENDING

Runtime IMPLEMENTED
+ task-verification/<TASK-ID>=success
→ VERIFIED
```

Schema 2 的`TASK_INDEX.md`状态只做镜像，不能单方面把任务抬成Verified。冻结Schema 1历史Runtime保持既有静态Verified兼容。任务依赖、Evidence全量扫描和下一任务启动必须调用统一Effective Status。

Release不读取任务Runtime作为产品发布权威，统一由`release-acceptance.mjs`校验当前main、产品门禁、产物完整性与发行信任证据。

## 3. 合并资格与最新验证轮次

Ready PR不得只按Commit SHA上残留的Context判断合并资格。同一Head可以先经历Draft诊断、`full-validation-draft`完整诊断，再转Ready；因此Controlled Merge必须读取当前Head最新的Quality、Security、Performance Workflow Run。

Ready合并需要同时满足：

```text
pr-policy=success
+ quality / quality=success
+ quality / release-audit=success
+ security=success
+ performance=success
+ 最新Quality Workflow Run=success
+ 最新Security Workflow Run=success
+ 最新Performance Workflow Run=success
```

最新Quality Run还必须包含并通过`quality / quality`、`quality / release-audit`和`quality / package-smoke`。旧Draft成功结果不得被Ready同SHA复用。

## 4. 仓库闭环条件

一项Schema 2任务只有在以下条件全部成立时才完成仓库闭环：

```text
来源PR Ready最新验证轮次成功
+ Ready Evidence绑定最新实现提交
+ implementationCommit之后仅存在当前任务收口文件
+ Controlled Merge完成
+ main-verification=success
+ task-verification/<TASK-ID>=success
+ 无新的开放work → main PR
+ work受控重置后与main完全一致
+ 远端只保留main/work
```

任一条件缺失：

- 不得启动下一任务；
- 不得把包含该任务实现但尚未进入并验证于main的提交作为Release来源；
- 不得把“PR已合并”表述为仓库已闭环；
- 自动同步失败时允许按相同CAS条件执行手动恢复，但必须复核`main == work`。

## 5. Main Verification与任务事实

Main Verification属于合并后的事实验证，不属于PR预授权。

如果来源PR正文含：

```text
<!-- worldforge-task: M10-22 -->
```

则最终main必须读取对应Schema 2 Runtime并验证：

- `status`为`IMPLEMENTED`；
- `executionBranch`为`work`；
- `verificationBinding.sourcePr`等于真实来源PR；
- `mainContext`为`main-verification`；
- `taskContext`为`task-verification/<TASK-ID>`。

成功后发布`main-verification`与任务Context。非任务维护PR可不带marker，此时只发布`main-verification`。

## 6. 稳定历史基线

以下SHA只表示历史审计或任务启动点，不表示当前仓库Head：

- M10-02全量审计矩阵：`ca83d48c7493bba21252a37f9aec024d6aa0ca79`。
- M10-03启动基线：`bb415f3da773160928efda20b877083b321601a0`。
- M10-04启动基线：`8f54dc4e5ed46d6ffca999fda29887f2302b1030`。
- M10-05启动基线：`f6197ed9b3c6c01ddabd5d42f6703c289b41cbc7`。
- M10-07合并主线：`21625e1e11e7c50071f0860d791e902637f0531f`。

当前Head必须从Git Ref读取，禁止从上述历史记录推断。

## 7. 当前治理边界

- 新建及活动Runtime必须使用Schema 2和`executionBranch: "work"`。
- 已Verified历史Schema 1 Runtime保持冻结，只用于历史读取。
- `.github/governance/effective-task-status.mjs`是任务有效状态与提交Context判定的策略核心。
- Draft Evidence校验文件完整性、Hash和来源提交；Ready Evidence必须绑定当前任务最新实现提交。
- Ready Head中`implementationCommit`之后只允许当前任务卡、当前Runtime、`TASK_INDEX.md`和当前任务Evidence目录；产品代码、测试、脚本、配置、工作流或跨任务Evidence后移必须阻断。
- Evidence manifest不预写未来Squash SHA；Evidence由`quality / release-audit`参与合并门禁，最终任务Verified由Main Verification提交状态证明。
- Release资格必须读取当前main提交的`main-verification`、产品门禁、三平台产物完整性和发行信任证据；Task Runtime只保留任务管理与历史审计职责。
- Branch Hygiene只保护`main`与`work`，不允许`release/*`或其他额外分支例外。
- Work Synchronization完成写入后必须复读work Ref并断言与已验证main一致。
- SQLite逐级Migration、未来Schema只读打开、Provider适配和协议版本门禁继续保留。
- Toolchain Export保持只读检出和Artifact-only；允许人工`workflow_dispatch`，也允许现有Quality工作流在同仓库`work → main` PR命中机器清单声明的工具链路径时通过`workflow_call`调用。禁止向正式分支提交工具链或二进制分片。

## 8. 产品与架构不变量

- AI输出先进入建议稿，作者明确采用后才能进入当前稿。
- `project.sqlite`是作品唯一权威真源。
- Renderer不得获得Node、文件系统、SQLite、环境变量或凭据能力。
- 数据、索引、日志、备份和配置只保存在本地。
- 未通过真实命令和永久门禁，不得声明验证成功。

## 9. 代码质量与结构规则

- Prettier必须覆盖TS、TSX、测试、CSS和配置文件，禁止因Glob遗漏形成假绿。
- Renderer的TS与TSX必须进入真实Coverage分母。
- ESLint关键规则写入配置，不得只通过命令行临时注入。
- CSS与SQL使用高置信静态检查，不能替代运行测试和Migration测试。
- 循环依赖、反向依赖、Feature私有穿透、深层导入绕过公共入口和多写入真源继续阻断。
- 文件行数、导出数量和依赖数量只报告、不阻断；不得为了缩短文件机械拆散完整功能。

## 10. 当前ChatGPT工作空间工具链

`docs/process/CURRENT_WORKSPACE_TOOLCHAIN.md`是当前ChatGPT持久化工作空间内666工具资产、绝对存储位置、激活命令、依赖恢复、浏览器替代路径、验证命令和更新规则的专项权威文档；`docs/process/CURRENT_WORKSPACE_TOOLCHAIN.json`是工具Profile与永久工作流关联的机器真源。

固定入口：

```bash
source /mnt/data/activate-666-tools.sh
/mnt/data/restore-666-workspace-dependencies.sh /path/to/666
/mnt/data/verify-project-tools.sh full
```

使用前必须确认目标仓库`pnpm-lock.yaml`与离线依赖快照一致。锁文件不匹配时重新通过GitHub Actions导出，禁止强制挂载旧依赖或修改锁文件迎合缓存。
