# main、work与governance分支永久保护配置

> 状态：Active  
> 本文定义GitHub仓库设置层的永久门禁。工作流负责检测漂移，真正阻止绕过依赖GitHub Repository Ruleset。

## 1. main规则集

为默认分支`main`配置Active Ruleset：

- 禁止删除与强推；
- 要求Pull Request；
- Required approvals：0；
- 清除旧审查并要求解决会话；
- 要求状态检查成功；
- 要求分支基于最新main；
- 要求线性历史；
- Bypass列表为空。

合并前永久必需检查只有：

```text
pr-policy
quality / quality
security
performance
```

`main-verification`属于合并后事实，不能加入合并前Ruleset。Task Governance与Evidence也不再作为独立永久Context；Evidence的Ready资格由Quality中的Release Audit承接。

## 2. 合并方式

- Allow squash merging：开启；
- Allow merge commits：关闭；
- Allow rebase merging：关闭；
- Allow auto-merge：按仓库Controlled Merge需要配置；
- Automatically delete head branches：关闭，`work`与`governance`均为永久集成分支。

Controlled Merge固定Squash，并向Merge API绑定受检Head SHA。正常流程禁止直接push main。

## 3. 集成分支规则

仓库长期且只允许：

```text
main
work
governance
```

职责：

- `work`：产品任务集成，PR为`work → main`；
- `governance`：仓库治理集成，PR为`governance → main`。

两条集成分支都应：

- 禁止删除或限制删除；
- 禁止普通用户强推；
- 每条lane最多一个开放PR；
- 允许Integration Branch Synchronization在严格受控条件下更新Ref。

若原生Ruleset无法按工作流身份精确授权，则保留删除/强推保护并由Repository Governance持续审计；同步失败不得通过扩大Bypass列表解决。

## 4. 权限边界

### Controlled Merge

```text
actions: write
checks: read
contents: write
pull-requests: write
```

只调用受控Merge API并调度Main Verification，不直接push main。

### Main Verification

```text
contents: read
checks: read
pull-requests: read
statuses: write
```

只读取来源、执行静态复核并发布提交状态。

### Integration Branch Synchronization

```text
contents: write
pull-requests: read
statuses: read
```

允许：

- 读取main、work、governance和来源PR；
- 缺少永久集成分支时从已验证main重建；
- 将来源lane在来源Head未变化时受控重置到已验证main；
- 将无开放PR、无独有提交、仅落后main的另一条lane非强制fast-forward到已验证main。

禁止：

- 修改仓库文件或main；
- 覆盖存在开放PR的兄弟lane；
- 强制覆盖含独有/分叉提交的兄弟lane；
- 修改Ruleset或Release。

### Branch Inventory / Hygiene

负责验证并修复分支库存为`main/work/governance`，不承担产品代码同步逻辑。

## 5. 负向验证

1. 直接推送main应被拒绝。
2. 任一四项永久检查失败、缺失或未完成时PR不得合并。
3. 非`work/governance → main` PR应由PR Policy拒绝。
4. 同一lane第二个开放PR应被拒绝。
5. 仓库出现第四条分支时Branch Inventory应报告并按策略修复。
6. Main Verification输入SHA、来源PR或来源Head不一致时应失败。
7. 来源lane合并后出现新提交或新PR时同步必须拒绝覆盖。
8. 兄弟lane有开放PR时应skip同步并保留Head。
9. 兄弟lane无PR但含独有/分叉提交时应fail-closed。
10. 当前main已推进时旧验证运行不得更新集成分支。
11. Main Verification失败时不得进入Integration Branch Synchronization。
12. 同步工作流不得依赖管理员PAT或修改Ruleset。

## 6. 漂移审计

Repository Governance持续比较仓库原生配置与：

```text
.github/governance/main-protection.json
.github/governance/required-checks.json
```

任一Ruleset缺失、状态非Active、检查名单漂移、存在未授权Bypass actor、开放非Squash合并或允许直接写main时均应失败。
