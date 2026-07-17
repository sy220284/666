# M1-05 界面与人工复核记录

复核对象：Block Patch、内容Hash与Revision  
复核方式：固定E2E场景、可见界面截图、数据库/契约断言及失败路径日志交叉核对。  
运行记录：https://github.com/sy220284/666/actions/runs/29551145839

## 逐项结论

| 验收项 | 复核内容 | 结论 |
|---|---|---|
| P0-018 | 旧Revision和Hash冲突被拒绝，不发生静默覆盖。 | PASS |
| P0-019 | insert/update/delete/move按序在一次事务提交，Revision只增加1。 | PASS |
| PATCH-ROLLBACK | 非法顺序、部分失败、重复requestId和故障注入无半提交。 | PASS |
| QUALITY-GATE | 静态、Unit、Integration、Migration、Security、E2E和Build全量通过。 | PASS |

## 截图证据

- `screenshots/m1-05-patch-revision.png`

## 独立复查

- 未以修改状态字段替代真实测试。
- 截图通过PNG头、非空体积和Playwright可见性断言。
- 自动化、数据结果与任务卡完成条件一致。
- 结论：通过。
