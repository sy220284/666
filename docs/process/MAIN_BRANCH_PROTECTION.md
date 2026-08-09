# main与work分支永久保护配置

> 本文定义GitHub仓库设置层的永久门禁。工作流负责检测漂移，真正阻止绕过依赖GitHub Repository Ruleset。

## 1. main规则集

为默认分支`main`配置Active Ruleset：

- 禁止删除；
- 禁止强推；
- 要求Pull Request；
- Required approvals：0；
- 清除旧审查；
- 要求解决会话；
- 要求状态检查成功；
- 要求分支基于最新main；
- 要求线性历史；
- Bypass列表为空。

必需检查：

```text
pr-policy
task-governance
quality / quality
security
performance
evidence
```

`trusted-governance`采用两步引导：先合并base侧只读工作流与策略，确认它能在后续PR产生可信检查；随后把它加入`required-checks.json`并应用Ruleset。引导完成前不得启动产品实现任务。

`main-verification`是合并后状态，不能加入合并前必需检查。

## 2. 合并方式

- Allow squash merging：开启；
- Allow merge commits：关闭；
- Allow rebase merging：关闭；
- Allow auto-merge：开启；
- Automatically delete head branches：建议关闭，避免GitHub删除长期`work`；即使被删除，Work Synchronization也只能在来源验证成功后重建。

Controlled Merge固定使用Squash，并向Merge API绑定受检Head SHA。

## 3. work规则

仓库长期只允许`main`和`work`。为`work`配置规则：

- 禁止删除或限制删除；
- 禁止普通用户强推；
- 允许`Work Synchronization`在严格CAS条件下更新引用；
- 禁止通过`work`之外的分支创建正式PR；
- 同一时刻最多一个`work → main` PR。

仓库原生Ruleset若无法按工作流身份精确授权，则保留work删除保护，由Repository Governance持续审计；Work Synchronization失败时由管理员按报告处理，不得扩大Bypass列表。

## 4. 权限边界

### Controlled Merge

```text
actions: write
checks: read
contents: write
pull-requests: write
```

仅调用Merge API和调度固定Main Verification，不得直接推送main。

### Main Verification

```text
contents: read
checks: read
pull-requests: read
statuses: write
```

只读取来源、执行静态复核并发布提交状态。

### Work Synchronization

```text
contents: write
pull-requests: read
```

只允许：

- 读取main、work和来源PR；
- 在work不存在时创建`refs/heads/work`；
- 在work仍等于来源受检Head时，将work重置到已验证main。

不得修改文件、main、Ruleset、Release或其他分支。

### Branch Hygiene

```text
contents: read
```

只审计分支清单，不执行同步或删除。

## 5. 负向验证

1. 直接推送main应被拒绝。
2. 任一必需检查失败、缺失或未完成时PR不得合并。
3. 非`work → main` PR应由PR Policy拒绝。
4. 第二个开放work PR应被拒绝。
5. 仓库出现第三个分支时Branch Hygiene应失败。
6. Main Verification输入SHA、来源PR或来源Head不一致时应失败。
7. work在合并后出现新提交时Work Synchronization必须拒绝覆盖。
8. 当前main已推进时旧验证运行不得同步work。
9. Main Verification失败时不得触发work同步。
10. Work Synchronization不得依赖管理员PAT或修改Ruleset。
11. 修改Head Runtime扩大`allowedPaths`、缩小`forbiddenPaths`或移除依赖时，base侧Trusted Governance必须失败。
12. 新任务实现与新任务授权不得出现在同一个PR。

## 6. 漂移审计

Repository Governance每周比较仓库原生配置与：

```text
.github/governance/main-protection.json
.github/governance/required-checks.json
```

任一Ruleset缺失、状态非Active、检查名单漂移、存在Bypass actor、开放非Squash合并或允许直接写main时均应失败。
