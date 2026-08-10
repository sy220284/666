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
- `.github/governance/required-checks.json`：服务器Ruleset与Controlled Merge共同读取的最小工程Context真源。
- `quality / quality`：Quality Workflow的服务器可见最终聚合Context，必须汇总Core Quality、Release Audit与package gate，禁止仅代表可复用Core子流程。
- GitHub Actions最新Workflow Run：Controlled Merge必须核对当前Head的最新Quality、Security、Performance运行，防止同SHA旧Draft绿灯被Ready复用。

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
→ quality / quality聚合Core Quality、Release Audit与package gate
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
9. 无任务marker的Ready PR只允许修改`.github/`、`scripts/`、`tests/`、`docs/process/`和Markdown维护文件；出现产品代码、Task Runtime或Evidence变化时必须进入正式任务闭包。

## 4. Draft、完整验证、Evidence收口与Ready门禁

默认Draft用于提前运行PR Policy、静态检查和低成本诊断。若PR正文包含精确`<!-- full-validation-draft -->`，Quality、Security、Performance按照Ready等价风险路由执行完整矩阵，但PR仍保持Draft，因此Controlled Merge必须拒绝合并。

`full-validation-draft`只用于提前获得完整矩阵结果，不能直接充当Ready合并凭据。Draft转Ready时即使Head SHA没有变化，也必须产生新的Ready验证轮次；Controlled Merge按Workflow Run创建时间与ID读取最新轮次，不能只读取Commit上残留的旧成功Context。

任务Evidence收口允许复用已经真实完成的实现Quality，避免同一产品实现重复执行Unit、Integration、Migration、Coverage、Electron E2E与三平台package：

1. Ready Head必须带精确`worldforge-task` marker；
2. Schema 2 Runtime必须已静态收口到`IMPLEMENTED`；
3. Evidence manifest必须绑定完整`implementationCommit`；
4. 从`implementationCommit`到当前Ready Head只能变化当前任务卡、Runtime、TASK_INDEX与当前任务Evidence；
5. GitHub Actions必须能找到该`implementationCommit`上一轮真实`completed + success`的Quality，且产品测试、Coverage、Electron E2E、Release Audit与最终Quality Job都确实执行成功。

五项同时成立时，Ready Quality只在当前closure Head重新执行静态检查、Release Audit和最终聚合，复用冻结实现的完整Quality事实；无法机器证明时自动回退完整Quality，不允许人工声明复用。Security与Performance仍由当前Ready轮次独立执行，保持最新安全和性能事实。

Ready合并前的永久工程Context保持最小四项：

```text
pr-policy
+ quality / quality
+ security
+ performance
```

- PR Policy：验证`work → main`、同仓库来源、唯一开放PR和永久自动化布局。
- `quality / quality`：顶层最终聚合门。Core Quality负责静态、Unit、Integration、Migration、Coverage、Electron E2E、Build和三平台package smoke按风险路由；Release Audit与package gate作为同一最终Context的依赖。Ready时任一必需依赖失败，服务器可见的`quality / quality`必须失败。
- Release Audit：在Quality Workflow内执行CI Policy、Release Check、历史Verified Evidence扫描与本PR Evidence校验；它不新增第五个永久Context，也不重复产品测试。
- Security：凭据扫描始终执行；Ready或`full-validation-draft`执行完整历史扫描、依赖审计与应用安全。
- Performance：Ready或`full-validation-draft`对相关代码执行真实性能预算与AI协议基线。

非任务维护PR不制造Runtime或Evidence。Ready Release Audit先确认改动仍限定在治理/测试/流程文档维护表面；一旦出现产品代码或任务数据变化，没有`worldforge-task` marker即fail-closed。

Verified Evidence扫描在任务PR内必须收到当前`pull_request.base.sha`作为`TASK_BASE_REF`。这样Schema 2当前任务已经静态收口为`IMPLEMENTED`时，只把它识别为“本PR当前Runtime”，不会在合并前错误地按历史来源PR查找`task-verification`；历史Implemented Runtime仍保持严格来源提交核验。

## 5. Controlled Merge、Healing与Main Verification

