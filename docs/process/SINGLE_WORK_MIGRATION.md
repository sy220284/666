# 唯一work治理迁移记录

> 状态：Implemented  
> 来源：作者要求仓库长期只保留`work`和`main`

本次迁移将全局授权升级为Schema 2 `single-work-pr`，统一PR、任务、主分支验证、有效状态与work同步机制。

## 实施范围

- 机器授权真源；
- PR Policy与Task Governance；
- Main Verification任务状态发布；
- Work Synchronization；
- Branch Hygiene；
- 本地任务控制兼容入口；
- 活动流程文档、任务模板和PR模板；
- 正向与负向单元测试。

## 完成标准

```text
仅main与work
+ 仅work → main PR
+ 一个开放正式PR
+ 旧分支策略只保留兼容转发
+ Main Verification发布任务有效状态
+ work同步具备CAS保护
+ 活动文档无独立分支或关闭PR流程
```

最终完成仍以该PR永久门禁、Controlled Merge、Main Verification、Work Synchronization和重新读取真实分支为准。
