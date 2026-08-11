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

`TASK_AUTHORIZATION.json`定义固定`main/work/governance`三分支、产品`work → main`与治理`governance → main`两条集成lane、每条lane最多一个开放PR以及main串行写入规则；它不承担任务预授权。`docs/tasks/runtime/`保存任务静态声明、边界、验证命令和合并后状态绑定。`ACTIVE_TASK.json/.md`和旧`taskctl`已经退役，任何流程不得重新读取或生成。

代码格式、结构与维护性治理必须同步读取 [`architecture/CODE_QUALITY_GOVERNANCE.md`](architecture/CODE_QUALITY_GOVERNANCE.md)。文件行数只作为观察指标，不参与合并资格；结构判断统一依据职责内聚、依赖方向、状态所有权、事务边界和公共接口。

在当前ChatGPT持久化工作空间中执行工具安装、离线恢复、格式化、Lint、TypeScript、Vitest、Playwright、Electron或全仓验证时，必须同步读取 [`process/CURRENT_WORKSPACE_TOOLCHAIN.md`](process/CURRENT_WORKSPACE_TOOLCHAIN.md)和机器清单 [`process/CURRENT_WORKSPACE_TOOLCHAIN.json`](process/CURRENT_WORKSPACE_TOOLCHAIN.json)。它们只约束`/mnt/data`工作空间资产和永久工具导出入口，不替代仓库锁文件。

## 2. 动态状态解析

本文件不固化活动PR、瞬时任务状态或“最新提交SHA”。每次工作开始时必须从真实仓库状态解析：

