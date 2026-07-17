# M1-07 界面与人工复核记录

复核对象：手动Version、定稿与历史恢复  
复核方式：固定E2E场景、可见界面截图、数据库/契约断言及失败路径日志交叉核对。  
运行记录：https://github.com/sy220284/666/actions/runs/29551145839

## 逐项结论

| 验收项 | 复核内容 | 结论 |
|---|---|---|
| P0-020 | Version与VersionBlock无业务UPDATE/DELETE路径，恢复生成新Draft。 | PASS |
| P0-021-ISOLATION | M1阶段不存在Candidate直写Draft路径，版本创建仅读取已提交Draft。 | PASS |
| P0-050-FOUNDATION | 导出入口只选择明确Version，TXT紧急导出由M1-08验证。 | PASS |
| VERSION-PERSISTENCE | 定稿指针、标签和版本列表重启后保持一致。 | PASS |

## 截图证据

- `screenshots/m1-07-version-history.png`

## 独立复查

- 未以修改状态字段替代真实测试。
- 截图通过PNG头、非空体积和Playwright可见性断言。
- 自动化、数据结果与任务卡完成条件一致。
- 结论：通过。
