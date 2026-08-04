# WorldForge 项目执行统一入口

> 状态：IN_PROGRESS  
> 当前任务：M10-04 兼容面收敛治理  
> 面向：Codex、开发者、审查者、测试人员

## 1. 启动顺序

```text
AGENTS.md
→ docs/PROJECT_EXECUTION_ENTRY.md
→ docs/tasks/TASK_AUTHORIZATION.json
→ docs/tasks/TASK_INDEX.md
→ 当前任务Runtime
→ 当前任务卡
→ 任务卡列出的专项真源、现有代码、测试、Migration、IPC与Evidence
```

`TASK_AUTHORIZATION.json`定义唯一`work`分支、任务PR与main串行写入规则；`docs/tasks/runtime/`保存任务机器状态、边界、验证命令与最终状态绑定。`ACTIVE_TASK.json/.md`旧兼容锚点已经退出当前执行链并删除。

## 2. 当前基线

```text
M8-09 V1.0稳定性治理（Verified）
→ M9-00 治理激活与权威文档同步（Verified）
→ M9-01 / AR-01 重构安全网（Verified）
→ M9-02 / AR-02 Shared Structure（Verified）
→ M9-03 / AR-03—AR-14 统一架构拆分（Verified）
   ├─ Writing、Canon、Planning与AppShell拆分
   ├─ Contracts、Preload与Main IPC拆分
   ├─ ServiceFacade、Project Workspace、Recovery与工具域拆分
   └─ Legacy退役、CSS分层与结构预算收敛
→ M10-01 异步生命周期与竞态硬化（Verified）
→ M10-02 全量代码测试与深度审计（Verified）
→ M10-03 IPC与协议维护治理（Verified）
   ├─ 专项Main IPC统一异常保护
   ├─ Preload命令调用公共运行时收敛
   ├─ DEC-004与中央主桥范围同步
   └─ 执行入口基线语义修正
→ M10-04 兼容面收敛治理（In Progress）
   ├─ 空载Renderer Legacy兼容层退役
   ├─ ACTIVE_TASK与旧taskctl退出当前治理链
   ├─ 活动Runtime强制Schema 2
   ├─ Contracts中央主桥名称分阶段收敛
   └─ 旧备份元数据一次性规范化
```

### 基线身份

- M10-02全量代码审计与完整矩阵基线：`ca83d48c7493bba21252a37f9aec024d6aa0ca79`；只表示M10-02审计闭环。
- M10-03启动基线：`bb415f3da773160928efda20b877083b321601a0`；只表示PR #309后的已验证状态。
- M10-03当前已验证仓库基线：`main@8f54dc4e5ed46d6ffca999fda29887f2302b1030`；PR #310合并、Main Verification与`task-verification/M10-03`成功，且`main == work`。
- M10-04从上述已验证提交启动；在Main Verification成功前，不得把任一M10-04 work提交称为已验证产品基线。

M10-02最终矩阵记录：Statements 85.35%、Branches 75.61%、Functions 85.81%、Lines 87.49%；246个测试文件、1063项测试通过，Electron E2E 33/33通过，Linux、Windows、macOS三平台Package Smoke通过。该记录属于审计历史证据，不随日常维护提交自动改写。

## 3. 当前执行模式

```text
仓库状态：IN_PROGRESS
稳定分支：main
唯一工作分支：work
最新已验证仓库基线：8f54dc4e5ed46d6ffca999fda29887f2302b1030
M10-02审计矩阵基线：ca83d48c7493bba21252a37f9aec024d6aa0ca79
main写入：serialized
直接main提交：禁止
允许正式PR：仅work → main
活动任务：M10-04（In Progress）
活动PR：尚未创建
```

M10-04只允许在任务Runtime列出的路径内实施；不得沿用已关闭Runtime，不得创建任务专属分支，不得改写历史Migration或已Verified Evidence。

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

## 5. 当前治理边界

- 删除已经没有兼容对象的Renderer Legacy Loader、Legacy Ownership空表和相关启动错误路径；旧模块不得重新引入。
- 当前任务控制、分支卫生与发布资格只读取Schema 2授权、Runtime、任务索引和GitHub提交状态。
- 新建及活动Runtime强制Schema 2；历史Schema 1 Runtime保持冻结，只用于历史依赖与状态读取。
- `CentralBridgeCommandSchema`是中央主桥真源；`RegisteredCommandSchema`只作为V1同对象兼容别名。
- `public-index.ts`是`@worldforge/contracts`唯一包根入口；`index.ts`只承担内部基础聚合。
- 旧备份元数据成功解析后尝试原子规范化；规范化失败时保留原文件并继续兼容读取。
- SQLite逐级Migration、未来Schema只读打开、Provider适配和协议版本门禁继续保留。
- AI输出继续先进入建议稿，设定更新建议继续由作者裁决，`project.sqlite`继续是作品唯一权威真源。
- Renderer不得获得Node、文件系统、SQLite、环境变量或凭据能力。

M9历史入口：[`docs/tasks/M9/README.md`](tasks/M9/README.md)。
