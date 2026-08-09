# WorldForge 开发自动化控制规范

> 状态：Active  
> 授权模式：`single-work-pr`

## 1. 目标

自动化只承担代码质量、数据与安全边界、可追溯合并、主分支验证和安全同步。自动化不得生成业务代码、伪造任务状态或绕过真实验证。

## 2. 权威状态

- `docs/tasks/runtime/<TASK-ID>.json`：任务范围、静态状态、依赖、允许路径、禁止路径、验证命令和提交状态绑定。
- `docs/tasks/TASK_INDEX.md`：独立任务、依赖和导航。
- GitHub Commit Status：`main-verification`与`task-verification/<TASK-ID>`提供有效Verified结论。
- `.github/governance/required-checks.json`：Controlled Merge需要的工程检查真源。

新建及活动Runtime必须使用Schema 2和`executionBranch: work`。历史Verified Runtime保持冻结，只允许读取。任务授权和Evidence继续用于项目管理与审计，不再充当工程PR合并或产品Release的第二套权威。

## 3. 唯一开发路径

```text
最新已验证main
→ Work Synchronization确认唯一work基线
→ 在work完成实现、测试、文档与Evidence
→ 唯一work → main PR
→ PR Policy验证分支形态与永久自动化布局
→ Draft静态诊断；必要时用full-validation-draft执行完整矩阵但保持禁止合并
→ Quality、Security、Performance全部通过
→ 状态/Evidence收口进入同一Head
→ 转Ready
→ Controlled Merge绑定受检Head执行Squash
→ Main Verification核验最终main和来源门禁
→ 发布任务验证状态
→ Work Synchronization受控同步work
```

约束：

1. 仓库只允许`main`和`work`。
2. 同一时刻最多一个开放的`work → main` PR。
3. 禁止机器人直接推送`main`；只有Controlled Merge可调用Merge API。
4. 禁止辅助分支、验证分支、治理分支和纯关闭PR。
5. 正式文件必须存在于PR Head，CI不得代替开发提交正式源码或状态。
6. 数据、Migration、安全、事务、项目边界和恢复失败立即阻断。
7. 活动任务Runtime必须是Schema 2；Schema 1只允许冻结历史读取。

## 4. Draft、全量验证与Ready门禁

默认Draft用于提前运行PR Policy、静态检查和低成本诊断。若PR正文包含精确标记`full-validation-draft`，Quality、Security、Performance按照Ready等价风险路由执行完整矩阵，但PR仍保持Draft，因此Controlled Merge必须继续拒绝合并。

`full-validation-draft`用于以下场景：

- Evidence和任务状态必须在完整矩阵通过后才能准确生成；
- 需要验证三平台package、Electron E2E、Coverage或真实Performance，但尚不允许自动合并；
- 合并前需要根据完整矩阵结果继续修改同一Head链。

完成完整Draft验证并把Evidence、Runtime、任务卡等收口到同一Head后，才转Ready。Ready合并前的永久工程检查为：

```text
pr-policy
+ quality / quality
+ security
+ performance
```

- PR Policy：验证`work → main`、同仓库来源、唯一开放PR和永久自动化布局。
- Quality：静态、Unit、Integration、Migration、Coverage、Electron E2E、Build和三平台package smoke按路径路由。
- Security：凭据扫描始终执行，Ready或`full-validation-draft`按风险执行完整历史扫描、依赖审计与应用安全。
- Performance：Ready或`full-validation-draft`对代码变更执行真实性能预算与AI协议基线。

## 5. Controlled Merge与Main Verification

Controlled Merge必须确认：PR为Ready、Head未移动、Head为`work`、Base为`main`、PR未落后main、无阻断审查、`required-checks.json`中的全部永久检查属于同一Head且成功。合并方式固定为Squash并绑定`expected_head_sha`。

Draft即使使用`full-validation-draft`取得全部绿色工程结果，也不得被Controlled Merge合并。该模式的目的就是在“完整验证”和“允许合并”之间建立明确隔离层。

Main Verification核对最终main SHA、来源PR、来源work Head和来源永久门禁，在最终main执行一致性检查，并发布`main-verification`及任务验证状态。

## 6. 任务有效状态与Release边界

PR Head中的Runtime最高声明到`IMPLEMENTED`：

```text
IMPLEMENTED + 任务验证状态缺失
→ VERIFICATION_PENDING

IMPLEMENTED + 来源绑定一致 + task-verification/<TASK-ID>成功
→ VERIFIED
```

任务依赖、Evidence扫描和下一任务启动读取有效任务状态。产品Release资格独立读取当前`main`的`main-verification`、产品门禁、三平台产物完整性和发行信任证据，不从Task Runtime推导发布资格。

## 7. Work Synchronization

Main Verification成功后，工作流确认受检main仍是当前main、来源PR已经合并、work仍等于来源受检Head或被自动删除、没有新work PR或新提交。全部满足后以CAS保护将`work`同步到已验证main；条件不满足时停止并报告。

## 8. Evidence

```text
docs/test-evidence/<TASK-ID>/
├─ summary.md
├─ commands.txt
├─ known-risks.md
└─ manifest.json
```

Evidence必须绑定真实受检work提交。失败、跳过和环境限制必须如实记录；合并后的main SHA与验证运行由提交状态闭环。需要完整矩阵结果才能生成的Evidence，应先使用`full-validation-draft`完成验证，再把Evidence写回同一PR，最后转Ready。

## 9. 测试路由

| 变更范围 | 必要追加验证 |
|---|---|
| Migration、Repository、事务 | Migration、Integration |
| Main、Preload、IPC、路径、恢复、安全 | Security、Electron E2E |
| Editor、Candidate、Revision、Lock | Unit、Integration、Electron E2E |
| Prompt、Provider、Eval | Eval、Integration，必要时Performance |
| 性能、DPI、FTS、搜索、流式处理 | Performance，必要时Electron E2E |
| 治理、发布与任务状态 | Unit、PR Policy、Release Check |

风险不确定时按更高风险执行。

## 10. 完成真实性

完成声明前必须确认：修改存在于真实PR Head；入口、导出、IPC、Migration、UI和测试没有断链；声明通过的命令真实成功；完整验证与Evidence绑定同一实现链；Controlled Merge与Main Verification绑定同一来源；任务有效Verified；`work`已同步到已验证`main`；并重新读取最终分支和提交状态。
