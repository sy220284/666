# M0-06 AI质量与中文Diff Spike

> 状态：Planned  
> 优先级：P0  
> 分支：`feat/m0-ai-diff-spike`

## 目标

在完整AI功能开发前验证T0/T1结构化输出、Provider故障路径、中文长段落Diff和性能预算。

## 依赖

M0-03、M0-04。

## 关联

- 需求：REQ-026、REQ-029、REQ-030
- 验收：P0-025、P0-026、P0-029

## 必读文档

- `docs/ai/PROMPT_AND_EVAL_SPEC.md`
- `docs/ai/PROVIDER_PROTOCOL.md`
- `docs/ui/CANDIDATE_REVIEW_SPEC.md`
- `docs/testing/PERFORMANCE_BUDGETS.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`

## 实施内容

1. 建立Provider Stub：正常流、断流、无效JSON、超时、取消。
2. 实现最小T0输入/输出Schema与Prompt Registry。
3. 验证T1基于骨架生成Candidate的协议链路。
4. 实现logicalBlockId结构Diff。
5. 实现中文字符Diff，覆盖新增、删除、移动、拆分、合并。
6. 生成最小Eval报告和ModelSupportProfile。
7. 评估Diff是否需要Worker或分片。

## 性能

- 5000字Diff首屏≤500ms。
- 5000字完整≤1.2s。
- 计算可取消且不阻塞编辑器输入。

## 决策输出

- T0/T1是否继续作为V1可选路径。
- 中文Diff算法和任务调度方式。
- 失败时的明确降级方案。

## 完成条件

协议、结构化解析、故障路径和性能报告齐全；不能用UI占位掩盖未达标的算法或模型能力。
