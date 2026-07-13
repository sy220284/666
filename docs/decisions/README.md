# WorldForge 架构决策记录

> 本目录只保留五项决定产品安全边界和核心数据模型的ADR。其余技术选择写入对应工程规格，不建立庞大的审批体系。

| ADR | 决策 | 状态 |
|---|---|---|
| [ADR-001](ADR-001-local-data-boundary.md) | 数据仅本地保存，模型请求由本机直连 | Frozen |
| [ADR-002](ADR-002-sqlite-source-of-truth.md) | 每项目SQLite是唯一权威数据源 | Frozen |
| [ADR-003](ADR-003-draft-candidate-version.md) | Draft、Candidate、Version三层分离 | Frozen |
| [ADR-004](ADR-004-ai-cannot-overwrite-draft.md) | AI不得直接覆盖作者正文或权威设定 | Frozen |
| [ADR-005](ADR-005-lock-revision-backup.md) | 锁定、Revision、事务和备份共同保护正文 | Frozen |

## ADR变更规则

1. Frozen ADR不得通过普通重构隐式改变。
2. 变更需新增替代ADR并标记原ADR为Superseded。
3. 变更必须同步功能清单、Schema、IPC、测试和追踪矩阵。
4. 不为“未来可能需要”新增ADR。
