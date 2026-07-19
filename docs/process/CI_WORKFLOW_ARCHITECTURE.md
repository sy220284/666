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
| `Controlled Merge` | 任一永久检查成功完成 | 聚合当前Head SHA的六项永久检查，复核Ready全量代次并squash合并 | 否 |
| `Main Verification` | Controlled Merge或合并事件幂等调度 | 在最终main SHA上重新执行完整Linux质量门并发布最终提交状态 | `main-verification` |
| `Repository Governance` | 每周、手动 | 审计自动化清单和main原生Ruleset是否缺失或漂移 | 否 |
| `Branch Hygiene` | 每周、手动 | 默认报告分支状态；手动apply时删除确定安全的分支 | 否 |
| `Release` | 手动 | 发布门、三平台构建打包和Release | 否 |

`quality-core.yml`由Quality、Main Verification和Release复用，不单独设为必需检查。日常Quality不重复独立Security和Performance套件；最终main与Release重新启用全部验证。

## 2. Draft快速反馈

Draft PR保留六个固定检查名称，只执行低成本验证：

```text
PR Policy
+ Task Governance
+ Evidence
+ Quality：task、workspace、boundary、format、lint、typecheck
+ Security：快速凭据扫描
+ Performance：明确延期到Ready
```

`ready_for_review`在同一Head SHA上重新运行完整Quality、Security和Performance；`converted_to_draft`取消旧重型运行并恢复轻量模式。Draft阶段的绿色状态不能授权合并。

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

Controlled Merge监听六项永久工作流的成功完成事件。任一检查单独重跑恢复成功后，都会重新进入统一聚合判断。

并发组按`workflow_run.head_sha`隔离：同一Head SHA只保留最新聚合运行，后到成功事件取消旧聚合；不同PR和不同SHA互不阻塞。聚合运行仍从`main`读取已审计脚本，不能执行PR分支中的合并代码。

聚合器分页读取Check Runs，并以`created_at`和Check Run ID判定同名检查的最新结果。Quality、Security和Performance还会读取各自最新Actions运行及全部Jobs：

- Quality必须实际完成Static、Unit、Integration、Migration、Electron E2E、Build、Package Smoke和聚合Job；
- Security必须实际完成依赖审计、凭据扫描、应用安全测试和聚合Job；
- Performance必须实际执行并通过性能预算步骤。

最新运行若仍是Draft快速路径，即使聚合检查显示成功，也会判为等待Ready全量代次。转回Draft产生的新快速运行会覆盖更早的Ready全量运行。

同时要求：头分支未落后main、没有Changes Requested、没有未解决线程，并在合并前重新读取PR状态、Head SHA和main状态。受控合并固定使用squash，并向Merge API绑定受检SHA。

PR Policy内嵌治理测试覆盖代次排序、Draft/Ready识别、性能步骤执行、失败状态、分页解析及恢复触发配置。

## 4. 主线验证

Controlled Merge合并后显式调度`main-verification.yml`；`Post Merge Verification Dispatcher`对已合并PR进行幂等兜底调度。两条入口共享去重逻辑，不会为同一main SHA重复创建验证运行。

Main Verification负责：

1. 核对最终main SHA与输入SHA；
2. 核对来源PR、来源Head SHA和merge SHA；
3. 分页读取六项永久检查并确认最新结果成功；
4. 再次确认Quality、Security和Performance来源于Ready全量运行；
5. 在最终main提交上重新执行完整Quality Core；
6. 以`main-verification`上下文写回最终SHA状态。

`main-verification`不加入合并前Ruleset，避免循环依赖。下一次合并只等待当前main的最终状态，不依赖历史任务专用Closeout流程。

## 5. 权限边界

- 常规工作流使用只读权限，Checkout关闭凭证持久化。
- 禁止`pull_request_target`、`repository_dispatch`和业务工作流直接写main。
- Controlled Merge只拥有读取检查、读取Actions运行、调用Merge API和调度固定主线工作流所需权限。
- Controlled Merge中不得保留任务、分支、Actions Run或提交SHA的历史专用逻辑。
- Main Verification仅以`statuses: write`发布最终SHA状态，不能修改仓库内容。
- Release发布Job使用独立`release`环境和最小写权限。

## 6. 证据与诊断

- Evidence按发生变化的任务目录逐项校验。
- Quality Core和Performance仅在失败时上传诊断，默认保留7天。
- Quality聚合失败时额外捕获format、lint和typecheck日志。
- Actions Artifact只用于定位失败，不能替代版本化任务证据。

## 7. 安全与性能

- Draft阶段保留快速凭据扫描；Ready阶段执行依赖审计和应用安全测试。
- `pnpm test:perf`保持独立必需检查。
- Main Verification和Release再次执行安全与性能套件。

## 8. 分支生命周期

永久保留`main`、当前活动任务分支、开放PR分支和`release/*`。每周任务只生成报告；实际删除必须手动触发并设置`apply=true`。分支删除由Branch Hygiene统一负责，不在合并配置中声明未实现行为。

## 9. Repository Ruleset审计

`Repository Governance`核验规则集状态、默认分支目标、删除与强推保护、线性历史、PR、会话解决、严格状态检查、精确检查名称和空Bypass列表。

## 10. 永久自动化清单

`.github/workflows/`和`.github/governance/`采用封闭白名单，不允许通过增加一个名称看似正常的额外文件绕过“永久工作流必须通用”的约束。

`PR Policy`与`Repository Governance`共同执行`scripts/automation-layout-policy.mjs`，要求：

1. 工作流目录只能包含本文件第1节列出的永久工作流及其可复用核心；
2. Governance目录只能包含已登记的通用检查、配置和调度辅助文件；
3. 工作流与治理辅助代码不得硬编码任务ID、任务分支、固定PR号或固定PR分支；
4. 新增永久能力必须在同一治理PR中显式更新清单、架构文档和策略测试；
5. 一次性恢复、迁移或Closeout逻辑不得长期留在默认分支。

自动化清单失败属于治理硬失败，不能以任务完成、历史兼容或工作流当前不触发为理由豁免。

## 11. Release

Release只允许手动触发，要求main引用、发布任务门、完整Quality、三平台Build后Package、独立发布环境和SHA-256资产清单。
