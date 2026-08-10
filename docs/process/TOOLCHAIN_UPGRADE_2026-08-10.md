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

## 结论

新依赖锁文件、Node/pnpm 运行基线、GitHub Actions 固定版本、pnpm 项目级配置和工具链权威文档已完成 Ubuntu 治理验证。Windows/macOS 跨平台打包矩阵仍由正式 PR Quality/Release 工作流执行。旧 /mnt/data 离线工具快照因锁文件改变必须视为 STALE，待依据新锁文件重新导出并复验后才能替换。
