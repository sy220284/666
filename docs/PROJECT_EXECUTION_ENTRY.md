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

`TASK_AUTHORIZATION.json`定义唯一`work`分支、任务PR与main串行写入规则；`docs/tasks/runtime/`保存任务静态声明状态、边界、验证命令与最终状态绑定。`ACTIVE_TASK.json/.md`和旧`taskctl`已经退役，任何流程不得重新读取或生成。

## 2. 动态状态解析

本文件不固化活动PR、瞬时任务状态或“最新提交SHA”。每次工作开始时必须从真实仓库状态解析：

```text
读取main与work Ref
→ 查询开放的work → main PR
→ 有开放PR：从PR marker解析任务ID，读取对应Schema 2 Runtime
→ 无开放PR：读取main Commit Status
→ 用effective-task-status计算任务有效状态
→ 核对main-verification
→ 核对main与work是否identical
```

状态语义：

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

Runtime、任务卡和任务索引中的`Implemented`属于静态声明，不得覆盖GitHub Commit Status计算出的有效Verified。发布、依赖、Evidence全量扫描和下一任务启动必须调用统一有效状态策略。

## 3. 仓库闭环条件

一项任务只有在以下条件全部成立时才完成仓库闭环：

```text
来源PR永久门禁成功
+ Controlled Merge完成
+ main-verification=success
+ task-verification/<TASK-ID>=success
+ 无新的开放work → main PR
+ work受控重置后与main完全一致
```

任一条件缺失：

- 不得启动下一任务；
- 不得发布；
- 不得把“PR已合并”表述为仓库已闭环；
- 自动同步失败时允许按相同CAS条件执行手动恢复，但必须复核`main == work`。

## 4. 稳定历史基线

以下SHA只表示历史审计或任务启动点，不表示当前仓库Head：

- M10-02全量审计矩阵：`ca83d48c7493bba21252a37f9aec024d6aa0ca79`。
- M10-03启动基线：`bb415f3da773160928efda20b877083b321601a0`。
- M10-04启动基线：`8f54dc4e5ed46d6ffca999fda29887f2302b1030`。
- M10-05启动基线：`f6197ed9b3c6c01ddabd5d42f6703c289b41cbc7`。

当前Head必须从Git Ref读取，禁止从上述历史记录推断。

## 5. 当前治理边界

- 新建及活动Runtime必须使用Schema 2和`executionBranch: "work"`。
- 已Verified历史Schema 1 Runtime保持冻结，只用于历史读取。
- `.github/governance/effective-task-status.mjs`是任务有效状态与提交Context判定的策略核心。
- Evidence manifest绑定实现提交；Evidence CI Check绑定精确PR Head。
- 发布资格必须读取当前main提交的`main-verification`和任务状态。
- Branch Hygiene只保护`main`与`work`，不允许`release/*`或其他额外分支例外。
- Work Synchronization完成写入后必须复读work Ref并断言与已验证main一致。
- SQLite逐级Migration、未来Schema只读打开、Provider适配和协议版本门禁继续保留。

## 6. 产品与架构不变量

- AI输出先进入建议稿，作者明确采用后才能进入当前稿。
- `project.sqlite`是作品唯一权威真源。
- Renderer不得获得Node、文件系统、SQLite、环境变量或凭据能力。
- 数据、索引、日志、备份和配置只保存在本地。
- 未通过真实命令和永久门禁，不得声明验证成功。
