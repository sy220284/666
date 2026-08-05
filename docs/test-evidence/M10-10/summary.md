# M10-10 当前工作空间工具链权威文档 Evidence

## 结论

当前ChatGPT持久化工作空间的666工具链、依赖存储位置、激活方式、依赖恢复、浏览器替代路径、验证命令和更新规则已经形成单一权威文档，并由项目执行入口显式路由。

## 受检实现

- 实现提交：`dddca80faceaa40f3acd388e32155c7bba055174`
- 权威文档：`docs/process/CURRENT_WORKSPACE_TOOLCHAIN.md`
- 执行入口：`docs/PROJECT_EXECUTION_ENTRY.md`
- 变更范围仅包含治理文档，不修改产品代码、锁文件、Migration、工作流或运行数据。

## 验证事实

- 当前主线`main-verification`成功；
- 前置任务`task-verification/M10-09`成功；
- PR Policy与Task Governance已通过；
- Performance已通过；
- 本地`/mnt/data/verify-project-tools.sh full`通过；
- Playwright使用系统Chromium真实启动通过；
- 最终差异只包含执行入口、工具链权威文档和M10-10收口文件。

## 验收

文档已明确仓库锁文件和永久工作流优先于工作空间快照；锁文件不匹配时恢复脚本拒绝挂载，禁止修改锁文件迎合缓存。工具二进制、缓存、`node_modules`和软链接未提交到仓库。
