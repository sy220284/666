# WorldForge M4与V1剩余功能整体任务摘要

> 状态：Active  
> 用途：里程碑导航；唯一执行任务为M4-04。

## 当前基线

- M4-01 FTS5公共索引、队列与项目词典：Verified。
- M4-02 P0—P4约束包与裁剪追溯：Verified。
- M4-03 Provider、凭据与连接测试：Verified。
- M4-04 V1剩余功能整体实施与发布闭环：In Progress。

## 唯一任务

| ID | 任务 | 依赖 | 核心交付 | 状态 |
|---|---|---|---|---|
| M4-04 | [V1剩余功能整体实施与发布闭环](M4/M4-04_PROMPT_REGISTRY_OUTPUT.md) | M4-01、M4-02、M4-03、M0-07 | 先读取原M4-04—M8-03全部要求及全量代码完成整体规划，再连续完成AI写作、校验交付、产品体验、硬化与发布关闭。 | In Progress |

原M4-05保留为详细需求来源，已由M4-04吸收，不再独立激活。

## 内部实施阶段

```text
全量基线审计与整体规划
→ AI公共合同与运行底座
→ 作者体验与AI写作闭环
→ 状态提取、校验与连续性
→ 搜索、统计、导入与恢复
→ 完整体验、硬化与发布关闭
```

内部阶段不是独立任务，不切换`ACTIVE_TASK`，不建立其他正式功能PR。

## 阶段门

- 编码前必须完成任务卡中的整体规划执行附件。
- 已完成任务卡、历史Evidence和历史Migration保持冻结。
- 每项用户功能必须形成Contracts→Core→Main→Preload→Renderer→测试的纵向闭环。
- Prompt、TaskProtocol、Candidate采用、导入协调器、RecoveryService、模式状态和主题状态只允许一个真源。
- 正式PR在全部V1功能完成前保持Draft；完成全量测试、证据和发布判断后一次转Ready。
- M4-04是V1最终任务，Verified后不自动激活下一任务。
