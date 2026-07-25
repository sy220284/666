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
- 不让普通重大操作恢复点无限永久累积。

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
- `docs/tasks/M6/M6-04_GENRE_RHYTHM_SERIAL_METRICS.md`

## 主要影响范围

- `migrations/project/`（仅备份元数据或保留策略确需扩展时）
- `packages/core-service/`中的既有RecoveryService
- `packages/contracts/`
- `apps/desktop/main/`
- `apps/desktop/preload/`
- `apps/desktop/renderer/`
- `tests/unit/`
- `tests/integration/`
- `tests/migration/`
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

## 保留与保护规则

```text
永久保护
├─ 最后一份已验证备份
├─ 作者显式保留的命名快照
├─ 当前Schema升级链要求的关键Migration恢复点
└─ 法定/产品明确要求的其他保护项

配额保留
├─ 日常滚动备份
└─ 普通重大操作恢复点
```

- 普通重大操作恢复点默认受“时间 + 数量 + 空间”配额管理，不永久无限增长。
- 作者可显式将任一已验证恢复点标记为保留；解除保护必须明确确认。
- 自动清理只处理已验证、未受保护且不在使用中的记录；优先清理最旧日常备份，再按策略清理普通重大操作恢复点。
- 保留策略必须版本化、可解释，并在清理预览中展示每项保留或删除原因。

## 实施内容

1. 在现有RecoveryService上增加日常滚动策略，默认保留14份；仅在空闲、关闭或符合一致性条件时执行。
2. 将Migration、导入、替换、Candidate采用、拆并章等高风险操作的既有Checkpoint统一映射为重大操作恢复点，禁止重复创建平行格式。
3. 为普通重大操作恢复点建立可配置时间、数量和空间配额；关键Migration点、最后已验证备份和作者显式保留项不受自动清理。
4. 作者可创建命名快照和备注，仍使用同一备份文件格式、验证和记录服务；命名快照默认受保护，作者可明确解除。
5. 每份备份显示类型、时间、大小、Hash、Schema版本、验证状态、来源操作、保留策略和保护原因。
6. 未完成写入、未通过完整性检查、Hash不一致或记录不完整的备份不得标记成功。
7. 保护最后一份已验证备份、关键Migration恢复点和用户显式保留快照；任何自动清理不得删除这些对象。
8. 恢复继续写入新目录并注册为新项目，禁止覆盖原项目；复用既有项目身份重映射和外键验证事务。
9. 提供空间统计、清理预览、预计释放空间、受保护项说明和安全删除。
10. 删除使用同目录安全操作，失败时记录真实状态，不出现“记录已删、文件仍在”或相反的半完成结果。
11. 备份、验证、清理和恢复不依赖AI或网络；Provider故障不得影响数据保护。
12. 恢复产生的Draft变化和项目复制标记`mutationOrigin: restore/system`，不得计入M6-04人工写作统计。
13. 恢复中心UI复用M5-00导航、作者语言和状态表达，并由M7-02统一接入最终工作台。

## 测试与证据

- 写入期间备份、并发备份、空间不足、备份损坏、Hash错误和验证失败。
- 日常滚动数量、普通重大恢复点配额、关键Migration点、命名快照和最后已验证备份保护。
- 时间、数量和空间配额组合；清理优先级与保护原因可解释。
- 清理预览、部分删除失败、记录/文件一致性和恢复中断。
- 恢复到新目录、新项目ID、外键完整性和原项目不变。
- 恢复后的完整创作流程。
- 自动清理不删除最后已验证备份、关键Migration恢复点和显式保留快照。
- 作者解除保护需要明确确认，解除后仍不得突破最后备份保护。
- AI和网络不可用时备份、清理和恢复仍可用。
- 恢复与项目复制不增加人工写作统计。

证据保存到：`docs/test-evidence/M6-06/`

## 完成条件

- 三轨备份共享同一RecoveryService、文件格式、验证和记录真源。
- 日常滚动、重大恢复点、命名快照和恢复中心形成完整UI闭环。
- 普通重大操作恢复点受可解释配额管理，不无限永久累积。
- 数据保护功能不依赖AI或网络。
- 自动清理不会删除最后已验证备份、关键Migration恢复点或作者保留快照。
- 恢复始终生成新副本，不覆盖原项目。
- 恢复和项目复制不会被M6-04计入人工写作统计。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、恢复、UI、安全或测试文档。
