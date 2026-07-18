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
| `Auto Merge` | 永久检查完成 | 复核PR状态并squash合并，随后调度主线复核 | 否 |
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

`ready_for_review`事件会在同一头SHA上重新运行Quality、Security和Performance的完整门禁；`converted_to_draft`会取消旧运行并恢复轻量模式。

Draft阶段的绿色状态不能授权合并。Auto Merge仍实时检查`pull.draft`，只有非Draft PR才能进入main。

## 3. 合并判据

进入main前必须同时通过：

```text
pr-policy
+ task-governance
+ quality / quality
+ security
+ performance
+ evidence
```

同时要求：头分支未落后main、没有Changes Requested、没有未解决线程，并且合并时头SHA与受检SHA一致。代码和常规工作流不得直接写入main，受控合并固定使用squash。

## 4. 唯一主线验证入口

Auto Merge通过仓库令牌调用Merge API后，普通`push`事件不会可靠地再次启动工作流。因此受控合并完成后必须显式调度`main-verification.yml`。

`Quality`、`Security`、`Performance`、`Evidence`和`Task Governance`只服务PR，不再监听`push main`。最终main提交只由Main Verification复核，避免双入口、空白状态和重复全量验证。

Main Verification负责：

1. 核对最终main SHA与输入SHA；
2. 核对来源PR、来源头SHA和merge SHA；
3. 核对来源PR六项永久检查均为最新成功结果；
4. 在最终main提交上重新执行完整Quality Core；
5. 以`main-verification`上下文把成功或失败Commit Status写回最终SHA，并链接对应Actions Run。

Auto Merge重复触发时先查询对应最终SHA是否已有Main Verification；main已经前进时跳过过期SHA。`main-verification`不加入本次PR的Ruleset，否则会形成合并前等待合并后检查的循环。

## 5. 权限边界

- 常规工作流使用只读权限，Checkout关闭凭证持久化。
- 禁止特权PR触发器、仓库事件旁路及业务工作流直接写main。
- Auto Merge只拥有读取检查、受控合并及调度固定主线工作流所需权限，并从main读取已审计脚本。
- Main Verification使用只读权限完成复核，仅以`statuses: write`发布最终SHA状态，不能修改仓库内容。
- Release发布Job使用独立`release`环境和最小写权限。
- 仓库原生Ruleset负责阻止管理员、本地Git或外部工具绕过CI。

## 6. 证据与诊断

- 实现PR未修改`docs/test-evidence/<TASK-ID>/`时，Evidence按实现优先模式记录延期通过。
- Git差异中出现一个或多个任务证据目录时，逐个校验摘要、命令、风险、人工复核、质量矩阵、测试结果、截图清单和Manifest。
- 任务切换后仍以实际发生变化的证据目录为准，不依赖最终ACTIVE_TASK。
- 任务关闭和追踪矩阵Verified更新必须与完整证据在同一PR中完成。
- Quality Core和Performance仅在失败时上传日志、截图、trace及测试结果，默认保留7天。
- Actions Artifact只用于定位失败，不能替代版本化任务证据。

## 7. 安全与性能

- Draft阶段仍执行仓库快速扫描，防止敏感内容进入远端历史。
- Ready阶段执行`pnpm audit --audit-level=high`和应用安全测试。
- `tests/security`覆盖IPC、路径、只读、Renderer边界及数据库安全。
- `pnpm test:perf`保持独立必需检查，避免性能回退被普通测试矩阵掩盖。
- Main Verification和Release再次执行安全与性能套件，最终提交和发布产物不依赖历史结果。

## 8. 分支生命周期

永久保留`main`、当前活动任务分支、开放PR分支和`release/*`。只有已合并分支，或相对main没有任何独有提交的分支，才可列为删除候选。

每周定时任务只生成报告。实际删除必须由维护者手动触发并设置`apply=true`；关闭但未合并且仍有独有提交的分支只能进入人工复核。

## 9. Repository Ruleset审计

`Repository Governance`核验：规则集存在且Active、目标为默认分支、禁止删除、禁止强推、要求线性历史、要求PR、会话解决、严格状态检查、精确检查名称以及空Bypass列表。任一项缺失或漂移均使审计失败并保留报告。

## 10. Release

Release只允许手动触发，要求当前引用为main、发布任务门通过、完整Quality通过、三个平台各自在本Job内Build后Package、发布Job进入`release`环境、已有Tag或Release拒绝覆盖，并生成SHA-256资产清单。
