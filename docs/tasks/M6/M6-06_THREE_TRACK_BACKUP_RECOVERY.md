# M6-06 三轨备份、恢复中心与空间清理

> 状态：Planned  
> 里程碑：M6 校验、搜索与交付  
> 优先级：P0  
> 建议分支：`feat/m6-three-track-backup-recovery`

## 目标

在基础恢复点之上完成日常滚动、重大操作、手动快照、验证、恢复和安全清理。

## 阶段定位

补齐校验、全项目搜索、节奏指标、DOCX和三轨备份恢复。

## 非目标

- 不覆盖原项目恢复。
- 不上传备份到云端。

## 依赖

M1-08、M2-04、M6-03、M6-05

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

## 主要影响范围

- `migrations/project/`
- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/renderer/`
- `tests/integration/`
- `tests/e2e/`

## 实施内容

1. 日常滚动备份默认14份，空闲或关闭时按策略执行。
2. Migration、导入、替换、拆并章前重大恢复点默认永久保留。
3. 作者可创建命名快照和备注。
4. 每份备份显示类型、时间、大小、Hash和验证状态。
5. 保护最后一份已验证备份，未验证备份不能标记成功。
6. 恢复到新目录并注册为新项目。
7. 提供空间统计、清理预览和安全删除。

## 测试与证据

- 写入期间备份、空间不足、备份损坏、删除保护和恢复中断。
- 恢复后的完整创作流程。
- 自动清理不删除最后已验证备份和永久恢复点。

证据保存到：`docs/test-evidence/M6-06/`

## 完成条件

- 三轨备份和恢复中心形成完整UI闭环。
- 数据保护功能不依赖AI或网络。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
