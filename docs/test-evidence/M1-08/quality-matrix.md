# M1-08质量矩阵

| 验收项 | 证据 | 结果 |
|---|---|---|
| 在线检查点与SHA-256 | `recovery-service.test.ts`；Quality `29713250352` | PASS |
| integrity/foreign key/hash验证 | RecoveryService集成测试；Main Verification `29713419581` | PASS |
| 低空间拒绝 | `BACKUP_SPACE_LOW`断言 | PASS |
| 损坏备份拒绝且不登记 | `BACKUP_CREATE_FAILED`与BackupRecord计数断言 | PASS |
| 恢复目标冲突 | `RESTORE_TARGET_CONFLICT`断言 | PASS |
| 恢复中断清理 | `RESTORE_VERIFY_FAILED`、空目标目录、源项目保持活动 | PASS |
| 损坏项目只读 | Integration与Security套件 | PASS |
| 全部源写入拒绝 | `PROJECT_READ_ONLY`断言 | PASS |
| 恢复不覆盖源文件 | 源数据库字节前后相等 | PASS |
| 恢复副本可写 | 新项目ID、read-write、继续写作 | PASS |
| 真实Electron恢复流程 | `unreadable-project-recovery.spec.ts`；Quality `29713250352` | PASS |
| 四张任务专属截图 | `screenshots/manifest.json`与二进制SHA-256 | PASS |
| 六项永久门禁与主线复验 | PR #85 + Main Verification `29713419581` | PASS |
