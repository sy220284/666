# M1-08 基础恢复点、完整性检查与只读恢复

> 状态：In Progress  
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
- `apps/desktop/renderer/`
- `tests/integration/`
- `tests/security/`
- `tests/e2e/`

## 实施内容

1. 实现SQLite Online Backup和BackupRecord基础。
2. 备份后执行integrity_check、foreign_key_check和Hash验证。
3. 提供高风险Use Case统一createOperationCheckpoint接口。
4. 恢复只允许到新目录，完成复制、校验和最近项目注册。
5. 数据库损坏时停止写入，提供只读浏览、Version导出和恢复副本入口。
6. 保护原项目，任何恢复失败不覆盖源文件。

## 测试与证据

- 写入期间备份、空间不足、备份损坏、恢复目标冲突和恢复中断。
- 损坏数据库只读打开且全部写命令失败。
- 恢复副本可重新打开并继续基础写作。

证据保存到：`docs/test-evidence/M1-08/`

## 完成条件

- 后续导入、替换、拆并章和Migration可调用统一恢复点基础。
- 恢复路径不覆盖原项目。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
