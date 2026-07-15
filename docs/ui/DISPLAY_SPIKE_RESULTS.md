# M0-06 显示、DPI与窗口恢复Spike结论

> 状态：Verified（证据提交`6dabe3d`，main分支远端双门禁通过）  
> 任务：M0-06  
> 决策适用：后续所有桌面工作台、编辑器、抽屉、浮层与显示设置

## 1. 结论

M0-06采用“操作系统窗口使用DIP、Renderer布局使用CSS px、UI缩放/正文字号/正文宽度相互独立”的统一策略。窗口与外观偏好写入`app.sqlite.window_preferences`；临时JSON文件不参与状态恢复。

实现链路：

```text
Renderer具名外观命令
→ Preload strict Schema
→ Electron Main合并真实窗口状态
→ 私有Main/Core消息
→ Core单写队列
→ app.sqlite
```

## 2. 冻结实现决策

| 主题 | 决策 | 约束 |
|---|---|---|
| 窗口坐标 | 保存和恢复DIP坐标、尺寸、displayId、scaleFactor、最大化状态 | 不对CSS尺寸再次乘scaleFactor |
| 显示器丢失 | 原displayId不存在时，在主显示器工作区居中并限制尺寸 | 窗口始终完整可见 |
| 显示器变化 | 监听added/removed/metrics-changed，重新限制窗口并重新判断断点 | 移动/缩放以250ms防抖持久化 |
| 窗口存储 | Core独占`app.sqlite`写入 | Main和Renderer不打开SQLite；无窗口JSON旁路 |
| 正文版心 | 窄680、标准760、宽860、自适应680—860 CSS px | 21:9也不超过860px |
| UI缩放 | 90%—150%，10%步进，通过CSS变量重排 | 禁止整页`transform`缩放 |
| 正文字号 | 14—28 CSS px | 与UI缩放和正文宽度分别保存 |
| 响应式 | `<900`双抽屉、`900—1099`右抽屉、`≥1100`三栏 | 按有效CSS视口判断 |
| 超宽布局 | 最大工作区1760 CSS px，支持偏左/居中/偏右 | 侧栏保持靠近正文 |
| 浮层 | 每次打开、Resize和跨屏后限制到可见视口 | 对话框最大`min(720px, viewport-32px)` |
| 抽屉键盘 | Esc关闭、Tab焦点循环、关闭后恢复触发点 | 左右抽屉共用行为 |

## 3. 原型边界

Renderer中的“安静编辑部”界面是显示技术原型，只承载公开布局样文和M0-06设置。它不连接项目正文、不伪造项目/章节数据，也不提前实现M1—M7业务工作台。后续业务界面复用其Token、断点模型、抽屉行为和窗口偏好契约。

## 4. 自动化覆盖

| 层级 | 覆盖 |
|---|---|
| Migration | Schema v1→v2真实备份、WAL合并、`quick_check`、单例读写、幂等requestId、重启重载 |
| Security | Renderer不能写displayId/坐标/scaleFactor/最大化状态；非法步进、额外字段被strict Schema拒绝 |
| Performance | 10,000次断点、版心和混合DPI恢复计算，P95及总耗时受一秒恢复预算约束 |
| Electron E2E | 沙箱边界、Core健康、app.sqlite持久化、关闭/重启恢复、无窗口JSON旁路 |
| Display matrix | 1280×800、2560×1440 @100/125/150%、3440×1440、3840×1600、有效1024×640；125%与150%使用Electron原生device scale factor |
| Interaction | 无整页水平滚动、双抽屉、Esc与焦点恢复、Popover/Dialog不越界、超宽左中右对齐 |

## 5. 验收与后续复用

本地无DISPLAY环境只执行纯函数、SQLite、契约、安全、性能和构建验证。真实Electron窗口与截图矩阵由GitHub Actions在3840×2160 Xvfb中执行：[Task Governance](https://github.com/sy220284/666/actions/runs/29393712442)与[Quality（含4/4 Playwright Electron E2E）](https://github.com/sy220284/666/actions/runs/29393712416)均通过。最终`display-dpi-matrix` Artifact（ID `8334265245`）包含7张截图，已人工复核中文字体、三栏/抽屉切换、右栏完整性及无水平溢出；150%截图的物理宽度因分数DIP舍入为2562px，误差1个有效CSS px且无裁切。

正式证据位于`docs/test-evidence/M0-06/`，包含逐文件SHA-256清单、测试结果、截图清单、性能记录和已知风险。证据提交`6dabe3d`的远端双门禁通过后，任务已关闭为Verified。

M1开始后，应用设置页面应复用相同外观契约，不另建窗口状态存储。M7可替换原型视觉与业务区域，但不得改变本文件冻结的坐标、断点、版心和独立缩放语义。
