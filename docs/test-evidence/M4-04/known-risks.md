# M4-04 Known Risks

## 当前验收状态

- M4-04产品实现提交：`42d7a682e3e1a26942fa9f4159d6123a8071350f`。
- M4-04阶段Evidence Head：`19b2238ac488ca7c656798c4211d2590e31f4430`。
- 产品合并提交：`e7168bb2bbb4f02dc596d65d126dec62dd720f2c`。
- C8延期治理main提交：`2b302b4630ce1e9e5210aa93b944cef9c4525b58`，`main-verification`运行`30323690925`成功。
- M4-04进入Implementation Hold；`M8-02`保持Planned，不自动激活。

## 已关闭风险

- 同项目不同面板请求并发落库。
- `editor → versions → candidates`中间状态成为最终权威状态。
- `editor → versions → editor`快速回切后Core停留在旧面板。
- 子工作台重建、卸载保存、旧失败重试和迟到成功回退当前面板。
- 畸形请求键退化为跨项目共享通道。
- Schema 27历史非法StoryTodo/StoryComment在Schema 28升级中产生半升级。
- PR #220治理规划未经过Ready门禁即进入main。

## 延期到M8-02的风险

1. 首次使用向导、统一工作台最终体验和上下文帮助。
2. Theme A/B、浅色、深色、护眼、高对比、减少动态、键盘、焦点和读屏终验。
3. 1280×800、2K、21:9、混合DPI与真实多屏。
4. Windows、macOS、Linux安装、升级、卸载、原生模块和安全降级。
5. 真实Provider账号、限流、权限、模型差异和完整AI Eval。
6. 真实超大DOCX、中央目录与本地Header字段级交叉验证及平台文件系统差异。
7. 超大项目搜索、批量替换、索引重建和长期运行性能报告。
8. 多进程或重复Core实例下日常备份持久化幂等。
9. 操作系统休眠、窗口焦点、输入法组合事件及真实人工P0路径。
10. 最终P0矩阵、发布判断、产物签名、Hash、回滚和Verified Evidence。

## 保留约束

- M4-04的Schema与Migration只允许向后追加，不得改写历史。
- M8-02不得重建Prompt、TaskProtocol、Candidate采用、导入、恢复、模式或主题状态系统。
- M8-02启动前必须重新读取M7-01—M8-03来源、V6.5规格、P0矩阵和M4-04 Evidence。
- 未完成真实平台和发布验收前，不得宣称V1最终Verified或可发布。
