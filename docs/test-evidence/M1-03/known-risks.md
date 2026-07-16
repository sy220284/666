# M1-03 已知风险与延期验证

## Electron桌面E2E

当前容器没有`DISPLAY`、`Xvfb`或`xvfb-run`。`pnpm test:e2e`完整构建成功后由仓库运行器明确返回`E2E_DISPLAY_UNAVAILABLE`（exit 2）。新增桌面场景已写入`tests/e2e/electron-shell.spec.ts`，覆盖默认结构、专业空白、编辑状态/目标字数、跨卷移动、软删除/恢复、排序与重启持久化；必须由具备虚拟显示的远端质量门执行后才能进入Verified。

## 实现优先主线

本任务按`implementation-mainline`推进，只可标记Implemented。截图、人工可用性检查、完整视口矩阵和远端GitHub质量门证据仍登记为deferredVerification，不得用于发布或P0 Verified声明。

## 卷状态语义

冻结Schema为Volume保留`status TEXT`，但未提供独立卷状态枚举。M1-03最小具名契约复用章节的五态生命周期；数据库不加入卷状态CHECK，避免形成不可逆的额外产品约束。若作者后续冻结独立卷状态，必须通过显式契约与追加Migration演进，不能静默改义。

## 后续外键

`chapters.active_draft_id`和`chapters.final_version_id`当前只能为NULL。目标表由M1-04与M1-07建立；在此之前不能安全建立或写入对应数据库外键。

## 恢复范围

本任务仅补足旧项目执行v2 Migration前必需的已验证SQLite恢复点。BackupRecord、统一操作恢复点、恢复到新副本、损坏项目恢复UI和完整恢复中心仍由M1-08交付。

## 回收站范围

M1-03实现P0-056基础恢复闭环，不提供永久删除。永久删除的影响预览与二次确认必须在后续获批任务中实现，当前UI不显示伪入口。
