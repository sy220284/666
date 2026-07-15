# M0-06 测试证据

生成时间：2026-07-15T06:22:07Z  
提交：98613c0d48dec23414b1598761c0a8e9e6c302f2

M0-06 已完成显示、DPI 与窗口恢复技术验证。Renderer 的具名外观命令经过 strict Preload/Main IPC 和私有 Main/Core 协议，由 Core 单写队列持久化到 app.sqlite；v1→v2 Migration 在替换前执行真实备份、WAL 合并与 quick_check。响应式原型冻结 680/760/860 CSS px 版心、独立 UI 缩放/正文字号/正文宽度、抽屉焦点管理、浮层限界和超宽对齐语义。GitHub Quality 在 Xvfb 中使用 Electron 原生 --force-device-scale-factor 完成 4/4 E2E，并生成 7 张中文字体清晰、无右栏裁切的最终截图。Task Governance：https://github.com/sy220284/666/actions/runs/29393712442；Quality：https://github.com/sy220284/666/actions/runs/29393712416；截图 Artifact ID：8334265245。

## 自动化结果

- 通过：9
- 失败：0
- 跳过：1
