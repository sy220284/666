# M1-08 界面与人工复核记录

复核对象：基础恢复点、完整性检查与只读恢复  
复核方式：固定E2E场景、可见界面截图、数据库/契约断言及失败路径日志交叉核对。  
运行记录：https://github.com/sy220284/666/actions/runs/29551145839

## 逐项结论

| 验收项 | 复核内容 | 结论 |
|---|---|---|
| P0-011 | 损坏或高版本数据库停止写入，仍可读取恢复点和Version。 | PASS |
| P0-052 | 统一createOperationCheckpoint覆盖导入、替换、拆并章和Migration操作类型。 | PASS |
| P0-055 | 恢复到新目录和新项目ID，原项目不覆盖，失败清理临时副本。 | PASS |
| RECOVERY-METADATA | 恢复点文件名、Hash、项目ID和路径边界均双层校验。 | PASS |

## 截图证据

- `screenshots/m1-08-recovery-center.png`
- `screenshots/m1-08-readonly-recovery.png`

## 独立复查

- 未以修改状态字段替代真实测试。
- 截图通过PNG头、非空体积和Playwright可见性断言。
- 自动化、数据结果与任务卡完成条件一致。
- 结论：通过。
