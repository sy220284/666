# WorldForge 开发自动化控制规范

> 状态：Active  
> 授权模式：`single-work-pr`

## 1. 目标

自动化只承担代码质量、数据与安全边界、可追溯合并、主分支验证和安全同步。自动化不得生成业务代码、伪造任务状态或绕过真实验证。

Task Governance、Evidence与Runtime不再作为开发授权或PR工程门禁；它们负责项目管理、证据和合并后的任务事实闭包。工程效率与任务真实性必须解耦。

## 2. 权威状态

- `docs/tasks/runtime/<TASK-ID>.json`：任务范围、静态状态、依赖、验证命令和合并后状态绑定。
- `docs/tasks/TASK_INDEX.md`：任务导航与静态进度镜像，不得把Schema 2任务单方面提升为有效Verified。
- GitHub Commit Status：`main-verification`与`task-verification/<TASK-ID>`提供有效Verified事实。
- `.github/governance/required-checks.json`：服务器Ruleset与Controlled Merge共同读取的工程检查真源。
- GitHub Actions最新Workflow Run：Controlled Merge必须核对当前Head的最新Quality、Security、Performance运行，旧Draft成功结果不得被Ready复用。

新建及活动Runtime必须使用Schema 2和`executionBranch: work`。历史Verified Schema 1 Runtime保持冻结，只允许读取。

## 3. 唯一开发路径

```text
最新已验证main
→ Work Synchronization确认唯一work基线
→ 在work完成实现、测试、文档与Evidence
→ 唯一work → main PR
→ PR Policy验证分支形态与永久自动化布局
→ Draft静态诊断；必要时用full-validation-draft执行完整矩阵但保持禁止合并
→ 状态/Evidence收口进入同一Head
→ 转Ready
→ Ready事件在同一Head重新启动Quality、Security、Performance
→ Controlled Merge只接受当前Head最新一轮Workflow Run全部成功
→ Squash Merge
→ Main Verification核验最终main、来源Head与最新来源门禁
→ 若PR带worldforge-task marker，发布task-verification/<TASK-ID>
→ Work Synchronization受控同步work
→ Branch Hygiene恢复main/work唯一库存
```

约束：

1. 仓库只允许`main`和`work`。
2. 同一时刻最多一个开放的`work → main` PR。
3. 禁止机器人直接推送`main`；正常主链只有Controlled Merge可调用Merge API。
4. 禁止辅助分支、验证分支、治理分支和纯关闭PR。
5. 正式文件必须存在于PR Head，CI不得代替开发提交正式源码或状态。
6. 数据、Migration、安全、事务、项目边界和恢复失败立即阻断。
7. 活动任务Runtime必须是Schema 2；Schema 1只允许冻结历史读取。
8. PR任务marker是合并后任务事实绑定，不是开发授权；非任务维护PR可以不带marker。

## 4. Draft、全量验证与Ready门禁

默认Draft用于提前运行PR Policy、静态检查和低成本诊断。若PR正文包含`full-validation-draft`，Quality、Security、Performance按照Ready等价风险路由执行完整矩阵，但PR仍保持Draft，因此Controlled Merge必须拒绝合并。

`full-validation-draft`只用于提前获得完整矩阵结果，不能充当Ready合并凭据。Draft转Ready时即使Head SHA没有变化，也必须产生新的Ready验证轮次；Controlled Merge按Workflow Run创建时间与ID读取最新轮次，不能只读取Commit上残留的旧成功Context。

Ready合并前的永久工程检查为：

```text
pr-policy
+ quality / quality
+ quality / release-audit
+ security
+ performance
```

- PR Policy：验证`work → main`、同仓库来源、唯一开放PR和永久自动化布局。
- Quality：静态、Unit、Integration、Migration、Coverage、Electron E2E、Build和三平台package smoke按路径路由。
- Release Audit：执行CI Policy、Release Check、历史Verified Evidence扫描与本PR Evidence校验；它是现有轻量Job，不增加重复产品测试。
- Security：凭据扫描始终执行；Ready或`full-validation-draft`执行完整历史扫描、依赖审计与应用安全。
- Performance：Ready或`full-validation-draft`对相关代码执行真实性能预算与AI协议基线。

