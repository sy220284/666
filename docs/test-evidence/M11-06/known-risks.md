# M11-06 已知风险

1. 本任务只调整展示层级和作者术语，不改变自动保存、切章保护、建议稿采用、历史版本与恢复的权威语义；后续界面改动必须继续复用这些成熟内核。
2. Linux 精确视觉 Hash 依赖仓库固定字体、1280×800 视口、系统缩放和测试路径。Runner、字体或 Chromium/Electron 渲染栈升级时必须重新完成两个独立 Head 的稳定性取证，不能直接覆盖 Hash。
3. 固定视觉作品路径位于仓库 `test-results` 下，只服务测试确定性；生产作品目录仍由作者选择，不得复用该测试路径。
4. Windows 托管 Runner 曾出现一次创建作品超过 5 秒的启动抖动；同一 Tree 的前后独立运行及最终实现轮次均成功。最终合并资格仍由最新永久门禁决定，不以单次失败或单次成功取代完整运行事实。
5. GitHub Actions Artifact 有保留期限。Schema 2 manifest、运行编号、Artifact ID、Digest 与截图 Hash 提供持久审计锚点，Artifact 只作为辅助诊断载体。
6. 长篇摘要、文风档案、智能任务分配、`Ctrl+K` 与 300万—500万字适配明确由 M11-07 承接，不得回填进 M11-06 的界面维护范围。
7. `IMPLEMENTED` 是合并前静态状态；最终有效 `VERIFIED` 必须同时满足来源绑定、Controlled Merge、`main-verification` 与 `task-verification/M11-06` 成功。
