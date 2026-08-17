# 工具链快照自动维护

> 状态：Active  
> 适用仓库：`sy220284/666`  
> 机器真源：[`CURRENT_WORKSPACE_TOOLCHAIN.json`](CURRENT_WORKSPACE_TOOLCHAIN.json)  
> 完整性定义：[`DEVELOPMENT_TOOLCHAIN_COMPLETENESS.md`](DEVELOPMENT_TOOLCHAIN_COMPLETENESS.md)

## 1. 目标

工具链与完整工作区恢复快照不得依赖人工续期。机器人持续维护与当前 `main` 对齐的 Linux x64 快照，并持续探测 Linux、Windows、macOS 宿主开发能力，避免 GitHub Actions 制品过期或 Runner 能力漂移后失去可恢复基线。

## 2. 双快照 + 三平台宿主探针

机器人刷新两类制品，并执行一类平台探针：

1. 可移植质量工具链：`.github/workflows/toolchain-export.yml`，包含锁定的格式化、静态检查、类型检查、测试、覆盖率、浏览器测试命令、构建辅助工具、pnpm store、元数据缓存、`node_modules`、清单与 Hash；
2. 完整工作区恢复包：`.github/workflows/workspace-bootstrap-export.yml`，包含当前源码、完整 workspace `node_modules`、pnpm store、Node 运行时、可恢复 pnpm、Playwright Chromium、Knip/jscpd 独立审计工具、清单与 Hash；
3. 宿主能力探针：`.github/workflows/toolchain-host-probe.yml`，在 Linux、Windows、macOS Runner 上验证系统编译、签名/公证和开发命令边界。

统一调度入口：

```text
.github/workflows/toolchain-maintenance.yml
```

机器人不复制打包实现，只调用永久导出与探针工作流。

## 3. 自动维护规则

触发规则固定为：

- 工具链、锁文件、权威清单、完整性规则或导出/探针工作流进入 `main` 时立即刷新；
- 每周一、周四 `03:17 UTC` 自动续期；
- 必要时允许在 `main` 手工触发维护工作流。

Artifact 保留期统一为 **14 天**。定时任务最大自然间隔为 4 天，因此正常状态下会保留多轮可恢复快照；单次计划任务延迟或失败不会立即形成空窗。

## 4. 来源与权限

自动维护只允许从当前 `main` 的完整提交 SHA 生成：

```text
source_sha = 当前 main SHA
quality runner = ubuntu-24.04
workspace runner = ubuntu-24.04
host probe = ubuntu-24.04 + windows-latest + macos-latest
```

所有流程保持最小权限；导出流程只上传 GitHub Actions Artifact，禁止 `git push`，禁止向 `main`、`work` 或 `governance` 提交二进制、缓存、`node_modules` 或本地工作区资产。

## 5. 完整恢复包自检

`.github/workflows/workspace-bootstrap-export.yml` 在上传前必须完成：

- 精确提交 SHA 校验；
- `pnpm install --frozen-lockfile` 完整依赖安装；
- Node、pnpm、Electron、Vitest、Playwright、esbuild 可执行检查；
- Knip 6.32.2 与 jscpd 5.0.12 独立工具载荷生成、离线冻结重建与版本检查；
- 与项目锁文件匹配的 Playwright Chromium 下载；
- 源码、依赖、浏览器、独立审计工具与 Node 运行时归档 Hash 校验；
- 在独立临时目录重新解包；
- 检查根依赖、`.pnpm`、pnpm store、Electron、浏览器、审计工具与 Node 运行时存在；
- 断裂符号链接必须为 0；
- 使用解包后的 Node 与 pnpm 再次执行版本检查；
- 使用解包后的 Playwright Chromium 真启动并退出。

只有上述恢复自检通过后才允许上传 Artifact，避免“文件存在但无法恢复”的假快照。

## 6. 漂移防护

`scripts/toolchain-policy.mjs` 与 `scripts/toolchain-completeness-policy.mjs` 持续检查：

- 自动维护计划、Runner、Profile、保留期与机器真源一致；
- 调度器同时调用质量工具链、完整工作区恢复和三平台 Host Probe；
- 两类导出保持只读、制品化；
- 完整恢复包包含浏览器、可恢复 pnpm 与独立审计工具；
- 所有根项目工具仍以 `package.json` / `pnpm-lock.yaml` 为版本真源；
- Knip/jscpd 使用机器权威中的精确稳定版，并拥有独立生成锁；
- 完整恢复工作流不得再出现固定 `BASELINE_SHA`。

任一项漂移都会让治理校验失败。

## 7. 与 `/mnt/data` 的关系

机器人维护的是 GitHub Actions 可下载快照，不直接覆盖当前 ChatGPT 工作空间中的 `/mnt/data/666-toolchain` 或 `/mnt/data/666-workspace-dependencies`。

本地恢复时必须选择与目标仓库提交/锁文件匹配的最新 Artifact，校验 Hash 后再解包，并继续执行仓库既有完整验证流程。旧快照不允许强制覆盖新锁文件。
