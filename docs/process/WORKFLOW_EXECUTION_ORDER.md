# WorldForge 工作流执行顺序

> 状态：Active  
> 更新日期：2026-07-30

## 标准顺序

```text
活动任务、依赖与范围检查
→ 独立正式分支
→ Draft PR持续执行完整永久门禁
→ 代码、测试、专项文档和实现Evidence汇合
→ 任务登记Implemented
→ PR转Ready
→ Ready Head六项永久门禁全部成功
→ 使用expected_head_sha串行受控合并
→ 等待合并提交的Main Verification成功
→ 独立治理关闭PR绑定main提交与最终Evidence
→ 任务登记Verified / VERIFIED_HOLD
→ 重新读取最终main复核
```

禁止把以下状态混为一谈：

- Draft PR检查成功：只证明当前分支受检提交通过。
- Ready PR检查成功：只证明该Head具备合并资格。
- PR已合并：只证明GitHub完成分支合并。
- Main Verification成功：证明合并提交通过主分支门禁。
- 关闭治理进入main：证明任务、追踪和最终Evidence与主分支一致。

只有最后一项完成后，才能声明任务主线闭环。

## 任务状态转换

```text
Planned
→ In Progress
→ Implemented
→ Verified
```

- `In Progress`：已经授权并进入正式分支实施。
- `Implemented`：代码、测试、文档和实现Evidence完成，等待受控合并与主分支验证。
- `Verified`：受控合并、Main Verification和最终治理关闭均已完成。
- `VERIFIED_HOLD`：最终任务已Verified，且不自动激活下一任务。

已Verified任务不得直接重开。后续缺陷必须建立新的独立维护任务，并保留原历史Evidence哈希。

## 任务推进前沿

任务索引承担执行顺序，但是否自动激活下一任务由`ACTIVE_TASK.json.authorization.autoActivateNext`决定。

自动激活开启时：

1. 找到索引中最后一张状态不为`Planned`的独立任务，作为执行前沿。
2. 只检查执行前沿之后第一张`Planned`任务。
3. 依赖满足时激活；依赖不满足时停止，不跳过。
4. 执行前沿之前残留的旧`Planned`状态不得重新抢占主线。

自动激活关闭时：

- 当前任务关闭后保持终态，不自行创建或激活下一任务。
- 新维护任务必须由作者明确立项，并同步任务卡、任务索引和活动任务真源。

## 并行与主分支推进

- 同时只允许一个正式功能或维护PR占用活动任务。
- 主分支若因独立治理或文档提交推进，正式PR不得覆盖这些独立变更。
- 压缩合并的内容来源必须通过Tree一致或Patch等价证明。
- 合并前重新读取最新main和PR Head，确认可合并、任务状态与Evidence绑定一致。

## 失败处理

任何门禁失败：

```text
定位真实原因
→ 在同一正式分支修复
→ 重跑受影响及全量永久门禁
→ 更新Evidence与风险说明
```

禁止跳过失败检查、缩小验证范围、手工改写成功结论或复用其他提交的Evidence。
