# WorldForge V1.0 任务索引

> 状态：Approved  
> 原则：一任务一分支；任务完成必须有证据；M0—M3核心链路优先于外围功能。

## 任务状态

```text
Planned → In Progress → Implemented → Verified
Blocked / Deferred / Removed
```

## M0 工程与安全底座

见[`M0_TASKS.md`](M0_TASKS.md)。

| ID | 名称 | 依赖 | 状态 |
|---|---|---|---|
| M0-01 | Monorepo与质量工具 | 无 | Planned |
| M0-02 | Electron安全基线 | M0-01 | Planned |
| M0-03 | SQLite、Migration与单写队列 | M0-01 | Planned |
| M0-04 | IPC与流式事件协议 | M0-01、M0-02 | Planned |
| M0-05 | 2K、曲面屏与窗口恢复Spike | M0-01 | Planned |
| M0-06 | AI质量与中文Diff Spike | M0-03、M0-04 | Planned |

## M1 编辑与版本核心

见[`M1_TASKS.md`](M1_TASKS.md)。

| ID | 名称 | 依赖 | 状态 |
|---|---|---|---|
| M1-01 | 项目工作空间与路径边界 | M0 | Planned |
| M1-02 | Draft、Tiptap与自动保存 | M1-01 | Planned |
| M1-03 | 锁定、Block Patch与Revision | M1-02 | Planned |
| M1-04 | Candidate、Version与采用撤销 | M1-03 | Planned |
| M1-05 | 回收站、拆章、并章与跨章移动 | M1-04 | Planned |

## M2 规划与连续性

见[`M2_TASKS.md`](M2_TASKS.md)。

| ID | 名称 | 依赖 | 状态 |
|---|---|---|---|
| M2-01 | 任务书、大纲、章节与SceneBeat | M1 | Planned |
| M2-02 | 实体、Canon与动态状态 | M2-01 | Planned |
| M2-03 | 时间线、知情信息与伏笔 | M2-02 | Planned |
| M2-04 | 定稿、状态提案、尾快照与失效传播 | M2-03 | Planned |

## M3 AI生成闭环

见[`M3_TASKS.md`](M3_TASKS.md)。

| ID | 名称 | 依赖 | 状态 |
|---|---|---|---|
| M3-01 | Provider、连接测试与凭据 | M0-06、M2 | Planned |
| M3-02 | 约束包与FTS5检索 | M2-04 | Planned |
| M3-03 | T0/T1、快速改写、融合与取消 | M3-01、M3-02 | Planned |
| M3-04 | 候选Diff、冲突、采用与回退 | M1-04、M3-03 | Planned |

## M4 完整交付

见[`M4_TASKS.md`](M4_TASKS.md)。

| ID | 名称 | 依赖 | 状态 |
|---|---|---|---|
| M4-01 | 校验、问题降噪与修订待办 | M3 | Planned |
| M4-02 | 当前章搜索、FTS5、替换与词典 | M3 | Planned |
| M4-03 | TXT/Markdown/DOCX导入导出 | M1、M2 | Planned |
| M4-04 | 三轨备份、完整性检查与恢复 | M1 | Planned |
| M4-05 | 新手/专业模式、工作台与完整视觉交互 | M1—M4-04 | Planned |

## M5 发布硬化

见[`M5_TASKS.md`](M5_TASKS.md)。

| ID | 名称 | 依赖 | 状态 |
|---|---|---|---|
| M5-01 | 安全、Migration、数据损坏与隐私硬化 | M4 | Planned |
| M5-02 | 性能、高分屏、AI Eval与长场景验收 | M4 | Planned |
| M5-03 | 跨平台构建、P0验收与发布关闭 | M5-01、M5-02 | Planned |

## 执行规则

1. 开始任务前更新本索引和追踪矩阵状态。
2. 一个分支只完成一个任务卡；端到端任务在任务卡中明确跨层范围。
3. 不允许M4外围体验阻塞M1—M3核心写作闭环。
4. V1.5任务不放入本索引，满足启动门后另建Epic。
5. `Implemented`表示代码已接通；只有验收和证据完成后才能标记`Verified`。
