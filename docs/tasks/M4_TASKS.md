# WorldForge M4与V1核心功能任务摘要

> 状态：Completed Historical Summary  
> 用途：里程碑导航；M4阶段全部任务已经Verified，不是当前执行入口。

## 最终结果

- M4-01 FTS5公共索引、队列与项目词典：Verified。
- M4-02 P0—P4约束包与裁剪追溯：Verified。
- M4-03 Provider、凭据与连接测试：Verified。
- M4-04 V1 C0—C7核心功能整体实施：Verified。

## 独立任务

| ID | 任务 | 依赖 | 核心交付 | 状态 |
|---|---|---|---|---|
| M4-01 | [FTS5公共索引、队列与项目词典](M4/M4-01_FTS_INDEX_DICTIONARY.md) | M3 | 公共索引、队列、权威回读和项目词典 | Verified |
| M4-02 | [P0—P4约束包与裁剪追溯](M4/M4-02_CONSTRAINT_PACKAGE.md) | M4-01、M3-06 | 约束分级、时序过滤、来源与裁剪追踪 | Verified |
| M4-03 | [Provider、凭据与连接测试](M4/M4-03_PROVIDER_CREDENTIAL_CONNECTION.md) | M3、M0 | Provider配置、凭据隔离、端点安全和能力探测 | Verified |
| M4-04 | [V1核心功能整体实施](M4/M4-04_PROMPT_REGISTRY_OUTPUT.md) | M4-01、M4-02、M4-03、M0-07 | Prompt、AI写作、建议稿、校验、搜索、导入导出和恢复 | Verified |

原M4-05—M6-06保留为M4-04详细需求来源，不再独立激活。

## 历史实施阶段

```text
全量基线审计与整体规划
→ AI公共合同与运行底座
→ 作者体验与AI写作闭环
→ 状态提取、校验与连续性
→ 搜索、统计、导入与恢复
→ C0—C7核心功能关闭
```

## 维护原则

- M4任务卡、历史Evidence和历史Migration保持冻结。
- 后续缺陷不得通过重开M4-04处理，必须建立新的独立维护任务。
- Prompt、TaskProtocol、Candidate采用、导入协调器和RecoveryService继续保持单一真源。
- 当前任务和状态只从`ACTIVE_TASK.json`与`TASK_INDEX.md`读取。
