# M4-04 三轨备份、完整性检查与恢复

> 状态：Planned  
> 优先级：P0  
> 分支：`feat/m4-backup-recovery`

## 目标

覆盖日常误操作、高风险变更和数据库损坏，提供可验证且不覆盖原项目的恢复能力。

## 依赖

M1、M0-03完成。

## 关联

- 需求：REQ-036、REQ-037
- 验收：P0-051—P0-055

## 必读文档

- `docs/decisions/ADR-005-lock-revision-backup.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/testing/SECURITY_TEST_CASES.md`
- `docs/ui/INTERACTION_STATES.md`

## 实施内容

1. SQLite Online Backup。
2. 日常滚动备份，默认14份。
3. Migration、导入、替换、拆并章前重大恢复点，默认永久。
4. 作者命名手动快照。
5. 备份后执行integrity_check和Hash。
6. 保护最后一份已验证备份。
7. 恢复到新目录并注册为新项目。
8. 空间统计和安全清理。

## 测试

写入期间备份、空间不足、备份损坏、删除保护、恢复目标冲突、恢复中断和恢复后的完整创作流程。

## 完成条件

恢复不覆盖原项目；未验证备份不能标记成功；最后一份已验证备份不能自动删除。
