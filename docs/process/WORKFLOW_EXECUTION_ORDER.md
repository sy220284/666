# WorldForge 工作流执行顺序

> 状态：Active  
> 分支模型：`main` + `work` + `governance`

## 1. 产品任务标准顺序

```text
核对任务、依赖、范围与最新已验证main
→ 确认work无开放冲突且已同步main
→ 在work实施、测试、文档和Evidence
→ work → main PR
→ Draft诊断；必要时full-validation-draft跑完整矩阵
→ Runtime登记IMPLEMENTED并绑定来源PR
→ 转Ready
→ 当前Head最新pr-policy + quality / quality + security + performance成功
→ Controlled Merge按expected_head_sha串行Squash
→ Main Verification成功
→ 发布main-verification与task-verification/<TASK-ID>
→ 任务有效状态转为VERIFIED
→ Integration Branch Synchronization同步来源work，并处理governance
→ Branch Inventory确认仅main/work/governance
→ 重新读取真实Refs与提交状态
```

## 2. 治理维护标准顺序

```text
核对最新已验证main
→ 确认governance基线安全
→ 在governance修改治理/测试/流程文档/构建治理表面
→ governance → main PR
→ 当前Head最新四项永久门禁成功
→ Controlled Merge串行Squash
→ Main Verification成功
→ Integration Branch Synchronization同步来源governance
→ 若work空闲且只是落后main，则自动非强制fast-forward到最新main
→ 若work存在开放PR且已经包含最新已验证main，则保留其Head继续开发
→ 若work存在开放PR但尚未包含最新已验证main，则同步任务fail-closed，显式执行main → work安全合并后再继续
→ Branch Inventory确认仅main/work/governance
→ 重新读取真实Refs与提交状态
```

治理PR无任务marker，不生成产品Runtime或任务Evidence。需要修改产品功能、数据库、IPC、产品数据模型时必须转`work`正式任务。

活动集成lane的主线回灌必须使用普通merge语义保留其独有提交；禁止reset、force push或Squash覆盖活动lane。主线回灌完成后，活动PR必须以新Head重新取得需要的验证结果。

## 3. 状态边界

不得混淆以下事实：

- Draft检查成功：用于反馈与诊断，不具备合并资格。
- Ready永久门禁成功：当前Head具备进入Controlled Merge的工程资格。
- PR已合并：GitHub已完成Squash，最终main尚需Main Verification。
- Main Verification成功：最终main、来源PR/Head与Fresh来源门禁一致。
- `task-verification/<TASK-ID>`成功：产品Schema 2任务可计算为Verified。
- Integration Branch Synchronization成功：来源lane已回到已验证main；空闲兄弟lane已同步；活动兄弟lane至少包含当前已验证main。活动兄弟lane若仍落后main，不得以skip伪装成功。
- Branch Inventory成功：远端固定库存为`main/work/governance`。

产品任务只有完成任务Context、work同步和最终复读后才能声明仓库闭环。治理维护只有完成Main Verification、来源governance同步和最终复读后才能声明治理闭环。

## 4. 分支与并行规则

- 永久分支只有`main`、`work`、`governance`。
- 产品PR精确为`work → main`；治理PR精确为`governance → main`。
- 每条集成lane最多一个开放PR；两条lane可并行工作。
- main写入、Controlled Merge与Main Verification始终串行。
- 一条lane合并后，另一条lane无开放PR且没有独有提交时才允许fast-forward。
- 另一条lane存在开放PR时不得覆盖其Head；若该lane尚未包含最新已验证main，Integration Branch Synchronization必须fail-closed并要求显式main回灌。
- 活动lane完成main回灌后允许保留其独有提交，只要求比较结果证明其已经包含当前已验证main。
- 另一条lane无开放PR但存在独有/分叉提交时fail-closed，必须人工确认来源后再恢复。

## 5. 任务状态

```text
PLANNED
→ IN_PROGRESS
→ IMPLEMENTED
→ VERIFICATION_PENDING（计算）
→ VERIFIED（计算）
```

- `IMPLEMENTED`由产品PR Head中的Schema 2 Runtime声明。
- `VERIFICATION_PENDING`表示合并后尚无匹配的任务验证成功Context。
- `VERIFIED`要求任务ID、来源PR、来源work Head、最终main提交与`task-verification/<TASK-ID>`完全一致。
- 治理PR不进入这条产品任务状态机。

## 6. 失败处理

永久门禁、Main Verification或同步失败时：

```text
停止后续合并/同步
→ 定位真实失败原因
→ 若活动兄弟lane落后main，先以main → lane普通merge完成安全回灌
→ 在对应集成lane修复其余问题
→ 重跑受影响检查和Fresh永久门禁
→ 重新执行受控合并/主线验证或同步验证
→ 重新读取main、work、governance真实Refs
```

禁止跳过失败检查、缩小必须验证的范围、复用其他Head的成功事实、强制覆盖有开放PR或独有提交的兄弟lane、把“活动PR仍落后main”记录为同步成功、手工伪造任务或主线成功状态。

## 7. 完成复查

每次工作结束至少确认：

```text
PR Head = 实际修改Head
四项永久门禁 = 当前Ready轮次成功
main-verification = success
产品任务需要时 task-verification/<TASK-ID> = success
来源lane = main
空闲兄弟lane = main；活动兄弟lane必须包含当前已验证main
远端分支 = main/work/governance
```
