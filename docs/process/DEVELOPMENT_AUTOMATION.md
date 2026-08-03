# WorldForge 开发自动化控制规范

> 状态：Active  
> 授权模式：`single-work-pr`

## 1. 目标

自动化只承担任务边界、代码质量、数据与安全边界、可追溯合并、主分支验证和安全同步。自动化不得生成业务代码、伪造任务状态或绕过真实验证。

## 2. 权威状态

- `docs/tasks/TASK_AUTHORIZATION.json`：分支、PR、合并、关闭与同步规则。
- `docs/tasks/runtime/<TASK-ID>.json`：任务范围、状态、依赖、允许路径、禁止路径和验证命令。
- `docs/tasks/TASK_INDEX.md`：任务依赖和导航。
- `docs/tasks/ACTIVE_TASK.json`与`.md`：旧状态机兼容锚点。

新建及活动Runtime必须使用`executionBranch: work`。历史Verified Runtime的来源分支记录保持冻结。

## 3. 唯一开发路径

```text
最新已验证main
→ Work Synchronization确认唯一work基线
→ 在work完成实现、测试、文档与Evidence
→ 唯一work → main PR
→ PR Policy与Task Governance验证分支、任务和路径
→ Quality、Security、Performance、Evidence执行永久门禁
→ Controlled Merge绑定受检Head执行Squash
→ Main Verification核验最终main和来源门禁
→ 任务验证状态发布
→ Work Synchronization受控重置work
```

约束：

1. 仓库只允许`main`和`work`。
2. 同一时刻最多一个开放的`work → main` PR。
3. 禁止机器人直接推送`main`；只有Controlled Merge可调用Merge API。
4. 禁止辅助分支、验证分支、治理分支和纯关闭PR。
5. 正式文件必须存在于PR Head，CI不得代替开发提交正式源码或状态。
6. 数据、Migration、安全、事务、项目边界和恢复失败立即阻断。

## 4. Draft与Ready门禁

Draft与Ready均按变更范围执行永久检查；Draft只阻止合并，不得用于跳过代码验证。

Ready合并前必须成功：

```text
pr-policy
+ task-governance
+ quality / quality
+ security
+ performance
+ evidence
```

- PR Policy：精确验证`work → main`、同仓库来源、唯一开放PR和永久自动化布局。
- Task Governance：验证授权Schema、任务标记、Runtime、允许路径和禁止路径。
- Quality：静态、Unit、Integration、Migration、Coverage、Electron E2E和Build按路径路由。
- Security：凭据扫描始终执行，依赖与应用安全按风险路由。
- Performance：性能敏感路径或任务明确要求时执行。
- Evidence：验证本次变化任务目录的真实性和完整性。

## 5. Controlled Merge与Main Verification

Controlled Merge必须确认：

- PR为Ready，Head未移动；
- Head为`work`，Base为`main`；
- PR未落后当前main；
- 无Changes Requested和未解决线程；
- 六项永久检查属于同一Head且全部成功；
- 合并方式固定为Squash，并绑定expected_head_sha。

Main Verification负责：

1. 核对最终main SHA；
2. 核对来源PR与来源work Head；
3. 核对来源六项永久门禁；
4. 在最终main执行静态一致性检查；
5. 发布`main-verification`及任务验证状态。

## 6. 任务有效状态

PR Head中的Runtime最高声明到`IMPLEMENTED`。有效状态由机器计算：

```text
IMPLEMENTED且任务验证状态缺失
→ VERIFICATION_PENDING

IMPLEMENTED且来源绑定、main SHA和任务验证状态一致
→ VERIFIED
```

Release Gate和下一任务激活必须读取有效状态。禁止通过第二个PR手工补写Verified来制造闭环。

## 7. Work Synchronization

Main Verification成功后，`Work Synchronization`检查：

- 受检main仍是当前main；
- 来源PR为已合并的`work → main`；
- work仍等于来源受检Head，或已被自动删除；
- 没有新的开放work PR；
- work没有合并后的新提交。

全部满足后，允许以CAS保护将`work`强制更新到已验证main。任一条件失败则停止并报告。

## 8. Evidence

新任务Evidence固定为：

```text
docs/test-evidence/<TASK-ID>/
├─ summary.md
├─ commands.txt
├─ known-risks.md
└─ manifest.json
```

- `summary.md`记录实现范围、测试、人工复核和结论。
- `commands.txt`只记录真实执行命令和退出结果。
- `known-risks.md`记录剩余风险，无风险时明确写“无”。
- `manifest.json`绑定文件完整性和受检work Head。
- 合并后的main SHA与验证运行通过提交状态绑定，不要求第二个关闭PR。
- 不得为了Evidence生成无人查看的截图或Artifact。

## 9. 测试路由

| 变更范围 | 必要追加验证 |
|---|---|
| Migration、Repository、事务 | `test:migration`、`test:integration` |
| Main、Preload、IPC、路径、恢复、安全 | `test:security`、`test:e2e` |
| Editor、Candidate、Revision、Lock | `test:unit`、`test:integration`、`test:e2e` |
| Prompt、Provider、Eval | `test:eval`、`test:integration`，必要时`test:perf` |
| 性能、DPI、FTS、搜索、流式处理 | `test:perf`，必要时`test:e2e` |
| 治理、发布与任务状态 | Unit、Task Governance、PR Policy |

风险不确定时按更高风险执行。

## 10. 完成真实性

任何完成声明前必须确认：

- 修改存在于真实work PR Head；
- 入口、导出、IPC、Migration、UI和测试没有断链；
- 声明通过的命令真实成功；
- Controlled Merge与Main Verification针对同一代来源；
- 任务有效状态已闭环；
- work已安全同步到已验证main；
- 重新读取真实main、work和关键状态。