```text
读取main、work与governance Ref
→ 查询开放的work → main与governance → main PR
→ work PR存在worldforge-task marker：读取对应Schema 2 Runtime
→ 无任务marker：按维护PR处理，不伪造任务ID
→ 无开放任务PR：读取main Commit Status
→ 用effective-task-status计算任务有效状态
→ 核对main-verification
→ 核对来源集成分支是否已同步到已验证main
→ 核对另一条集成分支：空闲时应与main一致；存在开放PR时允许保留其受控工作
→ 核对远端分支库存是否恰好为main/work/governance
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

服务器永久Context保持最小四项：

```text
pr-policy=success
+ quality / quality=success
+ security=success
+ performance=success
```

`quality / quality`必须是Quality Workflow的服务器可见最终聚合门，依赖Core Quality、`quality / release-audit`与`quality / package-smoke`。Ready状态下任一内部权威失败，最终`quality / quality`必须失败；禁止让服务器Ruleset看到的Quality与Controlled Merge额外读取的Release Audit形成两套互不一致的合并判断。

Controlled Merge在四个永久Context成功后仍必须读取当前Head最新的Quality、Security、Performance Workflow Run，并交叉核验最新Quality中的最终`quality / quality`、`quality / release-audit`和`quality / package-smoke`。这层复核负责验证轮次新鲜度，防止旧Draft成功结果被Ready同SHA复用；它不再补偿服务器Context缺失的业务门禁。

Ready Evidence全量扫描必须把当前PR的`base.sha`传给Effective Status。当前Schema 2 Runtime即使已静态收口到`IMPLEMENTED`，合并前也必须识别为本PR Runtime并排除历史`task-verification`解析；历史Implemented Runtime继续按各自来源Squash提交和任务Context严格核验。

## 4. 仓库闭环条件

一项Schema 2产品任务只有在以下条件全部成立时才完成仓库闭环：

```text
来源work PR Ready最新验证轮次成功
+ 服务器可见最终quality / quality成功
+ Ready Evidence绑定最新实现提交
+ implementationCommit之后仅存在当前任务收口文件
+ Controlled Merge完成
+ main-verification=success
+ task-verification/<TASK-ID>=success
+ 无新的开放work → main PR
+ work受控同步后与main完全一致
+ 远端分支库存恰好为main/work/governance
```

`governance`作为独立治理lane允许与产品工作并行：没有开放`governance → main` PR时，成功的Main Verification会把空闲governance快进到当前已验证main；若治理PR已开放，则保留其受控Head，不把“governance必须等于main”作为产品任务闭环条件。

任一任务条件缺失：

- 不得启动下一产品任务；
- 不得把包含该任务实现但尚未进入并验证于main的提交作为Release来源；
- 不得把“PR已合并”表述为仓库已闭环；
- 自动同步失败时允许按相同CAS/快进条件执行手动恢复，但必须复核来源lane与main关系，并确认没有覆盖另一条lane的开放工作。

如果PR已经进入main但Main Verification发现来源PR最新Ready轮次失败，则该任务仍处于`VERIFICATION_PENDING`。Integration Branch Synchronization和Branch Hygiene应保持阻断；修复必须从当前main重新建立受控`work`基线并通过新的来源PR完成验证事实，禁止沿用失败来源PR伪造成功Context。

## 5. Main Verification与任务事实

Main Verification属于合并后的事实验证，不属于PR预授权。

如果来源work PR正文含：

```text
<!-- worldforge-task: M10-22 -->
```

则最终main必须读取对应Schema 2 Runtime并验证：

- `status`为`IMPLEMENTED`；
- `executionBranch`为`work`；
- `verificationBinding.sourcePr`等于真实来源PR；
- `mainContext`为`main-verification`；
- `taskContext`为`task-verification/<TASK-ID>`。

成功后发布`main-verification`与任务Context。非任务维护PR以及`governance → main`治理PR可不带marker，此时只发布`main-verification`。Main Verification还必须重新读取来源Head最新Quality/Security/Performance运行；来源Ready Quality失败时，主线状态必须保持failure。

Main Verification成功后进入Integration Branch Synchronization：

1. 本次来源lane仍必须与来源PR受检Head一致，随后按Squash事实受控重置到已验证main；
2. 另一条lane若无开放PR且当前Head只是main的祖先，则仅执行非强制快进到已验证main；
3. 另一条lane若存在开放PR，则跳过同步并保留其工作；
4. 另一条lane若没有开放PR但含独有/分叉提交，则fail-closed，禁止强制覆盖。

因此`governance → main`治理合并完成并通过Main Verification后，只要`work`处于空闲且没有独有提交，`work`会自动同步到最新main；反向的`work → main`合并对空闲governance同理。

## 6. 稳定历史基线

以下SHA只表示历史审计或任务启动点，不表示当前仓库Head：

- M10-02全量审计矩阵：`ca83d48c7493bba21252a37f9aec024d6aa0ca79`。
- M10-03启动基线：`bb415f3da773160928efda20b877083b321601a0`。
- M10-04启动基线：`8f54dc4e5ed46d6ffca999fda29887f2302b1030`。
- M10-05启动基线：`f6197ed9b3c6c01ddabd5d42f6703c289b41cbc7`。
- M10-07合并主线：`21625e1e11e7c50071f0860d791e902637f0531f`。

当前Head必须从Git Ref读取，禁止从上述历史记录推断。

## 7. 当前治理边界

- 新建及活动产品Runtime必须使用Schema 2和`executionBranch: "work"`；治理维护通过`governance → main`，不伪造产品任务Runtime。
- 已Verified历史Schema 1 Runtime保持冻结，只用于历史读取。
- `.github/governance/effective-task-status.mjs`是任务有效状态与提交Context判定的策略核心。
- Draft Evidence校验文件完整性、Hash和来源提交；Ready Evidence必须绑定当前任务最新实现提交。
- Ready Head中`implementationCommit`之后只允许当前任务卡、当前Runtime、`TASK_INDEX.md`和当前任务Evidence目录；产品代码、测试、脚本、配置、工作流或跨任务Evidence后移必须阻断。
- Evidence manifest不预写未来Squash SHA；Evidence通过最新Quality Workflow中的`quality / release-audit`校验，并由最终`quality / quality`聚合后进入服务器合并门；最终任务Verified由Main Verification提交状态证明。
- Ready阶段Verified Evidence扫描必须提供`TASK_BASE_REF`，避免当前PR的Implemented Runtime被误判成历史已合并任务。
- Release资格必须读取当前main提交的`main-verification`、产品门禁、三平台产物完整性和发行信任证据；Task Runtime只保留任务管理与历史审计职责。
- Branch Inventory固定且只允许`main`、`work`、`governance`；Branch Hygiene保护三者并删除其他漂移分支。
- Integration Branch Synchronization完成写入后必须复读被同步Ref；来源lane必须与已验证main一致，空闲兄弟lane也必须同步；存在开放PR的兄弟lane只记录skip，不得强制覆盖。
- SQLite逐级Migration、未来Schema只读打开、Provider适配和协议版本门禁继续保留。
- Toolchain Export保持只读检出和Artifact-only；允许人工`workflow_dispatch`，也允许现有Quality工作流在同仓库`work → main`或`governance → main` PR命中机器清单声明的工具链路径时通过`workflow_call`调用。禁止向正式分支提交工具链或二进制分片。
- Foundation打包入口必须读取各buildable workspace真实`package.json exports`，禁止再次假定所有包都使用`dist/index.js`；桌面构建/打包前清理Renderer与Preload的TSC影子运行JS，只保留真实运行入口和非运行资产。

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
