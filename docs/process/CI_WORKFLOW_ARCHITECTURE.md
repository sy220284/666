# WorldForge CI与永久门禁架构

## 1. 正式工作流

| 工作流 | 触发 | 职责 | 必需检查 |
|---|---|---|---|
| `PR Policy` | PR→main | 校验真实PR分支、治理白名单和CI策略漂移 | `pr-policy` |
| `Task Governance` | PR→main、main | 校验任务状态、镜像、修改范围和证据规则 | `task-governance` |
| `Quality` | PR→main、main | 静态检查、Unit、Integration、Migration、E2E、Build和Package Smoke | `quality / quality` |
| `Security` | PR→main、main | 高危依赖、凭据、IPC、路径、Renderer和数据库安全 | `security` |
| `Performance` | PR→main、main、手动 | 性能预算和AI评估基线 | `performance` |
| `Evidence` | PR→main、main | 从Git差异提取全部变更任务证据目录并逐一验证 | `evidence` |
| `Auto Merge` | 永久检查完成 | 重新核验头SHA、最新main、全部必需检查和审查阻塞后squash合并；随后调度最终主线复核 | 否 |
| `Main Verification` | Auto Merge通过`workflow_dispatch`调度 | 校验最终main SHA、来源PR及六项永久检查来源，再对最终提交执行完整Linux质量、安全、性能、E2E、构建和打包复核 | `main-verification`（合并后状态，不参与本次PR合并判据） |
| `Repository Governance` | 每周、手动 | 严格审计GitHub原生main规则是否缺失或漂移 | 否 |
| `Branch Hygiene` | 每周、手动 | 默认只报告分支状态；仅手动apply时删除确定安全的分支 | 否 |
| `Release` | 手动 | 发布门、全量质量复核、三平台Build+Package、校验和与Release | 否 |

`quality-core.yml`是可复用实现，不单独设置为必需检查。日常`Quality`不重复运行已由`Security`和`Performance`负责的测试；`Main Verification`与`Release`调用该工作流时显式重新启用安全与性能复核。

## 2. 永久合并判据

进入`main`前必须同时通过：

```text
pr-policy
+ task-governance
+ quality / quality
+ security
+ performance
+ evidence
```

同时要求PR不是Draft、头分支未落后于当前main、没有Changes Requested、没有未解决审查线程，并且合并时头SHA与已检查SHA完全一致。

代码和常规工作流不得执行`git push main`。合并操作只能针对已满足上述条件的Pull Request，并固定使用squash方式。

## 3. 合并后主线复核

Auto Merge使用仓库`GITHUB_TOKEN`调用Merge API。GitHub为防止递归，不会因该Token产生的普通`push`事件再次启动工作流，因此PR检查不会自动附着到新生成的squash提交。

受控合并成功后，Auto Merge必须：

1. 取得Merge API返回的完整main提交SHA；
2. 使用`actions: write`权限调度固定的`main-verification.yml`；
3. 传入最终SHA、来源PR编号和已经通过检查的PR头SHA；
4. 在重复触发或Auto Merge重跑时先查询现有Workflow Run，避免重复调度；
5. 由`Main Verification`确认工作流运行SHA等于预期SHA；
6. 从GitHub读取已合并PR，确认目标分支、来源头SHA和`merge_commit_sha`一致；
7. 重新确认来源PR六项永久检查的最新结果全部成功；
8. 对最终main提交运行完整Linux Quality Core；
9. 生成`main-verification`绿色检查，使main页面明确显示最终提交已复核。

`main-verification`是合并后状态，不加入当前PR的Ruleset必需检查，否则会形成“尚未合并就等待合并后检查”的循环依赖。

## 4. 权限边界

- 常规工作流默认`contents: read`。
- Checkout统一设置`persist-credentials: false`。
- 禁止`pull_request_target`、`repository_dispatch`及业务工作流直写main。
- `Auto Merge`拥有检查读取、PR合并、必要内容写和仅用于调度固定主线复核工作流的`actions: write`权限；它不读取PR分支脚本。
- `Main Verification`仅拥有`contents: read`、`checks: read`和`pull-requests: read`，不能修改仓库。
- Release发布Job使用独立`release`环境和最小写权限。
- 仓库原生Ruleset负责阻止管理员、本地Git或外部工具绕过CI。

## 5. 证据策略

- 实现PR未修改任何`docs/test-evidence/<TASK-ID>/`目录时，Evidence门记录为延期通过。
- Git差异中出现一个或多个任务证据目录时，逐个要求摘要、命令、风险、人工复核、质量矩阵、测试结果、截图清单及总清单完整。
- 任务切换后仍以实际发生变化的旧任务证据目录为准，不依赖最终`ACTIVE_TASK`。
- 任务关闭和追踪矩阵更新必须与完整证据在同一PR中完成。

## 6. 安全与性能

- `pnpm audit --audit-level=high`阻断高危依赖。
- 凭据扫描阻断GitHub、云厂商、Slack和私钥模式。
- `tests/security`验证IPC、路径、只读、Renderer边界及数据库安全。
- `pnpm test:perf`作为独立永久检查，避免性能问题被普通测试矩阵掩盖。
- 日常Quality不重复上述两项；Main Verification和Release显式重新运行，防止最终提交或发布只依赖历史结果。

## 7. 分支生命周期

永久保留`main`、当前活动任务分支、开放PR分支和`release/*`。只有已合并分支，或相对main没有任何独有提交的分支，才可列为删除候选。

每周定时任务始终只生成报告。实际删除必须由维护者手动触发并设置`apply=true`；关闭但未合并且仍有独有提交的分支只能进入人工复核。

## 8. Repository Ruleset审计

`Repository Governance`核验：规则集存在且Active、目标为默认分支、禁止删除、禁止强推、要求线性历史、要求PR、会话解决、严格状态检查、精确检查名称以及空Bypass列表。任一项缺失或漂移均使审计失败并保留报告。

## 9. Release

Release只允许手动触发，要求当前引用为main、发布任务门通过、完整Quality通过、三个平台各自在本Job内Build后Package、发布Job进入`release`环境、已有Tag或Release拒绝覆盖，并生成SHA-256资产清单。
