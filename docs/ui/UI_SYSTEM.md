# WorldForge UI视觉系统 — Theme A：安静编辑部

> 状态：Frozen  
> 本文件定义Theme A与全局Token结构。Theme B见`UI_SYSTEM_THEME_B.md`。两种视觉方向共用业务组件、命令和状态机，遵守ADR-007。

## 1. 视觉目标

安静、纸面、编辑、克制、可控。正文是视觉中心；AI、锁定、冲突、保存和恢复清楚但不抢夺注意力。

## 2. Token结构

```text
color.bg.canvas/paper/panel/elevated
color.text.primary/secondary/muted
color.border.subtle/strong
color.accent.primary
color.ai.source
color.warning/danger/success
space.1—space.10
radius.sm/md/lg
shadow.popover/dialog
motion.fast/normal/slow
layout.sidebar.left/right
layout.content.narrow/normal/wide
font.serif.body
font.sans.ui
```

页面组件不得散落未登记颜色、字号和尺寸。

## 3. Theme A颜色

### 3.1 浅色

| Token | 值 |
|---|---|
| `color.bg.canvas` | `#F5F4F1` |
| `color.bg.paper` | `#FFFDFC` |
| `color.bg.panel` | `#F8F7F4` |
| `color.bg.elevated` | `#FFFFFF` |
| `color.text.primary` | `#242321` |
| `color.text.secondary` | `#5F5D59` |
| `color.text.muted` | `#8B8882` |
| `color.border.subtle` | `#E6E2DC` |
| `color.border.strong` | `#CFC8BE` |
| `color.accent.primary` | `#3F5F7D` |
| `color.ai.source` | `#6B658E` |
| `color.warning` | `#A56A2A` |
| `color.danger` | `#B54A46` |
| `color.success` | `#4E775B` |

### 3.2 深色

| Token | 值 |
|---|---|
| `color.bg.canvas` | `#171716` |
| `color.bg.paper` | `#1E1D1B` |
| `color.bg.panel` | `#22211F` |
| `color.bg.elevated` | `#2A2926` |
| `color.text.primary` | `#F1EEE8` |
| `color.text.secondary` | `#C2BDB5` |
| `color.text.muted` | `#918C84` |
| `color.border.subtle` | `#34322E` |
| `color.border.strong` | `#4A4741` |
| `color.accent.primary` | `#7E9FBC` |
| `color.ai.source` | `#A7A0D0` |
| `color.warning` | `#D09A5A` |
| `color.danger` | `#E17B75` |
| `color.success` | `#83AD8B` |

### 3.3 护眼

低亮暖灰或米色纸面；保持长文本对比度；Diff与代码区域保持中性。

### 3.4 高对比

加强边界和焦点环；弱文字达到可读对比；来源、警告和危险同时使用图标、文字和边框。

## 4. 字体与排版

UI字体：系统无衬线。正文优先系统宋体/思源宋体/Noto Serif安全回退；只保存字体名称，不分发字体文件。

| 场景 | 默认 |
|---|---:|
| 正文 | 18px |
| 正文范围 | 14—28px |
| UI正文 | 14px |
| 次级说明 | 12—13px |
| 页面标题 | 20—24px |

正文行高1.75—1.9，段距0.65—0.9em，宽度680/760/860 CSS px，最大860px。

## 5. 间距与形状

基础单位4px；页面区域优先16/24/32px。按钮6—8px圆角，卡片和弹层10—12px。阴影只用于浮层和对话框。

## 6. 图标与控件

- 使用统一SVG图标库。
- 图标提供文字标签或可访问名称。
- 每页最多一个主按钮。
- 危险操作与普通主按钮分离。
- 输入控件不能只依赖placeholder。
- 高级设置默认折叠。

## 7. 卡片规则

允许：候选、冲突、数据风险、恢复和新建入口。  
减少：普通设置、实体属性、统计、侧栏信息和一级导航。

## 8. AI来源与锁定

AI来源使用细线、低饱和底纹、标签或页边图标；不铺满整段强色。绿色不表示AI质量更高。

锁定使用页边线、图标和文字；所有模式均可识别；跳过锁定块后显示非阻断摘要。

## 9. 状态语义

| 状态 | 表现 |
|---|---|
| 正常/已保存 | 成功色或中性文字，不持续闪烁 |
| AI来源/任务 | AI来源色和图标 |
| 待确认/轻微偏差 | 警告色 |
| 数据风险/保存失败 | 危险色和持续Banner |
| 当前选中 | 主强调色 |
| 禁用 | 中性灰并保持可读 |

状态不得只靠颜色表达。

## 10. 动效

| Token | 时长 |
|---|---:|
| `motion.fast` | 120ms |
| `motion.normal` | 160ms |
| `motion.slow` | 200ms |

禁止持续呼吸、粒子、发光、庆祝、大范围弹跳和整页闪烁。减少动态时使用淡入淡出或直接切换。

## 11. 组件基线

```text
AppShell TopBar PrimaryNav Sidebar Drawer
WorkspaceHeader StatusIndicator TaskBar
Button IconButton Input Textarea Select Switch Slider
Tabs Tooltip Popover Dialog ContextMenu
Toast Banner EmptyState ErrorState Skeleton
VirtualList TreeView DataList
CandidateCard ConflictRow ValidationIssueRow RecoveryCard
EditorStatusGutter ArcMilestoneList RhythmSuggestionPanel
```

所有组件支持主题、键盘、焦点、禁用、加载和错误状态。

## 12. 实现与视觉回归

- Token集中定义并通过CSS变量暴露。
- Radix等只作为行为底座。
- 业务页面不得复制新按钮、对话框或状态系统。
- 视觉回归覆盖Theme A浅/深/护眼/高对比、Theme B浅/深、1280×800、2K 125%和21:9。
- 视觉回归之外必须验证主题切换不改变业务结果。
