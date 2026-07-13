# M5-02 性能、高分屏、AI Eval与长场景验收

> 状态：Planned  
> 优先级：P0  
> 分支：`test/m5-performance-eval`

## 目标

确认真实数据规模、目标显示环境和受支持模型下产品达到V1性能与质量基线。

## 依赖

M4全部完成。

## 关联

- 需求：REQ-026、REQ-029、REQ-030、REQ-041
- 验收：P0-025、P0-026、P0-029、P0-063—P0-066

## 必读文档

- `docs/testing/PERFORMANCE_BUDGETS.md`
- `docs/ai/PROMPT_AND_EVAL_SPEC.md`
- `docs/ui/RESPONSIVE_AND_DPI.md`
- `docs/ui/UI_ACCEPTANCE_CHECKLIST.md`

## 性能测试

- 2K键入P95≤50ms。
- 自动保存P95≤150ms。
- 编辑IPC P95≤200ms。
- AI取消反馈≤500ms。
- 5000字Diff首屏≤500ms、完整≤1.2s。
- 正文滚动≥50fps。
- Core单次事件循环阻塞<100ms。
- FTS5查询和重建记录真实数据。

## 显示测试

1280×800；2560×1440的100/125/150%；3440×1440；3840×1600；混合DPI；1024×640有效视口。

## AI Eval

按Provider、Model、Task、PromptVersion分别记录T0、T1、快速改写、状态提取、连续性和禁止信息泄露结果。

## 拆分决策

达到量化阈值时单独评审AI Utility Process或Worker调整，不在验收任务中顺手大规模重构。

## 完成条件

形成可复核性能报告、显示截图矩阵、AI支持档案和未达标降级清单。
