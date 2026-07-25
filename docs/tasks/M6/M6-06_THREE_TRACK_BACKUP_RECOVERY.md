# M6-06 三轨备份、恢复中心与空间清理

> 状态：Planned  
> 里程碑：M6 校验、搜索与交付  
> 优先级：P0  
> 建议分支：`work/m6-06-three-track-backup-recovery`

## 目标

在现有RecoveryService、基础恢复点和恢复到新副本能力之上，完成日常滚动、重大操作、手动快照、验证、恢复和安全清理。

## 阶段定位

补齐校验、全项目搜索、节奏指标、DOCX和三轨备份恢复。本任务扩展既有恢复引擎，不重建备份格式、在线备份、完整性验证或项目身份重映射逻辑。

## 非目标

- 不覆盖原项目恢复。
- 不上传备份到云端。
- 不建立第二套RecoveryService、备份记录真源或恢复事务。
- 不将未验证或未完成的文件标记为成功备份。

## 依赖

M1-08、M2-04、M6-03、M6-05

## 承接基线

启动任务前必须复核并复用现有RecoveryService及相关能力：

- SQLite Online Backup或等价一致性备份入口。
- 备份前空间检查。
- quick/integrity/foreign_key验证。
- SHA-256与BackupRecord。
- 临时文件、验证后原子落盘。
- 恢复到新目录、新项目身份和注册流程。
- M2-04高风险结构操作恢复点。

## 关联

- 需求：REQ-036、REQ-037
- 功能ID：BAK-001、BAK-002、BAK-003、RCV-001
- 验收：P0-051—P0-055

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/decisions/ADR-005-lock-revision-backup.md`
- `docs/database/DATABASE_SCHEMA.md`
- `docs/testing/SECURITY_TEST_CASES.md`
- `docs/ui/INTERACTION_STATES.md`
- `docs/tasks/M1/M1-08_RECOVERY_CHECKPOINT.md`
- `docs/tasks/M2/M2-04_STRUCTURE_RECOVERY.md`

## 主要影响范围

- `migrations/project/`（仅备份元数据或保留策略确需扩展时）
- `packages/core-service/`中的既有RecoveryService
- `packages/contracts/`
- `apps/desktop/main/`
- `apps/desktop/preload/`
- `apps/desktop/renderer/`
- `tests/unit/`
- `tests/integration/`
- `tests/security/`
- `tests/e2e/`

## 三轨定义

```text
日常滚动备份
├─ 自动策略
├─ 默认保留14份
└─ 可安全清理

重大操作恢复点
├─ Migration
├─ 导入
├─ 批量替换
├─ Candidate采用
└─ 拆章、并章、跨章移动

手动命名快照
├─ 作者命名
├─ 可选备注
└─ 明确保留状态
```

## 实施内容

1. 在现有RecoveryService上增加日常滚动策略，默认保留14份；仅在空闲、关闭或符合一致性条件时执行。
2. 将Migration、导入、替换、Candidate采用、拆并章等高风险操作的既有Checkpoint统一映射为重大操作恢复点，默认永久保留，禁止重复创建平行格式。
3. 作者可创建命名快照和备注，仍使用同一备份文件格式、验证和记录服务。
4. 每份备份显示类型、时间、大小、Hash、Schema版本、验证状态、来源操作和保留策略。
5. 未完成写入、未通过完整性检查、Hash不一致或记录不完整的备份不得标记成功。
6. 保护最后一份已验证备份、永久恢复点和用户显式保留快照；任何自动清理不得删除这些对象。
7. 恢复继续写入新目录并注册为新项目，禁止覆盖原项目；复用既有项目身份重映射和外键验证事务。
8. 提供空间统计、清理预览、预计释放空间、受保护项说明和安全删除。
9. 删除使用同目录安全操作，失败时记录真实状态，不出现“记录已删、文件仍在”或相反的半完成结果。
10. 备份、验证、清理和恢复不依赖AI或网络；Provider故障不得影响数据保护。
11. 恢复产生的Draft变化和项目复制不得计入M6-04人工写作统计。
12. 恢复中心UI复用M5-00导航、作者语言和状态表达，并由M7-02统一接入最终工作台。

## 测试与证据

- 写入期间备份、并发备份、空间不足、备份损坏、Hash错误和验证失败。
- 日常滚动数量、保留策略、永久恢复点、命名快照和最后已验证备份保护。
- 清理预览、部分删除失败、记录/文件一致性和恢复中断。
- 恢复到新目录、新项目ID、外键完整性和原项目不变。
- 恢复后的完整创作流程。
- 自动清理不删除最后已验证备份、永久恢复点和显式保留快照。
- AI和网络不可用时备份、清理和恢复仍可用。

证据保存到：`docs/test-evidence/M6-06/`

## 完成条件

- 三轨备份共享同一RecoveryService、文件格式、验证和记录真源。
- 日常滚动、重大恢复点、命名快照和恢复中心形成完整UI闭环。
- 数据保护功能不依赖AI或网络。
- 自动清理不会删除最后已验证备份、永久恢复点或作者保留快照。
- 恢复始终生成新副本，不覆盖原项目。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、恢复、UI、安全或测试文档。
