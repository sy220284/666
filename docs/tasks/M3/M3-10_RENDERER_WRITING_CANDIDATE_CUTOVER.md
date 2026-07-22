# M3-10 Renderer写作、Version、Candidate迁移与旧入口退役

> 状态：Verified  
> 里程碑：M3 规划、设定与连续性  
> 优先级：P0  
> 建议分支：`refactor/m3-renderer-writing-candidate-cutover`

## 目标

将Tiptap写作工作台、自动保存、查找替换、锁定、Version、Candidate预览/采用、冲突与撤销迁移到React，完成旧命令式Renderer入口退役，并以行为等价和安全零退化作为M3退出门。

## 阶段定位

正文与Candidate是Renderer最高风险域，最后迁移可复用前三张任务建立的React壳、Bridge、状态和组件边界。完成后M4—M6只在正式React架构上扩展。

## 非目标

- 不重写Tiptap Schema、Block Patch、Autosave Coordinator或Core事务。
- 不改变Draft/Candidate/Version、Revision、Hash、LockGuard和ApplyRecord语义。
- 不提前实现M5 AI生成、融合和完整候选审阅新功能。
- 不以一次性全量替换绕过现有Electron E2E和人工验收。

## 依赖

M3-09

## 关联

- 需求：REQ-007—REQ-013、REQ-029、REQ-035、REQ-039—REQ-041、REQ-047
- 功能ID：EDT-001—005、VER-001/002、CND-001—004、UI-002—007、THM-001架构基础
- 验收：P0-013—P0-021、P0-029—P0-032、P0-050、P0-060—P0-066、P0-075基础

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/decisions/ADR-005-lock-revision-backup.md`
- `docs/ui/EDITOR_INTERACTION_SPEC.md`
- `docs/ui/CANDIDATE_REVIEW_SPEC.md`
- `docs/ui/SCREEN_SPECIFICATIONS.md`
- `docs/ui/INTERACTION_STATES.md`

## 主要影响范围

- `apps/desktop/renderer/`
- `packages/editor-core/`
- `packages/contracts/`
- `tests/unit/`
- `tests/integration/`
- `tests/security/`
- `tests/e2e/`
- `tests/performance/`
- `docs/architecture/`
- `docs/ui/`

## 实施内容

1. 实现React写作工作台：左卷章、中Tiptap正文、右侧上下文标签和底部保存/字数/任务/风险状态。
2. 将Tiptap封装为独立Editor组件和Session Hook，保持中文IME、选区、撤销栈、滚动位置和章节切换flush。
3. 将Autosave Coordinator接入React生命周期，保存状态只在Core事务确认后变化。
4. 迁移当前章查找替换、块类型、分隔符、锁定和编辑器统计，继续复用Editor Core算法。
5. 迁移Version历史、定稿、比较、恢复为新Draft和导出；Version保持只读不可变。
6. 迁移Candidate预览、Diff、丢弃、采用、冲突集合、ApplyRecord和重启后撤销入口。
7. 删除旧`index.ts`、静态HTML业务主体、Candidate bootstrap和遗留全局DOM状态；`index.html`只保留安全元信息、样式入口和React Root。
8. 建立Bundle、性能、内存、事件注销和重复监听回归，避免双实例、重复保存和幽灵任务。

## 实现约束记录

- Renderer通过统一Bridge Adapter访问Draft、Version、Candidate和规划结构，React组件不直连Preload全局对象。
- 章节切换、面板切换和返回项目均先flush当前Draft；重建编辑器时恢复章节选区并重新聚焦正文DOM选区。
- Version创建在异步flush前固定表单元素引用，避免React事件对象跨await后失效；恢复操作继续创建新Draft，不修改原Version与原Draft记录。
- Candidate预览保持只读，采用与撤销继续由Core事务、Revision、Hash、LockGuard和ApplyRecord约束。

## 测试与证据

- 中文IME、800ms自动保存、失败持续提示、切章/关闭flush和未保存文本复制通过。
- 锁定、Revision/Hash冲突、Candidate隔离、原子采用、撤销和重启恢复零退化。
- 候选基础布局和窄视口降级可用，完整M5能力仍按后续任务实现。
- 长章编辑、Diff和章节切换性能不低于迁移前预算。
- 静态扫描确认旧入口、Bridge直调、业务DOM查询和重复状态系统清除。
- M3批量复验运行`29914507812`完成25/25 Electron E2E及全部永久门。

证据保存到：`docs/test-evidence/M3-10/`

## 完成条件

- React成为Renderer唯一页面渲染系统，旧`index.ts`及业务HTML入口删除。
- Zustand只承载UI临时状态；Tiptap和Core继续承担既定职责。
- 写作、Version、Candidate、冲突、锁定、保存和恢复行为有等价证据且安全指标保持为0。
- M4只能在M3全部任务Verified且延期账本清空后激活。

任务关闭前必须同步`TASK_INDEX.md`、追踪矩阵及实际受影响的架构、UI、安全、性能和测试文档。
