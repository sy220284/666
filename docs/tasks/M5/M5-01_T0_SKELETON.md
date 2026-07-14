# M5-01 T0多候选骨架

> 状态：Planned  
> 里程碑：M5 AI生成与候选审阅  
> 优先级：P0  
> 建议分支：`feat/m5-t0-skeleton`

## 目标

基于章节目标、SceneBeat和约束包生成多个可比较的结构化骨架Candidate。

## 阶段定位

完成T0/T1、改写、融合、候选审阅、采用和撤销的作者可控AI闭环。

## 非目标

- 不直接生成或修改Draft。
- 作者可完全绕过T0。

## 依赖

M4

## 关联

- 需求：REQ-026
- 功能ID：AI-004
- 验收：P0-025

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/ai/PROMPT_AND_EVAL_SPEC.md`
- `docs/product/FUNCTION_CATALOG.md`
- `docs/contracts/EVENT_PROTOCOL.md`

## 主要影响范围

- `packages/prompts/`
- `packages/core-service/`
- `packages/contracts/`
- `apps/desktop/renderer/`
- `evals/`
- `tests/integration/`
- `tests/e2e/`

## 实施内容

1. 输入包含ProjectBrief、章节目标、必选SceneBeat、尾快照、状态、知情、伏笔、长度、频道。
2. 输出包含beatId、顺序、事件、cause、consequence、informationReleased、characterIntentions、endingHook和risks。
3. 一次运行生成多个skeleton Candidate，保留Prompt/约束/模型来源。
4. 校验全部必选SceneBeat覆盖，禁止正文全文冒充骨架。
5. 无法解析时最多一次明确格式修复，失败返回稳定错误。
6. 支持作者编辑骨架和直接绕过进入T1。

## 测试与证据

- 必选节拍、因果、结尾钩子、无效JSON、取消和多候选。
- 相同Fixture回归Eval，未验证模型正确标识。
- 任何失败不改变Draft。

证据保存到：`docs/test-evidence/M5-01/`

## 完成条件

- T0是可选低成本决策工具，不成为强制流程。
- 骨架Candidate可被M5-02读取。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
