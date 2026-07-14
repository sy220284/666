# M5-04 多候选融合与部分结果恢复

> 状态：Planned  
> 里程碑：M5 AI生成与候选审阅  
> 优先级：P0  
> 建议分支：`feat/m5-candidate-merge-partial`

## 目标

按SceneBeat组合多个候选并安全处理取消、断流和partial Candidate。

## 阶段定位

完成T0/T1、改写、融合、候选审阅、采用和撤销的作者可控AI闭环。

## 非目标

- 不把融合结果直接写Draft。
- 不自动选择所谓最佳候选。

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

## 主要影响范围

- `migrations/project/`
- `packages/prompts/`
- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/renderer/`
- `evals/`
- `tests/integration/`

## 实施内容

1. 实现BeatSourceMapping，记录每个节拍来源Candidate和保留当前稿选择。
2. 检测SceneBeat顺序、重复事件、指代、地点连续性和拼接缝隙。
3. 只生成必要过渡，输出新的merge Candidate。
4. partial Candidate明确标识，不可直接定稿。
5. 支持继续生成、手动补全、保存部分或丢弃。
6. 取消后不再发送正文delta，已接收内容按用户选择处理。

## 测试与证据

- 多候选节拍选择、重复、顺序错误和过渡失败。
- 取消、断流、partial保存、继续生成和重启。
- 融合失败不改变源Candidate和Draft。

证据保存到：`docs/test-evidence/M5-04/`

## 完成条件

- 融合结果可追溯到来源节拍。
- 部分结果不会被误当完整稿。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
