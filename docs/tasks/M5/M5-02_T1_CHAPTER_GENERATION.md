# M5-02 T1章节扩写

> 状态：Planned  
> 里程碑：M5 AI生成与候选审阅  
> 优先级：P0  
> 建议分支：`feat/m5-t1-chapter-generation`

## 目标

基于作者选定或编辑后的骨架和完整约束包生成章节Candidate。

## 阶段定位

完成T0/T1、改写、融合、候选审阅、采用和撤销的作者可控AI闭环。

## 非目标

- 不直接写Draft。
- 不要求所有模型输出长正文JSON。

## 依赖

M5-01

## 关联

- 需求：REQ-026
- 功能ID：AI-005
- 验收：P0-026

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/ai/PROMPT_AND_EVAL_SPEC.md`
- `docs/contracts/EVENT_PROTOCOL.md`
- `docs/ui/CANDIDATE_REVIEW_SPEC.md`

## 主要影响范围

- `packages/prompts/`
- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/renderer/`
- `evals/`
- `tests/integration/`
- `tests/e2e/`

## 实施内容

1. 优先使用纯文本流，稳定结构化模型可输出temporaryId/beatId/type/content Blocks。
2. 输入包含骨架、约束包、目标字数、文风、Few-shot、必须/禁止项。
3. Renderer只展示临时流，完成后解析并一次保存完整Candidate。
4. 断流或取消按用户选择保存partial Candidate。
5. 禁止模型外壳、直接Patch和未确认Draft写入。
6. 后置校验报告必选事件、前章衔接和约束风险。

## 测试与证据

- 纯文本和结构化双模式、断流、取消、格式修复失败和骨架遗漏。
- 切章续跑、多任务并行和重启后Run状态。
- 任何失败不改变Draft。

证据保存到：`docs/test-evidence/M5-02/`

## 完成条件

- T1输出始终进入Candidate。
- 作者可跳过T0并以章节目标直接生成。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
