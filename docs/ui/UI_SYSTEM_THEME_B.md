# WorldForge UI视觉系统 — Theme B：水墨印章

> 状态：Frozen  
> 对应任务：`M7-03_THEMES_ACCESSIBILITY_RESPONSIVE.md`  
> 前提：共用`UI_SYSTEM.md`的Token结构和ADR-007业务分离约束。

## 1. 视觉目标

- 纸感：暖白或深墨纸面，不使用纯白/纯黑。
- 墨色：主文字使用暖调墨色。
- 朱红：只用于候选采纳、章节定稿等成功确认表现。
- 字体：正文使用衬线中文字体，控件保持无衬线。
- 业务：主题切换不改变任何命令、Patch、Revision和状态机。

## 2. 浅色Token

| Token | 值 |
|---|---|
| `color.bg.canvas` | `#F3EEE2` |
| `color.bg.paper` | `#FAF7EE` |
| `color.bg.panel` | `#ECE6D6` |
| `color.bg.elevated` | `#FFFDF8` |
| `color.text.primary` | `#2E2B26` |
| `color.text.secondary` | `#5B564C` |
| `color.text.muted` | `#8C8577` |
| `color.border.subtle` | `#DDD4BE` |
| `color.border.strong` | `#B8AC8E` |
| `color.accent.primary` | `#5C6B57` |
| `color.seal.primary` | `#A32B22` |
| `color.ai.source` | `#6E7A82` |
| `color.warning` | `#9A6C12` |
| `color.danger` | `#8B3A2E` |
| `color.success` | `#4F7860` |

## 3. 深色Token

| Token | 值 |
|---|---|
| `color.bg.canvas` | `#191815` |
| `color.bg.paper` | `#22201B` |
| `color.bg.panel` | `#29261F` |
| `color.bg.elevated` | `#312E27` |
| `color.text.primary` | `#EEE8DA` |
| `color.text.secondary` | `#C8BEAB` |
| `color.text.muted` | `#978D7C` |
| `color.border.subtle` | `#3D382E` |
| `color.border.strong` | `#5A5141` |
| `color.accent.primary` | `#94A28D` |
| `color.seal.primary` | `#D26559` |
| `color.ai.source` | `#9AA7AE` |
| `color.warning` | `#D0A34A` |
| `color.danger` | `#D68172` |
| `color.success` | `#82A88D` |

印章红、危险色和警告色不用于小号长文本。浅色与深色均须满足专项无障碍要求。

## 4. 字体、形状与动效

- `font.serif.body`：Noto Serif SC、Source Han Serif SC或安全回退。
- `font.sans.ui`：沿用Theme A系统字体。
- 信息密度、字号范围和正文宽度与Theme A一致。
- 圆角略收紧，但继续使用统一Token。
- 阴影使用低饱和暖褐调。
- 通用动效时长与Theme A一致。
- 印章动效使用独立`motion.easing.seal`，不拖慢操作。

## 5. 印章确认表现

适用：Candidate采用成功、章节定稿成功和手动快照成功。

规则：

1. 只在底层命令成功返回后播放。
2. 失败、取消、冲突和只读拒绝不播放。
3. 动画不写数据库，不参与状态判断。
4. 印章字样固定为“稿”，不使用真实姓名或机构印章。
5. 作者自定义印文属于V1.5。
6. 动画结束后焦点和修改定位保持正确。

## 6. 无障碍与降级

- `prefers-reduced-motion`时跳过下压、墨迹扩散和位移动画。
- 印章图形提供文字等效状态。
- 动画资源失败时仍显示标准成功反馈。
- 来源、锁定、警告和危险状态同时使用文字/图标/边界。
- 浅色和深色分别执行对比度与键盘测试。

## 7. V1.0范围

- Theme B提供浅色、深色和印章表现层。
- Theme B护眼/高对比变体属于V1.0 P1，P0不显示可用入口。
- Theme A提供浅色、深色、护眼和高对比。
- 主题切换前后Patch、Revision、ApplyRecord、Selection和未保存编辑保持一致。
