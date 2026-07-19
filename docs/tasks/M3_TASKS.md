# WorldForge M3 规划、设定与连续性任务摘要

> 状态：Frozen  
> 用途：里程碑导航与阶段门说明；不可替代独立任务卡。

## 阶段目标

建立规划、设定与连续性权威数据，作者确认后才改变状态；在M4前完成Renderer React架构校正。

## 任务顺序

| ID | 任务 | 依赖 | 核心交付 |
|---|---|---|---|
| M3-01 | [作品任务书与大纲树](M3/M3-01_PROJECT_BRIEF_OUTLINE.md) | M2 | 建立可跳过、可后补的作品任务书和长篇大纲树，不强迫作者遵循固定流程。 |
| M3-02 | [SceneBeat、场景关联与跨章移动](M3/M3-02_SCENE_BEAT_CROSS_CHAPTER.md) | M3-01、M2-04 | 建立SceneBeat规划模型、正文关联和安全跨章移动。 |
| M3-03 | [通用实体与静态Canon](M3/M3-03_ENTITY_CANON.md) | M3-01 | 建立人物、地点、势力、道具、能力、规则、事件等通用实体和作者确认的静态Canon。 |
| M3-04 | [动态状态、时间线与知情信息](M3/M3-04_STATE_TIMELINE_KNOWLEDGE.md) | M3-02、M3-03 | 建立按章节生效的动态状态历史、时间事件和人物知情边界。 |
| M3-05 | [伏笔生命周期与人物弧光](M3/M3-05_FORESHADOWING_CHARACTER_ARC.md) | M3-04 | 建立伏笔承诺追踪和人物弧光计划/里程碑模型。 |
| M3-06 | [状态提案、定稿、尾快照与失效传播](M3/M3-06_STATE_PROPOSAL_SNAPSHOT.md) | M3-04、M3-05、M1-07、M2-03 | 将章节定稿安全转换为下一章连续性入口，并在旧章返修后标记派生数据失效。 |
| M3-07 | [Renderer React基础、Bridge适配与状态边界](M3/M3-07_RENDERER_REACT_FOUNDATION.md) | M3-06 | 建立React Root、Zustand UI边界、Bridge适配、状态仲裁和渐进迁移兼容面。 |
| M3-08 | [Renderer壳层、首页、项目与设置迁移](M3/M3-08_RENDERER_SHELL_HOME_SETTINGS.md) | M3-07 | 迁移应用壳、六入口导航、首页、项目、设置、焦点和响应式侧栏。 |
| M3-09 | [Renderer规划、设定、结构与数据工具迁移](M3/M3-09_RENDERER_PLANNING_CANON_STRUCTURE.md) | M3-08 | 迁移M1—M3规划、设定、结构、恢复和基础导入导出工作台。 |
| M3-10 | [Renderer写作、Version、Candidate迁移与旧入口退役](M3/M3-10_RENDERER_WRITING_CANDIDATE_CUTOVER.md) | M3-09 | 迁移最高风险写作域，删除旧命令式DOM入口，形成M4正式前端基线。 |

## 阶段退出门

- 规划、设定、状态、时间线、知情、伏笔和弧光可独立维护。
- 状态提案必须作者确认，尾快照可供下一章读取。
- 旧章返修只标记派生数据失效，不自动改写后文。
- React成为Renderer唯一正式渲染系统，Zustand不成为业务真源，旧命令式入口退役。
- M4新增Renderer能力只能进入Bridge、Feature和统一状态体系。

## 执行规则

- 只能通过`ACTIVE_TASK.md`激活其中一张任务卡。
- 未满足依赖不得提前实现后续任务。
- 每张任务完成后同步追踪矩阵与证据目录。
