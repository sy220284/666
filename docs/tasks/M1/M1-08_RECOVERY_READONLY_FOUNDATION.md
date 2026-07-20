# M1-08 基础恢复点、完整性检查与只读恢复

> 状态：Verified  
> 里程碑：M1 基础写作MVP  
> 优先级：P0  
> 建议分支：`feat/m1-recovery-readonly-foundation`

## 目标

前置高风险操作所需的在线备份、验证、恢复副本和损坏只读路径。

## 阶段定位

交付无AI也能长期写作、自动保存、版本、导入导出和恢复的基础产品。

## 非目标

- 不实现日常14份滚动策略。
- 不实现手动命名快照和完整恢复中心。

## 依赖

M1-02、M0-03

## 关联

- 需求：REQ-004、REQ-036、REQ-037
- 功能ID：BAK-002、RCV-001、PRJ-004
- 验收：P0-011、P0-052、P0-055

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/decisions/ADR-005-lock-revision-backup.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/testing/SECURITY_TEST_CASES.md`

## 主要影响范围

- `migrations/project/`
- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/main/`
- `apps/desktop/preload/`
- `apps/desktop/renderer/`
- `tests/integration/`
- `tests/migration/`
- `tests/security/`
- `tests/e2e/`

## 实施内容

1. 实现SQLite Online Backup和BackupRecord基础。
2. 备份后执行integrity_check、foreign_key_check和Hash验证。
3. 提供高风险Use Case统一createOperationCheckpoint接口。
4. 恢复只允许到新目录，完成复制、校验和最近项目注册。
5. 数据库损坏时立即停止写入。数据库仍可被SQLite读取时，直接以只读连接浏览和导出Version；`project.sqlite`物理不可读时，只允许从外部Checkpoint中读取Version目录与正文。
6. Checkpoint读取必须同时通过路径边界、普通文件且非符号链接、文件大小、SHA-256、SQLite `integrity_check`、`foreign_key_check`和项目ID一致性校验；任一条件失败均不得暴露或导出其中数据。
7. Version导出可按Checkpoint时间顺序回退查找，使用临时文件和原子改名落盘；源项目库与Checkpoint始终保持只读、不被修复或覆盖。
8. 恢复副本只能写入新目录，任何失败不得覆盖或修改原项目。

## 测试与证据

- 写入期间备份、空间不足、备份损坏、恢复目标冲突和恢复中断。
- 可读取的完整性异常进入只读模式，全部写命令失败。
- 物理不可读时，从已验证Checkpoint列出并导出Version正文；源库字节保持不变。
- Checkpoint字节、Hash、项目ID、SQLite完整性或外键异常时，不得列出或导出Version。
- 恢复副本可重新打开并继续基础写作。

证据保存到：`docs/test-evidence/M1-08/`

## 完成条件

- 后续导入、替换、拆并章和Migration可调用统一恢复点基础。
- 逻辑损坏与物理不可读的降级能力边界明确且有自动化及真实Electron证据。
- 恢复和导出路径均不覆盖原项目或Checkpoint。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
