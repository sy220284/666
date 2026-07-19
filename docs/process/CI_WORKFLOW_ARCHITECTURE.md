# WorldForge CI与永久门禁架构

## 1. 工作流分层

| 工作流                  | 触发                 | 职责                                                                         | 必需检查            |
| ----------------------- | -------------------- | ---------------------------------------------------------------------------- | ------------------- |
| `PR Policy`             | PR→main              | 分支、治理白名单和CI策略                                                     | `pr-policy`         |
| `Task Governance`       | PR→main              | 任务状态、允许路径和证据结构                                                 | `task-governance`   |
| `Quality`               | PR→main              | Draft跑静态检查；Ready后跑测试、E2E、Build和Package Smoke                    | `quality / quality` |
| `Security`              | PR→main              | Draft保留快速扫描；Ready后跑依赖和应用安全套件                               | `security`          |
| `Performance`           | PR→main、手动        | Draft返回延期状态；Ready后跑性能基线                                         | `performance`       |
| `Evidence`              | PR→main              | 校验发生变化的任务证据包                                                     | `evidence`          |
| `Auto Merge`            | 任一永久检查成功完成 | 聚合当前头SHA的六项永久检查，复核Ready全量代次并squash合并，随后调度主线复核 | 否                  |
| `Main Verification`     | Auto Merge显式调度   | 在最终main SHA上重新执行完整Linux质量门，并发布最终提交状态                  | `main-verification` |
| `Repository Governance` | 每周、手动           | 审计main原生Ruleset是否缺失或漂移                                            | 否                  |
| `Branch Hygiene`        | 每周、手动           | 默认报告分支状态；手动apply时删除确定安全的分支                              | 否                  |
| `Release`               | 手动                 | 发布门、三平台构建打包和Release                                              | 否                  |

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

## 3. 合并判据、代次识别与恢复触发

进入main前必须同时通过：

```text
pr-policy
+ task-governance
+ quality / quality
+ security
+ performance
+ evidence
```

Auto Merge监听六项永久工作流的成功完成事件。任一检查单独重跑并恢复成功后，都会重新进入统一聚合判断，不依赖再次重跑Quality。

同一头SHA的聚合运行使用独立并发组；后到的恢复触发会取消同SHA的旧聚合，只保留一个有效判断。不同PR、不同SHA互不阻塞。

聚合器读取全部分页Check Runs，并以`created_at`和Check Run ID判定同名检查的最新结果。Quality、Security和Performance还会读取各自最新Actions运行及全部分页Jobs：

- Quality必须实际完成Static、Unit、Integration、Migration、Electron E2E、Build、Package Smoke和聚合Job；
- Security必须实际完成依赖审计、凭据扫描、应用安全测试和聚合Job；
- Performance必须实际执行并通过性能预算步骤。

因此，最新运行若仍是Draft快速路径，即使聚合检查显示成功，也只会被判为等待Ready全量代次。`converted_to_draft`产生的新快速运行会覆盖更早的Ready全量运行，重新转Ready后必须出现新的全量运行。

任一永久检查或全量代次失败时记录阻断原因并结束；失败检查单独重跑成功后由其成功事件恢复聚合。检查长时间未形成完整结果时以超时失败暴露工作流异常。

同时要求：头分支未落后main、没有Changes Requested、没有未解决线程，并且合并前重新读取PR状态与头SHA。Reviews、Review Threads和Check Runs均执行分页读取。受控合并固定使用squash，并向Merge API绑定受检SHA。

## 4. 唯一主线验证入口

Auto Merge受控合并后显式调度`main-verification.yml`。`Quality`、`Security`、`Performance`、`Evidence`和`Task Governance`只服务PR，不再监听`push main`。

Main Verification负责：

1. 核对最终main SHA与输入SHA；
2. 核对来源PR、来源头SHA和merge SHA；
3. 分页读取六项永久检查并确认最新结果成功；
4. 再次确认Quality、Security和Performance来源于Ready全量运行；
5. 在最终main提交上重新执行完整Quality Core；
6. 以`main-verification`上下文把成功或失败Commit Status写回最终SHA。

`main-verification`不加入合并前Ruleset，避免循环依赖。

## 5. 权限边界

- 常规工作流使用只读权限，Checkout关闭凭证持久化。
- 禁止特权PR触发器、仓库事件旁路及业务工作流直接写main。
- Auto Merge只拥有读取检查、读取Actions运行、受控合并及调度固定主线工作流所需权限。
- Main Verification使用`actions: read`复核来源运行，仅以`statuses: write`发布最终SHA状态，不能修改仓库内容。
- Release发布Job使用独立`release`环境和最小写权限。

## 6. 证据与诊断

- 任务证据继续由Evidence按发生变化的任务目录逐项校验。
- Quality Core和Performance仅在失败时上传诊断，默认保留7天。
- Quality聚合失败时额外运行只读诊断Job，分别捕获format、lint和typecheck日志。
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
