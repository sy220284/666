# M1-01 界面与人工复核记录

复核对象：app.sqlite、应用设置与最近项目  
复核方式：固定E2E场景、可见界面截图、数据库/契约断言及失败路径日志交叉核对。  
运行记录：https://github.com/sy220284/666/actions/runs/29551145839

## 逐项结论

| 验收项 | 复核内容 | 结论 |
|---|---|---|
| P0-009 | 真实UI创建项目后，最近项目在重启后恢复，应用设置持久化。 | PASS |
| APP-DATA-BOUNDARY | app.sqlite 不包含 Draft、Candidate、Version 或正文业务表。 | PASS |
| RECENT-PROJECTS | 路径缺失、重新定位、移除和排序路径由Integration/E2E覆盖。 | PASS |

## 截图证据

- `screenshots/m1-01-settings-recent.png`

## 独立复查

- 未以修改状态字段替代真实测试。
- 截图通过PNG头、非空体积和Playwright可见性断言。
- 自动化、数据结果与任务卡完成条件一致。
- 结论：通过。
