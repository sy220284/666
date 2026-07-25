# M5-04 多候选融合与部分结果恢复

> 状态：Planned  
> 里程碑：M5 AI生成与候选审阅  
> 优先级：P0  
> 建议分支：`work/m5-04-candidate-merge-partial`

## 目标

按SceneBeat组合多个Prose Candidate，并为取消、断流和partial结果提供清晰的作者处理流程。

## 阶段定位

完成T0/T1、改写、融合、候选审阅、采用和撤销的作者可控AI闭环。本任务负责融合与partial产品流程，底层运行和持久化继续由M4-05负责。

## 非目标

- 不把融合结果直接写Draft。
- 不自动选择所谓最佳候选。
- 不实现第二套取消、delta、Run状态、partial事务或重启恢复机制。
- 不允许Skeleton Candidate进入正文融合输出。

## 依赖

M5-02、M5-03

## 关联

- 需求：REQ-027、REQ-028
- 功能ID：AI-008、CND-005
- 验收：P0-023、P0-024、P0-028

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/ai/PROMPT_AND_EVAL_SPEC.md`
- `docs/ui/CANDIDATE_REVIEW_SPEC.md`
- `docs/contracts/EVENT_PROTOCOL.md`
- `docs/tasks/M4/M4-05_GENERATION_RUNTIME_EVAL.md`
- `docs/tasks/M5/M5-00_AUTHOR_WORKFLOW_PRODUCT_EXPERIENCE.md`

## 主要影响范围

- `migrations/project/`（仅BeatSourceMapping或继续生成追溯确需持久化时）
- `packages/prompts/`
- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/renderer/`
- `evals/`
- `tests/unit/`
- `tests/integration/`
- `tests/e2e/`

## 职责边界

```text
M4-05负责
├─ Provider取消与迟到delta阻断
├─ GenerationRun状态
├─ partial原子保存或丢弃
├─ 结果引用
└─ 重启后持久化查询

M5-04负责
├─ BeatSourceMapping
├─ 多候选节拍选择
├─ 保留当前稿选择
├─ 融合业务输入
├─ 继续生成
├─ 手动补全
└─ partial作者操作入口
```

## 实施内容

1. 实现BeatSourceMapping，记录每个SceneBeat来源Candidate、来源块和“保留当前稿”选择。
2. 只允许同项目、同章节、可用状态的Prose Candidate参与融合；Skeleton只可作为规划参考，不进入正文拼接。
3. 检测SceneBeat顺序、重复事件、指代、地点连续性和拼接缝隙。
4. 只生成必要过渡，输出新的`merge` Candidate并关联全部来源Candidate和GenerationRun。
5. partial Candidate明确标识完整度与截断位置，不可直接定稿或默认整稿采用。
6. 提供继续生成、手动补全、保存部分和丢弃入口；继续生成必须引用原Run、原Prompt、原约束和已接收内容边界。
7. 用户取消时调用M4-05取消协议；本任务只显示真实状态和处理选项，不自行维护底层delta停止逻辑。
8. partial保存、丢弃、Run终态和结果引用由M4-05原子处理；Renderer不得保留旁路全文。
9. UI术语、确认、取消、失败和恢复表达遵循M5-00。

## 测试与证据

- 多候选节拍选择、保留当前稿、重复、顺序错误和过渡失败。
- 跨项目、跨章节、Skeleton和不可用Candidate拒绝。
- 取消、断流、partial保存、丢弃、继续生成、手动补全和重启。
- 取消后无未来delta进入Renderer，验证调用M4-05而非本任务旁路。
- 融合失败不改变源Candidate和Draft。
- merge Candidate可追溯到每个来源节拍与Run。

证据保存到：`docs/test-evidence/M5-04/`

## 完成条件

- 融合结果可追溯到来源节拍、Candidate和GenerationRun。
- 部分结果不会被误当完整稿、整稿采用或直接定稿。
- 取消、流式和partial持久化没有形成第二套运行机制。
- UI遵循M5-00作者语言与状态规范。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、AI、UI、安全或测试文档。
