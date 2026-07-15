# M0-06 显示、DPI与窗口恢复Spike

> 状态：In Progress
> 里程碑：M0 工程、安全与运行底座  
> 优先级：P0  
> 工作分支：`main`（作者预授权连续主线模式）

## 目标

在业务页面开发前验证窗口状态、响应式布局、正文宽度和混合DPI策略。

## 阶段定位

应用可安全启动、Core可监管、SQLite/IPC/测试底座可用，关键技术风险有量化结论。

## 非目标

- 不实现最终视觉主题。
- 不实现完整业务工作台。

## 依赖

M0-02、M0-03、M0-05

## 关联

- 需求：REQ-041
- 功能ID：UI-006、UI-007
- 验收：P0-063—P0-066

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/ui/RESPONSIVE_AND_DPI.md`
- `docs/ui/UI_SYSTEM.md`
- `docs/testing/PERFORMANCE_BUDGETS.md`

## 主要影响范围

- `apps/desktop/main/`
- `apps/desktop/preload/`
- `apps/desktop/renderer/`
- `packages/contracts/`
- `packages/core-service/`
- `migrations/app/`
- `tests/e2e/`
- `tests/migration/`
- `tests/performance/`
- `tests/security/`
- `docs/ui/`

## 实施内容

1. 在app.sqlite保存DIP窗口坐标、displayId、scaleFactor、最大化状态和工作区对齐偏好。
2. 实现680/760/860 CSS px正文版心原型，界面缩放、正文字号和正文宽度独立。
3. 验证<1100px右抽屉、<900px双抽屉和21:9居中/偏左/偏右。
4. 验证Popover、选区工具、菜单和对话框跨屏重定位。
5. 验证窗口重启、显示器丢失和混合DPI切换后仍可见。

## 测试与证据

- 1280×800、2560×1440的100/125/150%、3440×1440、3840×1600、混合DPI、1024×640有效视口。
- 无整页水平滚动，文字/SVG清晰，窗口恢复正确。
- 保存状态不依赖临时JSON文件。

证据保存到：`docs/test-evidence/M0-06/`

## 完成条件

- 形成可复用响应式与窗口恢复决策及截图矩阵。
- 未通过的策略必须在进入M1前修正或明确Blocked。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
