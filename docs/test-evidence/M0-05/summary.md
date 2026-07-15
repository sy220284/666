# M0-05 验证摘要

日期：2026-07-15  
状态：Implemented；实现提交`a3d07ec`的本地静态/专项门禁、GitHub Task Governance、Quality与真实Electron桌面E2E均通过，等待状态提交远端复核后关闭。

## 已实现

- `@worldforge/testkit`可用生产Migration创建隔离的临时app/project数据库与项目工作区；目录权限为0700，清理幂等，非法projectId无法逃逸临时根目录。
- `ManualClock`和`SequenceIdFactory`不读取系统时间或随机源，可稳定复现时间戳、普通ID与UUID。
- 确定性Provider Stub覆盖正常、逐Token、断流、超时、限流、无效JSON和取消；调用记录只保存提示长度与SHA-256，不持久化提示正文。
- 故障工具真实触发SQLite写锁/`SQLITE_BUSY`、页数上限/`SQLITE_FULL`、事务中断回滚、关闭数据库头损坏和生产Migration事务中断；自测验证故障确实发生且没有部分写入。
- 中文公开合成Fixture提供5,000字长段落、50,000字长章节和1,500,000字/500章搜索项目；同一输入得到稳定哈希与命中位置。
- 恶意DOCX在测试时确定性生成，覆盖SEC-042—SEC-049的宏、路径穿越、高压缩比、过多文件、OLE、外部关系、损坏包和取消预览场景，不提交用户作品或巨型二进制。
- `evals/fixtures`登记CC0-1.0公开合成中文Fixture及隐私元数据，CI不使用真实作者项目或真实模型输出。
- 证据写入器统一生成摘要、命令/退出码、测试报告、截图清单、性能、风险和SHA-256 manifest；使用同目录暂存与原子替换，并在写入前拒绝凭据形状文本。
- `scripts/run-electron-e2e.mjs`只启动Playwright Electron配置；Linux无DISPLAY时要求Xvfb并失败关闭，不能退化为普通浏览器页面。失败时保留trace和截图。

## 自动化结果

- M0-05自测：4个测试文件、19项测试通过。
- Vitest全量：19个测试文件、72项测试通过。
- Migration专项：3个测试文件、16项测试通过。
- Integration专项：5个测试文件、12项测试通过。
- Security专项：4个测试文件、18项测试通过。
- Typecheck、Lint、Prettier、9层包边界和10个Workspace检查通过。
- 1,500,000字搜索Fixture生成25次，P95为85.647 ms，字符数、500章边界、5个唯一命中与SHA-256保持稳定；SEC-042—049八类DOCX一次生成538.704 ms。
- 本地容器无DISPLAY和`xvfb-run`，Electron启动器按设计以退出码2拒绝运行；GitHub Ubuntu/Xvfb上的Quality随后成功完成真实Electron窗口测试。
- GitHub Task Governance：<https://github.com/sy220284/666/actions/runs/29390711628>。
- GitHub Quality（含Playwright Electron）：<https://github.com/sy220284/666/actions/runs/29390711632>。

## 验收边界

M0-05交付后续任务复用的测试设施，不把Provider Stub、故障代理或Fixture当作生产功能。真实Provider、生产DOCX解析与跨平台安装包验收仍由对应业务任务和M8完成；本任务只证明这些场景已有稳定、公开、可复现的测试输入和执行入口。
