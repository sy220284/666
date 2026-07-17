# main分支永久保护配置

> 本文定义GitHub仓库设置层的永久门禁。工作流只能检测违规，真正阻止管理员、本地Git或外部工具直推`main`，必须依靠GitHub Branch Protection或Repository Ruleset。

## 必须启用

在仓库`Settings → Rules → Rulesets`中为`main`创建Active规则集：

- Target branches：`main`
- Restrict deletions：开启
- Block force pushes：开启
- Require a pull request before merging：开启
- Required approvals：0（单作者仓库，保留人工点击合并）
- Dismiss stale approvals：开启
- Require conversation resolution：开启
- Require status checks to pass：开启
- Require branches to be up to date before merging：开启
- Require linear history：开启
- Bypass list：留空；不得给GitHub Actions或机器人绕过权限

## 必需状态检查

必须使用精确检查名称：

```text
pr-policy
task-governance
quality / quality
security
```

不要把矩阵子Job配置为单独必需检查，最终聚合门负责统一判定。

## 合并方式

仓库建议配置：

- Allow squash merging：开启
- Allow rebase merging：关闭
- Allow merge commits：关闭
- Allow auto-merge：关闭
- Automatically delete head branches：可开启；若未开启，按Branch Hygiene报告人工清理

## Release环境

在`Settings → Environments`创建`release`环境：

- Required reviewers：作者本人或维护者
- Prevent self-review：单作者仓库不启用
- Deployment branches：仅`main`
- Environment secrets：不存储GitHub PAT；使用最小权限`GITHUB_TOKEN`

## 验证方法

配置完成后进行三次负向验证：

1. 本地或API直接推送`main`应被GitHub拒绝。
2. 未通过任一必需检查的PR应无法合并。
3. GitHub Actions Token尝试写`main`应被规则集拒绝。

本文件进入`main`后仍需在GitHub设置页面实际启用规则集；仓库代码无法自行授予或修改管理员级规则。
