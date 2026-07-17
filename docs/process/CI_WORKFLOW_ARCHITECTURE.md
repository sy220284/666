# WorldForge CI与永久门禁架构

## 1. 正式工作流

| 工作流 | 触发 | 职责 | 必需检查 |
|---|---|---|---|
| `PR Policy` | PR→main | 校验真实PR分支、治理白名单和CI策略漂移 | `pr-policy` |
| `Task Governance` | PR→main、main | 校验任务状态、镜像、修改范围和证据规则 | `task-governance` |
| `Quality` | PR→main、main | 静态检查、Unit、Integration、Migration、E2E、Build和Package Smoke | `quality / quality` |
| `Security` | PR→main、main | 高危依赖、凭据、IPC、路径、Renderer和数据库安全 | `security` |
| `Performance` | PR→main、main、手动 | 性能预算和AI评估基线 | `performance` |
| `Evidence` | PR→main、main | 未改证据时允许延期；修改证据时要求完整证据包 | `evidence` |
| `Repository Governance` | 每周、手动 | 审计GitHub原生main规则是否缺失或漂移 | 否 |
| `Branch Hygiene` | 每周、手动 | 分类活动、开放PR、已合并和孤立分支 | 否 |
| `Release` | 手动 | 发布门、三平台Build+Package、校验和与Release | 否 |

`quality-core.yml`是可复用实现，不单独设置为必需检查。

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

同时要求PR不是Draft、头分支基于最新main、没有Changes Requested、没有未解决审查线程，并且合并时头SHA与已检查SHA完全一致。

代码和常规工作流不得执行`git push main`。合并操作只能针对已满足上述条件的Pull Request，并固定使用squash方式。

## 3. 权限边界

- 常规工作流默认`contents: read`。
- Checkout统一设置`persist-credentials: false`。
- 禁止`pull_request_target`、`repository_dispatch`及业务工作流直写main。
- Release发布Job使用独立`release`环境和最小写权限。
- 仓库原生Ruleset负责阻止管理员、本地Git或外部工具绕过CI。

## 4. 证据策略

- 实现PR未修改活动任务证据目录时，Evidence门记录为延期通过。
- 一旦修改`docs/test-evidence/<ACTIVE_TASK>/`，必须同时提供摘要、命令、风险、人工复核、质量矩阵、测试结果、截图清单及总清单。
- 任务关闭和追踪矩阵更新必须与完整证据在同一PR中完成。

## 5. 安全与性能

- `pnpm audit --audit-level=high`阻断高危依赖。
- 凭据扫描阻断GitHub、云厂商、Slack和私钥模式。
- `tests/security`验证IPC、路径、只读、Renderer边界及数据库安全。
- `pnpm test:perf`作为独立永久检查，避免性能问题被普通测试矩阵掩盖。

## 6. 分支生命周期

永久保留`main`、当前活动任务分支、开放PR分支和`release/*`。已合并、已关闭或相对main没有独有提交的分支可安全删除；存在独有提交且无PR的分支只报告，不自动删除。

## 7. Release

Release只允许手动触发，要求当前引用为main、发布任务门通过、完整Quality通过、三个平台各自在本Job内Build后Package、发布Job进入`release`环境、已有Tag或Release拒绝覆盖，并生成SHA-256资产清单。
