# WorldForge Codex闭环执行手册

> 状态：Active  
> 作用：规定产品任务与仓库治理从接收、实现、验证、合并、主线验证到集成分支同步的完整路径。

## 1. 工作入口

```text
AGENTS.md
→ docs/PROJECT_EXECUTION_ENTRY.md
→ docs/tasks/TASK_AUTHORIZATION.json
→ docs/tasks/TASK_INDEX.md
→ 产品任务时读取当前Schema 2 Runtime
→ 当前任务卡与专项文档
→ 现有代码、测试、Migration、IPC和追踪矩阵
```

固定分支为`main/work/governance`：产品任务使用`work → main`，仓库治理使用`governance → main`。两条lane各最多一个开放PR，main写入始终串行。

## 2. 产品任务接收

开始实施前确认：

- 目标、非目标、依赖和验收；
- 当前Runtime状态、允许路径和禁止路径；
- 最新已验证main与work关系；
- 数据库、Migration、IPC、事件、错误码、UI、安全、恢复和性能影响；
- 已有、缺失、冲突和可复用能力；
- 是否存在重复实现、并行真源或过期任务假设。

产品任务固定在`work`完成实现、测试、文档与Evidence。治理维护不得借`governance`修改产品功能；范围触及产品代码、数据库、IPC或任务数据时转回正式产品任务。

## 3. 开工前输出

```text
任务ID（治理维护可无）：
目标：
非目标：
依赖：
真实基线：
执行lane：work / governance
允许路径：
禁止路径：
数据库/Migration影响：
IPC/事件影响：
UI影响：
安全与隐私影响：
恢复影响：
性能影响：
主要风险：
实施步骤：
验证命令：
```

### 3.1 审计与复审输出

凡任务包含“审计、复审、全量review、代码审查、设计审查、体验审查、安全审查、恢复审查、发布审查或治理审查”，必须先读取 `docs/process/USER_PERSPECTIVE_AUDIT_REPORTING.md`。

对作者汇报时固定回答：

```text
用户做了什么
→ 系统会发生什么
→ 用户会损失什么或困惑什么
→ 严重程度
→ 应达到什么正确结果
→ 必要时补充代码定位
```

工程术语只允许作为代码定位或开发附录，不得直接充当用户问题结论。严重程度统一使用“严重 / 高 / 中 / 低”，按真实使用后果判断。没有真实用户场景和用户影响的问题，不得进入主要审计问题清单。

## 4. 产品标准实施顺序

```text
失败测试或稳定复现
→ Contracts/Domain
→ Migration/Repository
→ Core Use Case
→ Main/Preload IPC
→ 最小Renderer/UI闭环
→ 失败、取消、冲突、只读和恢复路径
→ 自动化测试
→ 人工业务验收
→ 独立复查
→ 文档、追踪与Evidence
```

不涉及的层级明确记录“无影响”。

## 5. 编码规则

- TypeScript strict，边界使用strict Zod。
- 不新增未批准生产依赖，不重构无关模块。
- 禁止TODO、空函数、固定成功、演示数据和静默吞错。
- SQLite写入只在Core，通过单一写队列和事务。
- 已发布Migration只追加。
- Provider不查询项目数据、不保存Candidate。
- AI输出先进入建议稿，作者采用后才能修改当前稿。
- Renderer禁止Node、SQLite、文件系统、环境变量和凭据。
- 新功能覆盖空、加载、成功、失败、取消、冲突、只读和恢复。

## 6. 分支与PR

```text
产品：最新已验证main → work → main PR
治理：最新已验证main → governance → main PR
```

禁止：

- 创建`work/*`、`governance/*`、`feat/*`、`fix/*`、`policy/*`、`validate/*`等第四分支；
- 验证专用PR、纯Evidence关闭PR或第二个同lane PR；
- 直接提交main；
- 用治理PR承载产品任务实现。

`work`与`governance`可以并行持有各自PR，但共享main的Controlled Merge与Main Verification必须串行。

## 7. 测试路由

基础命令：

```bash
pnpm task:validate
pnpm check:language
pnpm check:workspaces
pnpm check:boundaries
pnpm format:check
pnpm lint
pnpm ci:policy
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:migration
pnpm test:coverage
pnpm test:security
pnpm test:perf
pnpm build
pnpm release:check
pnpm test:e2e
```

按任务卡和风险范围执行。未运行、失败或受环境限制必须如实记录。CI/永久门禁属于最终工程事实，不以本地输出替代。

## 8. Evidence

产品任务Evidence：

```text
docs/test-evidence/<TASK-ID>/
├─ summary.md
├─ commands.txt
├─ known-risks.md
└─ manifest.json
```

合并前Runtime最高登记`IMPLEMENTED`，Evidence绑定真实implementation commit与来源PR。治理维护无任务marker时不制造产品Runtime或Evidence。

合并后Main Verification发布`main-verification`；产品任务额外发布`task-verification/<TASK-ID>`。有效Verified由Runtime绑定与Commit Status计算。

## 9. 合并与主线验证

```text
Ready Head四项永久门禁成功
→ Controlled Merge读取最新Quality/Security/Performance轮次
→ 绑定expected_head_sha执行Squash
→ Main Verification核验最终main与来源PR/Head
→ 发布main-verification
→ 产品任务额外发布task-verification/<TASK-ID>
→ Integration Branch Synchronization
→ Branch Inventory/Hygiene
```

PR已合并不等于任务或治理已闭环；必须继续核对Main Verification与分支同步事实。

## 10. Integration Branch Synchronization

Main Verification成功后同时处理`work`和`governance`：

- 来源lane仍等于受检来源Head且无新同lane PR：受控重置到已验证main；
- 另一条lane已经等于main：保持；
- 另一条lane无开放PR且只是落后main：非强制fast-forward到最新main；
- 另一条lane存在开放PR：skip，保留其工作；
- 另一条lane无开放PR但含独有/分叉提交：fail-closed，禁止强制覆盖。

每次写Ref后必须复读确认。`governance → main`合并成功时，空闲`work`应自动跟上最新main；反向同理。

## 11. 完成声明

产品任务闭环前确认：

- 原始目标和非目标逐项复核；
- 实现真实存在于受检work Head；
- 专项验证与关联回归真实通过；
- 四项永久门禁来自当前Ready Head；
- Controlled Merge实际完成；
- `main-verification`与任务Context成功；
- `work == main`；
- 空闲`governance == main`，或其开放PR被明确保留；
- 远端分支库存恰好`main/work/governance`。

治理维护闭环前确认：

- 修改真实存在于受检governance Head；
- 四项永久门禁与Main Verification成功；
- `governance == main`；
- 空闲`work == main`，或其开放PR被明确保留；
- 最终Ref与关键文件重新读取验证。

Runner成功、Artifact上传或“PR可合并”都不能单独证明完成。
