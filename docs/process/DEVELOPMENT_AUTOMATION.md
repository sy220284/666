# WorldForge 开发自动化控制规范

> 状态：Active  
> 授权模式：`single-work-pr`

## 1. 目标

自动化只承担任务边界、代码质量、数据与安全边界、可追溯合并、主分支验证和安全同步。自动化不得生成业务代码、伪造任务状态或绕过真实验证。

## 2. 权威状态

- `docs/tasks/TASK_AUTHORIZATION.json`：分支、PR、合并、关闭与同步规则。
- `docs/tasks/runtime/<TASK-ID>.json`：任务范围、静态状态、依赖、允许路径、禁止路径、验证命令和提交状态绑定。
- `docs/tasks/TASK_INDEX.md`：独立任务、依赖和导航。
- GitHub Commit Status：`main-verification`与`task-verification/<TASK-ID>`提供有效Verified结论。

新建及活动Runtime必须使用Schema 2和`executionBranch: work`。历史Verified Runtime保持冻结，只允许读取。`ACTIVE_TASK.json/.md`和旧`taskctl`已经退役。

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
→ 发布任务验证状态
→ Work Synchronization受控重置work
```

约束：

1. 仓库只允许`main`和`work`。
2. 同一时刻最多一个开放的`work → main` PR。
3. 禁止机器人直接推送`main`；只有Controlled Merge可调用Merge API。
4. 禁止辅助分支、验证分支、治理分支和纯关闭PR。
5. 正式文件必须存在于PR Head，CI不得代替开发提交正式源码或状态。
6. 数据、Migration、安全、事务、项目边界和恢复失败立即阻断。
7. 活动任务Runtime必须是Schema 2；Schema 1只允许冻结历史读取。

## 4. Draft与Ready门禁

Draft用于提前运行治理和静态诊断。Ready合并前必须成功：

```text
trusted-governance
+ pr-policy
+ task-governance
+ quality / quality
+ security
+ performance
+ evidence
```

- PR Policy：验证`work → main`、同仓库来源、唯一开放PR和永久自动化布局。
- Task Governance：验证授权Schema、任务标记、Runtime、允许路径和禁止路径。
- Quality：静态、Unit、Integration、Migration、Coverage、Electron E2E和Build按路径路由。
- Security：凭据扫描始终执行，依赖与应用安全按风险路由。
- Performance：性能敏感路径或任务明确要求时执行。
- Evidence：验证本次任务目录的真实性和完整性。

## 5. Controlled Merge与Main Verification

Controlled Merge必须确认：PR为Ready、Head未移动、Head为`work`、Base为`main`、PR未落后main、无阻断审查、七项永久检查属于同一Head且成功。合并方式固定为Squash并绑定`expected_head_sha`。

Main Verification核对最终main SHA、来源PR、来源work Head和来源永久门禁，在最终main执行一致性检查，并发布`main-verification`及任务验证状态。

## 6. 任务有效状态

PR Head中的Runtime最高声明到`IMPLEMENTED`：

```text
IMPLEMENTED + 任务验证状态缺失
→ VERIFICATION_PENDING

IMPLEMENTED + 来源绑定一致 + task-verification/<TASK-ID>成功
→ VERIFIED
```

Release Gate和下一任务依赖必须读取有效状态，禁止通过第二个PR手工写入Verified。

## 7. Work Synchronization

Main Verification成功后，工作流确认受检main仍是当前main、来源PR已经合并、work仍等于来源受检Head或被自动删除、没有新work PR或新提交。全部满足后以CAS保护将`work`重置到已验证main；条件不满足时停止并报告。

## 8. Evidence

```text
docs/test-evidence/<TASK-ID>/
├─ summary.md
├─ commands.txt
├─ known-risks.md
└─ manifest.json
```

Evidence必须绑定真实受检work提交。失败、跳过和环境限制必须如实记录；合并后的main SHA与验证运行由提交状态闭环。

## 9. 测试路由

| 变更范围                             | 必要追加验证                         |
| ------------------------------------ | ------------------------------------ |
| Migration、Repository、事务          | Migration、Integration               |
| Main、Preload、IPC、路径、恢复、安全 | Security、Electron E2E               |
| Editor、Candidate、Revision、Lock    | Unit、Integration、Electron E2E      |
| Prompt、Provider、Eval               | Eval、Integration，必要时Performance |
| 性能、DPI、FTS、搜索、流式处理       | Performance，必要时Electron E2E      |
| 治理、发布与任务状态                 | Unit、Task Governance、PR Policy     |

风险不确定时按更高风险执行。

## 10. 完成真实性

完成声明前必须确认：修改存在于真实PR Head；入口、导出、IPC、Migration、UI和测试没有断链；声明通过的命令真实成功；Controlled Merge与Main Verification绑定同一来源；任务有效Verified；`work`已同步到已验证`main`；并重新读取最终分支和提交状态。
