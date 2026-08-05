# 已知风险与回退

## 风险

1. `/mnt/data/666-workspace-dependencies`来源基线早于当前仓库Head；恢复脚本必须以`pnpm-lock.yaml`一致性作为硬门。
2. Playwright官方浏览器包未持久化；当前工作空间使用`/usr/bin/chromium`，其他环境不得照搬该绝对路径。
3. `/mnt/data`路径只适用于当前ChatGPT工作空间，不能成为产品运行时、CI或其他开发者机器的硬编码依赖。
4. 压缩Artifact已经清理；工具链损坏或锁文件更新时必须重新通过永久Toolchain Export或受控Actions导出。

## 回退

回退`docs/process/CURRENT_WORKSPACE_TOOLCHAIN.md`、`docs/PROJECT_EXECUTION_ENTRY.md`以及M10-10任务和Evidence收口文件。回退不触及产品代码、数据库、Migration、锁文件和用户数据。
