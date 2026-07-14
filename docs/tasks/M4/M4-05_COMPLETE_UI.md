# M4-05 新手/专业模式、工作台与完整视觉交互

> 状态：Planned  
> 优先级：P0  
> 分支：`feat/m4-complete-ui`

## 目标

将M1—M4已接通能力整合成清晰、低干扰、长期可用的桌面产品界面，并支持两种视觉方向切换。

## 依赖

M1—M4-04全部完成。

## 关联

- 需求：REQ-038—REQ-041、REQ-047
- 验收：P0-057—P0-066、P0-075

## 必读文档

- `docs/ui/README.md`
- `docs/ui/UI_SYSTEM.md`
- `docs/ui/INFORMATION_ARCHITECTURE.md`
- `docs/ui/SCREEN_SPECIFICATIONS.md`
- `docs/ui/INTERACTION_STATES.md`
- `docs/ui/RESPONSIVE_AND_DPI.md`
- `docs/ui/ACCESSIBILITY.md`
- `docs/ui/UI_ACCEPTANCE_CHECKLIST.md`
- `docs/ui/VISUAL_REFERENCE_BASELINE.md`
- `docs/decisions/ADR-007-theme-logic-separation.md`

## 实施内容

1. 新手与专业模式共用数据，只改变披露度。
2. 自主写作、混合创作和AI初稿三条路径。
3. 对话式新建向导和跳过后的轻量脚手架。
4. 六个一级入口和三个核心工作台。
5. 写作工作台三栏与侧栏折叠。
6. 沉浸写作视图。
7. 候选全屏比较、冲突页和快速改写内联交互；Theme B下采纳动作替换为盖章动画，底层`candidate.apply`事件与状态机不变。
8. 上下文帮助、首次提示和统一用户术语。
9. Theme A安静编辑部：浅色、深色、护眼、高对比。Theme B水墨印章：浅色、深色（护眼/高对比延后V1.5，假设如无异议按此执行）。
10. 1280×800、2K、21:9、混合DPI和窗口恢复。
11. 键盘、焦点、中文输入和减少动态效果。

## 视觉原则

正文为中心；AI来源使用低饱和色系或中性色标识，不用绿色暗示更优；普通设置减少卡片化；微动效120—200ms；主题只改变Design Token和动画表现层，不得引入主题特定业务逻辑分支（ADR-007）。

## 验收

按`UI_ACCEPTANCE_CHECKLIST.md`逐项执行，并至少保存13寸、2K 125%、21:9、两种视觉方向各自深浅主题和无障碍证据。

## 完成条件

核心业务流程在所有目标视口和两种视觉方向中可完成；UI状态与真实Core状态一致；未实现功能不以可用入口展示。
