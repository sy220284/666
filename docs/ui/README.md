# WorldForge UI 文档索引

> 状态：Approved  
> 基线：WorldForge V6.5  
> 适用：V1.0 桌面端界面、交互、高分屏与无障碍实现

## 文档清单

| 文档 | 用途 |
|---|---|
| [`UI_SYSTEM.md`](UI_SYSTEM.md) | Theme A（安静编辑部）视觉方向、Design Token命名结构、颜色、字体、间距、图标、组件和主题规则 |
| [`UI_SYSTEM_THEME_B.md`](UI_SYSTEM_THEME_B.md) | Theme B（水墨印章）完整Token取值与印章动效设计，状态Frozen |
| [`INFORMATION_ARCHITECTURE.md`](INFORMATION_ARCHITECTURE.md) | 页面地图、一级入口、工作台层级和导航规则 |
| [`SCREEN_SPECIFICATIONS.md`](SCREEN_SPECIFICATIONS.md) | 首页、规划、写作、候选、检查、导入导出、设置等页面规格 |
| [`INTERACTION_STATES.md`](INTERACTION_STATES.md) | 空、加载、运行、成功、失败、取消、冲突、只读、恢复等状态规范 |
| [`EDITOR_INTERACTION_SPEC.md`](EDITOR_INTERACTION_SPEC.md) | 编辑、选区、锁定、保存、撤销、划选改写、场景联动和快捷键 |
| [`CANDIDATE_REVIEW_SPEC.md`](CANDIDATE_REVIEW_SPEC.md) | 候选比较、Diff、局部采用、融合、冲突处理和采用回退 |
| [`ONBOARDING_SPEC.md`](ONBOARDING_SPEC.md) | 新建向导、新手轻量脚手架、模式切换和上下文帮助 |
| [`RESPONSIVE_AND_DPI.md`](RESPONSIVE_AND_DPI.md) | 1280×800、2K、21:9曲面/超宽屏、混合DPI和窗口恢复 |
| [`ACCESSIBILITY.md`](ACCESSIBILITY.md) | 键盘、焦点、对比度、语义、中文输入法、减少动效和读屏规则 |
| [`UI_ACCEPTANCE_CHECKLIST.md`](UI_ACCEPTANCE_CHECKLIST.md) | UI实现、视觉、交互、高分屏、无障碍和业务闭环验收清单 |

## 实现优先级

```text
UI_SYSTEM + INFORMATION_ARCHITECTURE
→ SCREEN_SPECIFICATIONS
→ INTERACTION_STATES
→ EDITOR_INTERACTION_SPEC
→ CANDIDATE_REVIEW_SPEC
→ ONBOARDING_SPEC
→ RESPONSIVE_AND_DPI + ACCESSIBILITY
→ UI_ACCEPTANCE_CHECKLIST
```

## UI权威顺序

```text
V6.5完整设计方案
> 本目录UI实施规格
> 功能清单与P0验收矩阵
> 当前任务卡
> 现有组件实现
```

## 统一原则

1. 正文始终是写作工作台的视觉中心。
2. 新手模式和专业模式共用同一数据与功能，只改变信息披露程度。
3. 沉浸写作是任意模式可进入的视图状态，不创建第三套产品模式。
4. AI文本、AI建议和AI进度使用低饱和蓝紫或中性色表达来源，不使用大面积蓝底。
5. 绿色只表示操作成功或状态正常，不表示AI文本质量更高。
6. 卡片只用于候选、冲突、风险、恢复和需要独立决策的内容。
7. 普通设置、表单和信息列表优先使用分组、分隔线和轻量容器。
8. 所有异步状态展示真实程序阶段，不显示伪造倒计时。
9. 1280×800保证核心流程，2K为完整体验基线，21:9控制正文行宽和操作距离。
10. 所有界面必须覆盖空、加载、失败、取消、冲突、只读和恢复路径。

## 维护规则

- 新增页面时同步更新`INFORMATION_ARCHITECTURE.md`、`SCREEN_SPECIFICATIONS.md`和验收清单。
- 新增组件Token时同步更新`UI_SYSTEM.md`，禁止在页面内散落未登记的颜色和尺寸。
- 修改编辑器、候选或高分屏交互时，同步更新对应专项文档和Playwright截图基线。
- 页面实际实现与文档冲突时，先明确变更依据，再同步文档和验收，不允许长期漂移。