## 5. Controlled Merge与Main Verification

Controlled Merge必须同时满足两层事实：

1. `required-checks.json`中的永久Context在当前Head成功；
2. 当前Head最新的Quality、Security、Performance Workflow Run均已`completed + success`，且最新Quality Run中的`quality / quality`、`quality / release-audit`、`quality / package-smoke`全部成功。

只要最新一轮仍在运行、失败或被取消，即使同一SHA以前存在成功结果也不得合并。合并前还要复核PR仍为Ready、Head未移动、Base为当前main、无Changes Requested与未解决线程。合并方式固定为Squash并绑定受检Head SHA。

Main Verification再次核对最终main SHA、来源PR、来源work Head、永久Context和最新来源Workflow Run，并在最终main执行静态一致性检查。

若来源PR正文包含：

```text
<!-- worldforge-task: M10-22 -->
```

Main Verification还必须读取对应Schema 2 Runtime并确认：`status=IMPLEMENTED`、`executionBranch=work`、`sourcePr`等于真实来源PR、`mainContext=main-verification`、`taskContext=task-verification/<TASK-ID>`。验证成功后同时发布`main-verification`和`task-verification/<TASK-ID>`。该任务绑定发生在合并后，不重新引入PR预授权。

## 6. 任务有效状态与Release边界

Schema 2 Runtime在PR内最高静态声明到`IMPLEMENTED`：

```text
IN_PROGRESS
→ IN_PROGRESS

IMPLEMENTED
+ task-verification/<TASK-ID>缺失/失败
→ VERIFICATION_PENDING

IMPLEMENTED
+ task-verification/<TASK-ID>=success
→ VERIFIED
```

`TASK_INDEX.md`中的`Verified`只可镜像已经存在的有效事实，不能覆盖Schema 2 Runtime和Commit Status。冻结Schema 1历史任务继续保留其静态Verified兼容语义。

任务依赖、Evidence扫描和下一任务启动读取统一Effective Status。产品Release资格独立读取当前`main`的`main-verification`、产品门禁、三平台产物完整性和发行信任证据，不从Task Runtime推导发布资格。

## 7. Work Synchronization与Branch Hygiene

Main Verification成功后，工作流确认受检main仍是当前main、来源PR已经合并、work仍等于来源受检Head或没有新提交、没有新的work PR。全部满足后以CAS保护将`work`同步到已验证main。

随后Branch Hygiene自动修复远端分支库存，只允许`main`和`work`。任何额外分支都属于漂移，不得被任务、Release或临时验证流程长期保留。

## 8. Evidence

```text
docs/test-evidence/<TASK-ID>/
├─ summary.md
├─ commands.txt
├─ known-risks.md
└─ manifest.json
```

Evidence必须绑定真实受检work提交。失败、跳过和环境限制必须如实记录。需要完整矩阵结果才能生成Evidence时，先用`full-validation-draft`取得结果，再把Evidence和Runtime收口写入同一PR，最后转Ready触发新的Ready验证轮次。

Evidence通过`quality / release-audit`进入永久合并门禁；Task Verification则在合并后的Main Verification发布，两者职责不得混用。

## 9. 测试路由

| 变更范围 | 必要追加验证 |
|---|---|
| Migration、Repository、事务 | Migration、Integration |
| Main、Preload、IPC、路径、恢复、安全 | Security、Electron E2E |
| Editor、Candidate、Revision、Lock | Unit、Integration、Electron E2E |
| Prompt、Provider、Eval | Eval、Integration，必要时Performance |
| 性能、DPI、FTS、搜索、流式处理 | Performance，必要时Electron E2E |
| 治理、发布与任务状态 | Unit、PR Policy、Release Audit、Release Check |

风险不确定时按更高风险执行。

## 10. 完成真实性

完成声明前必须确认：修改存在于真实PR Head；入口、导出、IPC、Migration、UI和测试没有断链；声明通过的命令真实成功；完整验证与Evidence绑定同一实现链；Ready最新Workflow Run全部成功；Controlled Merge绑定同一来源；`main-verification`和任务需要的`task-verification`真实成功；`work`已同步到已验证`main`；远端最终只保留`main/work`；并重新读取最终分支和提交状态。
