# WorldForge V1.0 任务索引

> 状态：Frozen  
> 原则：同一时间一个活动任务；一任务一文件；一任务一分支；完成必须有证据。

## 唯一执行入口

1. [`ACTIVE_TASK.md`](ACTIVE_TASK.md)：当前唯一允许执行的任务。
2. 当前任务对应的一任务一文件任务卡。
3. [`../PROJECT_EXECUTION_ENTRY.md`](../PROJECT_EXECUTION_ENTRY.md)：按任务类型查询专项文档。

任务状态：

```text
Planned → In Progress → Implemented → Verified
Blocked / Deferred / Removed
```

## M0 工程与安全底座

| ID | 任务卡 | 依赖 | 状态 |
|---|---|---|---|
| M0-01 | [`Monorepo与质量工具`](M0/M0-01_MONOREPO_FOUNDATION.md) | 无 | Planned |
| M0-02 | [`Electron安全基线`](M0/M0-02_ELECTRON_SECURITY.md) | M0-01 | Planned |
| M0-03 | [`SQLite、Migration与单写队列`](M0/M0-03_SQLITE_WRITE_QUEUE.md) | M0-01 | Planned |
| M0-04 | [`IPC与流式事件协议`](M0/M0-04_IPC_STREAMING.md) | M0-01、M0-02 | Planned |
| M0-05 | [`2K、曲面屏与窗口恢复Spike`](M0/M0-05_DISPLAY_SCALING_SPIKE.md) | M0-01 | Planned |
| M0-06 | [`AI质量与中文Diff Spike`](M0/M0-06_AI_DIFF_SPIKE.md) | M0-03、M0-04 | Planned |

里程碑摘要：[`M0_TASKS.md`](M0_TASKS.md)。

## M1 编辑与版本核心

| ID | 任务卡 | 依赖 | 状态 |
|---|---|---|---|
| M1-01 | [`项目工作空间与路径边界`](M1/M1-01_PROJECT_WORKSPACE.md) | M0 | Planned |
| M1-02 | [`Draft、Tiptap与自动保存`](M1/M1-02_DRAFT_EDITOR.md) | M1-01 | Planned |
| M1-03 | [`锁定、Block Patch与Revision`](M1/M1-03_LOCK_REVISION.md) | M1-02 | Planned |
| M1-04 | [`Candidate、Version与采用撤销`](M1/M1-04_CANDIDATE_VERSION.md) | M1-03 | Planned |
| M1-05 | [`回收站、拆章、并章与跨章移动`](M1/M1-05_STRUCTURE_RECOVERY.md) | M1-04 | Planned |

里程碑摘要：[`M1_TASKS.md`](M1_TASKS.md)。

## M2 规划与连续性

| ID | 任务卡 | 依赖 | 状态 |
|---|---|---|---|
| M2-01 | [`任务书、大纲、章节与SceneBeat`](M2/M2-01_PLANNING_MODEL.md) | M1 | Planned |
| M2-02 | [`实体、Canon与动态状态`](M2/M2-02_CANON_STATE.md) | M2-01 | Planned |
| M2-03 | [`时间线、知情信息与伏笔`](M2/M2-03_CONTINUITY_MODELS.md) | M2-02 | Planned |
| M2-04 | [`定稿、状态提案、尾快照与失效传播`](M2/M2-04_STATE_PROPOSALS_SNAPSHOTS.md) | M2-03、M1-04 | Planned |

里程碑摘要：[`M2_TASKS.md`](M2_TASKS.md)。

## M3 AI生成闭环

| ID | 任务卡 | 依赖 | 状态 |
|---|---|---|---|
| M3-01 | [`Provider、连接测试与凭据`](M3/M3-01_PROVIDER_LAYER.md) | M0-06、M2 | Planned |
| M3-02 | [`约束包与FTS5检索`](M3/M3-02_CONSTRAINT_PACKAGE.md) | M2-04、M3-01 | Planned |
| M3-03 | [`T0/T1、快速改写、融合与取消`](M3/M3-03_GENERATION_WORKFLOWS.md) | M3-01、M3-02、M0-04 | Planned |
| M3-04 | [`候选Diff、冲突、采用与回退`](M3/M3-04_CANDIDATE_REVIEW.md) | M1-04、M3-03、M0-06 | Planned |

里程碑摘要：[`M3_TASKS.md`](M3_TASKS.md)。

## M4 完整交付

| ID | 任务卡 | 依赖 | 状态 |
|---|---|---|---|
| M4-01 | [`校验、问题降噪与修订待办`](M4/M4-01_VALIDATION_REVISION.md) | M3 | Planned |
| M4-02 | [`当前章搜索、FTS5、替换与词典`](M4/M4-02_SEARCH_DICTIONARY.md) | M3、M1 | Planned |
| M4-03 | [`TXT、Markdown与DOCX导入导出`](M4/M4-03_IMPORT_EXPORT.md) | M1、M2 | Planned |
| M4-04 | [`三轨备份、完整性检查与恢复`](M4/M4-04_BACKUP_RECOVERY.md) | M1、M0-03 | Planned |
| M4-05 | [`新手/专业模式、工作台与完整视觉交互`](M4/M4-05_COMPLETE_UI.md) | M1—M4-04 | Planned |

里程碑摘要：[`M4_TASKS.md`](M4_TASKS.md)。

## M5 发布硬化

| ID | 任务卡 | 依赖 | 状态 |
|---|---|---|---|
| M5-01 | [`安全、Migration、数据损坏与隐私硬化`](M5/M5-01_SECURITY_DATA_HARDENING.md) | M4 | Planned |
| M5-02 | [`性能、高分屏、AI Eval与长场景验收`](M5/M5-02_PERFORMANCE_EVAL.md) | M4 | Planned |
| M5-03 | [`跨平台构建、P0验收与发布关闭`](M5/M5-03_RELEASE_ACCEPTANCE.md) | M5-01、M5-02 | Planned |

里程碑摘要：[`M5_TASKS.md`](M5_TASKS.md)。

## 执行规则

1. 作者明确激活任务后，先更新`ACTIVE_TASK.md`和本索引状态。
2. Codex只能修改活动任务允许路径；范围变化先改活动任务文件。
3. 一个分支只完成一个任务卡。
4. `Implemented`表示真实接通；只有验收、人工复查和证据完成后才标记`Verified`。
5. 任务关闭后将`ACTIVE_TASK.md`恢复为无活动任务，等待作者激活下一项。
6. V1.5任务不进入本索引，满足启动门后单独建立Epic和任务目录。
