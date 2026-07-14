# M4-04 Prompt Registry、输出Schema与Cleaner

> 状态：Planned  
> 里程碑：M4 检索与AI基础设施  
> 优先级：P0  
> 建议分支：`feat/m4-prompt-registry-output`

## 目标

建立生产级版本化Prompt、输入输出Schema、构建器、解析器和受控清理规则。

## 阶段定位

建立FTS、约束包、Provider、Prompt和GenerationRun等可复用AI基础设施。

## 非目标

- 不在UI、Provider或Repository散落Prompt。
- 不把个人文风偏好硬编码为全局规则。

## 依赖

M4-02、M4-03

## 关联

- 需求：REQ-026、REQ-027、REQ-030
- 功能ID：AI-004—AI-008、AI-010基础
- 验收：P0-025—P0-028相关Eval

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/ai/PROMPT_AND_EVAL_SPEC.md`
- `docs/ai/PROVIDER_PROTOCOL.md`

## 主要影响范围

- `packages/prompts/`
- `packages/contracts/`
- `evals/`
- `tests/unit/`
- `tests/integration/`

## 实施内容

1. PromptDefinition包含稳定promptId、整数version、taskType、inputSchema、outputSchema、build和supportedModes。
2. 实现PromptBundle、约束Hash和GenerationRun元数据。
3. 分别建立T0、T1、rewrite、merge、validate、state_extract输入输出Schema。
4. 支持纯文本与结构化模式，按ModelSupportProfile选择，不强制所有模型长正文JSON。
5. Cleaner只清除登记的协议外壳和废话，不猜测重写无效JSON。
6. 重复Prompt版本注册必须失败，历史版本可读取。
7. 所有Prompt变更绑定对应Eval和公开Fixture。

## 测试与证据

- 注册、版本并存、重复冲突、占位符完整和输入输出Schema。
- 代码围栏、无效JSON、多JSON片段、一次格式修复和Cleaner正反Fixture。
- 静态扫描Prompt不散落到UI和Provider。

证据保存到：`docs/test-evidence/M4-04/`

## 完成条件

- Prompt Registry可审计、可复现、可降级。
- Prompt不承担锁定、Revision、项目边界和Candidate隔离。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
