# M5-05 候选审阅、采用与冲突工作台

> 状态：Planned  
> 里程碑：M5 AI生成与候选审阅  
> 优先级：P0  
> 建议分支：`feat/m5-candidate-review-apply`

## 目标

将AI候选和M2-03已经验收的Diff、ConflictSet、原子采用与持久化撤销引擎整合为完整作者审阅体验。

## 阶段定位

M2-03负责底层安全采用引擎和最小功能验收面；M5-05负责完整候选工作台、AI任务入口、长章节审阅效率和跨显示环境体验。

M5-05不得重写Candidate、ApplyRecord、ConflictSet、Checkpoint、Revision、Hash或LockGuard语义。如底层能力不足，应回到对应M2契约修订，而不是在Renderer建立旁路状态。

## 非目标

- 不使用单一AI评分强制推荐。
- 不修改Candidate/Version底层语义。
- 不建立绕过M2-03 Core事务的Renderer本地采用流程。
- 不复制一套主题专属的采用、冲突或撤销状态机。

## 依赖

M5-01、M5-02、M5-03、M5-04、M2-03

其中M2-03必须已经提供并验收：

- 动态结构Diff和中文字符Diff。
- 整稿、块级和SceneBeat选择映射。
- ConflictSet。
- 原子Apply事务、ApplyRecord和Checkpoint。
- 即时撤销及重启后回退。
- Core、Main IPC和Preload白名单命令。

## 关联

- 需求：REQ-013、REQ-029
- 功能ID：CND-001—CND-005
- 验收：P0-027—P0-032、P0-063—P0-066

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/ui/CANDIDATE_REVIEW_SPEC.md`
- `docs/ui/RESPONSIVE_AND_DPI.md`
- `docs/testing/PERFORMANCE_BUDGETS.md`
- `docs/tasks/M2/M2-03_DIFF_APPLY_CONFLICT_UNDO.md`

## 主要影响范围

- `apps/desktop/renderer/`
- `packages/editor-core/`
- `packages/contracts/`
- `tests/e2e/`
- `tests/performance/`
- `docs/ui/`

默认不修改`packages/core-service/`和项目数据库Schema；确需修改时必须先证明M2-03已验收契约无法支持目标交互。

## 实施内容

1. 将AI任务完成、候选历史、快速改写和融合结果接入统一审阅入口。
2. 候选列表按任务、时间、状态、完整度和基础Revision展示。
3. 支持双栏、上下、单稿、只看差异、折叠未改段、同步滚动和差异导航。
4. 在M2-03选择语义上实现整稿、块级、SceneBeat级采用和保留当前稿交互。
5. ConflictSet区分Revision、Hash、锁定、缺失块和结构冲突，并提供清晰解决路径。
6. 提交前展示修改摘要，成功后定位首个修改块并提供整体撤销。
7. partial Candidate显示限制、补全和继续生成入口。
8. 完成多Candidate比较、骨架选择、节拍融合和手动合并工作台。
9. 完成1280×800、2K、21:9、混合DPI、键盘和读屏标签验收。
10. Theme A/B只改变视觉Token与动效，不改变业务调用、命令和状态机。

## 测试与证据

- AI生成→候选入口→审阅→冲突→采用→撤销全流程。
- 5000/20000字候选性能、视口切换、折叠和滚动同步。
- 块级/节拍级采用、冲突、锁定、撤销和重启回退。
- 1280×800、2K 125%、21:9和混合DPI。
- 键盘全流程、读屏标签和不依赖单一颜色表达。
- Theme切换前后业务结果一致。

证据保存到：`docs/test-evidence/M5-05/`

## 完成条件

- AI生成→审阅→冲突→采用→撤销全链路可用。
- 完整候选工作台不复制或绕过M2-03底层事务。
- M5退出时作者可控AI写作闭环完成。
- P0-027—P0-032及P0-063—P0-066相关证据闭合。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
