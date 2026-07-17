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

## 合并方式

- Allow squash merging：开启
- Allow rebase merging：关闭
- Allow merge commits：关闭
- Allow auto-merge：开启
- Automatically delete head branches：开启

自动合并仍受全部必需检查、Draft状态、Changes Requested、未解决线程和头SHA一致性限制，不得成为绕过Ruleset的旁路。

## Release环境

在`Settings → Environments`创建`release`环境：

- Required reviewers：作者本人或维护者
- Deployment branches：仅`main`
- 不存储GitHub PAT；使用最小权限`GITHUB_TOKEN`

## 漂移审计

`Repository Governance`每周读取GitHub原生规则并与仓库配置比较。缺失或漂移时上传报告并发出警告；使用具备管理员权限的`REPO_ADMIN_TOKEN`执行`scripts/ruleset-policy.mjs apply`可应用配置。

## 负向验证

1. 本地或API直接推送`main`应被GitHub拒绝。
2. 任一必需检查失败、缺失或未完成时PR应无法合并。
3. Draft、Changes Requested或未解决线程应阻止自动合并。
4. Actions Token尝试直接写`main`应被规则集拒绝。

仓库代码不能自行授予管理员级权限；Ruleset和仓库Auto-merge开关必须由仓库管理员实际启用。
