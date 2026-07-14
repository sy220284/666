# M7-03 双视觉主题、无障碍与响应式验收

> 状态：Planned  
> 里程碑：M7 完整UI与体验整合  
> 优先级：P0  
> 建议分支：`feat/m7-themes-accessibility-responsive`

## 目标

完成Theme A安静编辑部、Theme B水墨印章、对比模式、无障碍和目标显示环境适配。

## 阶段定位

统一工作台、新手/专业模式、主题、无障碍和目标显示环境。

## 非目标

- 主题不得改变业务命令、状态机或数据模型。
- 不实现V1.5作者自定义印文。

## 依赖

M7-02、M0-06

## 关联

- 需求：REQ-041、REQ-047
- 功能ID：UI-006、UI-007、THM-001
- 验收：P0-063—P0-066、P0-075

## 必读文档

- `AGENTS.md`
- `docs/PROJECT_EXECUTION_ENTRY.md`
- `docs/product/WORLDFORGE_V6.5_FULL_SPEC.md`
- `docs/decisions/IMPLEMENTATION_DECISIONS.md`
- `docs/ui/UI_SYSTEM.md`
- `docs/ui/UI_SYSTEM_THEME_B.md`
- `docs/ui/VISUAL_REFERENCE_BASELINE.md`
- `docs/ui/RESPONSIVE_AND_DPI.md`
- `docs/ui/ACCESSIBILITY.md`
- `docs/decisions/ADR-007-theme-logic-separation.md`

## 主要影响范围

- `apps/desktop/renderer/`
- `apps/desktop/main/`
- `tests/e2e/`
- `tests/performance/`
- `docs/ui/`

## 实施内容

1. Theme A提供浅色、深色、护眼、高对比。
2. Theme B按冻结范围提供浅色、深色和印章表现层；后续模式按ADR/UI专项文档执行。
3. 主题只通过Design Token、图标和动画资源实现，不出现主题特定业务分支。
4. 候选应用和章节定稿的印章动画仅在成功回调后播放，减少动态效果时安全降级。
5. 完成键盘、焦点、语义标签、对比度和屏幕阅读器基础。
6. 按M0-06决策完成1280×800、2K 100/125/150%、21:9和混合DPI。
7. 验证主题切换前后Patch、Revision和ApplyRecord一致。

## 测试与证据

- 两种视觉方向、对应对比模式、减少动态、键盘和焦点。
- 13寸、2K 125%、21:9、混合DPI截图矩阵。
- 静态扫描主题条件分支与业务命令耦合。

证据保存到：`docs/test-evidence/M7-03/`

## 完成条件

- 核心业务在所有目标视口和冻结主题范围中可完成。
- UI专项验收清单全部有证据。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的Schema、IPC、UI、安全或测试文档。
