# M5-05 候选审阅、采用与冲突工作台

> 状态：Planned  
> 里程碑：M5 AI生成与候选审阅  
> 优先级：P0  
> 建议分支：`feat/m5-candidate-review-apply`

## 目标

将AI候选和已有Diff/采用引擎整合为完整审阅体验。

## 阶段定位

完成T0/T1、改写、融合、候选审阅、采用和撤销的作者可控AI闭环。

## 非目标

- 不使用单一AI评分强制推荐。
- 不修改Candidate/Version底层语义。

## 依赖

M5-01、M5-02、M5-03、M5-04、M2-03

## 关联

- 需求：REQ-013、REQ-029
- 功能ID：CND-001—CND-005
- 验收：P0-029—P0-032

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/ui/CANDIDATE_REVIEW_SPEC.md`
- `docs/ui/RESPONSIVE_AND_DPI.md`
- `docs/testing/PERFORMANCE_BUDGETS.md`

## 主要影响范围

- `apps/desktop/renderer/`
- `packages/editor-core/`
- `packages/core-service/`
- `packages/contracts/`
- `tests/e2e/`
- `tests/performance/`

## 实施内容

1. 候选列表按任务、时间、状态、完整度和基础Revision展示。
2. 支持双栏、上下、单稿、只看差异、折叠未改段、同步滚动和差异导航。
3. 支持整稿、块级、SceneBeat级采用和保留当前稿。
4. ConflictSet区分Revision、Hash、锁定、缺失块和结构冲突。
5. 提交前再次校验，成功后定位首个修改块并提供整体撤销。
6. partial Candidate显示限制和补全入口。
7. 1280×800、2K和21:9布局使用M0-06决策。

## 测试与证据

- 5000/20000字候选性能、视口切换和滚动同步。
- 块级/节拍级采用、冲突、锁定、撤销和重启回退。
- Theme逻辑无关，业务结果在视觉方向切换前后一致。

证据保存到：`docs/test-evidence/M5-05/`

## 完成条件

- AI生成→审阅→冲突→采用→撤销全链路可用。
- M5退出时作者可控AI写作闭环完成。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
