# M10-10 当前工作空间工具链权威文档 Evidence

## 结论

当前ChatGPT持久化工作空间的666工具链、依赖存储位置、激活方式、依赖恢复、浏览器替代路径、验证命令和更新规则已经形成单一权威文档，并由项目执行入口显式路由。

实施过程中发现文档型PR的Performance工作流会按设计跳过性能预算，但Controlled Merge将被跳过的“Run performance budgets”步骤误判为永久未就绪。该治理阻断已修复：文档模式执行明确的成功空操作，完整模式继续执行真实性能预算。

## 受检实现

- 实现提交：`0c4d347dc9700ef547ab98db51c7b86c2fd8b314`
- 权威文档：`docs/process/CURRENT_WORKSPACE_TOOLCHAIN.md`
- 执行入口：`docs/PROJECT_EXECUTION_ENTRY.md`
- 性能门禁修复：`.github/workflows/performance.yml`
- 产品代码、锁文件、Migration和运行数据未修改。

## 验证事实

- 当前主线`main-verification`成功；
- 前置任务`task-verification/M10-09`成功；
- PR Policy、Task Governance、Evidence、Quality、Security和Performance均通过；
- 文档路由中的“Run performance budgets”步骤以`success`完成；
- 本地`/mnt/data/verify-project-tools.sh full`通过；
- Playwright使用系统Chromium真实启动通过；
- 实现提交之后只存在任务卡、Runtime、任务索引和本任务Evidence收口文件。

## 验收

文档已明确仓库锁文件和永久工作流优先于工作空间快照；锁文件不匹配时恢复脚本拒绝挂载，禁止修改锁文件迎合缓存。工具二进制、缓存、`node_modules`和软链接未提交到仓库。

Performance完整路由未降低：非文档变更仍执行真实性能预算与AI协议基线；仅Draft或文档变更执行可审计的成功空操作，使Controlled Merge获得确定终态。
