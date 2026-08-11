# M11-04 可视化故事知识工作台

> 状态：Planned  
> 里程碑：M11 产品体验与 AI 创作协同  
> 优先级：P1  
> 执行分支：`work`  
> 目标分支：`main`

## 目标

在 M11-03 权威故事数据与现有 CanonWorkbench 基础上，建立人物卡、人物关系图、故事时间线、伏笔泳道、人物成长路线和历史时间轴等可视化投影，同时保持原有列表/编辑入口作为精确编辑与窄屏降级路径。

## 阶段定位

本任务只解决“已有权威故事数据如何更高效地看、找、理解、跳转”。所有可视化均为只读投影或受控导航，不建立新的业务真源。

## 非目标

- 不新增第二套设定工作台、知识数据库或图谱快照数据库。
- 不在 Renderer 聚合并持久化业务状态。
- 不复制 Canon、Continuity、NarrativePlanning 的写逻辑。
- 不为了图形布局修改故事事实模型。
- 不以复杂关系图替代所有列表和表单编辑能力。

## 依赖

- M11-03 有效 VERIFIED。

## 真实承接基线

启动时以最新 verified main 为准。规划承接点：

- `CanonWorkbench` / `CanonCoreWorkbench`。
- `ContinuityRelationshipEditor`、时间线/知情编辑器。
- `NarrativeRelationshipEditor`、伏笔与人物弧光。
- 写作工作台现有“本章写作辅助”。
- Version/Candidate/Recovery 历史能力。
- M11-03 `CharacterRelationship` 与统一 AI 审阅结果。

## 关联

- 功能ID：`KNO-VIS-001`、`CHAR-CARD-001`、`REL-GRAPH-001`、`TIM-VIS-001`、`ARC-VIS-001`。
- 验收：快速定位人物、关系、时间、伏笔、成长与历史状态；1000 章作品保持可用。

## 必读文档

- `docs/architecture/ARCHITECTURE.md`
- `docs/ui/SCREEN_SPECIFICATIONS.md`
- `docs/ui/INFORMATION_ARCHITECTURE.md`
- `docs/tasks/TASK_TEMPLATE.md`
- M3-04、M3-05、M11-03 任务卡

## 主要影响范围

- `packages/contracts/`
- `packages/core-service/`（只读 projection/query）
- `apps/desktop/main/`
- `apps/desktop/preload/`
- `apps/desktop/renderer/src/features/canon/`
- `apps/desktop/renderer/src/features/writing/`
- `apps/desktop/renderer/src/shell/`
- `tests/`
- UI/IPC/架构文档

## 职责、状态所有权与依赖方向

1. 新增 `StoryKnowledgeProjectionService` 或等价只读查询边界，负责 bounded query、分页、章节有效性过滤、图邻域读取和聚合 DTO。
2. Projection 不拥有 INSERT/UPDATE/DELETE 权限，不保存图形状态为故事事实。
3. 所有编辑动作导航回现有 Canon/Continuity/Relationship/NarrativePlanning 命令。
4. Renderer 仅拥有布局、缩放、选中、展开等临时 UI 状态。
5. 图谱、时间线、人物卡共享相同投影来源，避免各组件自行发起大量重复 catalog 读取。

## 数据库与 Migration

- 默认零新增业务表。
- 允许为现有表增加必要只读查询索引，但必须以真实性能证据证明。
- 禁止新增 `character_graph_snapshots`、`timeline_visual_state`、`knowledge_projection_cache` 等持久真源。
- 如引入可重建缓存，必须单独证明必要性并按 `regenerate` 进入 ClonePolicy；默认不做。

## IPC、事件与错误码

可增加具名只读查询，例如：

- character knowledge projection
- relationship neighborhood
- timeline window
- foreshadowing lane window
- arc route
- history aggregation

所有查询必须带 project scope、分页/窗口上限和稳定排序。目标变化或已归档时返回明确 stale/missing 结果，禁止猜测替代对象。

## UI 闭环

### 人物卡

聚合：基础资料、CanonFact、当前状态、知情、人物关系、近期事件、伏笔、弧光。

### 人物关系图

- 默认中心人物 + 一级邻居。
- 用户按需扩展二级及更多邻居。
- 支持章节滑杆查看当时有效关系。
- 节点点击打开人物卡；边点击打开关系编辑器。

### 时间线

提供：故事时间、章节时间、人物时间三种投影；保留列表作为精确编辑入口。

### 伏笔泳道与成长路线

直接投影既有 Foreshadowing、ArcMilestone 和 dependency；不保存额外可视状态。

### 历史时间轴

聚合 Version、Candidate、checkpoint 与 Recovery 元数据，恢复操作继续调用原服务。

### 本章写作辅助升级

在现有“本章”区域增加 AI 审阅摘要、时间线、关系变化、成长节点和历史跳转，不新增平行 ChapterConsole。

## 安全、隐私与恢复

- 只读 projection 不扩大 Renderer 能力面。
- 所有导航目标使用现有稳定 ID 与项目归属校验。
- 只读项目允许查看，所有编辑动作保持禁用。
- 恢复、克隆不依赖任何可视化临时状态。

## 性能预算

必须提供 100 / 300 / 1000 章项目测试：

- 首屏只加载当前可见窗口和必要邻域。
- 关系图默认节点数设置硬上限，扩展按需查询。
- 大列表使用分页/虚拟化。
- 查询 P95、Renderer 内存与交互帧率不得出现相对当前基线的明显退化。
- 切换项目/章节后旧请求不得回写新页面。

## 实施内容

1. 定义 StoryKnowledge projection contract。
2. Core 只读聚合查询与索引评估。
3. Main/Preload/Renderer Bridge。
4. 人物卡。
5. 人物关系图。
6. 时间线三投影。
7. 伏笔泳道和成长路线。
8. 历史时间轴。
9. 升级现有本章写作辅助。
10. 响应式、键盘、空状态、失败/取消/stale 降级。

## 自动化测试

```text
pnpm task:validate
pnpm check:language
pnpm check:workspaces
pnpm check:boundaries
pnpm check:docs
pnpm check:governance
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:coverage
pnpm test:security
pnpm test:reliability
pnpm test:perf
pnpm build
pnpm test:e2e
```

专项覆盖：

- Projection 只读保证。
- 章节有效关系过滤。
- 1000 章窗口查询。
- Request race、切项目 stale response。
- 窄屏、键盘与列表 fallback。
- 目标归档/删除后的安全跳转失败。

## 人工验收

- 从人物图可在三步以内进入关系/人物原始编辑入口。
- 章节滑杆变化时只显示当时有效的数据。
- 1000 章测试项目不一次性加载全书关系和时间线。
- 可视化失败时列表与正文写作继续可用。

## Evidence

保存到：`docs/test-evidence/M11-04/`

## 回滚策略

整体回滚 projection 接口与可视化组件；因本任务默认无新业务表，回滚后原 Canon/Continuity/NarrativePlanning 数据与编辑器保持完整可用。

## 完成条件

- 可视化全部来自现有权威数据或 M11-03 新权威关系数据。
- 无第二份故事知识真源。
- 大项目性能、请求生命周期、只读与失效目标路径通过专项测试。
- Contracts → Core → Main → Preload → Renderer → 测试闭环完成。
