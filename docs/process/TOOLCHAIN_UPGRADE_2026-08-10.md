# 2026-08-10 工具链治理升级验证记录

状态：VERIFIED

基线提交来源：main@c774f981a345c8d515bb54d1bbc908e0e4eb1731
治理分支：chore/toolchain-governance-20260810
验证环境：GitHub Actions ubuntu-24.04

## 实际工具版本

- Node.js: v24.18.1
- npm: 11.16.0
- pnpm: 11.21.0
- Prettier: 3.9.6
- ESLint: v10.8.0
- TypeScript: Version 6.0.3
- Playwright: Version 1.62.0
- Electron: 43.2.0

## 已通过验证

- pnpm install --lockfile-only
- pnpm install --frozen-lockfile --prefer-offline
- pnpm toolchain:check
- pnpm ci:policy
- pnpm format:check
- pnpm lint
- pnpm typecheck
- pnpm test:unit
- pnpm test:integration
- pnpm test:migration
- pnpm test:security
- pnpm test:coverage
- pnpm build
- pnpm test:e2e
- pnpm package
- pnpm release:check

## 主线可信策略迁移

独立治理分支已使用新 Actions pins 完成验证。由于 main 上的可信 PR Policy 使用 main 自身的 ci-policy 校验候选，而旧策略仅接受升级前的 Action SHA，主线落仓采用两阶段迁移。第一阶段仅让受可信策略直接检查的永久 workflow 暂时保留升级前的 Action 实现 SHA；Node 继续固定 24.18.1，pnpm 继续由 packageManager 提供 11.21.0，Electron 与依赖锁文件均不回退。候选策略只允许升级前 SHA 与已验证新 SHA 两组精确值。待该过渡策略进入 main 后，第二阶段将这些 workflow 全部切换到已验证新 SHA，并删除旧 SHA 白名单。

第一阶段现已在 `work` 完成落仓：受 trusted main 策略直接检查的 13 个永久 workflow 已切换到升级前的可信 Action 实现 SHA，同时保持 Node 24.18.1 与 pnpm 11.21.0；双 SHA 精确白名单策略已落仓，临时迁移 workflow 与 helper 已清理。当前进入 PR #346 最新 Head 的 trusted PR Policy 与永久 Quality / Security / Performance / Full Work Validation 复核。

## pnpm 11 离线工具链复验修正

PR #346 的正式 Quality 工具链导出暴露了 pnpm 11.21.0 的离线 lockfile verification 边界：包内容已经全部命中 Artifact 内的 content-addressable store，但离线二次安装仍需要 registry package metadata；缺少该 metadata 时会触发 `ERR_PNPM_NO_OFFLINE_META`。

永久修正为让工具链 Artifact 同时携带 `store/` 与 `cache/`。`store/` 保存包内容，`cache/` 保存 pnpm 离线解析与 lockfile 供应链验证所需的 registry metadata / verification cache。锁文件生成、fetch、首次离线安装和独立临时目录二次复验均显式绑定同一 Artifact `cacheDir`，确保复验真正自包含。

不采用 `trustLockfile: true` 绕过方案。离线复验继续执行 pnpm 的 lockfile supply-chain verification，保留 `minimumReleaseAge` 等仓库治理语义。`cache/` 已进入机器权威清单的 `requiredBundleEntries`，`pnpm toolchain:check` 同时阻止后续重新引入 synthetic trustLockfile 绕过或漏绑 metadata cache。

## 结论

新依赖锁文件、Node/pnpm 运行基线、GitHub Actions 固定版本、pnpm 项目级配置和工具链权威文档已完成 Ubuntu 治理验证。Windows/macOS 跨平台打包矩阵仍由正式 PR Quality/Release 工作流执行。旧 /mnt/data 离线工具快照因锁文件改变必须视为 STALE，待依据新锁文件重新导出并复验后才能替换。
