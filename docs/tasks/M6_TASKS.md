# WorldForge 原M6 校验、搜索与交付需求摘要

> 状态：Absorbed by M4-04  
> 用途：保留校验、搜索、统计、DOCX与恢复详细需求；不得作为独立任务执行入口。

## 执行归属

原M6-01—M6-06全部由[M4-04 V1剩余功能整体实施与发布闭环](M4/M4-04_PROMPT_REGISTRY_OUTPUT.md)吸收，在同一活动任务内按整体合同和用户路径连续实施。

## 需求范围

| 原ID | 需求来源 | 统一实施内容 |
|---|---|---|
| M6-01 | [确定性/统计校验与修订待办](M6/M6-01_RULE_STATS_VALIDATION_TODOS.md) | ValidationIssue、稳定锚点、规则/基础统计校验、StoryTodo与Comment。 |
| M6-02 | [AI语义与人物弧光一致性校验](M6/M6-02_AI_SEMANTIC_ARC_VALIDATION.md) | 基于Final Version和已确认状态的语义、设定、知情、伏笔与弧光风险。 |
| M6-03 | [全项目搜索与安全批量替换](M6/M6-03_PROJECT_SEARCH_SAFE_REPLACE.md) | Draft/Version/Entity搜索、ReplacePlan、安全Patch与`safe_replace`来源。 |
| M6-04 | [网文节奏与连载指标](M6/M6-04_GENRE_RHYTHM_SERIAL_METRICS.md) | mutationOrigin、人工写作会话、节奏、钩子与黄金三章指标。 |
| M6-05 | [DOCX安全导入与多格式导出](M6/M6-05_DOCX_TRANSFER.md) | 复用ImportPlan完成DOCX安全导入和Version多格式导出。 |
| M6-06 | [三轨备份、恢复中心与空间清理](M6/M6-06_THREE_TRACK_BACKUP_RECOVERY.md) | 复用RecoveryService完成滚动备份、恢复点、快照、配额清理和新副本恢复。 |

## 统一实施顺序

```text
ValidationIssue与确定性校验
→ 真实状态基础上的AI语义校验
→ 全项目搜索与安全替换
→ mutationOrigin与人工写作统计
→ DOCX与多格式导出
→ 三轨备份、清理与恢复
```

该顺序属于M4-04内部实施计划，不形成独立任务切换。

## 统一退出要求

- 校验、搜索替换、人工写作统计、节奏指标、DOCX和三轨恢复均从正式桌面入口可用。
- pending、rejected和旧Version StateProposal不参与权威校验。
- Version和Entity不能被通用ReplacePlan修改。
- 人工写作统计不混入AI、导入、替换、恢复、结构和系统变更。
- DOCX与文本导入复用同一ImportPlan和`mutationOrigin: import`。
- 三轨备份复用同一RecoveryService；最后已验证备份、关键Migration点和作者保留项受保护。
- 相关验收统一进入`docs/test-evidence/M4-04/`和P0矩阵。
