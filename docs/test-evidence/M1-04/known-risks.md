# M1-04 已知风险与延期验证

## Electron桌面E2E与真实输入法

当前容器没有`DISPLAY`、Xvfb或`xvfb-run`。`pnpm test:e2e`完成应用构建后由仓库运行器明确返回`E2E_DISPLAY_UNAVAILABLE`（exit 2）。新增桌面场景可被Playwright正常解析，覆盖四类块、身份继承、撤销重做、网页/纯文本粘贴、composition状态、保存、选区和重开重建，但未在本容器执行图形化场景。

合成composition事件可验证程序状态机和结构工具保护，不能替代Windows/macOS/Linux真实拼音、五笔及候选窗口行为。真实IME连续输入、候选提交、长时间写作、截图和人工可用性检查必须由具备桌面与输入法的远端质量门完成后才能进入Verified。

## 实现优先主线

本任务按`implementation-mainline`推进，只可标记Implemented。M1-03依赖已Implemented但仍处于延期验证队列；远端GitHub质量门、人工验收、完整显示矩阵和截图仍不得用于P0 Verified声明。

## M1-05过渡入口

M1-04只提供显式`draft.saveSnapshot`：Draft和DraftBlock Revision保持0，`content_hash`保持NULL。它不提供并发Revision冲突、expectedHash、持久化Patch撤销或锁定保护。M1-05必须以Block Patch、Revision和Hash入口替换该过渡写法，不能把快照接口误当作最终契约。

## M1-06范围

当前没有800ms自动保存、当前章查找、字数统计或写作目标进度。UI明确显示为手动保存，并保留保存失败时的窗口正文；这些功能由M1-06实现，不在本任务显示为可用。

## 性能证据边界

现有Performance专项与20万中文字符的纯映射测试通过，但本容器未采集真实2K编辑器键入P95、滚动帧率或章节切换桌面指标。正式构建下3000—8000字、20000字和50000字Fixture的图形性能仍需按`PERFORMANCE_BUDGETS.md`采样。

## 恢复范围

v2→v3 Migration具备升级前SQLite恢复点、事务回滚和外键校验；Draft快照故障注入也证明事务回滚。统一RecoveryPoint、恢复中心、损坏项目恢复UI和恢复到新副本仍属于M1-08。
