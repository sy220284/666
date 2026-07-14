# M8-02 性能、E2E、显示与AI Eval验收

> 状态：Planned  
> 里程碑：M8 发布硬化与验收  
> 优先级：P0  
> 建议分支：`test/m8-performance-e2e-ai-eval`

## 目标

在真实数据规模、完整业务路径、目标显示环境和支持模型下验证性能与质量基线。

## 阶段定位

完成安全、数据、性能、E2E、跨平台构建、P0追踪和发布关闭。

## 非目标

- 未达到阈值时不在验收任务内无计划拆进程。

## 依赖

M8-01、M7-03

## 关联

- 需求：REQ-026、REQ-029、REQ-030、REQ-041
- 功能ID：无
- 验收：P0-025、P0-026、P0-029、P0-063—P0-066

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/testing/PERFORMANCE_BUDGETS.md`
- `docs/testing/P0_ACCEPTANCE_MATRIX.md`
- `docs/ai/PROMPT_AND_EVAL_SPEC.md`
- `docs/ui/UI_ACCEPTANCE_CHECKLIST.md`

## 主要影响范围

- `tests/performance/`
- `tests/e2e/`
- `evals/`
- `docs/test-evidence/M8-02/`
- `必要的缺陷修复路径`

## 实施内容

1. 验证2K键入P95≤50ms、自动保存P95≤150ms、编辑IPC P95≤200ms。
2. AI取消反馈≤500ms，5000字Diff首屏≤500ms、完整≤1.2s。
3. 正文滚动≥50fps，Core单次事件循环阻塞<100ms。
4. 记录FTS查询/重建、长章节、百万字和多任务真实数据。
5. 完成创建项目→写作→版本→规划→AI→校验→导出→恢复完整E2E。
6. 按Provider、Model、Task、PromptVersion记录T0、T1、改写、状态提取和连续性Eval。
7. 完成1280×800、2K、21:9、混合DPI和主题截图矩阵。

## 测试与证据

- 性能、E2E、Eval和显示矩阵全部运行。
- 达拆分阈值时单独提出后续任务，不顺手大改。
- 未达标功能有明确降级或阻断结论。

证据保存到：`docs/test-evidence/M8-02/`

## 完成条件

- 形成可复核性能报告、E2E报告、AI支持档案和显示证据。
- 不存在伪造进度或只跑局部成功路径。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
