# M7-03 双视觉主题、无障碍与响应式验收

> 状态：Planned  
> 里程碑：M7 完整UI与体验整合  
> 优先级：P0  
> 建议分支：`work/m7-03-themes-accessibility-responsive`

## 目标

在现有Appearance和Theme状态基础上完成Theme A安静编辑部、Theme B水墨印章、对比模式、无障碍和目标显示环境终验。

## 阶段定位

M3与M5已经建立主题状态和基础工作台；M7-03负责视觉资源、响应式、无障碍和显示环境最终闭环，不建立第二套主题状态源。

## 非目标

- 主题不得改变业务命令、状态机或数据模型。
- 不实现V1.5作者自定义印文。
- 不重建Appearance、Theme或减少动态偏好状态。
- 不复制主题专属业务组件或流程。

## 依赖

M7-02、M0-06

## 承接基线

- 复用现有Appearance设置、Theme A/B状态、浅色/深色/护眼/高对比和减少动态偏好。
- 复用M5-00/M7-02统一工作台，不创建主题专属导航或业务状态机。
- 复用M0-06显示与性能决策。

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
- `apps/desktop/main/`（仅既有外观偏好接线）
- `tests/unit/`
- `tests/e2e/`
- `tests/performance/`
- `docs/ui/`

## 实施内容

1. 复用现有Theme状态完善Theme A浅色、深色、护眼和高对比视觉资源。
2. 复用同一状态源完善Theme B浅色、深色和印章表现层；后续模式按ADR/UI专项文档执行。
3. 主题只通过Design Token、CSS变量、图标、字体和动画资源实现，不出现主题特定业务分支。
4. Candidate采用、章节定稿等成功动画只在Core成功回调后播放；失败、取消、结果未知时不得播放成功反馈。
5. 减少动态开启时所有非必要动画安全降级，业务结果和焦点顺序保持一致。
6. 完成键盘、焦点、语义标签、对比度、屏幕阅读器、非颜色状态表达和错误可读性。
7. 按M0-06决策完成1280×800、2K 100/125/150%、21:9和混合DPI；核心任务不得依赖整页横向滚动。
8. 验证主题切换前后Patch、Revision、Candidate、StateProposal、ValidationIssue和ApplyRecord业务结果一致。
9. 主题切换不得重建编辑器、丢失选区、光标、滚动、未保存输入或后台任务订阅。
10. 静态扫描Theme条件不得进入Core命令选择、事务、权限、状态机或数据Schema。
11. 所有显示环境验收覆盖M7-02接入的写作、候选、校验、搜索、导入导出和恢复工作台。

## 测试与证据

- 两种视觉方向、全部冻结模式、减少动态、键盘、焦点和读屏。
- 1280×800、2K 100/125/150%、21:9、混合DPI截图矩阵。
- 主题切换前后选区、光标、滚动、未保存输入和后台任务状态。
- Patch、Revision、Candidate、StateProposal和ApplyRecord业务结果一致。
- 静态扫描主题条件分支与业务命令耦合。
- 对比度、非颜色表达、焦点可见性和错误提示自动/人工证据。

证据保存到：`docs/test-evidence/M7-03/`

## 完成条件

- 核心业务在所有目标视口和冻结主题范围中可完成。
- Appearance和Theme保持单一状态源。
- 主题切换不改变业务命令、事务结果或用户工作位置。
- UI专项验收清单全部有证据。
- 无障碍和响应式问题不存在P0阻断项。

任务关闭前必须同步`TASK_INDEX.md`、`V1.0_TRACEABILITY_MATRIX.md`及实际受影响的IPC、UI、性能或测试文档。
