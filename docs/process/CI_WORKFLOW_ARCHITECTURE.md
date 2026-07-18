# WorldForge CI与永久门禁架构

## 1. 工作流分层

| 工作流 | 触发 | 职责 | 必需检查 |
|---|---|---|---|
| `PR Policy` | PR→main | 分支、治理白名单和CI策略 | `pr-policy` |
| `Task Governance` | PR→main | 任务状态、允许路径和证据结构 | `task-governance` |
| `Quality` | PR→main | Draft跑静态检查；Ready后跑测试、E2E、Build和Package Smoke | `quality / quality` |
| `Security` | PR→main | Draft保留快速扫描；Ready后跑依赖和应用安全套件 | `security` |
| `Performance` | PR→main、手动 | Draft返回延期状态；Ready后跑性能基线 | `performance` |
| `Evidence` | PR→main | 校验发生变化的任务证据包 | `evidence` |
| `Auto Merge` | `Quality`成功完成 | 聚合当前头SHA的六项永久检查，复核PR状态并squash合并，随后调度主线复核 | 否 |
| `Main Verification` | Auto Merge显式调度 | 在最终main SHA上重新执行完整Linux质量门，并发布最终提交状态 | `main-verification` |
| `Repository Governance` | 每周、手动 | 审计main原生Ruleset是否缺失或漂移 | 否 |
| `Branch Hygiene` | 每周、手动 | 默认报告分支状态；手动apply时删除确定安全的分支 | 否 |
| `Release` | 手动 | 发布门、三平台构建打包和Release | 否 |

`quality-core.yml`是Quality、Main Verification和Release共用的底层实现，不单独设为必需检查。日常Quality不重复Security和Performance套件；最终main与Release会重新启用全部验证。

## 2. Draft快速反馈

Draft PR保留六个固定检查名称，但只执行低成本验证：

```text
PR Policy
+ Task Governance
+ Evidence
+ Quality：task、workspace、boundary、format、lint、typecheck
+ Security：快速扫描
+ Performance：明确延期到Ready
```

`ready_for_review`事件会在同一头SHA上重新运行Quality、Security和Performance的完整门禁；`converted_to_draft`会取消旧运行并恢复轻量模式。Draft阶段的绿色状态不能授权合并。

## 3. 合并判据与代次聚合

进入main前必须同时通过：

```text
pr-policy
+ task-governance
+ quality / quality
+ security
+ performance
+ evidence
```

Auto Merge只监听`Quality`成功完成，不再被六个工作流分别唤醒。启动后读取当前PR头SHA的全部Check Runs，以`created_at`和Check Run ID判定最新代次，并等待仍在排队或运行的检查完成。较早的Draft绿色结果不能覆盖较新的Ready排队结果。

任一永久检查失败时记录阻断原因并结束；检查长时间未形成完整结果时以超时失败暴露工作流异常。同时要求头分支未落后main、没有Changes Requested、没有未解决线程，并且合并时头SHA与受检SHA一致。受控合并固定使用squash。

## 4. 唯一主线验证入口

Auto Merge受控合并后显式调度`main-verification.yml`。`Quality`、`Security`、`Performance`、`Evidence`和`Task Governance`只服务PR，不再监听`push main`。

Main Verification负责：

1. 核对最终main SHA与输入SHA；
2. 核对来源PR、来源头SHA和merge SHA；
3. 以`created_at`和Check Run ID重新确认六项永久检查的最新代次均成功；
4. 在最终main提交上重新执行完整Quality Core；
5. 以`main-verification`上下文把成功或失败Commit Status写回最终SHA。

`main-verification`不加入合并前Ruleset，避免循环依赖。

## 5. 权限边界

- 常规工作流使用只读权限，Checkout关闭凭证持久化。
- 禁止特权PR触发器、仓库事件旁路及业务工作流直接写main。
- Auto Merge只拥有读取检查、受控合并及调度固定主线工作流所需权限。
- Main Verification仅以`statuses: write`发布最终SHA状态，不能修改仓库内容。
- Release发布Job使用独立`release`环境和最小写权限。

## 6. 证据与诊断

- 任务证据继续由Evidence按发生变化的任务目录逐项校验。
- Quality Core和Performance仅在失败时上传诊断，默认保留7天。
- Quality聚合失败时额外运行只读诊断Job，分别捕获format、lint和typecheck日志，修复后置静态失败无Artifact的问题。
- Actions Artifact只用于定位失败，不能替代版本化任务证据。

## 7. 安全与性能

- Draft阶段保留仓库快速扫描；Ready阶段执行依赖审计和应用安全测试。
- `pnpm test:perf`保持独立必需检查。
- Main Verification和Release再次执行安全与性能套件。

## 8. 分支生命周期

永久保留`main`、当前活动任务分支、开放PR分支和`release/*`。每周任务只生成报告；实际删除必须手动触发并设置`apply=true`。

## 9. Repository Ruleset审计

`Repository Governance`核验规则集状态、默认分支目标、删除与强推保护、线性历史、PR、会话解决、严格状态检查、精确检查名称和空Bypass列表。

## 10. Release

Release只允许手动触发，要求main引用、发布任务门、完整Quality、三平台Build后Package、独立发布环境和SHA-256资产清单。
