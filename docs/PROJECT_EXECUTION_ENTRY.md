# WorldForge 项目执行统一入口

> 状态：IMPLEMENTED  
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
→ M9-00—M9-03 V1.1架构拆分治理（Verified）
→ M10-01 异步生命周期与竞态硬化（Verified）
→ M10-02 全量代码测试与深度审计（Verified）
→ M10-03 IPC与协议维护治理（Verified）
→ M10-04 兼容面收敛治理（Implemented）
   ├─ 空载Renderer Legacy兼容层退役
   ├─ ACTIVE_TASK与旧taskctl退出当前治理链
   ├─ 活动Runtime强制Schema 2
   ├─ Contracts中央主桥名称分阶段收敛
   ├─ 旧备份元数据一次性规范化
   └─ 发布资格改读Runtime、索引与提交状态
```

### 基线身份

- M10-02审计矩阵基线：`ca83d48c7493bba21252a37f9aec024d6aa0ca79`。
- M10-03启动基线：`bb415f3da773160928efda20b877083b321601a0`。
- M10-04启动时最新已验证仓库基线：`main@8f54dc4e5ed46d6ffca999fda29887f2302b1030`；PR #310合并、Main Verification与`task-verification/M10-03`成功，且启动时`main == work`。
- M10-04受检实现与Evidence位于PR #312；Main Verification成功前，任何work提交都不是已验证产品基线。

M10-02最终矩阵记录：Statements 85.35%、Branches 75.61%、Functions 85.81%、Lines 87.49%；246个测试文件、1063项测试通过，Electron E2E 33/33通过，Linux、Windows、macOS三平台Package Smoke通过。该记录属于历史审计证据。

## 3. 当前执行模式

```text
仓库状态：IMPLEMENTED
稳定分支：main
唯一工作分支：work
最新已验证仓库基线：8f54dc4e5ed46d6ffca999fda29887f2302b1030
main写入：serialized
直接main提交：禁止
允许正式PR：仅work → main
活动任务：M10-04（Implemented）
活动PR：#312（Draft，待Ready完整矩阵）
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

## 5. 当前治理边界

- Renderer生产启动链只保留React入口、Core健康门禁和生命周期注册表；旧模块重新引入由结构测试阻断。
- 当前任务控制、分支卫生与发布资格只读取Schema 2授权、Runtime、任务索引和GitHub提交状态。
- 活动Runtime强制Schema 2；历史Schema 1 Runtime保持冻结，只用于历史依赖与状态读取。
- `CentralBridgeCommandSchema`是中央主桥真源；`RegisteredCommandSchema`只作为V1同对象兼容别名。
- `public-index.ts`是`@worldforge/contracts`唯一包根入口；`index.ts`只承担内部基础聚合。
- 旧备份元数据成功解析后尝试原子规范化；失败时保留原文件并继续兼容读取。
- SQLite逐级Migration、未来Schema只读打开、Provider适配和协议版本门禁继续保留。
- AI输出继续先进入建议稿，`project.sqlite`继续是作品唯一权威真源。
- Renderer不得获得Node、文件系统、SQLite、环境变量或凭据能力。
