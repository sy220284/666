# WorldForge UI视觉系统 — Theme B：水墨印章

> 状态：Frozen  
> 对应任务：`M7-03_THEMES_ACCESSIBILITY_RESPONSIVE.md`  
> 前提：遵守`UI_SYSTEM.md`的Token结构和`ADR-007`主题/逻辑分离约束。

## 1. 视觉目标

- 纸感：正文区使用暖白偏米的宣纸感，不使用纯白。
- 墨色：主文字使用暖调深灰墨色，降低冷硬感。
- 朱红：只用于候选采纳、章节定稿等确认表现，不作日常强调色。
- 字体：正文使用衬线中文字体，界面控件保持无衬线。

## 2. Design Token

### 2.1 颜色

| Token | 取值 | 用途 |
|---|---|---|
| `color.bg.canvas` | `#F3EEE2` | 应用画布 |
| `color.bg.paper` | `#FAF7EE` | 正文纸面 |
| `color.bg.panel` | `#ECE6D6` | 侧栏和面板 |
| `color.bg.elevated` | `#FFFFFF` | 浮层 |
| `color.text.primary` | `#2E2B26` | 主文字 |
| `color.text.secondary` | `#5B564C` | 次级文字 |
| `color.text.muted` | `#8C8577` | 辅助说明 |
| `color.border.subtle` | `#DDD4BE` | 常规分隔 |
| `color.border.strong` | `#B8AC8E` | 强调边界 |
| `color.accent.primary` | `#5C6B57` | 日常选中与焦点 |
| `color.seal.primary` | `#A32B22` | 印章确认图形 |
| `color.ai.source` | `#6E7A82` | AI来源 |
| `color.warning` | `#B8860B` | 警示 |
| `color.danger` | `#8B3A2E` | 危险 |
| `color.success` | `#4F7860` | 成功 |

印章红和危险色不用于小号长文本。所有模式必须达到专项无障碍要求。

### 2.2 字体

- `font.serif.body`：Noto Serif SC或安全回退。
- `font.sans.ui`：沿用Theme A界面字体。
- 正文字号与Theme A保持同等信息密度。
- 行高按真实字体度量校正，不能仅靠固定倍数。

### 2.3 形状、阴影与动效

- 圆角比Theme A略收紧，但继续使用统一Token。
- 阴影使用低饱和暖褐调。
- 通用动效时长与Theme A一致。
- 印章动效使用独立`motion.easing.seal`，总反馈不拖慢操作。

## 3. 候选采纳与定稿印章

- 只在底层命令成功后播放。
- 失败、取消和冲突不播放成功印章。
- 动画不写入数据库，不参与状态判断。
- 印章字样固定为“稿”，不使用真实姓名或机构印章。
- 作者自定义印文不属于V1.0。

### 无障碍与降级

- `prefers-reduced-motion`时跳过下压和墨迹动画。
- 图形提供文字等效状态。
- 动画失败时仍显示标准成功反馈和修改定位。

## 4. V1.0范围

- Theme B提供浅色、深色和冻结的印章表现层。
- Theme A提供浅色、深色、护眼和高对比。
- Theme B其他对比模式需独立任务和无障碍证据后扩展。
- 主题切换不改变Patch、Revision、ApplyRecord和任何业务状态。
