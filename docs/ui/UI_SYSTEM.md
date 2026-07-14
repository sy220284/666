# WorldForge UI视觉系统 — Theme A：安静编辑部

> 状态：Frozen  
> 视觉定位：安静编辑部  
> 目标：形成长期写作时低干扰、清晰、稳定、具有编辑质感的桌面界面。
> 本文件是Theme A的Design Token定义。Theme B（水墨印章）Token定义见[`UI_SYSTEM_THEME_B.md`](UI_SYSTEM_THEME_B.md)。两套主题共用本文件§2的Token命名结构和§X组件规范，只替换Token取值和候选采纳的动画表现，不改变业务逻辑（ADR-007）。

## 1. 视觉目标

WorldForge的视觉体验围绕五个关键词：

- 安静：减少强色、弹跳、发光和持续动画。
- 纸面：正文区具有稳定、舒适、接近纸张阅读的背景与排版。
- 编辑：用批注线、来源标识、页边状态和细分隔线表达专业性。
- 克制：普通信息不滥用卡片、阴影和大标题。
- 可控：AI、锁定、冲突、保存和恢复状态清晰，但不抢夺正文注意力。

## 2. Design Token命名

所有视觉值通过Token使用，页面组件不得直接散落十六进制颜色。

```text
color.bg.canvas
color.bg.paper
color.bg.panel
color.bg.elevated
color.text.primary
color.text.secondary
color.text.muted
color.border.subtle
color.border.strong
color.accent.primary
color.ai.source
color.warning
color.danger
color.success
space.1—space.10
radius.sm/md/lg
shadow.popover/dialog
motion.fast/normal/slow
layout.sidebar.left
layout.sidebar.right
layout.content.narrow/normal/wide
```

## 3. 颜色系统

### 3.1 浅色主题

| Token | 值 | 用途 |
|---|---|---|
| `color.bg.canvas` | `#F5F4F1` | 应用整体背景 |
| `color.bg.paper` | `#FFFDFC` | 正文纸面 |
| `color.bg.panel` | `#F8F7F4` | 侧栏、工具区 |
| `color.bg.elevated` | `#FFFFFF` | 弹层和对话框 |
| `color.text.primary` | `#242321` | 正文外主要文字 |
| `color.text.secondary` | `#5F5D59` | 次级信息 |
| `color.text.muted` | `#8B8882` | 弱提示 |
| `color.border.subtle` | `#E6E2DC` | 轻分隔线 |
| `color.border.strong` | `#CFC8BE` | 强边界 |
| `color.accent.primary` | `#3F5F7D` | 主操作与当前状态 |
| `color.ai.source` | `#6B658E` | AI来源和AI建议 |
| `color.warning` | `#A56A2A` | 警告与待处理 |
| `color.danger` | `#B54A46` | 数据风险和删除 |
| `color.success` | `#4E775B` | 保存成功、验证通过 |

### 3.2 深色主题

| Token | 值 | 用途 |
|---|---|---|
| `color.bg.canvas` | `#171716` | 应用整体背景 |
| `color.bg.paper` | `#1E1D1B` | 正文纸面 |
| `color.bg.panel` | `#22211F` | 侧栏、工具区 |
| `color.bg.elevated` | `#2A2926` | 弹层和对话框 |
| `color.text.primary` | `#F1EEE8` | 主要文字 |
| `color.text.secondary` | `#C2BDB5` | 次级信息 |
| `color.text.muted` | `#918C84` | 弱提示 |
| `color.border.subtle` | `#34322E` | 轻分隔线 |
| `color.border.strong` | `#4A4741` | 强边界 |
| `color.accent.primary` | `#7E9FBC` | 主操作与当前状态 |
| `color.ai.source` | `#A7A0D0` | AI来源和AI建议 |
| `color.warning` | `#D09A5A` | 警告 |
| `color.danger` | `#E17B75` | 数据风险和删除 |
| `color.success` | `#83AD8B` | 成功与正常 |

### 3.3 护眼主题

- 正文背景采用低亮暖灰或米色。
- 正文与背景对比度仍需满足长文本可读性。
- 禁止使用高饱和黄色模拟纸张。
- 图片、候选Diff和代码区域保持中性，避免整体色偏影响识别。

### 3.4 高对比主题

- 边界和焦点环加强。
- 弱文字不低于可读对比度。
- 来源、警告和危险状态同时使用图标、文字和边框，不只依赖颜色。

## 4. 字体与排版

### 4.1 UI字体

优先级：

```text
-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif
```

### 4.2 正文字体预设

- 系统宋体：适合长时间中文阅读。
- 系统黑体：适合简洁编辑。
- 用户自定义本机字体：只保存字体名称，不打包或分发字体文件。

推荐字体栈：

```text
"Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", SimSun, serif
```

### 4.3 字号

| 场景 | 默认 |
|---|---:|
| 正文 | 18px |
| 正文可调范围 | 14—28px |
| UI正文 | 14px |
| 次级说明 | 12—13px |
| 页面标题 | 20—24px |
| 对话框标题 | 18px |

### 4.4 正文排版

