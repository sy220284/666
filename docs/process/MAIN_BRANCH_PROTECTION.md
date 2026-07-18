# main分支永久保护配置

> 本文定义GitHub仓库设置层的永久门禁。工作流可以检测配置漂移；真正阻止管理员、本地Git或外部工具绕过PR，仍依赖GitHub Repository Ruleset。

## 必须启用

在仓库`Settings → Rules → Rulesets`中为默认分支创建Active规则集，配置由`.github/governance/main-protection.json`和`required-checks.json`定义：

- Restrict deletions：开启
- Block force pushes：开启
- Require a pull request before merging：开启
- Required approvals：0（单作者仓库）
- Dismiss stale approvals：开启
- Require conversation resolution：开启
- Require status checks to pass：开启
- Require branches to be up to date before merging：开启
- Require linear history：开启
- Bypass list：留空，不给Actions或机器人绕过权限

## 必需状态检查

精确名称：

```text
pr-policy
task-governance
quality / quality
security
performance
evidence
```

矩阵子Job不单独设置为必需检查，由各自聚合门负责统一判定。

`main-verification`是合并后附着到最终squash提交的复核状态，不加入PR Ruleset必需检查。将它加入合并前检查会造成循环依赖：PR必须先合并才能产生该检查，但Ruleset又会等待该检查后才允许合并。

## 合并方式

- Allow squash merging：开启
- Allow rebase merging：关闭
- Allow merge commits：关闭
- Allow auto-merge：开启
- Automatically delete head branches：开启

自动合并仍受全部必需检查、Draft状态、Changes Requested、未解决线程、头SHA一致性以及“未落后于当前main”限制，不得成为绕过Ruleset的旁路。

Auto Merge使用全仓库串行并发组，避免两个已通过PR同时读取同一main基线并竞争合并。合并成功后只允许通过固定的`main-verification.yml`进行`workflow_dispatch`；该工作流校验最终SHA、来源PR和历史门禁，再运行完整Linux复核。

## Main Verification权限

- Auto Merge：`actions: write`仅用于调度固定工作流；同时保留`checks: read`、`contents: write`和`pull-requests: write`。
- Main Verification：使用`contents: read`、`checks: read`和`pull-requests: read`完成只读复核；仅使用`statuses: write`把最终成功或失败状态写回目标main SHA。
- 不使用PAT，不使用`repository_dispatch`，不允许工作流直接推送main。
- 工作流输入必须包含最终main SHA、来源PR编号和来源头SHA。
- 工作流运行SHA、PR的`merge_commit_sha`、来源头SHA及六项永久检查必须相互一致。
- 聚合结果必须以`main-verification`上下文写入Commit Status；成功和失败都必须可见，且状态链接指向对应Actions Run。

## Release环境

在`Settings → Environments`创建`release`环境：

- Required reviewers：作者本人或维护者
- Deployment branches：仅`main`
- 不存储GitHub PAT；使用最小权限`GITHUB_TOKEN`

## 漂移审计

`Repository Governance`每周读取GitHub原生规则并与仓库配置进行完整比较。审计范围包括：

- 规则集存在、目标为默认分支且状态为Active；
- 禁止删除、禁止强推、要求线性历史；
- 要求PR、清除旧审查、解决会话；
- 状态检查要求分支基于最新main，且检查名称与配置完全一致；
- Bypass列表为空。

任一项缺失或漂移都会使工作流失败，并上传包含具体差异原因的报告。使用具备管理员权限的`REPO_ADMIN_TOKEN`执行`scripts/ruleset-policy.mjs apply`可应用配置；没有该Token时审计仍可使用仓库Token只读运行。

## 负向验证

1. 本地或API直接推送`main`应被GitHub拒绝。
2. 任一必需检查失败、缺失或未完成时PR应无法合并。
3. Draft、Changes Requested或未解决线程应阻止自动合并。
4. 落后于当前`main`的PR即使历史检查成功，也不得自动合并。
5. Actions Token尝试直接写`main`应被规则集拒绝。
6. Ruleset缺失、状态非Active、检查名单漂移或存在Bypass actor时，治理审计必须失败。
7. Auto Merge成功后未产生针对最终SHA的`main-verification`运行，应视为主线复核链路故障。
8. Main Verification输入SHA、来源PR、来源头SHA或永久检查任一不一致时必须失败。
9. Main Verification完成后未在最终SHA写入`main-verification`成功或失败状态，应视为状态发布故障。

仓库代码不能自行授予管理员级权限；Ruleset和仓库Auto-merge开关必须由仓库管理员实际启用。
