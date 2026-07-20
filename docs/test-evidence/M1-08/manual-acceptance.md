# M1-08人工复核记录

复核时间：2026-07-20T02:59:51Z  
受测主线提交：`3520855a45604bcfb7c740209552dc812c8de413`  
来源PR：#85

## 人工审计

- 核对`tests/integration/recovery-service.test.ts`：在线检查点生成SHA-256与BackupRecord，恢复到新项目ID，恢复副本可重新打开并继续写作。
- 核对低空间、损坏备份、目标冲突和恢复中断路径：失败不登记无效检查点、不残留恢复目录，源项目保持活动。
- 核对物理损坏数据库：只读`integrity-failed`模式阻止写入，外部检查点仍可恢复，原损坏数据库字节保持不变。
- 核对`tests/security/recovery-readonly.test.ts`：外键损坏后全部源写入被`PROJECT_READ_ONLY`拒绝，恢复副本为新的可写项目。
- 核对`tests/e2e/unreadable-project-recovery.spec.ts`：真实Electron中创建检查点、损坏数据库、进入恢复入口、恢复副本并从最近项目重新打开。
- 核对四张任务专属截图及SHA-256与截图清单一致。

## 判定

M1-08的恢复、只读保护、源项目不覆盖和可写恢复副本闭环通过。
