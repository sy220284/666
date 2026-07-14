# WorldForge M1 基础写作MVP任务摘要

> 状态：Frozen  
> 用途：里程碑导航与阶段门说明；不可替代独立任务卡。

## 阶段目标

交付无AI也能长期写作、自动保存、版本、导入导出和恢复的基础产品。

## 任务顺序

| ID | 任务 | 依赖 | 核心交付 |
|---|---|---|---|
| M1-01 | [app.sqlite、应用设置与最近项目](M1/M1-01_APP_SETTINGS_RECENT_PROJECTS.md) | M0 | 建立应用级数据真源和项目首页基础，使最近项目、窗口/界面偏好与正文数据彻底分离。 |
| M1-02 | [项目工作空间、路径边界与只读打开](M1/M1-02_PROJECT_WORKSPACE_PATHS.md) | M1-01 | 完成项目创建、打开、关闭、移动、活动项目隔离和异常只读打开。 |
| M1-03 | [卷与章节基础生命周期](M1/M1-03_VOLUME_CHAPTER_LIFECYCLE.md) | M1-02 | 在编辑器之前建立稳定的Volume和Chapter基础模型、排序、状态和软删除。 |
| M1-04 | [Draft、Tiptap与中文输入](M1/M1-04_DRAFT_EDITOR_IME.md) | M1-03 | 建立稳定的中文块级正文编辑器和Draft/DraftBlock持久化映射。 |
| M1-05 | [Block Patch、内容Hash与Revision](M1/M1-05_BLOCK_PATCH_REVISION.md) | M1-04 | 统一所有正文写入为结构化Block Patch和原子Revision事务，为自动保存、锁定、Candidate和批量操作提供唯一写入通道。 |
| M1-06 | [自动保存、字数与当前章查找](M1/M1-06_AUTOSAVE_STATS_FIND.md) | M1-05 | 完成基础写作所需的自动保存、保存状态、统一字数统计和当前章查找。 |
| M1-07 | [手动Version、定稿与历史恢复](M1/M1-07_MANUAL_VERSION_FINALIZE.md) | M1-06 | 提供无AI场景下的不可变历史版本、章节定稿和恢复为新当前稿能力。 |
| M1-08 | [基础恢复点、完整性检查与只读恢复](M1/M1-08_RECOVERY_READONLY_FOUNDATION.md) | M1-02、M0-03 | 前置高风险操作所需的在线备份、验证、恢复副本和损坏只读路径。 |
| M1-09 | [TXT与Markdown基础导入导出](M1/M1-09_TEXT_IMPORT_EXPORT_MVP.md) | M1-07、M1-08 | 让基础写作MVP具备旧稿进入和稳定稿件输出能力。 |

## 阶段退出门

- 无AI也能完成创建项目→建卷章→写作→自动保存→版本→导入导出→恢复。
- 关闭、重启、保存失败、路径失效和数据库损坏路径可用。
- 基础MVP有完整E2E证据。

## 执行规则

- 只能通过`ACTIVE_TASK.md`激活其中一张任务卡。
- 未满足依赖不得提前实现后续任务。
- 每张任务完成后同步追踪矩阵与证据目录。
