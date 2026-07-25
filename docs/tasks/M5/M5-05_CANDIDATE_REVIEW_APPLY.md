# M5-05 候选审阅、采用与冲突工作台

> 状态：Planned  
> 里程碑：M5 AI生成与候选审阅  
> 优先级：P0  
> 建议分支：`work/m5-05-candidate-review-apply`

## 目标

将AI候选和M2-03已经验收的Diff、ConflictSet、原子采用与持久化撤销引擎整合为完整作者审阅体验，并明确Skeleton、Prose和partial Candidate的不同权限。

## 阶段定位

M2-03负责底层安全采用引擎和最小功能验收面；M5-05负责完整候选工作台、AI任务入口、长章节审阅效率和跨显示环境体验。

M5-05不得重写Candidate、ApplyRecord、ConflictSet、Checkpoint、Revision、Hash或LockGuard语义。如底层能力不足，应在本任务中通过正式合同扩展承接，不回写已完成任务卡，也不得在Renderer建立旁路状态。

## 非目标

- 不使用单一AI评分强制推荐。
- 不建立绕过M2-03 Core事务的Renderer本地采用流程。
- 不复制一套主题专属的采用、冲突或撤销状态机。
- 不允许Skeleton进入正文Diff、Apply或定稿。
- 不允许partial Candidate默认整稿采用或直接定稿。

## 依赖

M5-01、M5-02、M5-03、M5-04、M2-03

其中M2-03必须已经提供并验收：

- 动态结构Diff和中文字符Diff。
- 整稿、块级和SceneBeat选择映射。
- ConflictSet。
- 原子Apply事务、ApplyRecord和Checkpoint。
- 即时撤销及重启后回退。
- Core、Main IPC和Preload白名单命令。

## Candidate类型边界

```text
Skeleton Candidate
├─ 骨架比较
├─ 作者编辑
├─ 作为T1输入
└─ 禁止正文Diff、Apply和定稿

Prose Candidate
├─ full
├─ rewrite
├─ merge
├─ Diff与冲突处理
└─ Draft Apply

partial Prose Candidate
├─ 继续生成
├─ 手动补全
├─ 块级审阅（显式风险）
└─ 禁止默认整稿采用和直接定稿
```

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
- `docs/tasks/M5/M5-00_AUTHOR_WORKFLOW_PRODUCT_EXPERIENCE.md`
- `docs/tasks/M5/M5-01_T0_SKELETON.md`
- `docs/tasks/M4/M4-05_GENERATION_RUNTIME_EVAL.md`

## 主要影响范围

- `apps/desktop/renderer/`
- `packages/editor-core/`
- `packages/contracts/`
- `packages/core-service/`（仅Candidate类型守卫、生产来源查询或M2契约无法承接的正式扩展）
- `tests/unit/`
- `tests/integration/`
- `tests/e2e/`
- `tests/performance/`
- `docs/ui/`

项目数据库Schema默认不修改；确需增加审阅索引或来源投影时必须证明现有持久化无法承载，并使用追加Migration。

## 实施内容

1. 将AI任务完成、候选历史、快速改写和融合结果接入统一审阅入口。
2. 候选列表按任务、时间、类型、状态、完整度和基础Revision展示。
3. 每个候选显示GenerationRun、Provider/Model、Prompt版本、约束来源、裁剪摘要和来源Version；普通界面使用作者语言，高级详情提供技术追溯。
4. Skeleton工作区只提供骨架比较、编辑、选择和进入T1，不出现正文采用按钮；Core类型守卫作为最终硬保证。
5. Prose工作区支持双栏、上下、单稿、只看差异、折叠未改段、同步滚动和差异导航。
6. 在M2-03选择语义上实现整稿、块级、SceneBeat级采用和保留当前稿交互。
7. partial Candidate显著显示限制、截断位置、继续生成和手动补全入口；整稿采用和定稿默认禁用并给出原因。
8. ConflictSet区分Revision、Hash、锁定、缺失块和结构冲突，并提供清晰解决路径。
9. 提交前展示修改摘要，成功后定位首个修改块并提供整体撤销。
10. 完成多Candidate比较、骨架选择、节拍融合和手动合并工作台，但不得复制M5-04融合业务或M2-03采用事务。
11. UI术语、导航、状态、禁用原因和错误表达遵循M5-00。
12. 完成1280×800、2K、21:9、混合DPI、键盘和读屏标签验收。
13. Theme A/B只改变视觉Token与动效，不改变业务调用、命令和状态机。

## 测试与证据

- AI生成→候选入口→审阅→冲突→采用→撤销全流程。
- Skeleton比较/编辑/T1入口及所有正文Apply命令拒绝。
- partial继续生成、手动补全、限制展示、整稿采用拒绝和定稿拒绝。
- GenerationRun、Prompt、约束来源和候选历史追溯。
- 5000/20000字候选性能、视口切换、折叠和滚动同步。
- 块级/节拍级采用、冲突、锁定、撤销和重启回退。
- 1280×800、2K 125%、21:9和混合DPI。
- 键盘全流程、读屏标签和不依赖单一颜色表达。
- Theme切换前后业务结果一致。

证据保存到：`docs/test-evidence/M5-05/`

## 完成条件

- AI生成→审阅→冲突→采用→撤销全链路可用。
- Skeleton进入正文Diff、Apply或Version的成功次数为0。
- partial不会被误当完整稿、默认整稿采用或直接定稿。
- 完整候选工作台不复制或绕过M2-03底层事务。
- 所有AI结果均可追溯到GenerationRun、Prompt和约束来源。
- M5退出前候选审阅界面符合M5-00作者语言和工作台规范。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、AI、UI、安全或测试文档。
