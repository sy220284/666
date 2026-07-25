# WorldForge M6 校验、搜索与交付任务摘要

> 状态：Frozen  
> 用途：里程碑导航与阶段门说明；不可替代独立任务卡。

## 阶段目标

补齐确定性与AI校验、全项目搜索、安全批量替换、人工写作统计、网文节奏指标、DOCX和三轨备份恢复，并保持所有入口复用既有权威真源。

## 任务顺序

| ID | 任务 | 依赖 | 核心交付 |
|---|---|---|---|
| M6-01 | [确定性/统计校验与修订待办](M6/M6-01_RULE_STATS_VALIDATION_TODOS.md) | M5、M3 | 建立可重复的规则/基础统计校验、稳定问题锚点和StoryTodo/批注闭环。 |
| M6-02 | [AI语义与人物弧光一致性校验](M6/M6-02_AI_SEMANTIC_ARC_VALIDATION.md) | M6-01、M5-06 | 基于Final Version证据和已确认状态提示人物行为、设定、衔接、知情、文风和弧光风险。 |
| M6-03 | [全项目搜索与安全批量替换](M6/M6-03_PROJECT_SEARCH_SAFE_REPLACE.md) | M4-01、M2-01、M1-08 | 搜索Draft、只读Version和Entity；ReplacePlan只作用于活动DraftBlock并标记`safe_replace`来源。 |
| M6-04 | [网文节奏与连载指标](M6/M6-04_GENRE_RHYTHM_SERIAL_METRICS.md) | M3-02、M6-01、M6-02、M6-03 | 建立统一mutationOrigin和写作会话统计，提供建议级节奏分析；后续入口由M6-05/M6-06接线。 |
| M6-05 | [DOCX安全导入与多格式导出](M6/M6-05_DOCX_TRANSFER.md) | M1-09、M1-08 | 扩展现有导入协调器，补齐DOCX安全导入和TXT/Markdown/DOCX Version导出，并复用`import`来源。 |
| M6-06 | [三轨备份、恢复中心与空间清理](M6/M6-06_THREE_TRACK_BACKUP_RECOVERY.md) | M1-08、M2-04、M6-03、M6-05 | 扩展现有RecoveryService，完成滚动备份、配额化重大恢复点、命名快照、恢复和安全清理。 |

## 阶段退出门

- 校验、搜索替换、人工写作统计、节奏指标、DOCX和三轨备份恢复可用。
- M6-02只读取已确认状态，pending、rejected和旧Version StateProposal不参与权威校验。
- 搜索对象与可替换对象分离，Version和Entity不能被通用ReplacePlan修改。
- 人工写作统计不混入AI采用、TXT/Markdown/DOCX导入、替换、恢复、结构和系统操作。
- M6-04不提前宣称M6-05/M6-06入口已经验收，M8-02负责七类来源最终回归。
- DOCX和三轨备份复用既有协调器与RecoveryService，没有第二套真源。
- 普通重大恢复点受时间、数量和空间配额管理；最后已验证备份、关键Migration点和作者保留项受保护。
- 所有建议级功能不替作者裁决，不阻断基础写作。
- 高风险操作均有恢复点和失败回滚。

## 执行规则

- 只能通过`ACTIVE_TASK.md`激活其中一张任务卡。
- M5-06未完成前不得激活M6-02。
- M6-03未完成前不得激活M6-04，避免`safe_replace`来源合同悬空。
- M6-05、M6-06完成后必须补齐M6-04来源接线回归，再由M8-02统一终验。
- 未满足依赖不得提前实现后续任务。
- 每张任务完成后同步追踪矩阵与证据目录。