- 行高：1.75—1.9。
- 段间距：0.65—0.9em。
- 首行缩进由项目设置控制，默认2em或关闭。
- 最大行宽：860 CSS px。
- 推荐常规宽度：760 CSS px。
- 标点挤压、孤行控制和连字符由浏览器能力与编辑器策略评估，不牺牲输入稳定性。

## 5. 间距系统

基础单位4px：

| Token | 值 |
|---|---:|
| `space.1` | 4px |
| `space.2` | 8px |
| `space.3` | 12px |
| `space.4` | 16px |
| `space.5` | 20px |
| `space.6` | 24px |
| `space.8` | 32px |
| `space.10` | 40px |

页面区域优先使用16/24/32px节奏；正文内部以排版单位为主。

## 6. 圆角、边框与阴影

| 类型 | 规则 |
|---|---|
| 普通按钮 | 6—8px圆角 |
| 输入框 | 6px圆角 |
| 候选、冲突、恢复卡片 | 10—12px圆角 |
| 面板 | 通常不使用大圆角，靠分隔线区分 |
| 弹层 | 10—12px圆角 |
| 阴影 | 仅用于浮层、菜单、对话框；页面卡片避免重阴影 |

正文纸面可以使用极弱边界或阴影，深色主题通常取消阴影。

## 7. 图标

- 使用统一SVG图标库。
- 默认16px，工具栏18px，一级导航20px。
- 图标必须有文字标签或可访问名称。
- 删除、覆盖、恢复、锁定和冲突使用稳定图形，不使用含义模糊的装饰图标。
- Emoji只用于内容或用户自定义标签，不作为核心功能图标。

## 8. 按钮

### 主按钮

每个页面或对话框最多一个主按钮。适用：创建项目、生成候选、确认采用、开始恢复。

### 次按钮

用于取消、预览、换一个、保存设置等操作。

### 文字按钮

用于低风险、低频操作，如“查看全部”“重置”。

### 危险按钮

- 红色或危险Token。
- 不与普通主按钮并排造成误点。
- 永久删除、覆盖导出和放弃未保存结果必须提供清楚后果。

## 9. 输入控件

- 标签置于输入框上方或左侧，不能只依赖placeholder。
- 错误信息显示在字段附近。
- 高级设置默认折叠。
- 数值设置提供合理范围、步进和重置。
- Prompt、规则和长文本输入使用可调整高度的多行编辑器。

## 10. 卡片使用规则

允许使用卡片：

- AI候选摘要。
- 冲突项。
- 数据损坏与恢复选择。
- 高风险校验问题。
- 新建项目入口。

减少卡片：

- 设置列表。
- 人物属性表。
- 普通统计。
- 右侧栏常规信息。
- 一级导航。

这些区域使用标题、分隔线、列表和表单分组。

## 11. AI来源视觉

- AI来源通过左侧细线、微弱底纹、来源标签或页边图标表达。
- 正常编辑视图不铺设整段蓝色背景。
- 来源模式开启后显示更明确的AI/手动/混合标记。
- 作者修改AI段落后来源可变为mixed。
- AI质量评分不使用绿色“优秀稿”诱导作者选择。

## 12. 锁定视觉

- 段落左侧1—2px锁定线。
- 悬停或选中时显示锁图标和“此段已锁定”。
- 深色、护眼和高对比主题均可识别。
- 锁定状态不采用大面积警告色。
- AI操作跳过锁定块后，用非阻断摘要说明跳过数量。

## 13. 状态颜色语义

| 状态 | 颜色用途 |
|---|---|
| 正常/已保存 | 成功色或中性文字，不持续闪烁 |
| AI来源/AI任务 | AI来源色 |
| 待确认/轻微偏差 | 警告色 |
| 数据风险/保存失败 | 危险色 |
| 当前选中 | 主强调色 |
| 禁用 | 中性灰并保持文字可读 |

## 14. 动效

| Token | 时长 | 用途 |
|---|---:|---|
| `motion.fast` | 120ms | 按钮、选中、悬停 |
| `motion.normal` | 160ms | 抽屉、标签、列表切换 |
| `motion.slow` | 200ms | 对话框与全屏工作区 |

禁止：

- 持续呼吸动画。
- 粒子、发光和庆祝动画。
- 大范围弹跳。
- AI生成时整页闪烁。

系统开启减少动态效果时，位移动画改为淡入淡出或直接切换。

## 15. 组件基线

首批通用组件：

```text
AppShell
TopBar
PrimaryNav
Sidebar
Drawer
WorkspaceHeader
StatusIndicator
TaskBar
Button
IconButton
Input/Textarea/Select/Switch/Slider
Tabs
Tooltip
Popover
Dialog
ContextMenu
Toast
Banner
EmptyState
ErrorState
Skeleton
VirtualList
TreeView
DataList
CandidateCard
ConflictRow
ValidationIssueRow
RecoveryCard
EditorStatusGutter
```

组件必须支持主题、键盘、焦点、禁用、加载和错误状态。

## 16. 实现约束

- Token集中定义并通过CSS变量暴露。
- Radix UI等基础组件只作为行为底座，视觉需遵守本系统。
- 禁止在业务页面复制粘贴一套新的按钮、对话框和状态样式。
- 自定义颜色必须先登记Token和用途。
- 视觉回归截图覆盖四种主题、1280×800、2K 125%和21:9。
