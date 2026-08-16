# 工具链快照自动维护

> 状态：Active  
> 适用仓库：`sy220284/666`  
> 机器真源：[`CURRENT_WORKSPACE_TOOLCHAIN.json`](CURRENT_WORKSPACE_TOOLCHAIN.json)

## 1. 目标

工具链与完整工作区恢复快照不得依赖人工续期。机器人持续维护与当前 `main` 对齐的 Linux x64 快照，避免 GitHub Actions 制品过期后失去可恢复基线。

## 2. 双快照

机器人同时刷新两类制品：

1. 精简质量工具链：`.github/workflows/toolchain-export.yml`，包含锁定工具、pnpm store、元数据缓存、`node_modules`、清单与 Hash；
2. 完整工作区恢复包：`.github/workflows/workspace-bootstrap-export.yml`，包含当前源码、完整 workspace `node_modules`、pnpm store、Node 运行时、清单与 Hash。

统一调度入口：

```text
.github/workflows/toolchain-maintenance.yml
```

机器人不复制打包实现，只调用上述两个永久导出工作流。

## 3. 自动维护规则

触发规则固定为：

- 工具链、锁文件、权威清单、风险路由或导出工作流进入 `main` 时立即刷新；
- 每周一、周四 `03:17 UTC` 自动续期；
- 必要时允许在 `main` 手工触发维护工作流。

Artifact 保留期统一为 **14 天**。定时任务最大自然间隔为 4 天，因此正常状态下会保留多轮可恢复快照；单次计划任务延迟或失败不会立即形成空窗。

## 4. 来源与权限

自动维护只允许从当前 `main` 的完整提交 SHA 生成：

```text
source_sha = 当前 main SHA
quality runner = ubuntu-24.04
workspace runner = ubuntu-24.04
```

所有流程保持 `contents: read`，只上传 GitHub Actions Artifact；禁止 `git push`，禁止向 `main`、`work` 或 `governance` 提交二进制、缓存、`node_modules` 或本地工作区资产。

## 5. 完整恢复包自检

`.github/workflows/workspace-bootstrap-export.yml` 在上传前必须完成：

- 精确提交 SHA 校验；
- `pnpm install --frozen-lockfile` 完整依赖安装；
- Node、pnpm、Electron、Vitest、Playwright、esbuild 可执行检查；
- 源码、依赖与 Node 运行时归档 Hash 校验；
- 在独立临时目录重新解包；
- 检查根依赖、`.pnpm`、pnpm store、Electron 与 Node 运行时存在；
- 断裂符号链接必须为 0；
- 使用解包后的 Node 与命令入口再次执行版本检查。

只有上述恢复自检通过后才允许上传 Artifact，避免“文件存在但无法恢复”的假快照。

## 6. 漂移防护

`scripts/toolchain-policy.mjs` 持续检查：

- 自动维护计划、Runner、Profile、保留期与机器真源一致；
- 调度器同时调用精简工具链与完整工作区恢复工作流；
- 两类导出保持只读、制品化；
- 所有自动刷新路径进入 `toolchain-export` 风险路由；
- 完整恢复工作流不得再出现固定 `BASELINE_SHA`；
- 永久工作流库存包含维护机器人与完整恢复导出器。

任一项漂移都会让治理校验失败。

## 7. 与 `/mnt/data` 的关系

机器人维护的是 GitHub Actions 可下载快照，不直接覆盖当前 ChatGPT 工作空间中的 `/mnt/data/666-toolchain` 或 `/mnt/data/666-workspace-dependencies`。

本地恢复时必须选择与目标仓库提交/锁文件匹配的最新 Artifact，校验 Hash 后再解包，并继续执行仓库既有完整验证流程。旧快照不允许强制覆盖新锁文件。