服务器Ruleset与Controlled Merge共享同一个Quality事实：`quality / quality`已经汇总Core Quality、Release Audit与package gate。Controlled Merge在此基础上再验证运行轮次新鲜度，不能维护另一套相互独立的合并标准。

Controlled Merge必须同时满足：

1. `required-checks.json`中的四个永久Context在当前Head成功，其中`quality / quality`已经是最终聚合结果；
2. 当前Head最新的Quality、Security、Performance Workflow Run均已`completed + success`；最新Quality Run中的`quality / quality`、`quality / release-audit`、`quality / package-smoke`再次交叉核验成功，用于证明永久Context来自最新Ready轮次，而非同SHA历史Draft运行。

只要最新一轮仍在运行、失败或被取消，即使同一SHA以前存在成功结果也不得合并。合并前还要复核PR仍为Ready、Head未移动、Base为当前main、无Changes Requested与未解决线程。合并方式固定为Squash并绑定受检Head SHA。

若当前main的最新`main-verification`已经失败，Base Gate不得形成“坏main永远无法被修复”的恢复死锁。此时进入healing模式：不伪造或覆盖旧main状态，只允许基于当前坏main的PR继续进入Controlled Merge自身的Fresh Ready检查；当前Head四个永久Context与最新Quality/Security/Performance仍必须全部成功。healing merge完成后必须立即重新执行Main Verification，只有新main取得真实`main-verification=success`后才恢复正常基线。

Main Verification再次核对最终main SHA、来源PR、来源work Head、四个永久Context和最新来源Workflow Run，并在最终main执行静态一致性检查。来源PR最新Quality失败时，即使PR已经通过其他入口进入main，Main Verification也必须失败，不得发布成功任务事实。

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

若Main Verification失败，Work Synchronization和Branch Hygiene必须保持阻断。修复PR在当前坏main上通过Fresh Ready后可以自动进入healing merge，不再要求人工伪造成功状态或手动调用Merge API；新main验证成功后再自动同步`work`。

## 8. Evidence

```text
docs/test-evidence/<TASK-ID>/
├─ summary.md
├─ commands.txt
├─ known-risks.md
└─ manifest.json
```

Evidence必须绑定真实受检work提交。失败、跳过和环境限制必须如实记录。需要完整矩阵结果才能生成Evidence时，先用`full-validation-draft`取得结果，再把Evidence和Runtime收口写入同一PR，最后转Ready。若收口后只有允许的任务Closure文件变化，Ready Quality可以机器复用已冻结实现的完整Quality，避免重复产品矩阵。

Evidence通过最新Quality Workflow中的`quality / release-audit`参与自动合并判定，并由服务器可见最终`quality / quality`聚合；Task Verification则在合并后的Main Verification发布，两者职责不得混用。

## 9. 测试路由

| 变更范围 | 必要追加验证 |
|---|---|
| Migration、Repository、事务 | Migration、Integration |
| Main、Preload、IPC、路径、恢复、安全 | Security、Electron E2E |
| Editor、Candidate、Revision、Lock | Unit、Integration、Electron E2E |
| Prompt、Provider、Eval | Eval、Integration，必要时Performance |
| 性能、DPI、FTS、搜索、流式处理 | Performance，必要时Electron E2E |
| 治理、发布与任务状态 | Unit、PR Policy、Release Audit、Release Check |
| Evidence/Runtime最终收口且冻结实现已完整验证 | 当前Head静态 + Release Audit；Quality产品矩阵复用冻结实现；Security/Performance保持Fresh Ready |
| 纯治理维护且无任务marker | 静态、PR Policy、Release Audit、Security/Performance按路径路由；不创建任务Evidence |

风险不确定时按更高风险执行；复用条件无法机器证明时自动回退完整矩阵。

## 10. 完成真实性

完成声明前必须确认：修改存在于真实PR Head；入口、导出、IPC、Migration、UI和测试没有断链；声明通过的命令真实成功；完整验证与Evidence绑定同一实现链；服务器可见`quality / quality`与最新Ready Quality轮次同时成功；Controlled Merge绑定同一来源；`main-verification`和任务需要的`task-verification`真实成功；`work`已同步到已验证`main`；远端最终只保留`main/work`；并重新读取最终分支和提交状态。
